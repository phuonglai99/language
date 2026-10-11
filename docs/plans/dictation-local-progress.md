# Kế hoạch cải thiện luyện nghe và lưu tiến trình trên trình duyệt

Ngày lập: 2026-10-05. Trạng thái: đã triển khai code ngày 2026-10-05; chưa chạy regression test/E2E trước deploy.

## 1. Mục tiêu và phạm vi

Tự động lưu quá trình học ở `/dictation/[slug]` bằng localStorage. Người học tải lại trang, chuyển bài hoặc đóng trình duyệt rồi quay lại sẽ tiếp tục từ câu đang học, giữ bài làm và kết quả đã chấm.

“Của user” trong phạm vi này là cùng trình duyệt, cùng profile và cùng origin (giao thức + host + port), chưa phải dữ liệu gắn tài khoản. Không đồng bộ giữa thiết bị; đổi domain/port hoặc xoá dữ liệu trình duyệt sẽ không thấy tiến trình cũ. Người dùng chung profile trình duyệt dùng chung tiến trình. Không cần thêm cột SQLite hoặc API lưu tiến trình.

Phạm vi phiên bản đầu: màn luyện nghe, không bao gồm công cụ căn audio, flashcard hay lịch sử nhiều lượt học. Mỗi bài giữ một lượt học hiện tại. Badge tiến trình ở danh sách bài có thể bổ sung sau.

Phạm vi bổ sung: dấu `*` đỏ cho số cần nhập; tự hiển thị dấu câu/ký tự đặc biệt và loại khỏi điểm; mở gợi ý từng từ bằng chữ Hán hoặc pinyin. Các yêu cầu này triển khai cùng cơ chế lưu tiến trình bên dưới.

## 2. Hiện trạng

File chính: `src/app/dictation/[slug]/page.tsx`.

- Vị trí câu, bài nhập, kết quả, gợi ý, tốc độ và độ khó chỉ nằm trong React state.
- `changeSentence()` hiện xoá `userInput`, nên chuyển câu cũng mất bài đang nhập.
- `results` và `hintUsed` đang dùng vị trí mảng; API chấm bài nhận `sentences[currentIndex].index`.
- Điểm và số câu đã làm được tính từ `results`; không cần lưu thêm các số tổng hợp này.
- Nội dung câu lấy qua `/api/dictation/lessons/[slug]`; kết quả chấm từ `/api/dictation/check`.

## 3. Trải nghiệm mong muốn

1. Mở bài lần đầu: bắt đầu như hiện tại, bật tự lưu mặc định.
2. Nhập bài: lưu bản nháp từng câu; chuyển câu rồi quay lại vẫn còn nội dung.
3. Chấm bài: lưu bài đã nộp, kết quả và việc đã dùng gợi ý cho câu đó.
4. Quay lại bài: tự khôi phục và thông báo nhẹ “Đã khôi phục tiến trình trên thiết bị này”. Không tự phát audio hoặc tự gửi lại yêu cầu chấm.
5. Lưu tốc độ (hiện có 0.75 và 1) và độ khó (`easy`, `normal`, `hard`) theo từng bài.
6. Thêm “Làm lại bài”: xác nhận, xoá tiến trình riêng bài hiện tại, về câu đầu. Giữ tốc độ và độ khó đang chọn; bài làm/kết quả/gợi ý được xoá.
7. Nút làm lại từng câu chỉ xoá bản nháp và kết quả câu đó. Giữ cờ đã dùng gợi ý trong lượt học hiện tại để không mất dấu việc đã xem đáp án.
8. Hoàn thành bài vẫn giữ tiến trình cho đến khi người học chọn làm lại.
9. Nếu lưu bị chặn/đầy bộ nhớ: vẫn học bình thường bằng state và hiện cảnh báo “Không thể lưu tiến trình trên trình duyệt này”; không báo đã lưu thành công.

## 4. Dữ liệu lưu

Key mỗi bài: `hsk:dictation:progress:v1:<slug được encodeURIComponent>`.

Cấu trúc dự kiến:

```ts
type DictationProgressV1 = {
  version: 1;
  slug: string;
  updatedAt: number; // Unix milliseconds
  contentSignature: string;
  scoringVersion: 1; // Tăng khi quy tắc chấm thay đổi để vô hiệu kết quả cũ
  currentSentenceIndex: number; // index từ API, không phải vị trí mảng
  playbackRate: 0.75 | 1;
  difficulty: 'easy' | 'normal' | 'hard';
  wordHintMode: 'hanzi' | 'pinyin';
  sentences: Record<string, {
    draft: string;
    hintUsed: boolean;
    wordHintsUsed: Record<string, { hanzi: boolean; pinyin: boolean }>; // tokenId trong câu
    submission?: {
      input: string; // Bài nhập tại thời điểm gửi chấm
      result: CheckResult;
    };
  }>;
};
```

`CheckResult` tái sử dụng cấu trúc hiện có, chuyển type ra module dùng chung nếu cần. Chỉ lưu các câu đã tương tác, không lưu audio, DOM, toàn bộ bài đọc hoặc thông tin tài khoản.

Không lưu `isPlaying`, `isChecking`, trạng thái IME, refs hay trạng thái mở gợi ý. Khi khôi phục, audio dừng và gợi ý đóng; cờ `hintUsed` vẫn được giữ. Lưu riêng bài đã nộp giúp phân biệt kết quả cũ với bản nháp đã sửa nhưng chưa chấm lại.

## 5. Cách triển khai

### A. Module persistence

Tạo `src/lib/dictationProgress.ts` phụ trách tạo key, đọc, kiểm tra schema, ghi và xoá tiến trình. Bao toàn bộ truy cập localStorage và JSON bằng xử lý lỗi; không truy cập `window` ở cấp module hoặc lúc render server.

Kiểm tra version, slug, giá trị enum, độ dài chuỗi, số phần tử, index hợp lệ và cấu trúc kết quả chấm. Không tin JSON đã lưu là đúng chỉ vì ép kiểu TypeScript. Dữ liệu hỏng bỏ qua riêng bài đó; không dùng `localStorage.clear()` và không ảnh hưởng ghi chú/cài đặt khác.

### B. Nhận diện phiên bản nội dung

Tạo `contentSignature` xác định từ danh sách câu có thứ tự, gồm `index`, `hanzi`, `words`, `pinyin` và danh sách token có thứ tự (id, text, kind, pinyin, scorable); loại trừ timestamp căn audio. Cần thuật toán ổn định giữa các lần mở và so sánh trước khi restore.

Nếu chữ, cách chia câu/từ hoặc thứ tự câu thay đổi: reset bài làm/kết quả/vị trí của bài, giữ thiết lập tốc độ/độ khó hợp lệ, báo “Nội dung bài đã thay đổi, tiến trình bài này được bắt đầu lại”. Chỉ sửa thời gian audio thì vẫn giữ tiến trình. Phiên bản đầu chọn reset toàn bài khi nội dung khác để tránh ghép kết quả vào sai câu.

### C. Khôi phục trước khi tự lưu

Chờ tải bài thành công, đọc storage, kiểm tra chữ ký nội dung rồi khôi phục state một lần theo slug. Chỉ bật cơ chế ghi khi hoàn tất bước này, tránh state mặc định ghi đè tiến trình cũ.

Tách state theo slug (ví dụ component con có `key={slug}`); huỷ fetch/callback cũ khi đổi bài. Ánh xạ index API về vị trí mảng hiện tại, fallback câu đầu nếu index lưu không còn hợp lệ. Bài không có câu phải xử lý an toàn.

### D. Ghi tiến trình

- Khi gõ: cập nhật bản nháp trong bộ nhớ ngay, debounce ghi localStorage khoảng 500 ms.
- Khi chuyển câu, chấm xong, dùng gợi ý, đổi thiết lập hoặc làm lại: ghi ngay snapshot mới nhất, không dùng closure/state cũ.
- Khi `visibilitychange` chuyển sang hidden và khi `pagehide`: flush snapshot còn chờ. Cleanup lúc rời bài cũng flush, trừ khi phiên ghi đã bị vô hiệu hoá do reset/xung đột.
- Tôn trọng composition của bộ gõ: không can thiệp IME; `compositionend` cập nhật và lưu văn bản đã hoàn tất. Khôi phục không kích hoạt phím tắt.
- Chỉ lưu kết quả chấm khi HTTP thành công và payload hợp lệ. Gắn response với slug, index và nội dung đã gửi; response đến muộn sau đổi câu không được gán sang câu mới. Response của lượt trước phải bị bỏ qua sau “Làm lại bài”.
- Sau reset, huỷ timer/request cũ và tăng mã phiên học trong bộ nhớ để callback cũ không ghi lại dữ liệu vừa xoá.

localStorage được chia sẻ giữa các tab. Phiên bản đầu dùng sự kiện `storage`: nếu tab khác cập nhật/xoá cùng bài, ngừng tự ghi ở tab hiện tại, huỷ debounce và hiện thông báo yêu cầu tải lại để tiếp tục lưu. Không tự ghi đè bản mới lúc tab cũ đóng. Không cần hợp nhất bài làm giữa hai tab trong phiên bản này.

Khi `scoringVersion` thay đổi nhưng nội dung không đổi: giữ bản nháp/vị trí/thiết lập, bỏ kết quả chấm không còn tương thích và yêu cầu chấm lại.

### E. UI và i18n

Đặt thông báo khôi phục/trạng thái lưu và nút “Làm lại bài” gần phần tiến trình. Thêm nội dung tiếng Việt trong `src/i18n/vi/dictation.ts`. Dùng thông báo ngắn, không hiển thị tên key hoặc JSON cho người học.

Không đổi hành vi Space/Enter của ô tìm kiếm; giữ các sửa lỗi phím tắt đã triển khai.

### F. Số: dấu `*` đỏ và hướng dẫn nhập

- Với phần đáp án là chữ số, hiển thị một `*` đỏ cho mỗi chữ số còn bị che; không tự lộ số như gợi ý mặc định hiện nay. Ví dụ `2026` → `****` đỏ.
- Hiển thị hướng dẫn cạnh vùng nhập: **“Dấu * màu đỏ là chữ số cần điền. Hãy nhập số tương ứng bạn nghe được.”**
- Bổ sung nhãn truy cập “Cần nhập số” cho ô số; không dùng màu đỏ làm tín hiệu duy nhất. Phân biệt dấu `*` đỏ với màu báo đáp án sai.
- Số là phần bài làm cần chấm điểm, không phải ký tự đặc biệt được bỏ qua. Giữ cách tính theo token/từ hiện tại, không chuyển riêng số sang điểm theo từng chữ số.
- Hỗ trợ số ASCII và full-width (`123`, `１２３`) qua chuẩn hoá. Chữ Hán viết số như `三` vẫn là chữ Hán nếu đáp án nguồn là `三`; không suy diễn mọi từ Hán chỉ số thành ô chữ số.
- Token hỗn hợp như `3点`, `A3` chỉ tô đỏ dấu che tương ứng chữ số, không tô đỏ cả token.
- Với số thập phân, ngày tháng hoặc phần trăm (`3.5`, `2026/10/05`, `20%`): chữ số bị che, dấu phân cách/ký hiệu được hiện sẵn và không tính điểm. Cần giữ cùng quy tắc tách token cho client và API.

### G. Dấu câu và ký tự đặc biệt: hiện sẵn, không chấm

- Hiển thị ngay dấu câu và ký hiệu đúng vị trí trong câu, kể cả khi che toàn bộ đáp án: `，。！？、：；`, dấu ngoặc, dấu nháy, dấu gạch, `%`, ký hiệu tiền tệ…
- Người học chỉ phải nhập chữ/từ và số. Khi chấm, chuẩn hoá cả đáp án lẫn bài nhập để bỏ các dấu câu/ký hiệu theo cùng một quy tắc; nhập hoặc không nhập chúng không làm mất điểm, không tạo lỗi `extra` hoặc lệch ô phía sau.
- Khoảng trắng dùng để bố trí nội dung, không tạo ô đáp án hoặc điểm riêng. Chữ Latin vẫn là chữ cần nhập, không coi là ký tự đặc biệt chỉ vì không phải chữ Hán.
- Tách rõ token hiển thị và token cần chấm. Ký hiệu không tham gia tử số, mẫu số, số từ cần nhập, trạng thái đúng hoàn toàn hoặc số câu đã hoàn thành. Câu không có token cần chấm không thành bài tập/không chia cho 0.
- Không chỉ mở rộng regex xoá dấu: phải giữ chuỗi gốc cho UI và ánh xạ token chấm về đúng vị trí gốc. Dùng Unicode punctuation/symbol khi phù hợp, xử lý dấu thanh/pinyin mà không xoá nhầm chữ.
- Ví dụ đáp án `我有3本书。`: dấu `。` hiện sẵn, vị trí số có `*` đỏ; nhập `我有3本书` hoặc `我有3本书。` cho kết quả tương đương.

### H. Gợi ý từng từ: chữ Hán hoặc pinyin

- Thêm lựa chọn **“Gợi ý từng từ: Chữ Hán / Pinyin”**, mặc định Pinyin để hỗ trợ phát âm trước khi lộ chữ. Lựa chọn chế độ không tự mở gợi ý.
- Mỗi token cần nhập có nút/ô có thể bấm hoặc dùng bàn phím để xem riêng gợi ý của token đó. Không mở toàn câu hoặc tự điền câu trả lời.
- Chế độ Chữ Hán hiện nguyên từ; chế độ Pinyin hiện pinyin có dấu của đúng từ. Với token số/Latin, dùng pinyin/phát âm từ dữ liệu nguồn nếu có; chế độ hiện đáp án hiển thị token gốc và tính là đã xem gợi ý.
- Không tách pinyin toàn câu theo khoảng trắng rồi ghép với `words`: từ nhiều âm tiết và chữ đa âm dễ lệch. Lấy pinyin của token gốc từ nội dung bài khi tạo API câu luyện nghe.
- Nếu token thiếu pinyin, báo “Chưa có pinyin cho từ này”; không tự lộ đáp án hoặc tạo pinyin chưa kiểm chứng. Chỉ đánh dấu dùng gợi ý khi thực sự hiển thị được nội dung.
- Bấm lại cùng từ đóng gợi ý. Đổi chế độ khi một từ đang mở thì cập nhật loại gợi ý cho từ đó và ghi nhận loại đã xem; không mở các từ khác. Chế độ khó không vô hiệu nút gợi ý chủ động của người học.
- Giữ tính năng gợi ý toàn câu hiện có, tách nhãn với gợi ý từng từ. Gợi ý toàn câu và gợi ý từng từ đều đặt cờ `hintUsed` của câu; lưu thêm lịch sử loại gợi ý theo token để khôi phục đúng.
- Việc xem gợi ý không tự tăng/giảm điểm đúng của bài nhập; tiếp tục đánh dấu “đã dùng gợi ý” để phân biệt bài tự làm. Không tự tạo quy tắc trừ điểm mới.
- Lưu `wordHintMode` và `wordHintsUsed` theo bài trong localStorage. Khi quay lại bài, khôi phục lịch sử sử dụng nhưng đóng các gợi ý đang mở. Làm lại một câu giữ lịch sử gợi ý trong lượt học; làm lại toàn bài xoá lịch sử và giữ chế độ lựa chọn.

### I. Các phần code dự kiến thay đổi

- `src/lib/dictation.ts`: mô hình token có id trong câu, text gốc, kind, pinyin, scorable; phân loại số/ký hiệu; chuẩn hoá và chấm nhất quán. Giữ ranh giới từ gốc khi tách các đoạn hiển thị để tránh đổi trọng số điểm ngoài ý muốn.
- `src/app/api/dictation/lessons/[slug]/route.ts`: trả token chi tiết từ nội dung nguồn, gồm pinyin từng từ; không cần đổi schema SQLite.
- `src/app/api/dictation/check/route.ts`: dùng chung quy tắc bỏ dấu/ký hiệu, chỉ chấm token cần nhập. API tự lấy đáp án từ bài, không tin đáp án hoặc cờ `scorable` do client gửi.
- `src/app/dictation/[slug]/page.tsx`: render dấu số đỏ, ký hiệu hiện sẵn, gợi ý từng từ; cập nhật đếm từ/điểm và lưu tiến trình.
- `src/i18n/vi/dictation.ts`: hướng dẫn dấu số đỏ, lựa chọn loại gợi ý, nhãn trợ năng và thông báo thiếu pinyin.

## 6. Thứ tự thực hiện

- [x] Chốt mô hình token hiển thị/chấm, giữ pinyin từng từ và bổ sung dữ liệu API.
- [x] Đồng bộ quy tắc dấu câu/ký hiệu và cách tính điểm giữa client/API.
- [x] Render dấu `*` đỏ cho số, hướng dẫn nhập và ký hiệu hiện sẵn.
- [x] Thêm gợi ý từng từ; UI hiện tại mở popup Chữ Hán/Pinyin trực tiếp từ cụm `*` tương ứng và hiển thị hai hàng Pinyin/Hán tự.
- [x] Thêm type, schema validation và module persistence có version.
- [x] Tổ chức bản nháp/kết quả theo index câu và cô lập state theo slug.
- [x] Tích hợp restore sau khi tải bài; chặn ghi trước restore.
- [x] Tích hợp debounce, flush, lưu thiết lập/gợi ý và xử lý response chấm đến muộn.
- [x] Thêm reset câu/bài, thông báo và xử lý xung đột nhiều tab.
- [ ] Bổ sung kiểm thử trình duyệt cho popup gợi ý, wrapping và IME; tài liệu hành vi đã được cập nhật.
- [ ] Khi chuẩn bị deploy production, kiểm tra trình duyệt thật; automated checks đã chạy đạt ngày 2026-10-08.

## 7. Tiêu chí nghiệm thu trước deploy

- Nhập tiếng Việt/Trung, chuyển câu, tải lại, đóng/mở bài: giữ đúng bản nháp từng câu và vị trí học.
- Điểm, số câu đã chấm và cờ dùng gợi ý khôi phục đúng; sửa bản nháp không làm kết quả cũ trông như vừa chấm bản mới.
- Tốc độ/độ khó khôi phục, audio không tự chạy.
- Hai bài lưu độc lập; đổi bài khi request còn chạy không làm lẫn tiến trình.
- Làm lại một câu không xoá câu khác; làm lại bài không xoá bài khác; callback cũ không phục hồi dữ liệu đã reset.
- JSON hỏng, version lạ, index vượt giới hạn, storage bị chặn/đầy không làm crash màn học.
- Thay nội dung câu làm mất hiệu lực tiến trình đúng cách; chỉnh timestamp audio vẫn giữ tiến trình.
- Hai tab không âm thầm ghi đè tiến trình sau khi phát hiện thay đổi từ tab khác.
- Tab bị đóng ngay sau nhập liệu được flush trong các sự kiện vòng đời thông thường; không cam kết lưu được khi trình duyệt/hệ điều hành bị kill trước khi chạy callback.
- Giữ hoạt động tìm kiếm, phím tắt và bộ gõ IME hiện tại.

Các tiêu chí bổ sung cho số, ký hiệu và gợi ý:

- `2026`, `１２３`, `3点`, `A3`: chỉ dấu che chữ số tô đỏ; hướng dẫn nhập số luôn tìm thấy được.
- `3.5`, `20%`, ngày tháng và dấu câu Trung/Anh: ký hiệu hiện sẵn; có/không gõ ký hiệu cho cùng kết quả, không làm lệch câu trả lời phía sau.
- Dấu câu/ký hiệu không tăng điểm hay mẫu số; số và chữ Latin vẫn được chấm; câu chỉ có ký hiệu không tạo điểm giả.
- Gợi ý đúng từ nhiều âm tiết, chữ đa âm theo dữ liệu bài, từ thiếu pinyin và token số/Latin; đổi chế độ không mở cả câu hoặc tự điền đáp án.
- Dùng gợi ý rồi tải lại: giữ cờ/lịch sử và lựa chọn chế độ nhưng không tự mở đáp án. Xác nhận khôi phục không cộng điểm cho ký hiệu hoặc kết quả theo quy tắc chấm cũ.
- Các ô gợi ý thao tác được bằng bàn phím, không kích hoạt nhầm phím tắt toàn màn hình khi đang nhập hoặc chọn gợi ý.

Tính năng và UI gợi ý tại chỗ đã được triển khai; chưa deploy và chưa kiểm tra IME/popup trên thiết bị thật.
