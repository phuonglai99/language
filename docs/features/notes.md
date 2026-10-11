# Ghi chú (Notes)

> Trạng thái hiện tại từ 2026-10-08: Notes của người dùng anonymous chỉ lưu trên trình duyệt, không ghi vào DB của hệ thống.

## Kiến trúc lưu trữ

- Toàn bộ thư mục và từ đã lưu nằm trong `localStorage` với key `hsk:notes:local:v1`.
- Không có đồng bộ tài khoản, đồng bộ thiết bị hay ghi xuống SQLite/server DB.
- Dữ liệu thuộc origin và browser profile hiện tại. Xoá site data, dùng trình duyệt/profile khác hoặc chế độ riêng tư có thể làm mất dữ liệu.
- Dữ liệu Notes cũ trong bảng SQLite được giữ nguyên để có thể phục hồi thủ công. Không tự nhập dữ liệu đó vào trình duyệt vì người dùng anonymous không có định danh để xác định chủ sở hữu.
- Các route `/api/notes/**` cũ trả `410 Gone`, ngăn client cũ tiếp tục đọc hoặc ghi Notes trên server.

Module trung tâm là `src/lib/localNotes.ts`. Mọi màn hình phải dùng module này thay vì truy cập `localStorage` trực tiếp.

## Màn hình và luồng ghi

| Nơi | Hành vi |
|---|---|
| `/notes` | Đọc danh sách thư mục local, tạo thư mục mới và hiển thị dung lượng đang dùng |
| `/notes/[id]` | Đọc/đổi tên/xoá thư mục, xoá từ, chọn nhiều và tạo bài kiểm tra hoàn toàn ở local |
| `NoteModal` | Chọn hoặc tạo thư mục local rồi lưu từ; không gọi API |
| `LocalNoteFolderModal` | Chọn/tạo thư mục đích cho tùy chọn tự lưu của Luyện nhập |
| `QuizMode` | Từ trả lời sai được lưu vào thư mục hệ thống `local-mistake` |
| `PracticeMode` | Khi bật tự lưu, câu sai/bỏ qua/xem đáp án được lưu vào thư mục đã chọn |

`local-mistake` có tên **Từ chưa vững**, luôn được tạo khi đọc store cũ chưa có thư mục hệ thống. Không cho đổi tên hoặc xoá thư mục này.

## Schema local v1

```ts
interface LocalNotesStoreV1 {
  version: 1;
  folders: Array<{
    id: string;
    name: string;
    isSystem: boolean;
    createdAt: string;
  }>;
  items: Array<{
    id: string;
    folderId: string;
    sourceKey: string;
    zh: string;
    py: string;
    vn: string;
    pos: string;
    sourceLessonId: string | null;
    createdAt: string;
  }>;
}
```

Giới hạn ứng dụng:

- tối đa 100 thư mục;
- tối đa 500 item được thêm mới trên toàn bộ các thư mục;
- tên thư mục tối đa 100 ký tự;
- store Notes vẫn có hàng rào phụ 3 MiB theo ước lượng bảo thủ `JSON.length * 2`;
- chống trùng trong một thư mục theo `sourceKey`, sau đó theo cặp `zh + py`;
- JSON sai schema/version được bỏ an toàn và khởi tạo lại thư mục hệ thống.

Mỗi lần thêm từ, module kiểm tra giới hạn 500 trước khi serialize và gọi `localStorage.setItem`. Store cũ đã có hơn 500 từ vẫn được đọc nguyên vẹn, không bị cắt hoặc xoá; user phải xoá bớt trước khi thêm từ mới. Lỗi quota hoặc localStorage bị chặn trả `false`; luồng học vẫn tiếp tục và UI có thể báo không lưu được.

## Dung lượng ước tính

Đo trực tiếp trên dữ liệu HSK hiện có bằng đúng shape JSON của local store và cách tính UTF-16 bảo thủ:

| Số từ | Dung lượng ước tính | Trung bình mỗi từ |
|---:|---:|---:|
| 100 | 43,9 KiB | khoảng 449 byte |
| 500 (giới hạn ứng dụng) | khoảng 0,22 MiB | khoảng 450 byte |
| 1.000 | 0,43 MiB | khoảng 454 byte |
| 4.898 (toàn bộ HSK 1–6 hiện tại) | 2,16 MiB | khoảng 462 byte |

Với mẫu hiện tại, 500 từ chiếm khoảng 0,22 MiB, tương đương khoảng 4,4% của quota 5 MiB. Từ có nghĩa dài hơn, metadata dài hơn hoặc nhiều folder sẽ làm dung lượng thực tế tăng nhẹ.

`/notes` hiển thị `số item/500`, dung lượng ước tính và thanh phần trăm theo giới hạn 500 từ. Hàng rào 3 MiB vẫn được giữ để phòng dữ liệu bất thường; đây là giới hạn riêng của ứng dụng, không phải cam kết quota giống nhau trên mọi trình duyệt.

## Đồng bộ giao diện

- Sau mỗi ghi thành công, module phát sự kiện `hsk:notes:local-changed` để cập nhật các component trong cùng tab.
- Trang `/notes` nghe thêm sự kiện `storage` để cập nhật khi tab khác thay đổi key Notes.
- Dữ liệu không được đồng bộ giữa thiết bị. Nếu sau này có đăng nhập, cần thiết kế rõ cơ chế import/merge trước khi bật server sync.

## API Notes cũ

Các route sau chỉ còn là hàng rào tương thích và đều trả `410 Gone` với thông báo Notes anonymous đã chuyển sang localStorage:

- `GET`, `POST /api/notes/folders`
- `PATCH`, `DELETE /api/notes/folders/[id]`
- `GET`, `POST /api/notes/items`
- `DELETE /api/notes/items/[id]`

Repo và bảng `note_folders`/`note_items` hiện được giữ như dữ liệu legacy. Không thêm luồng UI hoặc API anonymous mới vào các bảng này.

## Kiểm thử cần giữ

- store rỗng luôn có `local-mistake`;
- đọc được store local cũ chưa có folder hệ thống;
- JSON hỏng không làm crash trang;
- tạo/đổi tên/xoá folder và thêm/xoá item hoạt động;
- không xoá được folder hệ thống;
- thêm trùng không tạo item thứ hai;
- item thứ 501 bị từ chối nhưng 500 item cũ vẫn được giữ;
- đầy quota hoặc vượt 3 MiB không làm gián đoạn phiên học;
- không còn `fetch('/api/notes...')` trong client.
