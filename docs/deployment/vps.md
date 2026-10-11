# Chuẩn bị deploy VPS (SQLite v4)

Ứng dụng chạy Node 22+, Next.js và `better-sqlite3`; cài dependency và build trên Linux đích. Không chuyển `node_modules` hoặc `.next` từ macOS sang VPS.

## Kiểm tra bản phát hành

```bash
npm ci
npm run check
npm run build
```

Nếu Turbopack bị môi trường chặn mở cổng nội bộ để xử lý CSS, có thể build bằng `npm run build -- --webpack`. Build không thay thế bước lint/test.

Chỉ triển khai commit đã chứa đầy đủ thay đổi. `git archive HEAD` không chứa thay đổi chưa commit hoặc file untracked. Không đóng gói `.env.local`, DB, WAL, backup hoặc thư mục venv trong source release.

## Dữ liệu và môi trường

- `DB_PATH` mặc định là `data/hsk.db`, không còn là `data/lessons.db`.
- Dùng đường dẫn tuyệt đối đến DB v4 đang vận hành, nằm ngoài thư mục source release, chẳng hạn `/var/lib/hsk-web/hsk.db`.
- User chạy app cần quyền ghi DB và thư mục chứa DB để SQLite tạo `-wal` và `-shm`.
- Giữ `src/server/db/migrations/*.sql` trong release: app đọc các file này lúc khởi tạo kết nối.
- `ANTHROPIC_API_KEY` chỉ cần cho tính năng phân tích DOCX. Giữ key trong môi trường server hoặc `.env.local` riêng của release, không commit.
- DB phải tồn tại; app không tạo dữ liệu học từ đầu. DB cũ cần quy trình chuyển v4 trong `docs/migration-plan.md`, không chỉ đổi tên file.

## Backup trước cập nhật

Xác minh đường dẫn DB thật từ cấu hình tiến trình đang chạy trước khi thao tác. Không chép DB local đè lên production.

SQLite WAL không an toàn khi chỉ sao chép file `.db` đang hoạt động. Dùng SQLite backup API. Ví dụ dưới đây chạy tại thư mục app có dependency, sau khi đặt `DB_PATH` đúng và đặt `BACKUP_PATH` thành đường dẫn mới có timestamp trong thư mục backup đã tạo:

```bash
node <<'JS'
const fs = require('node:fs');
const Database = require('better-sqlite3');
(async () => {
  const source = process.env.DB_PATH;
  const target = process.env.BACKUP_PATH;
  if (!source || !target) throw new Error('Set DB_PATH and BACKUP_PATH first');
  if (fs.existsSync(target)) throw new Error('Backup target already exists');
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try { await db.backup(target); } finally { db.close(); }
  const backup = new Database(target, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Invalid backup');
    console.log('Backup verified');
  } finally { backup.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
JS
```

Giữ bản backup và release trước để rollback. Nếu đã có ghi mới sau triển khai, không restore backup cũ một cách tự động vì sẽ mất các ghi mới đó.

## Triển khai

1. Tạo thư mục release mới từ commit đã kiểm tra; giữ app hiện tại chạy trong lúc cài dependency và build.
2. Cấu hình môi trường cho release mới. Chạy các bước kiểm tra phía trên; chỉ tiếp tục nếu đạt.
3. Backup DB production như trên. Nếu release có migration mới, kiểm tra migration với bản sao DB trước khi cho app mới truy cập DB production.
4. Cập nhật cấu hình PM2 để `cwd` trỏ tới release mới, chạy `npm start -- --hostname 127.0.0.1 --port 3000`, với `DB_PATH` tuyệt đối. Giữ tên tiến trình đang có; không tạo tiến trình thứ hai tranh port 3000. Restart với môi trường mới.
5. Nginx chuyển tiếp đến `127.0.0.1:3000`. Giữ cấu hình domain/TLS hiện có.
6. Kiểm tra HTTP và thao tác học, tìm kiếm, phát âm, ghi chú trước khi `pm2 save`.

```bash
curl --fail --silent --output /dev/null http://127.0.0.1:3000/
curl --fail --silent --output /dev/null 'http://127.0.0.1:3000/api/vocab?level=HSK1'
curl --fail --silent --output /dev/null http://127.0.0.1:3000/api/reading/counts
```

Nếu kiểm tra thất bại, chuyển PM2 về release cũ. Chỉ dùng lại DB khi schema tương thích với release cũ; nếu không, dừng ghi và đánh giá restore từ backup cùng các ghi phát sinh.

## Kết quả kiểm tra local ngày 2026-10-04

- `npm run check` đạt: lint không có error (còn 4 cảnh báo ảnh/font), TypeScript và 17 unit/integration tests đạt.
- Production build Webpack đạt; có bước kiểm tra TypeScript.
- DB local: `quick_check = ok`, migration 1 và 2 đã áp dụng. Đây không phải xác nhận DB trên VPS.
- Đã sửa các lỗi lint chặn CI ở sidebar, dictation, grammar, match game, lesson và notes; không tắt rule để bỏ qua lỗi.
- Bản chuẩn bị này gồm sửa phím tắt khi nhập liệu, popup dịch bài khóa có nút phóng to, và rút gọn nghĩa Hán–Việt trong kết quả tra nhanh (giữ dữ liệu nguồn đầy đủ).
- Smoke test server production local đạt HTTP 200: `/`, `/vocab/HSK1`, `/reading`, `/api/vocab?level=HSK1`, `/api/reading/counts`, `/api/search?q=里`.
- Chưa kiểm tra tương tác popup/phím tắt và âm thanh trực tiếp trên trình duyệt production.
- Đã deploy VPS ngày 2026-10-04; xem bản ghi bên dưới. Source được đóng gói từ working tree kèm manifest SHA-256, chưa commit/push Git.


## Production đã triển khai ngày 2026-10-04

- URL: http://139.59.109.45:3000
- PM2: `hsk-web`, trạng thái online, đã `pm2 save`.
- Release đang chạy: `/var/www/hsk-releases/20261004T074311Z`.
- DB đang dùng: `/var/www/hsk-web/data/hsk.db` (DB production cũ, không chép DB local lên).
- Backup: `/var/backups/hsk-web/20261004T074311Z/hsk.db` và `hsk-pre-switch.db`; cả hai qua SQLite quick_check.
- Cấu hình PM2: `release.config.json` và `rollback.config.json` trong thư mục backup, quyền chỉ dành cho chủ sở hữu. Không đưa các file này lên Git vì có môi trường tiến trình.
- Release chứa `release-manifest.json`, base commit `9e9b40f091ca325868dfdb56b82b833737432371` cùng các thay đổi chưa commit. SHA-256 archive: `41c8547c52d5ac80522b14dd7df6ec88f045665ebdb918335f945959d754eff0`.
- `node_modules` của release là symlink tới `/var/www/hsk-web/node_modules`: lockfile khớp SHA-256, tái sử dụng dependency Linux để tiết kiệm đĩa. Không xoá hoặc chạy `npm ci` trong thư mục cũ khi release hiện tại còn dùng symlink này. Release sau nên cài dependency riêng nếu lockfile thay đổi.
- Build trên VPS: `HSK_LOW_MEMORY_BUILD=1 NODE_OPTIONS=--max-old-space-size=384 npm run build -- --webpack` (một worker).
- `npm run check` trên VPS đạt: 17 tests, TypeScript, lint không error; 4 cảnh báo ảnh/font.
- Staging cổng nội bộ 3108 đã kiểm tra và dừng. Sau chuyển PM2, 10 trang/API trả 200, gồm flashcard, bài đọc, dictation, từ vựng, ghi chú và tra từ.
- Kiểm tra từ ngoài VPS: trang chủ, bài đọc `a-beautiful-word` và API tra `里` trả 200; xác nhận nghĩa ngắn của release mới.
- PM2 restart không đổi `cwd` trong lần chuyển đầu; đã rollback rồi tạo lại đúng tiến trình `hsk-web` từ cấu hình release. Đã xác minh `pm_cwd` thực tế trước khi lưu PM2.

Rollback code (không restore DB; migration không thay đổi trong release này):

```bash
pm2 delete hsk-web
pm2 start /var/backups/hsk-web/20261004T074311Z/rollback.config.json
pm2 save
```

Kiểm tra HTTP sau rollback. Việc tạo lại tiến trình có gián đoạn ngắn. Không khôi phục bản backup DB nếu chưa đánh giá các ghi phát sinh sau deploy.
