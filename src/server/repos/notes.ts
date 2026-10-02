import { getDb } from '../db/connection';
import { findOrCreateSense, findOrCreateWord } from './words';
import { nanoid } from '@/lib/nanoid';
import { posNameVi } from '@/shared/pos';
import type { NewNoteItemInput, NoteFolderDTO, NoteFolderWithCountDTO, NoteItemDTO } from '@/types/api';

export const MISTAKE_FOLDER_ID = 'mistake';

interface FolderRow { id: string; name: string; is_system: number; created_at: string; item_count?: number }

const toFolder = (r: FolderRow): NoteFolderDTO => ({
  id: r.id, name: r.name, isSystem: r.is_system === 1, createdAt: r.created_at,
});

export async function listNoteFolders(): Promise<NoteFolderWithCountDTO[]> {
  const rows = getDb().prepare(`
    SELECT f.id, f.name, f.is_system, f.created_at, COUNT(i.id) AS item_count
    FROM note_folders f LEFT JOIN note_items i ON i.folder_id = f.id
    GROUP BY f.id
    ORDER BY f.is_system DESC, f.created_at ASC
  `).all() as FolderRow[];
  return rows.map(r => ({ ...toFolder(r), itemCount: r.item_count ?? 0 }));
}

export async function createNoteFolder(name: string): Promise<NoteFolderDTO> {
  const row = getDb().prepare(
    'INSERT INTO note_folders (id, name, is_system) VALUES (?, ?, 0) RETURNING id, name, is_system, created_at',
  ).get(nanoid(), name.trim()) as FolderRow;
  return toFolder(row);
}

/** System folders (Mistake) cannot be renamed or deleted. */
export async function renameNoteFolder(id: string, name: string): Promise<void> {
  getDb().prepare('UPDATE note_folders SET name = ? WHERE id = ? AND is_system = 0').run(name.trim(), id);
}

/** Items go with the folder (ON DELETE CASCADE). */
export async function deleteNoteFolder(id: string): Promise<void> {
  getDb().prepare('DELETE FROM note_folders WHERE id = ? AND is_system = 0').run(id);
}

const ITEM_SELECT = `
  SELECT i.id, i.folder_id, i.created_at, w.hanzi, w.pinyin,
         COALESCE(s.meaning_vi, fs.meaning_vi, s.meaning_en, fs.meaning_en, '') AS meaning,
         COALESCE(s.pos, fs.pos) AS pos
  FROM note_items i
  JOIN words w ON w.id = i.word_id
  LEFT JOIN word_senses s ON s.id = i.sense_id
  -- no sense saved: show the word's first Vietnamese sense, else its first sense
  LEFT JOIN word_senses fs ON i.sense_id IS NULL AND fs.id = (
    SELECT id FROM word_senses WHERE word_id = w.id ORDER BY meaning_vi IS NULL, position LIMIT 1
  )
`;

interface ItemRow { id: string; folder_id: string; created_at: string; hanzi: string; pinyin: string; meaning: string; pos: string | null }

const toItem = (r: ItemRow): NoteItemDTO => ({
  id: r.id, folderId: r.folder_id, zh: r.hanzi, py: r.pinyin, vn: r.meaning,
  pos: posNameVi(r.pos), sourceLessonId: null, createdAt: r.created_at,
});

export async function listNoteItems(folderId: string): Promise<NoteItemDTO[]> {
  const rows = getDb().prepare(`${ITEM_SELECT} WHERE i.folder_id = ? ORDER BY i.created_at DESC`).all(folderId) as ItemRow[];
  return rows.map(toItem);
}

/**
 * Saves a word into a folder. The word (and its sense, matched on the Vietnamese meaning)
 * is found in the dictionary or created; saving the same word twice returns the first item.
 */
export async function addNoteItem(input: NewNoteItemInput): Promise<NoteItemDTO> {
  const db = getDb();
  const id = db.transaction(() => {
    const wordId = findOrCreateWord(db, input.zh, input.py, 'manual');
    const existing = db.prepare('SELECT id FROM note_items WHERE folder_id = ? AND word_id = ?')
      .pluck().get(input.folderId, wordId) as string | undefined;
    if (existing) return existing;
    const senseId = findOrCreateSense(db, wordId, input.vn, input.pos, 'manual');
    const newId = nanoid();
    db.prepare('INSERT INTO note_items (id, folder_id, word_id, sense_id) VALUES (?, ?, ?, ?)')
      .run(newId, input.folderId, wordId, senseId);
    return newId;
  })();
  return toItem(db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id) as ItemRow);
}

export async function deleteNoteItem(id: string): Promise<void> {
  getDb().prepare('DELETE FROM note_items WHERE id = ?').run(id);
}
