/**
 * Shapes the API and server components return to the client. They do not mirror DB
 * columns: repos in src/server/repos map rows to these. For now most keep the pre-v4
 * shapes so screens did not have to change during the migration.
 */

// ── Notes ────────────────────────────────────────────────────────────────────

export interface NoteFolderDTO {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
}

export interface NoteFolderWithCountDTO extends NoteFolderDTO {
  itemCount: number;
}

export interface NoteItemDTO {
  id: string;
  folderId: string;
  zh: string;
  py: string;
  vn: string;
  /** Vietnamese part-of-speech name ("Danh từ"), '' when unknown. */
  pos: string;
  /** Pre-v4 lesson link; v4 has no lessons table, so this is always null. */
  sourceLessonId: string | null;
  createdAt: string;
}

export interface NewNoteItemInput {
  folderId: string;
  zh: string;
  py: string;
  vn: string;
  pos: string;
}
