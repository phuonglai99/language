/**
 * Fill missing `pos` (part of speech) for all vocab items in lessons.db.
 * Rule-based classifier — no API key required.
 * Usage: node scripts/fill-pos-local.mjs [--dry-run]
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/lessons.db');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Classifier ────────────────────────────────────────────────────────────────

function classifyPos(zh, py, vn) {
  const v = (vn ?? '').trim();
  const vl = v.toLowerCase();

  // ── 1. INTERJECTIONS ───────────────────────────────────────────────────────
  if (vl === 'thán từ' || vl.startsWith('thán từ') || vl === 'alo' || vl === 'ái chà') return 'Thán từ';

  // ── 2. PARTICLES ───────────────────────────────────────────────────────────
  const particleKeywords = ['đứng cuối câu', 'dùng trong câu hỏi', 'trợ từ ngữ khí',
    'dùng để chỉ trạng thái', 'dùng để chỉ sự thay đổi', 'trợ từ của động từ',
    'dùng để hỏi thêm', 'trợ từ', 'vân vân'];
  if (particleKeywords.some(k => vl.includes(k))) return 'Trợ từ';
  if (['của (thuộc tính)', 'đã (dùng để chỉ sự thay đổi)', 'đang (dùng để chỉ trạng thái hiện tại)',
    'đi, nhé, nhỉ (đứng cuối câu)', 'thì sao? (dùng để hỏi thêm)',
    'không (dùng trong câu hỏi)', 'a', 'a, à, ơ (trợ từ ngữ khí)',
    'đang (trợ từ)', 'đang'].includes(vl)) return 'Trợ từ';

  // ── 3. NUMERALS ────────────────────────────────────────────────────────────
  if (['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười',
    'trăm', 'nghìn', 'vạn', 'mười nghìn', 'không (số 0)', 'đầu tiên',
    'hai (khi đếm số lượng)', 'một nửa'].includes(vl)) return 'Số từ';

  // ── 4. PRONOUNS ────────────────────────────────────────────────────────────
  if (['tôi', 'bạn', 'anh ấy, ông ấy', 'cô ấy, bà ấy', 'nó (cho vật, động vật)',
    'chúng tôi', 'chúng ta', 'bạn (dùng lịch sự)', 'ai',
    'đâu, chỗ nào', 'cái gì', 'mấy', 'làm sao', 'như thế nào',
    'đây, này', 'đó, kia', 'mỗi', 'mọi người', 'người khác', 'bản thân',
    'tất cả', 'lẫn nhau, với nhau', 'đây, kia', 'tất cả, toàn bộ',
    'lẫn nhau', 'các'].includes(vl)) return 'Đại từ';
  if (vl.startsWith('bao nhiêu') || vl === 'tại sao') return 'Đại từ';

  // ── 5. CONJUNCTIONS ────────────────────────────────────────────────────────
  if (['và', 'hoặc là', 'nhưng', 'vì vậy', 'vì', 'nếu như', 'tuy rằng',
    'mà còn, hơn nữa', 'không những', 'thế là', 'cho nên', 'vì thế',
    'nhưng, có điều', 'vậy mà', 'tóm lại', 'nếu không thì', 'không bằng',
    'đồng thời', 'trừ phi', 'nếu', 'ngoài ra, còn lại', 'còn như…..',
    'vì thế, cho nên', 'tuy nhiên', 'bất kể', 'bất luận', 'cho dù',
    'tuy … vẫn', 'hoặc', 'hay là hoặc là', 'vừa ... vừa ...',
    'ngoài ra', 'đã….', 'tuy rằng, mặc dù'].includes(vl)) return 'Liên từ';

  // ── 6. PREPOSITIONS ────────────────────────────────────────────────────────
  if (['từ, theo', 'so sánh', 'dựa vào, theo', 'về (liên quan đến)',
    'về (vấn đề gì đó)', 'bị, được (giới từ bị động)', 'hướng về, đối với',
    'cùng với', 'ở, tại', 'đối với', 'từ khi….', 'theo', 'về hướng',
    'cùng', 'căn cứ vào', 'từ', 'trong đó', 'bên cạnh đó',
    'do', 'do …', 'đem, lấy (giới từ)', 'nhân', 'đến từ'].includes(vl)) return 'Giới từ';
  if (vl.includes('giới từ bị động') || vl.includes('(giới từ)')) return 'Giới từ';

  // ── 7. MEASURE WORDS ───────────────────────────────────────────────────────
  const mwExact = ['cái (đơn vị lượng từ)', 'cuốn (dùng cho sách)',
    'cái (dùng cho sự việc, quần áo)', 'miếng, đồng (tiền)',
    'tờ, bức (dùng cho vật phẳng, giấy, tranh, bàn)', 'chiếc (xe)',
    'vị, ngài', 'sợi, cái', 'tầng', 'đoạn, quãng', 'phút, phân',
    'lần', 'tuổi', 'lần, lượt', 'chuyến', 'phần', 'vài', 'đôi',
    'loại, hạt giống', 'tòa', 'trận, suất', '%', 'điểm phần trăm',
    'pound (đơn vị đo lường)', 'cái (lượng từ cho cây)', 'lượng từ cho cây',
    'lượng từ cho bài viết', 'quyển, sổ', 'tờ, bức', 'khẩu (đơn vị)',
    'cặp', 'bộ', 'lần (lượt)', 'lượt', 'đơn vị tiền tệ',
    'kilogram (kg)', 'km', 'mét', 'giây', 'tiếng đồng hồ', 'phút',
    'ngày', 'tháng, mặt trăng', 'năm',
    'cái (dùng cho bài viết)', 'giờ (trong thời gian)', 'khắc (15 phút)'];
  if (mwExact.includes(vl)) return 'Lượng từ';
  if (vl.includes('lượng từ') || vl.includes('dùng cho sách') ||
    vl.includes('dùng cho sự việc') || vl.includes('dùng cho vật phẳng') ||
    vl.includes('dùng cho cây') || vl.includes('dùng cho bài viết') ||
    vl.includes('(đơn vị lượng từ)') || vl.includes('đơn vị đo')) return 'Lượng từ';

  // ── 8. ADVERBS ─────────────────────────────────────────────────────────────
  if (['không', 'không có, chưa', 'đừng, khác biệt',
    'rất, cực kỳ', 'đều', 'vẫn, còn', 'đừng', 'khá, tương đối',
    'luôn luôn', 'hầu như, gần như', 'thường xuyên', 'thường (quá khứ)',
    'lại, vừa', 'chỉ', 'thật', 'gần đây', 'đột nhiên', 'thực ra',
    'đương nhiên', 'không ngừng', 'dần dần', 'từng bước', 'tự động',
    'đã từng', 'sớm muộn', 'liền', 'thì, ngay', 'vô cùng', 'thậm chí',
    'chí ít', 'đành', 'chỉ cần', 'tốt nhất', 'lẽ nào', 'nhân tiện',
    'ban đầu', 'nhất thiết', 'đôi khi', 'một chút', 'từ trước đến nay',
    'tùy tiện, tự nhiên', 'mãi mãi', 'vừa hay', 'vừa mới', 'ngay lập tức',
    'đặc biệt là', 'đặc biệt', 'chưa chắc', 'rốt cuộc', 'cuối cùng',
    'kịp thời', 'chủ động', 'cùng nhau', 'ban đầu', 'vừa mới',
    'lại', 'cũng', 'vẫn', 'đã', 'đang', 'mới', 'thậm chí',
    'quá', 'rất', 'khá', 'nhất', 'chỉ',
    'không ngừng', 'liên tục', 'dần dần', 'từng bước một',
    'hơn, càng', 'đã từng', 'bao nhiêu, biết bao', 'cực kỳ',
    'nhất (so sánh nhất)', 'tổng cộng', 'nhất định', 'vô cùng',
    'thật sự', 'tuy rằng, thật ra', 'tóm lại', 'nói chung',
    'từ đó', 'từ đó trở đi', 'ngay', 'liền', 'tức thì'].includes(vl)) return 'Phó từ';

  // ── 9. SET PHRASES ─────────────────────────────────────────────────────────
  const phraseExact = [
    'không có gì (đáp lại lời cảm ơn)', 'xin lỗi', 'tạm biệt', 'cảm ơn',
    'không sao, không có gì', 'gọi điện thoại', 'ngủ', 'nói chuyện',
    'hát', 'chơi bóng rổ', 'đá bóng', 'chạy bộ', 'dậy (rời khỏi giường)',
    'đi làm', 'bị bệnh', 'bơi', 'nhảy múa', 'lên mạng', 'leo núi',
    'đánh răng', 'tắm', 'quét dọn', 'giúp đỡ (động từ li hợp)',
    'gió thổi', 'mưa', 'kết hôn', 'gặp mặt', 'yên tâm', 'đến trễ',
    'sốt', 'tản bộ', 'thức đêm', 'hắt xì', 'chơi piano', 'cạn ly',
    'giảm béo', 'xếp hàng', 'tắc đường', 'nghỉ hè', 'tiêm', 'tăng ca',
    'đình công', 'chúc tết', 'điểm danh', 'mua sắm', 'đi công tác',
    'ra đời', 'tốt nghiệp', 'chào hỏi', 'đăng kí', 'nếm thử',
    'hỏi thăm', 'kết bạn', 'làm thêm', 'cắt tóc', 'đi dạo',
    'giảm giá', 'chụp ảnh', 'từ chức, bỏ việc', 'đình công',
    'thăng tiến, thăng chức', 'tìm việc', 'tranh cử, vận động bầu cử',
    'nhậm chức, nhận chức', 'cúi đầu, cúi chào', 'nhảy (lên)', 'cúi chào',
    'bỏ dở giữa chừng', 'đốt cháy giai đoạn', 'an cư lạc nghiệp',
    'nổi tiếng khắp thế giới', 'tính toán kỹ lưỡng', 'tranh thủ (thời gian)',
    'yêu không rời tay', 'trải qua nhiều thăng trầm', 'cẩn thận, chăm chỉ',
    'cải tiến, hoàn thiện', 'tập trung cao độ', 'chú ý khắp thế giới',
    'có vai trò quan trọng', 'giác ngộ, tỉnh ngộ', 'nói không ra lời',
    'chụp ảnh', 'đăng ký',
  ];
  if (phraseExact.includes(vl)) return 'Cụm từ';

  // ── 10. PROPER NOUNS ───────────────────────────────────────────────────────
  const properList = ['bắc kinh', 'trung quốc', 'tiếng hán', 'trường thành',
    'trường giang', 'châu á', 'tiếng phổ thông (tiếng trung chuẩn)',
    'tiếng phổ thông'];
  if (properList.some(p => vl.includes(p))) return 'Danh từ riêng';
  // Capitalized hints in zh field
  if (/^[A-Z]/.test(py ?? '')) return 'Danh từ riêng';

  // ── 11. ADJECTIVE PATTERNS ─────────────────────────────────────────────────
  const adjWords = [
    'lớn', 'to', 'nhỏ', 'nhiều', 'ít', 'nhanh', 'chậm', 'cao', 'thấp',
    'ngắn', 'dài', 'đắt', 'rẻ', 'nặng', 'nhẹ', 'mỏng', 'dày',
    'trắng', 'đen', 'đỏ', 'vàng', 'xanh', 'tím', 'đẹp', 'xấu',
    'lạnh', 'nóng', 'ngọt', 'đắng', 'chua', 'cay', 'mặn', 'nhạt',
    'sạch', 'bẩn', 'cũ', 'mới', 'già', 'trẻ', 'gần', 'xa',
    'đúng', 'sai', 'buồn', 'vui', 'mệt', 'bận', 'khó', 'dễ',
    'quan trọng', 'thú vị', 'thoải mái', 'đơn giản', 'phức tạp',
    'khỏe mạnh', 'an toàn', 'nguy hiểm', 'phổ biến', 'nổi tiếng',
    'thông minh', 'nghèo', 'giàu', 'bảo thủ', 'ích kỉ',
    'thành khẩn', 'kiêu ngạo', 'bi quan', 'bất an', 'hối hận',
    'lo lắng', 'căng thẳng', 'hạnh phúc', 'đáng yêu', 'nhiệt tình',
    'nghiêm túc', 'cẩn thận', 'phong phú', 'rõ ràng', 'tinh xảo',
    'chính xác', 'thuận lợi', 'hữu hảo', 'hài lòng', 'trực tiếp',
    'tự nhiên', 'trọng đại', 'chu đáo', 'thô ráp', 'đơn điệu',
    'đơn thuần', 'ẩm ướt', 'ồn ào', 'triệt để', 'trừu tượng',
    'xuất sắc', 'vội vàng', 'hữu ích', 'dữ dội', 'chăm chỉ',
    'không cần thiết', 'tất yếu', 'cần thiết', 'trung thực',
    'thật', 'giả', 'đúng hạn', 'tiêu chuẩn', 'chính thức',
    'thích hợp', 'tạm thời', 'phổ biến', 'phổ thông', 'cơ bản',
    'chủ yếu', 'thứ yếu', 'trung bình', 'thông thường', 'bình thường',
    'thành thạo', 'lưu loát', 'thịnh hành', 'hoạt bát', 'khỏe',
    'no', 'đói', 'ngọt', 'mặn', 'tươi mới', 'đặc biệt', 'kỳ lạ',
    'giống nhau', 'khác nhau', 'xúc động', 'hứng khởi', 'dũng cảm',
    'trung thực', 'trung thực', 'nhẫn nại', 'dày công', 'tỉ mỉ',
    'ưu tú', 'hài hước', 'vui vẻ', 'đáng tiếc', 'đáng thương',
    'lịch sự', 'đáng', 'lợi hại', 'năng động', 'chủ động',
    'tự giác', 'tự hào', 'hổ thẹn', 'xấu hổ', 'đắt đỏ',
    'bão hòa', 'thành thục', 'lồi lõm', 'bình thản', 'điềm tĩnh',
    'hung hăng', 'bá đạo', 'thứ yếu', 'kịch liệt', 'chính xác, tỉ mỉ',
    'cẩn thận, chăm chỉ', 'thông thạo', 'tinh tế', 'chu đáo',
    'trật tự', 'gò bó', 'cục bộ', 'chủ quan',
  ];
  if (adjWords.some(a => vl === a || vl.startsWith(a + ',') || vl.startsWith(a + ' '))) return 'Tính từ';
  // Multi-word adjective patterns
  if (/^(tốt|khỏe|đẹp|sạch|đúng|sai|nhàm|sốt|mập|gầy|béo|khô|ướt|ấm|mát|tươi|non|già|bé|đen|trắng|đỏ|xanh|vàng|tím|nâu|xám)/.test(vl)) return 'Tính từ';

  // ── 12. VERB PATTERNS ──────────────────────────────────────────────────────
  const verbStarters = [
    'ăn', 'uống', 'đọc', 'viết', 'nghe', 'nói', 'học', 'dạy', 'làm', 'mua',
    'bán', 'đi', 'đến', 'về', 'mở', 'đóng', 'xem', 'tìm', 'giúp', 'cho',
    'tặng', 'nhận', 'gặp', 'biết', 'nhớ', 'quên', 'thích', 'yêu', 'muốn',
    'nghĩ', 'hiểu', 'hỏi', 'trả lời', 'dùng', 'cần', 'lấy', 'cầm', 'đặt',
    'để', 'trả', 'giải quyết', 'phát triển', 'tổ chức', 'tham gia',
    'nghiên cứu', 'sử dụng', 'quản lý', 'kiểm tra', 'thay đổi', 'tiếp tục',
    'bắt đầu', 'kết thúc', 'hoàn thành', 'thực hiện', 'chuẩn bị',
    'tuyển dụng', 'phỏng vấn', 'điều tra', 'giới thiệu', 'giải thích',
    'chứng minh', 'đảm bảo', 'bảo vệ', 'ngăn chặn', 'kiên trì',
    'sắp xếp', 'ảnh hưởng', 'biểu diễn', 'biểu thị', 'quyết định',
    'lựa chọn', 'theo đuổi', 'tránh', 'trao tặng', 'ban hành',
    'thăm hỏi', 'mời', 'từ chối', 'nhắc nhở', 'thông báo',
    'yêu cầu', 'chú ý', 'cung cấp', 'tuyên dương', 'hứa', 'đạt',
    'trao đổi', 'phát sóng', 'tư vấn', 'lắp đặt', 'sửa chữa',
    'điều trị', 'xử lý', 'lan truyền', 'sản xuất', 'tổng hợp',
    'phân tích', 'tuân thủ', 'tôn kính', 'bổ sung', 'chịu đựng',
    'tồn tại', 'phát hiện', 'xuất hiện', 'gọi', 'chuyển', 'gửi',
    'nhận được', 'ôm', 'đeo', 'mang', 'cưỡi', 'lái', 'ngồi',
    'đứng', 'chạy', 'đi bộ', 'bơi', 'leo', 'nhảy', 'hát',
    'vẽ', 'nấu', 'xào', 'luộc', 'rửa', 'dọn', 'lau', 'sửa',
    'xây', 'phá', 'cắt', 'may', 'đan', 'in', 'phô tô', 'copy',
    'lưu', 'tải', 'cài', 'xóa', 'kiểm', 'thử', 'đo', 'cân',
    'chọn', 'bầu', 'đề nghị', 'xin', 'đăng ký', 'báo cáo',
    'trình bày', 'phát biểu', 'diễn thuyết', 'tuyên bố', 'thừa nhận',
    'phủ nhận', 'xác nhận', 'đồng ý', 'phản đối', 'ủng hộ', 'phê bình',
    'khen ngợi', 'chúc', 'cảm ơn', 'xin lỗi', 'tha thứ', 'nghi ngờ',
    'tin tưởng', 'nhận ra', 'phát hiện', 'tìm kiếm', 'so sánh',
    'phân loại', 'sắp xếp', 'tính toán', 'dự tính', 'lên kế hoạch',
    'thiết kế', 'sáng tạo', 'phát minh', 'cải tiến', 'nâng cao',
    'giảm', 'tăng', 'mở rộng', 'thu hẹp', 'kéo dài', 'rút ngắn',
    'xây dựng', 'phá hủy', 'bảo tồn', 'bảo dưỡng', 'chăm sóc',
    'nuôi dưỡng', 'điều chỉnh', 'kiểm soát', 'theo dõi', 'quan sát',
    'nhìn thấy', 'cảm thấy', 'ngửi thấy', 'nghe thấy', 'chạm vào',
    'trải qua', 'trải nghiệm', 'gặp phải', 'chịu đựng', 'vượt qua',
    'đạt được', 'giành được', 'thua', 'thắng', 'đối mặt', 'đối phó',
    'phụ trách', 'quản lý', 'hướng dẫn', 'chỉ đạo', 'lãnh đạo',
    'phục vụ', 'cung cấp', 'hỗ trợ', 'giúp đỡ', 'cứu trợ',
    'tham khảo', 'tư vấn', 'góp ý', 'phản hồi', 'cập nhật',
    'thông tin', 'liên lạc', 'liên hệ', 'kết nối', 'phối hợp',
    'kéo', 'đẩy', 'nâng', 'hạ', 'ném', 'bắt', 'giữ', 'buông',
    'mở', 'đóng', 'khóa', 'mở khóa', 'kéo khóa', 'cài',
    'gõ', 'đánh', 'đập', 'bẻ', 'gãy', 'cào', 'móc', 'nhai',
    'nuốt', 'hít', 'thở', 'ho', 'hắt xì', 'ngáp', 'ngủ', 'thức',
    'ngã', 'ngã', 'trượt', 'vấp', 'đụng', 'va', 'chạm',
    'bật', 'tắt', 'khởi động', 'thoát', 'đăng nhập', 'đăng xuất',
    'phát sóng', 'thu', 'phát', 'dịch', 'biên soạn', 'chỉnh sửa',
    'duyệt', 'xuất bản', 'phân phối', 'tiếp thị', 'quảng cáo',
    'ký', 'ký kết', 'hợp đồng', 'thỏa thuận', 'đàm phán',
    'thương lượng', 'thảo luận', 'tranh luận', 'biện luận',
    'thăm', 'tham quan', 'du lịch', 'đi chơi', 'nghỉ ngơi',
    'tiếp đón', 'chào đón', 'đưa tiễn', 'tiễn đưa',
    'học thuộc', 'ôn tập', 'chuẩn bị', 'luyện tập', 'rèn luyện',
    'thi đấu', 'tranh tài', 'cạnh tranh', 'chiến đấu', 'bảo vệ',
    'tấn công', 'phòng thủ', 'rút lui', 'chiếm', 'giải phóng',
    'chiếm lĩnh', 'đầu hàng', 'hy sinh', 'bảo vệ', 'giữ gìn',
    'phá hoại', 'cản trở', 'cản phá', 'cứu', 'giải cứu',
    'đánh giá', 'nhận xét', 'phán đoán', 'xét xử', 'kết án',
    'tha bổng', 'tạm giam', 'bắt giữ', 'thả', 'phạt', 'khen',
    'bình chọn', 'đề cử', 'bổ nhiệm', 'miễn nhiệm', 'từ chức',
    'nhận chức', 'chủ trì', 'điều phối', 'giám sát', 'thanh tra',
    'kiểm toán', 'đánh thuế', 'chi tiêu', 'tiết kiệm', 'đầu tư',
    'vay', 'cho vay', 'trả nợ', 'thanh toán', 'chuyển khoản',
    'rút tiền', 'gửi tiền', 'kinh doanh', 'buôn bán', 'giao dịch',
    'trao đổi', 'nhập khẩu', 'xuất khẩu', 'sản xuất', 'chế tạo',
    'chế biến', 'lắp ráp', 'đóng gói', 'vận chuyển', 'giao hàng',
    'thúc đẩy', 'xúc tiến', 'khuyến khích', 'động viên', 'cổ vũ',
    'an ủi', 'thoải mái', 'giải trí', 'thư giãn', 'vui chơi',
    'giải trí', 'giải thích', 'phiên dịch', 'chuyển ngữ',
    'phân tích', 'tổng hợp', 'so sánh', 'đánh giá', 'kết luận',
  ];
  if (verbStarters.some(v => vl === v || vl.startsWith(v + ',') || vl.startsWith(v + ' ') || vl.startsWith(v + '/'))) return 'Động từ';

  // Common single-character Chinese verbs
  const singleCharVerbs = ['爱','吃','喝','读','写','听','说','看','去','来','走','跑',
    '坐','站','住','开','关','进','出','回','到','问','答','买','卖','用','帮',
    '叫','打','拿','放','送','带','找','想','知','认','见','感','做','是','有',
    '在','给','让','被','把','比','从','向','跟','为','以','与','对','于','自',
    '将','就','才','再','也','都','很','太','最','不','没','可','要','能','会',
    '应','该','得','敢','肯','愿','想','喜','爱','恨','怕','担','关','注','忘',
    '记','学','教','研','查','测','考','试','办','管','理','改','换','选','定',
    '决','建','造','修','破','拆','装','搬','移','推','拉','抬','举','摆','放'];
  if (zh && zh.length === 1 && singleCharVerbs.includes(zh)) return 'Động từ';

  // ── 13. NOUN PATTERNS (DEFAULT) ────────────────────────────────────────────
  // Anything not caught above → Danh từ (most common POS in HSK)
  return 'Danh từ';
}

// ── Main ──────────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
const rows = db.prepare('SELECT id, title, level, data FROM lessons ORDER BY level, created_at').all();

let totalMissing = 0, updated = 0;
const preview = [];

for (const row of rows) {
  let d;
  try { d = JSON.parse(row.data); } catch { continue; }

  let changed = false;
  for (let i = 0; i < (d.vocab ?? []).length; i++) {
    const v = d.vocab[i];
    if (!v.pos || v.pos.trim() === '') {
      totalMissing++;
      const pos = classifyPos(v.zh, v.py, v.vn);
      if (preview.length < 30) preview.push(`[${row.level}] ${v.zh} (${v.py}) → ${pos}  | ${v.vn}`);
      if (!DRY_RUN) {
        d.vocab[i].pos = pos;
        changed = true;
        updated++;
      }
    }
  }
  if (changed) {
    db.prepare('UPDATE lessons SET data = ? WHERE id = ?').run(JSON.stringify(d), row.id);
  }
}

if (DRY_RUN) {
  console.log(`DRY RUN — would update ${totalMissing} items.\n`);
  console.log('Sample classifications:');
  preview.forEach(p => console.log(' ', p));
} else {
  console.log(`Done! Updated ${updated} vocab items across ${rows.length} lessons.`);
  console.log('\nSample:');
  preview.forEach(p => console.log(' ', p));
}

// ── Verification ──────────────────────────────────────────────────────────────
if (!DRY_RUN) {
  const rows2 = db.prepare('SELECT data FROM lessons').all();
  let stillMissing = 0;
  const posCount = {};
  for (const r of rows2) {
    const d = JSON.parse(r.data);
    for (const v of (d.vocab ?? [])) {
      if (!v.pos || v.pos.trim() === '') stillMissing++;
      posCount[v.pos || '(empty)'] = (posCount[v.pos || '(empty)'] || 0) + 1;
    }
  }
  console.log('\nPOS distribution:');
  Object.entries(posCount).sort((a, b) => b[1] - a[1]).forEach(([pos, n]) => console.log(`  ${pos}: ${n}`));
  console.log(`\nStill missing pos: ${stillMissing}`);
}
