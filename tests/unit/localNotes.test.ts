import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOCAL_MISTAKE_FOLDER_ID, LOCAL_NOTES_MAX_ITEMS, LOCAL_NOTES_STORAGE_KEY, addLocalNoteItem, createLocalNoteFolder, deleteLocalNoteFolder, deleteLocalNoteItem,
  listLocalNoteFolders, listLocalNoteItems, parseLocalNotesStore,
} from '../../src/lib/localNotes';

test('local notes create folders, deduplicate words, and never need a server API', () => {
  const values = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
    dispatchEvent: () => true,
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  try {
    const folder = createLocalNoteFolder('Từ chưa vững');
    assert.ok(folder);
    const input = { sourceKey: 'hsk-1:1:1', zh: '学校', py: 'xuéxiào', vn: 'trường học', pos: 'Danh từ', sourceLessonId: 'hsk-1' };
    assert.equal(addLocalNoteItem(folder.id, input), true);
    assert.equal(addLocalNoteItem(folder.id, input), true);
    assert.equal(listLocalNoteFolders().find(value => value.id === folder.id)?.itemCount, 1);
    assert.equal(listLocalNoteFolders().find(value => value.id === LOCAL_MISTAKE_FOLDER_ID)?.isSystem, true);
    assert.equal(deleteLocalNoteFolder(LOCAL_MISTAKE_FOLDER_ID), false);
    const items = listLocalNoteItems(folder.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].zh, '学校');
    assert.equal(deleteLocalNoteItem(items[0].id), true);
    assert.equal(listLocalNoteItems(folder.id).length, 0);
    assert.ok(values.has(LOCAL_NOTES_STORAGE_KEY));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('local notes parser drops malformed storage safely', () => {
  const empty = parseLocalNotesStore('{');
  assert.equal(empty.items.length, 0);
  assert.equal(empty.folders[0].id, LOCAL_MISTAKE_FOLDER_ID);
  const malformed = parseLocalNotesStore(JSON.stringify({ version: 1, folders: [{ id: 'server-id' }], items: [] }));
  assert.equal(malformed.items.length, 0);
  assert.equal(malformed.folders[0].id, LOCAL_MISTAKE_FOLDER_ID);
});

test('local notes fail safely when browser storage rejects a write', () => {
  const fakeWindow = {
    localStorage: {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    },
    dispatchEvent: () => true,
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  try {
    assert.equal(createLocalNoteFolder('Không thể lưu'), null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('local notes keep 500 existing items and reject item 501', () => {
  const existingItems = Array.from({ length: LOCAL_NOTES_MAX_ITEMS }, (_, index) => ({
    id: `local-item-${index}`,
    folderId: LOCAL_MISTAKE_FOLDER_ID,
    sourceKey: `source-${index}`,
    zh: `词${index}`,
    py: `ci${index}`,
    vn: `từ ${index}`,
    pos: 'n',
    sourceLessonId: null,
    createdAt: '2026-10-08T00:00:00.000Z',
  }));
  const values = new Map([[LOCAL_NOTES_STORAGE_KEY, JSON.stringify({
    version: 1,
    folders: [{ id: LOCAL_MISTAKE_FOLDER_ID, name: 'Từ chưa vững', isSystem: true, createdAt: '1970-01-01T00:00:00.000Z' }],
    items: existingItems,
  })]]);
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
    dispatchEvent: () => true,
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  try {
    assert.equal(addLocalNoteItem(LOCAL_MISTAKE_FOLDER_ID, {
      sourceKey: 'source-501', zh: '新', py: 'xīn', vn: 'mới', pos: 'adj', sourceLessonId: null,
    }), false);
    assert.equal(listLocalNoteItems(LOCAL_MISTAKE_FOLDER_ID).length, LOCAL_NOTES_MAX_ITEMS);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
