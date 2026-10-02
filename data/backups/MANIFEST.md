# Backup manifest

Quy trình: [docs/migration-plan.md §2](../../docs/migration-plan.md).

- Backup bằng `sqlite3 <db> ".backup '<file>'"`.
- SHA-256 của file `.backup` khác file gốc là bình thường (SQLite ghi lại các trang). Nội dung được xác minh bằng SHA-256 của `.dump`.

## B0 — 2026-10-02 14:53 (trước P0)

| File | SHA-256 file | Ghi chú |
|---|---|---|
| `lessons-B0-20261002-1453.db` | `2824d2d7ea72e029f06dc439ead406ef45ff35f49aec114f555962ec688013ed` | Từ `data/lessons.db` (SHA-256 gốc `ef61d121…ca8aa`) |
| `mandarin-bean-lessons-B0-20261002-1453.json` | `9a20615227aa0440d94b2ced5416c2f940975bcae7d21ef681570125cfd119fb` | Trùng khớp byte với `data/mandarin-bean-lessons.json` |

Kiểm tra:
- `PRAGMA integrity_check`: `ok`
- SHA-256 của `.dump`: gốc = backup = `3dff6f3e198412b247efbc5ca088fe80994c21ec56fd1c2b13f4b2b9bf77e55e`

| Bảng | Gốc | Backup |
|---|---|---|
| `lessons` | 12 | 12 |
| `kanji` | 11.906 | 11.906 |
| `mb_lessons` | 729 | 729 |
| `hanzii_grammar` | 1.734 | 1.734 |
| `note_folders` | 2 | 2 |
| `note_items` | 5 | 5 |

Thử khôi phục: mở bằng `sqlite3 -readonly`, `integrity_check` và đếm số dòng như trên: đạt.

Cần làm tay: copy 2 file B0 ra ngoài thư mục repo (ổ ngoài hoặc cloud).
