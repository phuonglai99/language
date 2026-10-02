#!/usr/bin/env python3
"""Align Mandarin Bean lesson audio to hanzi sentences via Whisper.

Reads passages from and saves audio marks through the app's API (the app must be
running), so the database is only written by the app:
  GET /api/dictation/align           passages and whether they have marks
  GET /api/dictation/align/<slug>    one passage: audio_url, content, sentences
  PUT /api/dictation/align/<slug>    save marks

Usage:
  source scripts/venv/bin/activate
  python scripts/align-whisper.py --slug you-have-grown-up --model small
  python scripts/align-whisper.py --model small
  python scripts/align-whisper.py --limit 5 --force
  python scripts/align-whisper.py --api http://localhost:3001
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def _is_punct_char(ch: str) -> bool:
    # Same definition as isPunctChar in src/shared/text.ts (Unicode P, Z, Sm, So, whitespace).
    cat = unicodedata.category(ch)
    return cat[0] in ("P", "Z") or cat in ("Sm", "So") or ch.isspace()


def is_punct_only(hanzi: str) -> bool:
    return bool(hanzi) and all(_is_punct_char(c) for c in hanzi)


def only_cjk(text: str) -> str:
    return "".join(CJK_RE.findall(text or ""))


def extract_sentences(content: list) -> list[dict]:
    out: list[dict] = []
    for index, para in enumerate(content):
        hanzi = "".join((w.get("hanzi") or "") for w in para)
        pinyin = " ".join(w.get("pinyin") for w in para if w.get("pinyin"))
        word_count = sum(
            1
            for w in para
            if (w.get("hanzi") or "").strip() and not is_punct_only(w.get("hanzi") or "")
        )
        if word_count > 0:
            out.append(
                {
                    "index": index,
                    "hanzi": hanzi,
                    "pinyin": pinyin,
                    "word_count": word_count,
                }
            )
    return out


def flatten_words(segments: list) -> list[dict]:
    words: list[dict] = []
    for seg in segments or []:
        seg_words = seg.get("words") or []
        if seg_words:
            for w in seg_words:
                token = (w.get("word") or "").strip()
                if w.get("start") is None or w.get("end") is None:
                    continue
                words.append(
                    {
                        "word": token,
                        "start": float(w["start"]),
                        "end": float(w["end"]),
                    }
                )
        else:
            text = (seg.get("text") or "").strip()
            if text and seg.get("start") is not None and seg.get("end") is not None:
                words.append(
                    {
                        "word": text,
                        "start": float(seg["start"]),
                        "end": float(seg["end"]),
                    }
                )
    return words


def greedy_overlap(
    needle: str, chars: list[tuple[str, int]], cursor: int
) -> tuple[int | None, int | None, int, float]:
    """Sequential left-to-right match with a small skip window."""
    if not needle or cursor >= len(chars):
        return None, None, cursor, 0.0

    search_end = min(len(chars), cursor + max(len(needle) * 2, len(needle) + 24))
    t_i = 0
    j = cursor
    first_wi: int | None = None
    last_wi: int | None = None
    matched = 0
    look = 4

    while j < search_end and t_i < len(needle):
        if chars[j][0] == needle[t_i]:
            if first_wi is None:
                first_wi = chars[j][1]
            last_wi = chars[j][1]
            matched += 1
            t_i += 1
            j += 1
            continue

        skip_whisper = next(
            (
                k
                for k in range(1, look + 1)
                if j + k < search_end and chars[j + k][0] == needle[t_i]
            ),
            None,
        )
        if skip_whisper is not None:
            j += skip_whisper
            continue

        skip_target = next(
            (
                k
                for k in range(1, look + 1)
                if t_i + k < len(needle) and chars[j][0] == needle[t_i + k]
            ),
            None,
        )
        if skip_target is not None:
            t_i += skip_target
            continue

        j += 1

    coverage = matched / len(needle)
    return first_wi, last_wi, j, coverage


def match_sentences(sentences: list[dict], words: list[dict]) -> list[dict]:
    """Map Whisper words onto lesson sentences in order (greedy character overlap)."""
    chars: list[tuple[str, int]] = []
    for i, w in enumerate(words):
        for c in only_cjk(w["word"]):
            chars.append((c, i))

    haystack = "".join(c for c, _ in chars)
    cursor = 0
    out: list[dict] = []

    for s in sentences:
        needle = only_cjk(s["hanzi"])
        if not needle or not chars:
            out.append({"index": s["index"], "start": None, "end": None})
            continue

        found = haystack.find(needle, cursor)
        if found >= 0:
            start_wi = chars[found][1]
            end_wi = chars[found + len(needle) - 1][1]
            out.append(
                {
                    "index": s["index"],
                    "start": round(words[start_wi]["start"], 3),
                    "end": round(words[end_wi]["end"], 3),
                }
            )
            cursor = found + len(needle)
            continue

        start_wi, end_wi, new_cursor, coverage = greedy_overlap(needle, chars, cursor)
        if start_wi is not None and end_wi is not None and coverage >= 0.55:
            out.append(
                {
                    "index": s["index"],
                    "start": round(words[start_wi]["start"], 3),
                    "end": round(words[end_wi]["end"], 3),
                }
            )
            cursor = new_cursor
        else:
            out.append({"index": s["index"], "start": None, "end": None})

    return out


def api_request(base: str, path: str, method: str = "GET", body: dict | None = None) -> dict:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "User-Agent": "hsk-web-whisper-align/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {path}: HTTP {exc.code} {detail}") from exc


def download_audio(url: str, dest: Path) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "hsk-web-whisper-align/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp, dest.open("wb") as fh:
        while True:
            chunk = resp.read(64 * 1024)
            if not chunk:
                break
            fh.write(chunk)


def load_lessons(api: str, slug: str | None, force: bool) -> list[dict]:
    if slug:
        return [{"slug": slug}]
    summaries = api_request(api, "/api/dictation/align")["lessons"]
    return [
        l for l in summaries
        if l.get("audio_url") and (force or not l.get("hasTimestamps"))
    ]


def align_lesson(model, slug: str, audio_url: str, content: list, language: str) -> list[dict]:
    sentences = extract_sentences(content)
    suffix = Path(audio_url).suffix or ".mp3"
    tmp_path = Path(tempfile.gettempdir()) / f"whisper-align-{slug}{suffix}"
    try:
        download_audio(audio_url, tmp_path)
        result = model.transcribe(
            str(tmp_path),
            language=language,
            word_timestamps=True,
            verbose=False,
        )
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass

    words = flatten_words(result.get("segments") or [])
    timestamps = match_sentences(sentences, words)

    whisper_text = only_cjk(result.get("text") or "")
    lesson_text = "".join(only_cjk(s["hanzi"]) for s in sentences)
    matched = sum(1 for t in timestamps if t["start"] is not None)
    print(
        f"    whisper_chars={len(whisper_text)} lesson_chars={len(lesson_text)} "
        f"matched={matched}/{len(sentences)}"
    )
    if matched < len(sentences):
        missing = [t["index"] for t in timestamps if t["start"] is None]
        print(f"    unmatched indexes: {missing}")
        print(f"    whisper: {whisper_text[:180]}")
        print(f"    lesson:  {lesson_text[:180]}")

    return timestamps


def main() -> None:
    parser = argparse.ArgumentParser(description="Align lesson audio to sentences with Whisper")
    parser.add_argument("--slug", help="Align a single lesson")
    parser.add_argument("--model", default="small", help="Whisper model (default: small)")
    parser.add_argument("--limit", type=int, default=0, help="Max lessons to process (0 = all)")
    parser.add_argument("--force", action="store_true", help="Re-align lessons that already have timestamps")
    parser.add_argument("--dry-run", action="store_true", help="Transcribe and print, do not write DB")
    parser.add_argument("--language", default="zh", help="Whisper language code (default: zh)")
    parser.add_argument("--api", default="http://localhost:3000", help="Base URL of the running app")
    args = parser.parse_args()

    try:
        rows = load_lessons(args.api, args.slug, args.force)
    except Exception as exc:  # noqa: BLE001 - surface any connection problem plainly
        sys.exit(f"Cannot reach the app at {args.api} ({exc}). Start it first (npm run dev).")
    if args.limit:
        rows = rows[: args.limit]
    if not rows:
        print("Nothing to align.")
        return

    print(f"Loading Whisper model '{args.model}' …")
    import whisper

    model = whisper.load_model(args.model)
    print(f"Aligning {len(rows)} lesson(s)")

    ok = 0
    failed = 0
    for i, row in enumerate(rows, 1):
        slug = row["slug"]
        quoted = urllib.parse.quote(slug)
        try:
            detail = api_request(args.api, f"/api/dictation/align/{quoted}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"[{i}/{len(rows)}] {slug} — ERROR loading: {exc}", file=sys.stderr)
            continue
        audio_url = detail["lesson"].get("audio_url")
        if not audio_url:
            print(f"[{i}/{len(rows)}] {slug} — skip (no audio_url)")
            continue

        print(f"[{i}/{len(rows)}] {slug}")
        t0 = time.time()
        try:
            content = detail["lesson"]["content"]
            timestamps = align_lesson(model, slug, audio_url, content, args.language)
            if args.dry_run:
                print(f"    dry-run {json.dumps(timestamps, ensure_ascii=False)}")
            else:
                by_index = {t["index"]: t for t in timestamps}
                payload = []
                for s in detail["sentences"]:
                    t = by_index.get(s["index"], {})
                    start, end = t.get("start"), t.get("end")
                    if start is None or end is None or not start < end:
                        start, end = None, None  # the API rejects empty intervals
                    payload.append({"index": s["index"], "hanzi": s["hanzi"], "start": start, "end": end})
                api_request(args.api, f"/api/dictation/align/{quoted}", "PUT", {"sentences": payload})
            elapsed = time.time() - t0
            print(f"    saved in {elapsed:.1f}s")
            ok += 1
        except Exception as exc:
            failed += 1
            print(f"    ERROR: {exc}", file=sys.stderr)

    print(f"Done. ok={ok} failed={failed}")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
