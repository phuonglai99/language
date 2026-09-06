#!/usr/bin/env python3
"""Align Mandarin Bean lesson audio to hanzi sentences via Whisper.

Usage:
  source scripts/venv/bin/activate
  python scripts/align-whisper.py --slug you-have-grown-up --model small
  python scripts/align-whisper.py --model small
  python scripts/align-whisper.py --limit 5 --force
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "lessons.db"

# Keep in sync with src/lib/dictation.ts
_WORD_PUNCT = set(" \t\n\r，。？！、：；「」『』【】（）…—·“”‘’")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def is_punct_only(hanzi: str) -> bool:
    return bool(hanzi) and all(c in _WORD_PUNCT for c in hanzi)


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


def ensure_column(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(mb_lessons)")}
    if "sentence_timestamps" not in cols:
        conn.execute("ALTER TABLE mb_lessons ADD COLUMN sentence_timestamps TEXT")
        conn.commit()
        print("Added column mb_lessons.sentence_timestamps")


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


def load_lessons(
    conn: sqlite3.Connection, slug: str | None, force: bool
) -> list[sqlite3.Row]:
    if slug:
        rows = conn.execute(
            "SELECT slug, audio_url, content, sentence_timestamps FROM mb_lessons WHERE slug = ?",
            (slug,),
        ).fetchall()
        if not rows:
            sys.exit(f"Lesson not found: {slug}")
        return rows

    if force:
        return conn.execute(
            "SELECT slug, audio_url, content, sentence_timestamps FROM mb_lessons ORDER BY hsk_level, slug"
        ).fetchall()

    return conn.execute(
        """
        SELECT slug, audio_url, content, sentence_timestamps
        FROM mb_lessons
        WHERE audio_url IS NOT NULL AND audio_url != ''
          AND (sentence_timestamps IS NULL OR sentence_timestamps = '')
        ORDER BY hsk_level, slug
        """
    ).fetchall()


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
    args = parser.parse_args()

    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_column(conn)

    rows = load_lessons(conn, args.slug, args.force)
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
        audio_url = row["audio_url"]
        if not audio_url:
            print(f"[{i}/{len(rows)}] {slug} — skip (no audio_url)")
            continue

        print(f"[{i}/{len(rows)}] {slug}")
        t0 = time.time()
        try:
            content = json.loads(row["content"])
            timestamps = align_lesson(model, slug, audio_url, content, args.language)
            if args.dry_run:
                print(f"    dry-run {json.dumps(timestamps, ensure_ascii=False)}")
            else:
                conn.execute(
                    "UPDATE mb_lessons SET sentence_timestamps = ? WHERE slug = ?",
                    (json.dumps(timestamps, ensure_ascii=False), slug),
                )
                conn.commit()
            elapsed = time.time() - t0
            print(f"    saved in {elapsed:.1f}s")
            ok += 1
        except Exception as exc:
            failed += 1
            print(f"    ERROR: {exc}", file=sys.stderr)

    conn.close()
    print(f"Done. ok={ok} failed={failed}")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
