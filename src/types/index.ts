export interface BotuPart {
  t: 'y' | 'am' | 'solo';
  ph: string;
  n: string;
}

export interface BotuBlock {
  char: string;
  parts: BotuPart[];
}

export interface VocabCard {
  id: string;
  zh: string;
  py: string;
  pos: string;
  vn: string;
  botu: BotuBlock[];
  ex: { zh: string; vn: string };
}

export interface GrammarPoint {
  id: string;
  title: string;
  titleVn: string;
  formula: string;
  explanation: string;
  examples: { zh: string; vn: string; note?: string }[];
  exercises: Exercise[];
  comparisons?: Comparison[];
}

export interface Exercise {
  id: string;
  type: 'fill' | 'choice';
  question: string;
  blank?: string;
  options?: string[];
  answer: string;
  explanation?: string;
}

export interface Comparison {
  wordA: string; pinyinA: string; meaningA: string;
  wordB: string; pinyinB: string; meaningB: string;
  tip: string;
  exA: { zh: string; vn: string };
  exB: { zh: string; vn: string };
}

export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  level: string;
  topic?: string;
  createdAt: string;
  vocab: VocabCard[];
  grammar: GrammarPoint[];
}
