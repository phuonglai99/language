import { createDecipheriv, createHash } from 'node:crypto';

/**
 * Hanzii character lookup (moved out of the /api/kanji route so scripts can use it too).
 * The API answers with an AES-encrypted payload; the key is derived the way the Hanzii
 * web client does it.
 */

export interface HanziiCharacter {
  char: string;
  cn_vi?: string;
  pinyin?: string;
  strokes?: number;
  radical?: string;
  lucthu?: string;
  hinhthai?: string;
  netbut?: string;
  popular?: string | number;
  means_tdpt: string[];
  means_tg: string[];
  means_tdtd: string[];
  strokes_svg?: string;
}

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

export async function fetchFromHanzii(char: string): Promise<HanziiCharacter | null> {
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
    popular: r.popular as string | number | undefined,
    means_tdpt: means.tdpt ?? [],
    means_tg: means.tg ?? [],
    means_tdtd: means.tdtd ?? [],
    strokes_svg: r.strokes as string | undefined,
  };
}

// ─── Grammar search ──────────────────────────────────────────────────────────

/** One grammar point as the Hanzii search API returns it (fields we use). */
export interface HanziiGrammarItem {
  id: number | string;
  _id?: string;
  title?: string;
  use_for?: string;
  keywords?: string;
  level?: string;
  contents?: string[];
}

const GRAMMAR_HEADERS = {
  Accept: 'application/json',
  Referer: 'https://hanzii.net/',
  Origin: 'https://hanzii.net',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'X-Client-Id': 'hzw_ba07c148af1713c1e1290501',
};

/** One page of Hanzii grammar search results; throws on HTTP errors. */
export async function searchHanziiGrammar(key: string, page: number, limit = 50): Promise<{ result: HanziiGrammarItem[]; total: number }> {
  const url = `https://api2.hanzii.net/api/search/all/vi/grammar/?key=${encodeURIComponent(key)}&page=${page}&limit=${limit}`;
  const res = await fetch(url, { headers: GRAMMAR_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${key} p${page}`);
  const json = await res.json() as { data?: string };
  if (!json.data || typeof json.data !== 'string') return { result: [], total: 0 };
  const data = decryptHanzii(json.data) as { result?: HanziiGrammarItem[]; total?: number };
  return { result: data.result ?? [], total: data.total ?? 0 };
}
