export const LOCAL_NOTES_STORAGE_KEY = 'hsk:notes:local:v1';
export const LOCAL_NOTES_CHANGED_EVENT = 'hsk:notes:local-changed';
export const LOCAL_MISTAKE_FOLDER_ID = 'local-mistake';
export const LOCAL_NOTES_MAX_ITEMS = 500;
export const LOCAL_NOTES_SAFE_LIMIT_BYTES = 3 * 1024 * 1024;
const SYSTEM_CREATED_AT = '1970-01-01T00:00:00.000Z';

export interface LocalNoteFolder {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
}

export interface LocalNoteFolderWithCount extends LocalNoteFolder {
  itemCount: number;
  isLocal: true;
}

export interface LocalNoteItem {
  id: string;
  folderId: string;
  sourceKey: string;
  zh: string;
  py: string;
  vn: string;
  pos: string;
  sourceLessonId: string | null;
  createdAt: string;
}

export interface LocalNotesStoreV1 {
  version: 1;
  folders: LocalNoteFolder[];
  items: LocalNoteItem[];
}

type LocalNoteInput = Omit<LocalNoteItem, 'id' | 'folderId' | 'createdAt'>;

const MAX_FOLDERS = 100;
// Continue reading an oversized legacy store without deleting it. New writes
// are blocked by LOCAL_NOTES_MAX_ITEMS until the user removes enough items.
const MAX_LEGACY_ITEMS = 10_000;
const mistakeFolder = (): LocalNoteFolder => ({ id: LOCAL_MISTAKE_FOLDER_ID, name: 'Từ chưa vững', isSystem: true, createdAt: SYSTEM_CREATED_AT });
const emptyStore = (): LocalNotesStoreV1 => ({ version: 1, folders: [mistakeFolder()], items: [] });
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function validFolder(value: unknown): value is LocalNoteFolder {
  return isObject(value) && typeof value.id === 'string' && value.id.startsWith('local-') && value.id.length <= 100 &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 100 && typeof value.isSystem === 'boolean' &&
    typeof value.createdAt === 'string';
}

function validItem(value: unknown): value is LocalNoteItem {
  return isObject(value) && typeof value.id === 'string' && value.id.startsWith('local-item-') && value.id.length <= 120 &&
    typeof value.folderId === 'string' && value.folderId.startsWith('local-') && typeof value.sourceKey === 'string' && value.sourceKey.length <= 240 &&
    typeof value.zh === 'string' && value.zh.length <= 200 && typeof value.py === 'string' && value.py.length <= 300 &&
    typeof value.vn === 'string' && value.vn.length <= 1_000 && typeof value.pos === 'string' && value.pos.length <= 100 &&
    (value.sourceLessonId === null || typeof value.sourceLessonId === 'string') && typeof value.createdAt === 'string';
}

export function parseLocalNotesStore(raw: string | null): LocalNotesStoreV1 {
  if (!raw) return emptyStore();
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.folders) || !Array.isArray(value.items) ||
        value.folders.length > MAX_FOLDERS || value.items.length > MAX_LEGACY_ITEMS ||
        !value.folders.every(validFolder) || !value.items.every(validItem)) return emptyStore();
    const folders = value.folders.some(folder => folder.id === LOCAL_MISTAKE_FOLDER_ID)
      ? value.folders
      : [mistakeFolder(), ...value.folders];
    const folderIds = new Set(folders.map(folder => folder.id));
    return { version: 1, folders, items: value.items.filter(item => folderIds.has(item.folderId)) };
  } catch {
    return emptyStore();
  }
}

function readStore(): LocalNotesStoreV1 {
  if (typeof window === 'undefined') return emptyStore();
  try { return parseLocalNotesStore(window.localStorage.getItem(LOCAL_NOTES_STORAGE_KEY)); }
  catch { return emptyStore(); }
}

function writeStore(store: LocalNotesStoreV1): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const serialized = JSON.stringify(store);
    if (serialized.length * 2 > LOCAL_NOTES_SAFE_LIMIT_BYTES) return false;
    window.localStorage.setItem(LOCAL_NOTES_STORAGE_KEY, serialized);
    window.dispatchEvent(new Event(LOCAL_NOTES_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

function localId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${random}`;
}

export function isLocalNoteFolderId(id: string): boolean {
  return id.startsWith('local-');
}

export function localNotesUsage(): { usedBytes: number; limitBytes: number; percent: number; itemCount: number; maxItems: number } {
  if (typeof window === 'undefined') return { usedBytes: 0, limitBytes: LOCAL_NOTES_SAFE_LIMIT_BYTES, percent: 0, itemCount: 0, maxItems: LOCAL_NOTES_MAX_ITEMS };
  try {
    const raw = window.localStorage.getItem(LOCAL_NOTES_STORAGE_KEY) ?? JSON.stringify(emptyStore());
    const usedBytes = raw.length * 2;
    const itemCount = parseLocalNotesStore(raw).items.length;
    return {
      usedBytes, limitBytes: LOCAL_NOTES_SAFE_LIMIT_BYTES,
      percent: Math.min(100, Math.round(itemCount / LOCAL_NOTES_MAX_ITEMS * 100)),
      itemCount, maxItems: LOCAL_NOTES_MAX_ITEMS,
    };
  } catch {
    return { usedBytes: 0, limitBytes: LOCAL_NOTES_SAFE_LIMIT_BYTES, percent: 0, itemCount: 0, maxItems: LOCAL_NOTES_MAX_ITEMS };
  }
}

export function listLocalNoteFolders(): LocalNoteFolderWithCount[] {
  const store = readStore();
  return store.folders.map(folder => ({
    ...folder, isLocal: true,
    itemCount: store.items.filter(item => item.folderId === folder.id).length,
  }));
}

export function getLocalNoteFolder(id: string): LocalNoteFolderWithCount | null {
  return listLocalNoteFolders().find(folder => folder.id === id) ?? null;
}

export function listLocalNoteItems(folderId: string): LocalNoteItem[] {
  return readStore().items.filter(item => item.folderId === folderId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createLocalNoteFolder(name: string): LocalNoteFolder | null {
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) return null;
  const store = readStore();
  if (store.folders.length >= MAX_FOLDERS) return null;
  const folder: LocalNoteFolder = { id: localId('local-'), name: trimmed, isSystem: false, createdAt: new Date().toISOString() };
  return writeStore({ ...store, folders: [...store.folders, folder] }) ? folder : null;
}

export function renameLocalNoteFolder(id: string, name: string): boolean {
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) return false;
  const store = readStore();
  if (!store.folders.some(folder => folder.id === id && !folder.isSystem)) return false;
  return writeStore({ ...store, folders: store.folders.map(folder => folder.id === id ? { ...folder, name: trimmed } : folder) });
}

export function deleteLocalNoteFolder(id: string): boolean {
  const store = readStore();
  if (!store.folders.some(folder => folder.id === id && !folder.isSystem)) return false;
  return writeStore({ ...store, folders: store.folders.filter(folder => folder.id !== id), items: store.items.filter(item => item.folderId !== id) });
}

export function addLocalNoteItem(folderId: string, input: LocalNoteInput): boolean {
  if (!input.zh || input.zh.length > 200 || input.py.length > 300 || input.vn.length > 1_000 || input.pos.length > 100 || input.sourceKey.length > 240) return false;
  const store = readStore();
  if (!store.folders.some(folder => folder.id === folderId)) return false;
  const duplicate = store.items.some(item => item.folderId === folderId &&
    (item.sourceKey === input.sourceKey || (item.zh === input.zh && item.py === input.py)));
  if (duplicate) return true;
  if (store.items.length >= LOCAL_NOTES_MAX_ITEMS) return false;
  const item: LocalNoteItem = {
    ...input, id: localId('local-item-'), folderId, createdAt: new Date().toISOString(),
  };
  return writeStore({ ...store, items: [...store.items, item] });
}

export function deleteLocalNoteItem(id: string): boolean {
  const store = readStore();
  if (!store.items.some(item => item.id === id)) return false;
  return writeStore({ ...store, items: store.items.filter(item => item.id !== id) });
}

export function deleteLocalNoteItems(ids: Iterable<string>): boolean {
  const selected = new Set(ids);
  const store = readStore();
  return writeStore({ ...store, items: store.items.filter(item => !selected.has(item.id)) });
}
