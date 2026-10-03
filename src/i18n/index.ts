/**
 * All user-visible UI text lives here, never inline in components:
 *
 *   import { t } from '@/i18n';
 *   <button>{t.lesson.flashcard.next}</button>
 *   <span>{t.home.card.vocabCount(n)}</span>
 *
 * Plain objects (no runtime library), usable in server and client components.
 * Only Vietnamese for now; another language = a sibling folder with the same shape.
 */
import { common } from './vi/common';
import { home } from './vi/home';
import { shell } from './vi/shell';
import { vocab } from './vi/vocab';
import { grammar } from './vi/grammar';
import { api } from './vi/api';
import { lesson } from './vi/lesson';
import { notes } from './vi/notes';
import { reading } from './vi/reading';
import { dictation } from './vi/dictation';

export const t = { common, home, shell, vocab, grammar, api, lesson, notes, reading, dictation } as const;

export type Messages = typeof t;
