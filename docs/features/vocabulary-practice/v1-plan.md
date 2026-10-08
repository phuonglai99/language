# Kế hoạch v1: nhìn chữ Hán và nhìn nghĩa tiếng Việt để luyện từ

Ngày: 2026-10-07. Cập nhật triển khai: 2026-10-08. Trạng thái: **đã triển khai code v1; chưa kiểm thử IME thủ công/deploy**.

Theo dõi phiên bản tại [README](README.md) và [CHANGELOG](CHANGELOG.md).

## 1. Yêu cầu đã chốt

- Làm cả hai tính năng để bổ sung cho nhau: nhìn chữ Hán → trả lời; nhìn nghĩa tiếng Việt → nhập từ tiếng Trung và kiểm tra.
- Khi nhìn chữ Hán, có hai chế độ: nhập pinyin đầy đủ kèm số thanh; hoặc dùng bàn phím tiếng Trung nhập/chọn chữ Hán.
- Pinyin phải nhập toàn bộ âm tiết, ví dụ `xue2 xiao4`; không chỉ điền số thanh.
- Dùng số **5** cho thanh nhẹ, ví dụ 妈妈 → `ma1 ma5`.
- Bỏ qua khoảng trắng khi chấm pinyin và Hán tự; không bắt người học gõ cách âm tiết. Dùng số thanh làm ranh giới âm tiết để đơn giản hóa xử lý bài nhập.
- Trước khi luyện, chọn nguồn từ **HSK 1–6** hoặc **Ngẫu nhiên**. Mỗi cấp chỉ dùng từ đúng cấp; Ngẫu nhiên lấy từ toàn bộ kho HSK 1–6 trong DB. Thứ tự/tập từ của phiên được xáo theo số lượng đã chọn.
- UI có hướng dẫn rõ ràng cho cách nhập, đặc biệt thanh nhẹ.
- Dùng thư mục `docs/features/` có sẵn để theo dõi tài liệu và phiên bản.

Các lựa chọn từ mục 2 trở đi là thiết kế gốc của v1. Trạng thái thực tế và sai khác được ghi tại mục 12 và [CHANGELOG](CHANGELOG.md).

## 2. Phạm vi và vị trí trong app

Thêm tab **Luyện nhập** ở `/lesson/[id]`. Màn cấu hình dùng nguồn từ HSK trong DB (`hsk-1`…`hsk-6` hoặc `hsk-random`); repo/API vẫn giữ khả năng đọc bài upload để tương thích luồng v1. Dùng từ/cụm từ, chưa yêu cầu dịch hay nhập cả câu dài.

| Mã dạng bài | Nhãn hiển thị | Đề | Bài nhập |
|---|---|---|---|
| `hanzi-to-pinyin` | Nhìn chữ · Gõ pinyin | 学校 | `xue2 xiao4` |
| `hanzi-to-hanzi` | Nhìn chữ · Gõ Hán tự | 学校 | `学校` |
| `vi-to-hanzi` | Nhìn nghĩa · Gõ Hán tự | trường học | `学校` |

- Giữ nguyên flashcard, quiz trắc nghiệm, ghép thẻ và dictation.
- Chế độ nhìn chữ → gõ Hán tự là bài làm quen bộ gõ; kết quả không được gọi là đã nhớ cách đọc hoặc thanh điệu.
- Luyện kết hợp mặc định trộn `hanzi-to-pinyin` và `vi-to-hanzi`; cho bật thêm `hanzi-to-hanzi` một cách chủ động.
- Chưa xây bàn phím pinyin/IME riêng, nhận diện giọng nói, viết tay, AI chấm dịch tự do hoặc đồng bộ tài khoản.
- Ôn trong phiên và lưu tiến trình trên thiết bị thuộc v1; lịch ôn cách ngày/SRS là bước sau.

## 3. Hiện trạng đã đọc trong code

| Vị trí | Hiện trạng và tác động |
|---|---|
| `src/app/lesson/[id]/page.tsx` | Có `flash`, `quiz`, `match`, `list`; cần thêm tab, xử lý URL và cô lập state theo bài |
| `src/app/lesson/[id]/QuizMode.tsx` | Hiện là trắc nghiệm hai hướng; không dùng nguyên cách tạo đáp án lựa chọn cho bài tự nhập |
| `src/types/index.ts` | `VocabCard` có `id`, `zh`, `py`, `vn`, `pos`, `ex`; chưa có `senseId`, ngôn ngữ nghĩa hoặc các đáp án được duyệt |
| `src/server/repos/vocab.ts` | `vn` có thể lấy `meaning_en` khi thiếu `meaning_vi`; không thể coi mọi `card.vn` là tiếng Việt |
| `src/server/repos/words.ts` | Từ phân biệt bằng chữ và pinyin; sense gắn nghĩa. Không gom theo riêng chuỗi chữ Hán |
| `src/shared/text.ts` | Pinyin được nối liền, giữ dấu; có helper bỏ thanh/so khớp thanh nhẹ phục vụ nhập dữ liệu. Không dùng các helper này để chấm thanh nghiêm ngặt |
| `src/lib/keyboard.ts` | Đã có guard bỏ qua phím tắt trong input và khi composition IME |
| `src/lib/dictationProgress.ts` | Có mẫu lưu tiến trình có version; tham khảo quy tắc, không dùng chung key/state với luyện từ |
| `src/i18n/README.md` | Chữ UI phải đặt trong nhóm i18n tiếng Việt |

Trước khi triển khai Next.js, đọc hướng dẫn liên quan trong `node_modules/next/dist/docs/` theo `AGENTS.md`, đặc biệt Client Components, Route Handlers và tham số route bất đồng bộ.

## 4. Luồng màn hình và nội dung hướng dẫn

### 4.1. Chọn bài tập

1. Mở tab Luyện nhập, chọn HSK 1–6 hoặc Ngẫu nhiên trên toàn bộ kho HSK 1–6.
2. Chọn Nhìn chữ Hán / Nhìn nghĩa tiếng Việt / Kết hợp.
3. Với Nhìn chữ Hán, chọn Gõ pinyin hoặc Gõ Hán tự.
4. Chọn 10/20/30 từ hoặc tất cả từ đủ dữ liệu; mặc định 10 hoặc số từ hiện có nếu ít hơn.
5. Với Kết hợp, hiển thị cả số từ và tổng số câu: một từ có thể được hỏi ở nhiều dạng.
6. Báo số từ không đủ dữ liệu cho từng dạng; không âm thầm dịch nghĩa hoặc đoán pinyin để lấp chỗ trống.
7. Có lựa chọn **Tự lưu từ chưa vững vào Notes**. Khi bật, mở popup chọn thư mục Notes cục bộ hoặc tạo thư mục mới; chỉ xác nhận bật sau khi người học chọn thư mục.
8. Nếu không có câu hợp lệ, hiển thị trạng thái trống và đường quay lại danh sách từ, không tạo phiên 0 câu.

### 4.2. Màn trả lời

- Hiện tên dạng, câu hiện tại/tổng câu, đề, ô nhập có label, nút **Kiểm tra**, **Bỏ qua**, **Xem đáp án**.
- Nhìn chữ Hán: chỉ hiện chữ, có thể thêm nghĩa/từ loại đã chọn để phân biệt cách đọc đa âm; không hiện pinyin hoặc tự phát audio trước khi nộp.
- Nhìn nghĩa: hiện nghĩa tiếng Việt theo sense, từ loại và ngữ cảnh tiếng Việt nếu có. Câu ví dụ chữ Hán/pinyin chỉ hiện sau khi chấm để tránh lộ đáp án.
- Không tái sử dụng popup tra chữ làm lộ pinyin/đáp án mà không ghi nhận đã xem gợi ý.
- Audio trước nộp, nếu được cung cấp qua nút gợi ý, phải được ghi nhận. Mặc định audio nằm ở phần phản hồi sau nộp.
- Nút nghe ở thẻ đáp án dùng icon loa, có `aria-label` và `title` “Nghe phát âm”.
- Enter trong ô nhập dùng để kiểm tra nhưng không được bắt sự kiện Enter đang xác nhận ứng viên IME.
- Trả lời đúng tự chuyển sang câu tiếp theo. Trả lời sai giữ nguyên câu, không lộ đáp án, chọn lại nội dung và focus ô nhập để người học sửa ngay; lần sai vẫn được ghi nhận và lên lịch ôn.
- Khi người học chủ động **Xem đáp án**, hiện chữ Hán, pinyin có dấu, pinyin dạng số, nghĩa và ví dụ nếu có; lúc này mới hiện nút **Câu tiếp theo** và icon nghe.

### 4.3. Hướng dẫn bắt buộc cho pinyin

Đặt hướng dẫn ngắn luôn thấy cạnh input, không chỉ trong placeholder hoặc tooltip:

> Nhập đầy đủ pinyin, thêm số thanh 1–5 sau mỗi âm tiết. Có thể viết liền hoặc cách: xue2xiao4 và xue2 xiao4 đều được. Thanh nhẹ dùng 5, ví dụ 妈妈 → ma1ma5. Với ü, bạn có thể gõ v: 绿 → lv4.

Phần **Cách nhập pinyin** mở rộng:

| Thanh | Ví dụ dạng có dấu | Cách gõ |
|---|---|---|
| 1 | mā | `ma1` |
| 2 | má | `ma2` |
| 3 | mǎ | `ma3` |
| 4 | mà | `ma4` |
| Thanh nhẹ | ma | `ma5` |

- Placeholder chung: `Ví dụ: ma1 ma5`, không lấy đáp án của câu hiện tại làm placeholder.
- Gợi ý bàn phím Latin cho mode này; tắt tự viết hoa, spellcheck/autocorrect nếu trình duyệt hỗ trợ.
- Nhắc rõ: “Dùng pinyin có số theo cách đọc trong bài; thanh nhẹ cũng cần số 5.”

### 4.4. Hướng dẫn bắt buộc cho nhập Hán tự

> Bật bàn phím tiếng Trung (Pinyin) trên thiết bị. Gõ cách đọc, chọn chữ Hán trong bộ gõ, rồi bấm Kiểm tra. Ứng dụng chấm chữ Hán bạn đã chọn và bỏ qua khoảng trắng.

- Nhãn ở dạng nhìn nghĩa: **Nhập từ tiếng Trung đã học trong bài**.
- Không tự chuyển ô nhập sang bàn phím chỉ có Latin/số khi cần bộ gõ tiếng Trung.
- Không chặn Space, phím số, mũi tên hoặc Enter khi bộ gõ đang chọn ứng viên.
- Enter dùng để xác nhận ứng viên không được đồng thời nộp bài. Kiểm tra `isComposing`, composition refs và tương thích `keyCode === 229`; kiểm thử trình duyệt thực tế, đặc biệt sự kiện Enter quanh `compositionend`.
- Nút Kiểm tra vẫn dùng được trên mobile, không phụ thuộc phím tắt. Không chấm khi composition chưa hoàn tất.

### 4.5. Khả năng truy cập và trạng thái lỗi

- Label và hướng dẫn nối với input qua `aria-describedby`; kết quả có vùng thông báo `aria-live`.
- Lỗi có chữ giải thích, không chỉ đổi màu. Giữ focus có chủ đích; không tự lấy focus khi người dùng đang xem hướng dẫn.
- Sau một đáp án sai hoặc lỗi định dạng, đưa focus về ô nhập và chọn nội dung hiện tại để có thể gõ đè; không làm vậy khi người học đã chọn Xem đáp án.
- Màn hình nhỏ không tràn ngang; hướng dẫn và nút kiểm tra nhìn thấy được khi bàn phím mở.
- Fetch/chấm lỗi phải giữ bài nhập và cho thử lại. Không ghi là trả lời sai khi mạng/API lỗi.
- Audio không khả dụng không chặn học hoặc kiểm tra đáp án.

## 5. Quy tắc chấm pinyin

### 5.1. Bài nhập của người học

- Bắt buộc mỗi âm tiết kết thúc bằng một số **1–5**, kể cả thanh nhẹ. V1 không chấp nhận bỏ thanh, dùng `0`, hoặc thay bằng dấu thanh.
- Chuẩn hóa Unicode, chữ hoa/thường và loại toàn bộ khoảng trắng Unicode trong bản dùng để chấm; giữ nguyên bài nhập để hiển thị. Không sửa giá trị input khi người học đang gõ/composition.
- `ü` và `v` tương đương trong âm tiết phù hợp (`lü4` = `lv4`); không đổi mọi `u` thành `ü` (`lu4` khác `lv4`).
- Tách bài nhập theo số thanh kết thúc mỗi âm tiết: `xue2xiao4` → `xue2`, `xiao4`. `xue2 xiao4`, `xue2xiao4` và chuỗi có khoảng trắng thừa cho cùng kết quả.
- Parser phải tiêu thụ toàn bộ chuỗi sau chuẩn hóa, không chỉ nhặt các đoạn khớp: `xue2xiao`, `xue2xiao44` hoặc `xue2!xiao4` đều cần báo định dạng. Việc bỏ khoảng trắng không được làm mất số thanh hoặc ký tự không hợp lệ.
- Không suy âm tiết còn thiếu số từ đáp án. Chuỗi như `xuexiao4` được chấm như một âm tiết người học đã nhập và không thể đúng cho đáp án hai âm tiết `xue2 xiao4`.
- Pinyin có dấu như `xué xiào` được nhắc đổi sang số, không âm thầm coi là đúng.
- Input rỗng, thiếu số, số ngoài 1–5, sai định dạng: phản hồi định dạng, không lộ đáp án và chưa tăng số lần chấm kiến thức.
- Khi định dạng hợp lệ: so chuỗi âm tiết chuẩn với đáp án; phân biệt sai âm, sai thanh, thiếu/thừa âm tiết.
- Sai âm tiết nhưng đúng định dạng, ví dụ `xue2 xia4`, là lỗi kiến thức. Không dùng bộ kiểm tra âm tiết hợp lệ để vô tình miễn mọi lỗi đánh vần.
- So sánh có căn chỉnh âm tiết để thiếu một âm tiết không làm toàn bộ phần sau bị báo sai. Nếu ánh xạ chữ–âm không chắc chắn, hiển thị lỗi theo vị trí âm tiết, không gắn sai chữ.

### 5.2. Đáp án từ nguồn

- Lấy cách đọc gắn với đúng từ/sense, không suy diễn pinyin từng chữ độc lập.
- Tạo biểu diễn chuẩn gồm danh sách `{ base, tone }`, trong đó tone là 1–5. Đây là đáp án dùng cho chấm, khác chuỗi có dấu dùng để hiển thị.
- Pinyin nguồn có thể lưu liền (`xuéxiào`, `māma`) hoặc có dấu nháy (`Xī'ān`). Cần bộ tách âm tiết có danh sách âm tiết, ranh giới dấu nháy và kiểm tra tính duy nhất; không `split(' ')` đơn thuần.
- Chỉ suy thanh nhẹ từ âm tiết không dấu khi đã xác thực chất lượng nguồn. Pinyin toàn bộ không dấu có thể là dữ liệu mất thanh, không được mặc nhiên biến tất cả thành thanh 5.
- Ca không tách duy nhất, dị đọc chưa xác định, âm tiết đặc biệt hoặc nhi hóa chưa được hỗ trợ: loại khỏi pool pinyin, ghi lý do để sửa dữ liệu. Không ép số âm tiết luôn bằng số chữ Hán.
- Theo cách đọc từ điển/bài học đã duyệt. V1 không tự nhận mọi biến điệu 一/不 hoặc thanh 3 là tương đương; nếu có nhiều cách hợp lệ cần danh sách biến thể được duyệt theo mục từ.
- Không dùng `pinyinPlain`, `neutralToneVariants` hoặc `firstReading` như đáp án chấm tự động: chúng có thể làm mất phân biệt thanh hoặc bỏ cách đọc.

## 6. Quy tắc chấm Hán tự và xử lý từ đồng nghĩa

- Cả hai dạng nhập Hán tự so sánh chữ cuối cùng sau khi IME hoàn tất. Không đọc hoặc chấm chuỗi pinyin tạm trong bộ gõ.
- Chuẩn hóa NFC và loại toàn bộ khoảng trắng Unicode ở cả bài nhập lẫn đáp án để so sánh: `学 校` và `学校` tương đương. Giữ nguyên input/draft, chỉ chuẩn hóa bản dùng để chấm sau khi IME hoàn tất.
- V1 chỉ chọn từ/cụm từ Hán tự phù hợp cho pool này. Dấu câu thừa hoặc chuỗi Latin chưa chuyển đổi được nhắc sửa định dạng; không xóa chúng để chấm phần còn lại và không tự biến pinyin thành đáp án.
- Đúng khi khớp đáp án chuẩn hoặc biến thể Hán tự được duyệt cho câu đó. Phồn thể/giản thể không tự coi tương đương nếu chưa có biến thể được duyệt.
- Nhìn chữ → gõ Hán tự: chấm đúng chuỗi đề, chủ yếu luyện thao tác bộ gõ; không cộng vào điểm nhớ từ theo nghĩa.
- Nhìn nghĩa → gõ Hán tự: chỉ hỏi từ của bài và nghĩa cụ thể. Không tuyên bố mọi đáp án khác là sai tiếng Trung.
- Nếu không khớp, dùng thông báo: **“Chưa khớp từ đang ôn trong bài. Đáp án của bài: …”**.
- Không tự chấp nhận từ chỉ vì có cùng chuỗi nghĩa tiếng Việt. Từ gần nghĩa khác cách dùng có thể không thay thế được.
- Bổ sung ngữ cảnh/từ loại, whitelist đáp án tương đương được kiểm duyệt, hoặc loại câu còn mơ hồ. Không phát hành câu đã biết mơ hồ với một đáp án độc nhất.
- Dữ liệu whitelist/câu hỏi đặc biệt đặt trong metadata phía server có version, khóa theo bài + wordId + senseId; v1 chưa cần màn quản trị hay migration riêng chỉ cho whitelist. Có thể rỗng khi không có câu cần ngoại lệ.

## 7. Dữ liệu, API và ranh giới chấm

### 7.1. Nguồn dữ liệu luyện tập

Tạo repo/DTO riêng cho luyện nhập để trả được `wordId`, `senseId`, `meaningVi` thực, chữ, pinyin gốc và ví dụ. Không sửa nghĩa của trường `VocabCard.vn` trên mọi màn hình để phục vụ riêng tính năng mới.

- Bài upload: ưu tiên sense đã liên kết ở `lesson_words.sense_id`; nếu thiếu dùng fallback xác định có nghĩa tiếng Việt trong đúng word.
- Danh sách HSK: chọn sense có tiếng Việt theo thứ tự ổn định, lưu rõ sense đã chọn.
- Nguồn Ngẫu nhiên: lấy ứng viên có `hsk_level` từ 1 đến 6 trong DB; client chỉ xáo/chọn ID câu từ DTO, còn check/reveal luôn tải lại đáp án đúng nguồn phía server.
- Thiếu tiếng Việt: không tạo câu `vi-to-hanzi`; vẫn có thể tạo dạng nhìn chữ nếu đủ dữ liệu.
- Thiếu pinyin chuẩn: loại dạng pinyin, không nhất thiết loại dạng nhập Hán tự.
- ID câu gồm bài + wordId + senseId + dạng; không dùng vị trí mảng hoặc riêng chữ Hán làm định danh.
- Chữ ký nội dung gồm đề, pinyin chuẩn, nghĩa/ngữ cảnh và tập đáp án được duyệt. Thay các mục này phải vô hiệu kết quả cũ tương ứng.
- Kiểm kê bằng truy vấn chỉ đọc trước khi chọn thư viện/bộ tách pinyin. Không sửa dữ liệu nguồn hàng loạt để làm test đi qua.

### 7.2. API đề xuất

| API | Trách nhiệm |
|---|---|
| `GET /api/lessons/[id]/practice` | Trả cấu hình dạng được hỗ trợ, câu đủ điều kiện, số mục bị loại theo lý do, `contentSignature`, `scoringVersion` |
| `POST /api/lessons/[id]/practice/check` | Nhận `questionId`, `kind`, `input`, `contentSignature`; tự tải đáp án nguồn và chấm |
| `POST /api/lessons/[id]/practice/reveal` | Nhận ID/dạng/chữ ký nội dung, trả đáp án khi người học chọn Xem đáp án; client ghi nhận đã xem |

- DTO đề dùng union theo dạng: pinyin chỉ trả chữ/ngữ cảnh cho đề, vi-to-hanzi trả nghĩa/ngữ cảnh; không nhét đáp án vào placeholder hoặc thuộc tính trợ năng.
- GET không cần trả toàn bộ answer key. Đây là app tự học, không cam kết chống gian lận vì dữ liệu từ còn có ở màn danh sách và dạng câu khác.
- Check trả `correct` hoặc `incorrect`, lỗi từng phần, đáp án chuẩn, feedback, ID/dạng/chữ ký/phiên bản chấm. Lỗi định dạng trả riêng, không tính điểm.
- Validate body, enum, giới hạn input (đề xuất tối đa 200 ký tự), membership câu trong đúng bài, dạng khả dụng; không tin đáp án, nghĩa, whitelist hoặc kết quả client gửi.
- `400`: payload không hợp lệ; `404`: bài/câu không tồn tại; `409`: nội dung đã thay đổi; `422`: định dạng bài nhập cần sửa. Mọi lỗi giữ draft và thông báo phù hợp.
- Server không ghi tiến trình trong v1. Gắn request với câu + input snapshot + mã phiên client; phản hồi đến sau đổi bài/reset không được cập nhật phiên mới.
- Tránh submit lặp, có trạng thái đang chấm; lỗi mạng không tạo thêm lượt hoặc tự chấm lại khi restore.

## 8. Phiên học, điểm và luyện kết hợp

- Lưu kết quả riêng cho ba dạng. Không gộp điểm chép lại chữ với nhớ pinyin hoặc nhớ từ theo nghĩa.
- “Đúng lần đầu, tự làm” = đúng ở lượt nộp hợp lệ đầu tiên, chưa xem gợi ý/đáp án. Sửa sau khi biết đáp án không tăng chỉ số này.
- Bỏ qua được tính chưa hoàn thành, không tính đúng. Xem đáp án đánh dấu đã xem và đưa vào danh sách ôn lại.
- Tóm tắt: đúng lần đầu/tổng câu ban đầu của từng dạng, số sai/chưa làm, số đã dùng gợi ý, kết quả luyện lại riêng.
- Câu sai/xem đáp án có thể lặp sau ít nhất 3 câu của từ khác; không đủ khoảng cách thì gom vào phần Ôn lại cuối phiên. Lượt ôn không tăng mẫu số ban đầu.
- Mỗi câu sai được đưa lại tối đa một lần tự động trong phiên để tránh vòng lặp vô hạn; sau đó người học chọn Ôn từ còn sai.
- Kết hợp không hỏi cùng một từ ngay sau khi vừa lộ đáp án ở dạng khác. Áp dụng khoảng cách ít nhất 3 từ khác, tính theo wordId và cả chữ giống nhau để tránh lộ qua dị đọc/sense khác.
- Nếu bộ từ quá nhỏ để xen kẽ, chỉ hỏi một dạng của từ đó trong lượt chính; đưa dạng còn lại sang lượt luyện riêng và thông báo rõ. Không coi nhớ ngay sau khi xem đáp án là bằng chứng nhớ lâu.

## 9. Lưu tiến trình trên thiết bị

Key đề xuất: `hsk:vocabulary-practice:progress:v1:<encoded lesson id>`. Một phiên đang học cho mỗi bài, kèm kết quả theo dạng trong phiên.

Lưu: version, lessonId, contentSignature, scoringVersion, lựa chọn dạng/số từ, thứ tự câu đã tạo, câu hiện tại, draft theo ID câu, submission/input đã chấm, lần nộp hợp lệ đầu, cờ gợi ý/đáp án, hàng đợi ôn lại và thời điểm cập nhật.

- Không lưu IME, focus, trạng thái fetch, audio hoặc toàn bộ đáp án của bài.
- Restore sau khi tải câu và kiểm tra schema/chữ ký; không ghi state mặc định đè lên dữ liệu trước restore.
- Debounce draft, flush khi chuyển câu/nộp/đổi cấu hình/rời màn theo lifecycle khả dụng. Không cam kết lưu được khi hệ điều hành kill tiến trình ngay lập tức.
- Nội dung đổi: reset phiên không tương thích, giữ thiết lập; phiên bản chấm đổi: giữ draft và cấu hình, bỏ kết quả và chỉ số phụ thuộc kết quả cũ.
- Storage lỗi/đầy: vẫn học được, thông báo không lưu được. JSON hỏng/version lạ chỉ bỏ dữ liệu riêng tính năng/bài đó.
- Sự kiện storage từ tab khác: dừng ghi tab cũ, thông báo tải lại; không tự hợp nhất phiên.
- Làm lại câu giữ dấu đã xem đáp án trong phiên. Bắt đầu phiên mới cần xác nhận nếu sẽ mất phiên đang làm; giữ thiết lập, xóa kết quả phiên cũ và hủy callback đang chờ.
- Chuyển mode trong phiên không âm thầm tái tạo queue hoặc làm mất draft; muốn đổi cấu hình bộ câu thì đi qua thao tác Bắt đầu phiên mới.

### 9.1. Notes cục bộ cho từ chưa vững

- Cấu hình phiên có cờ tự lưu và ID thư mục đã chọn. Tiến trình cũ chưa có hai trường này được đọc với mặc định tắt.
- Tự lưu khi câu trả lời sai, bị bỏ qua hoặc người học xem đáp án; không lưu khi chỉ sai định dạng nhập.
- Thư mục và mục từ dùng key `hsk:notes:local:v1`, có version/schema validation và chống trùng trong cùng thư mục. Không gọi API ghi notes và không ghi vào SQLite/server DB.
- Popup chỉ liệt kê thư mục cục bộ, cho tạo mới ngay tại chỗ và ghi rõ dữ liệu chỉ nằm trên thiết bị/trình duyệt hiện tại.
- Toàn bộ Notes của người dùng anonymous dùng chung store local này. Trang `/notes` chỉ hiển thị thư mục trên thiết bị; `/notes/[id]` đọc, đổi tên và xóa trực tiếp trong localStorage.
- Các route `/api/notes/**` cũ trả `410`; dữ liệu Notes SQLite cũ được giữ nguyên nhưng không tự nhập vì không có định danh để xác định chủ sở hữu.
- Store giới hạn thêm mới tối đa 500 từ trên toàn bộ thư mục; dữ liệu cũ vượt giới hạn không bị xoá. Trang `/notes` hiển thị số từ/500 và dung lượng đang dùng. Với dữ liệu HSK hiện tại, 500 từ chiếm khoảng 0,22 MiB.
- Nếu localStorage lỗi/đầy hoặc thư mục đã bị xóa, việc học vẫn tiếp tục và UI báo không tự lưu được.

## 10. Phân chia công việc và file dự kiến

| Bước | Công việc | Đầu ra/điều kiện hoàn thành |
|---|---|---|
| P1 | Kiểm kê dữ liệu và định nghĩa DTO | Số từ đủ điều kiện từng dạng, danh sách ngoại lệ, cách chọn sense và policy thanh/biến thể rõ ràng |
| P2 | Chuẩn hóa pinyin, chấm âm/thanh và Hán tự | Hàm thuần, fixture đại diện, không làm thay đổi helper tìm kiếm/import đang dùng |
| P3 | Repo câu hỏi và API | Membership, chữ ký nội dung, check/reveal, xử lý lỗi và không tin answer key client |
| P4 | UI hai tính năng/ba dạng | Hướng dẫn thanh 5, IME an toàn, phản hồi từng lỗi, trạng thái tải/trống/lỗi, mobile/a11y |
| P5 | Luyện kết hợp, ôn sai, tiến trình | Điểm riêng từng dạng, khoảng cách lặp, restore/reset và chống phản hồi cũ |
| P6 | Kiểm tra hồi quy và tài liệu | Checks đạt, kiểm tra IME thủ công, ghi kết quả/giới hạn vào changelog trước phát hành |

File mới dự kiến (tên có thể điều chỉnh khi triển khai, cần cập nhật tài liệu):

- `src/lib/vocabularyPractice.ts`: type, grading thuần và căn chỉnh lỗi.
- `src/lib/pinyinSyllables.ts`: parser/chuẩn hóa đáp án pinyin, không phụ thuộc DB/browser.
- `src/lib/vocabularyPracticeProgress.ts`: schema, queue/state, persistence và phiên bản.
- `src/server/repos/vocabularyPractice.ts`: nguồn câu/đáp án theo bài/sense; cho inject DB để test in-memory.
- `src/server/data/vocabularyPracticeOverrides.ts`: ngoại lệ được duyệt có version và lý do.
- `src/app/api/lessons/[id]/practice/...`: GET, check và reveal.
- `src/app/lesson/[id]/PracticeMode.tsx` và component con nếu cần: UI nhập, cấu hình, kết quả.
- `src/i18n/vi/practice.ts`: hướng dẫn, feedback và thông báo; đăng ký ở i18n index/type hiện có.
- Tests unit cho parser/grading/queue/persistence; integration cho repo và API boundary.

File hiện có cần tích hợp: page lesson, i18n index/common, DTO API và server exports nếu theo convention của dự án. Chỉ tham khảo logic dictation/keyboard/speech, không thay quy tắc chấm dictation để dùng cho bài từ.

## 11. Tiêu chí nghiệm thu và kiểm thử

### 11.1. Ma trận chấm tối thiểu

| Đề/dạng | Bài nhập | Kỳ vọng |
|---|---|---|
| 学校 / pinyin | `xue2 xiao4` | Đúng |
| 学校 / pinyin | ` XUE2   XIAO4 ` | Đúng sau chuẩn hóa |
| 学校 / pinyin | `xue2 xiao3` | Sai thanh âm tiết 2, đáp án thanh 4 |
| 学校 / pinyin | `xue2 xia4` | Sai âm ở âm tiết 2 |
| 学校 / pinyin | `xue xiao` | Thiếu số thanh; chưa chấm kiến thức |
| 学校 / pinyin | `xue2xiao4` | Đúng như `xue2 xiao4` |
| 学校 / pinyin | `xué xiào` | Hướng dẫn nhập số thanh |
| 学校 / pinyin | `xue2xiao`, `xue2xiao44`, `xue2!xiao4` | Báo định dạng; không bỏ phần dư để chấm đúng |
| 学校 / pinyin | `xuexiao4` | Không đúng; không tự bổ sung số thanh hoặc tách theo đáp án |
| 妈妈 / pinyin | `ma1 ma5` | Đúng với nguồn đã duyệt `māma` |
| 妈妈 / pinyin | `ma1 ma`, `ma1 ma0` | Thiếu thanh 5 / số không hợp lệ |
| 绿 / pinyin | `lv4`, `lü4` | Đúng; `lu4` sai âm |
| 西安 / pinyin | `xi1 an1` | Đúng, không gộp thành `xian1` |
| 学校 / gõ Hán tự | `学校` | Đúng sau commit IME |
| 学校 / gõ Hán tự | ` 学 校 ` | Đúng, bỏ qua khoảng trắng |
| 学校 / gõ Hán tự | `xuexiao` | Nhắc chọn Hán tự, không tự chuyển đổi |
| trường học / gõ Hán tự | `学校` | Đúng; không lộ chữ/pinyin trước nộp |
| Nghĩa có nhiều đáp án được duyệt | Biến thể trong whitelist | Đúng theo sense/câu; không suy whitelist từ cùng bản dịch |

Thêm fixture: Unicode tổ hợp, khoảng trắng Unicode/tab/xuống dòng và input chỉ có khoảng trắng, pinyin nguồn liền/không dấu/mơ hồ, chữ đa âm, thiếu/thừa âm tiết, thanh nhẹ khác thanh có dấu, dữ liệu thiếu nghĩa Việt, sense ngoài bài và từ cùng chữ khác cách đọc. Quy tắc tách bài nhập bằng số thanh không thay thế bộ tách pinyin có dấu từ nguồn ở mục 5.2.

### 11.2. Kiểm thử tích hợp và trải nghiệm

- Unit: parser và grader nghiêm ngặt; căn chỉnh lỗi; điểm lần đầu; queue không liền từ; retry có giới hạn; validation progress/reset/version.
- Integration DB `:memory:` theo testing hiện tại: lấy đúng sense bài/HSK; không dùng fallback tiếng Anh làm đề Việt; membership/whitelist và loại câu lỗi dữ liệu.
- API: payload sai, input quá dài, bài/câu ngoài phạm vi, client gửi đáp án giả, chữ ký cũ, lỗi server; không tính điểm khi request lỗi.
- UI: ba dạng độc lập, hướng dẫn thanh 5 luôn tìm được, Enter chấm an toàn với IME, đúng tự chuyển câu, sai focus để nhập lại, kiểm tra/xem đáp án/bỏ qua/ôn lại và tổng kết chính xác.
- IME: Enter chọn ứng viên không submit; Space/số/mũi tên không bị chiếm; kiểm tra trên trình duyệt desktop và ít nhất một thiết bị mobile có bộ gõ Trung. Ghi rõ nền tảng đã thử, không coi test DOM giả là đủ.
- Persistence: tải lại giữ draft/queue; đổi bài/reset khi request chậm; storage hỏng/đầy/khác tab; không khôi phục kết quả của phiên cũ.
- Hồi quy: flashcard/quiz/match và phím tắt dictation không thay đổi ngoài phạm vi; từ thiếu dữ liệu vẫn hiển thị được ở danh sách gốc.
- Chạy `npm run check` sau triển khai theo [testing](../../development/testing.md); build với fixture/môi trường phù hợp, không phụ thuộc DB thật trong test tự động. Báo riêng lỗi nền có sẵn nếu có.

## 12. Theo dõi thực hiện

- [x] Ghi yêu cầu hai tính năng, hai mode nhìn chữ và thanh nhẹ 5.
- [x] Đọc luồng lesson/quiz, repo từ và helper pinyin hiện tại.
- [x] Tạo kế hoạch, hướng dẫn UI và quy ước version trong `docs/features/`.
- [x] P1: Kiểm kê dữ liệu thực và chốt cách chuẩn hóa/ngoại lệ. HSK1–6 có lần lượt 145/148/290/578/1295/2420 mục đủ pinyin; các mục bị loại có lý do `unmarked`/`unsupported`. Sáu bài upload có 63 câu pinyin và 65 câu cho mỗi dạng Hán tự trên snapshot DB ngày 2026-10-08.
- [x] P2: Triển khai parser, grading, căn chỉnh lỗi và unit test.
- [x] P3: Triển khai repo riêng, GET/check/reveal, chữ ký nội dung và test DB in-memory. API không nhận đáp án từ client.
- [x] P4: Triển khai UI ba dạng, hướng dẫn thanh 5, composition guard, trạng thái lỗi/loading/empty và vùng thông báo trợ năng.
- [x] P5: Triển khai kết hợp, lượt riêng khi pool nhỏ, ôn sai tối đa một lần, điểm theo dạng và local progress có version/chống tab ghi đè.
- [x] Bổ sung bộ chọn HSK 1–6/Ngẫu nhiên; lưu tiến trình tách theo nguồn và thêm integration test nguồn Ngẫu nhiên đi qua nhiều cấp HSK.
- [x] Bổ sung tùy chọn tự lưu câu chưa vững vào thư mục Notes cục bộ, popup chọn/tạo thư mục và hiển thị thư mục local ở trang Notes; không ghi DB.
- [ ] P6: `npm run check` và production build bằng webpack đã đạt ngày 2026-10-08. Turbopack build không chạy được trong sandbox vì không được bind cổng nội bộ. Còn kiểm tra IME thủ công trên desktop/mobile và E2E trình duyệt trước khi coi là phát hành hoàn tất.

Code v1 đã được triển khai nhưng chưa deploy. Giới hạn hiện tại: whitelist ngoại lệ đã có cấu trúc/version nhưng đang rỗng; chưa có SRS cách ngày hay đồng bộ tài khoản.
