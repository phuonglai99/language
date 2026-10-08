export type PinyinSyllable = { base: string; tone: 1 | 2 | 3 | 4 | 5 };

export type SourcePinyinResult =
  | { ok: true; syllables: PinyinSyllable[]; numbered: string }
  | { ok: false; reason: 'empty' | 'unmarked' | 'unsupported' | 'ambiguous' };

// Standard Hanyu Pinyin spellings. `v` is the internal form of ü.
const SYLLABLES = new Set(`
a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo
da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo
e ei en eng er fa fan fang fei fen feng fo fou fu
ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun
ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo
la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu long lou lu luan lun luo lv lve
ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu
na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve
o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun
ran rang rao re ren reng ri rong rou ru ruan rui run ruo
sa sai san sang sao se sen seng sha shai shan shang shao she shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo
ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
wa wai wan wang wei wen weng wo wu
xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun
ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun
za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo
`.trim().split(/\s+/));

const TONE_MARK: Record<string, 1 | 2 | 3 | 4> = {
  '\u0304': 1, // macron
  '\u0301': 2, // acute
  '\u030c': 3, // caron
  '\u0300': 4, // grave
};

type Letter = { value: string; tone: 1 | 2 | 3 | 4 | null };

function sourceLetters(raw: string): (Letter | "'")[] | null {
  const normalized = raw.normalize('NFD').toLowerCase().replace(/[’‘]/g, "'").replace(/u:/g, 'v');
  const out: (Letter | "'")[] = [];
  for (const ch of normalized) {
    if (/\s/u.test(ch)) continue;
    if (ch === "'") { out.push(ch); continue; }
    if (ch === '\u0308') {
      const last = out.at(-1);
      if (!last || last === "'" || last.value !== 'u') return null;
      last.value = 'v';
      continue;
    }
    const tone = TONE_MARK[ch];
    if (tone) {
      const last = out.at(-1);
      if (!last || last === "'" || last.tone != null) return null;
      last.tone = tone;
      continue;
    }
    if (!/[a-zv]/.test(ch)) return null;
    out.push({ value: ch, tone: null });
  }
  return out;
}

function parseChunk(chunk: Letter[]): PinyinSyllable[][] {
  const memo = new Map<number, PinyinSyllable[][]>();
  const visit = (start: number): PinyinSyllable[][] => {
    if (start === chunk.length) return [[]];
    const cached = memo.get(start);
    if (cached) return cached;
    const found: PinyinSyllable[][] = [];
    for (let end = Math.min(chunk.length, start + 6); end > start; end--) {
      const slice = chunk.slice(start, end);
      const base = slice.map(letter => letter.value).join('');
      // In standard orthography an a/e/o-initial syllable after another syllable
      // needs an apostrophe (Xi'an, chang'e). Apostrophes were split into chunks.
      if (start > 0 && /^[aeo]/.test(base)) continue;
      if (!SYLLABLES.has(base)) continue;
      const tones = slice.flatMap(letter => letter.tone == null ? [] : [letter.tone]);
      if (tones.length > 1) continue;
      const syllable: PinyinSyllable = { base, tone: tones[0] ?? 5 };
      for (const tail of visit(end)) {
        found.push([syllable, ...tail]);
        if (found.length > 1) break;
      }
      if (found.length > 1) break;
    }
    memo.set(start, found);
    return found;
  };
  return visit(0);
}

/**
 * Parses the dictionary's marked, often-unspaced pinyin. Apostrophes are hard
 * boundaries and a tone mark may belong to only one syllable. Ambiguous or wholly
 * unmarked sources are deliberately excluded from automatic grading.
 */
export function parseSourcePinyin(raw: string): SourcePinyinResult {
  const letters = sourceLetters(raw);
  if (!letters?.length) return { ok: false, reason: raw.trim() ? 'unsupported' : 'empty' };
  if (!letters.some(letter => letter !== "'" && letter.tone != null)) return { ok: false, reason: 'unmarked' };

  const chunks: Letter[][] = [];
  let current: Letter[] = [];
  for (const letter of letters) {
    if (letter === "'") {
      if (!current.length) return { ok: false, reason: 'unsupported' };
      chunks.push(current); current = [];
    } else current.push(letter);
  }
  if (!current.length) return { ok: false, reason: 'unsupported' };
  chunks.push(current);

  const syllables: PinyinSyllable[] = [];
  for (const chunk of chunks) {
    const possibilities = parseChunk(chunk);
    if (!possibilities.length) return { ok: false, reason: 'unsupported' };
    if (possibilities.length > 1) return { ok: false, reason: 'ambiguous' };
    syllables.push(...possibilities[0]);
  }
  return { ok: true, syllables, numbered: syllables.map(s => `${s.base}${s.tone}`).join(' ') };
}
