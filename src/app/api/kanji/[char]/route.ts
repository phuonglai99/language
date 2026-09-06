import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv, createHash } from 'node:crypto';
import { getKanji, saveKanji } from '@/lib/db';

// ─── Hanzii decryption ───────────────────────────────────────────────────────

const SECRET_KEY = 'I2F6a0dYSRcybhgOVA9aM1o+ByE4GAd+Vx4MMzQWH2cDCgFlWzYWGE5bHEBRAHNSXys7Jjl/XFFSFmQaBhUJPzU0H0tdaBABMR4MBx0eBkgNHFAfBwd7GlRFAFw6UQYlMBobBg==';
const PEPPER = 'myPepper123';

function buildAesKey(): Buffer {
  const bytes = Buffer.from(SECRET_KEY, 'base64');
  bytes.reverse();
  const pepperBytes = Buffer.from(PEPPER, 'utf8');
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= pepperBytes[i % pepperBytes.length];
  return createHash('sha256').update(bytes.toString('utf8'), 'utf8').digest();
}

const AES_KEY = buildAesKey();

function decryptHanzii(b64: string): unknown {
  const bytes = Buffer.from(b64, 'base64');
  const iv = bytes.subarray(0, 16);
  const cipher = bytes.subarray(16);
  const decipher = createDecipheriv('aes-256-cbc', AES_KEY, iv);
  const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

// ─── Fetch from Hanzii ───────────────────────────────────────────────────────

async function fetchFromHanzii(char: string) {
  const url = `https://api2.hanzii.net/api/search/all/vi/kanji/?key=${encodeURIComponent(char)}&page=1&limit=5`;
  const res = await fetch(url, {
    headers: { Referer: 'https://hanzii.net/' },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  const json = await res.json() as { data?: string };
  if (!json.data || typeof json.data !== 'string') return null;
  const data = decryptHanzii(json.data) as { found: boolean; result?: Record<string, unknown>[] };
  if (!data.found || !data.result?.length) return null;
  const r = data.result[0] as Record<string, unknown>;
  const content0 = (r.content as Record<string, unknown>[])?.[0] as Record<string, unknown> | undefined;
  const means = (content0?.means ?? {}) as Record<string, string[]>;
  return {
    char,
    cn_vi: r.cn_vi as string | undefined,
    pinyin: r.pinyin as string | undefined,
    strokes: r.count as number | undefined,
    radical: r.sets as string | undefined,
    lucthu: r.lucthu as string | undefined,
    hinhthai: r.hinhthai as string | undefined,
    netbut: r.netbut as string | undefined,
    popular: r.popular as number | undefined,
    means_tdpt: means.tdpt ?? [],
    means_tg: means.tg ?? [],
    means_tdtd: means.tdtd ?? [],
    strokes_svg: r.strokes as string | undefined,
  };
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ char: string }> }) {
  const { char } = await params;
  const decoded = decodeURIComponent(char);

  // 1. Try DB cache first
  let row = getKanji(decoded);

  // 2. Cache miss → fetch from Hanzii, save, return
  if (!row) {
    const fetched = await fetchFromHanzii(decoded).catch(() => null);
    if (fetched) {
      saveKanji({
        char: fetched.char,
        cn_vi: fetched.cn_vi,
        pinyin: fetched.pinyin,
        strokes: fetched.strokes,
        radical: fetched.radical,
        lucthu: fetched.lucthu,
        hinhthai: fetched.hinhthai,
        netbut: fetched.netbut,
        popular: fetched.popular,
        means_tdpt: fetched.means_tdpt,
        means_tg: fetched.means_tg,
        means_tdtd: fetched.means_tdtd,
        strokes_svg: fetched.strokes_svg,
      });
      row = getKanji(decoded);
    }
  }

  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const meansTdtd: string[] = row.means_tdtd ? JSON.parse(row.means_tdtd) : [];
  const posMatch = meansTdtd[0]?.match(/^\(([^)]+)\)/);
  const pos = posMatch ? posMatch[1] : null;

  return NextResponse.json({
    char: row.char,
    cnVi: row.cn_vi,
    pinyin: row.pinyin,
    strokes: row.strokes,
    radical: row.radical,
    lucthu: row.lucthu,
    hinhthai: row.hinhthai,
    netbut: row.netbut,
    popular: row.popular,
    pos,
    meansTdpt: row.means_tdpt ? JSON.parse(row.means_tdpt) : [],
    meansTg: row.means_tg ? JSON.parse(row.means_tg) : [],
    meansTdtd,
    strokesSvg: row.strokes_svg ? JSON.parse(row.strokes_svg) : null,
    botu: row.botu ? JSON.parse(row.botu) : null,
  });
}
