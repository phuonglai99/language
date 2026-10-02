# Báo cáo đối chiếu P6 — DB cũ ↔ DB v4

Sinh bởi `npm run migrate:v4:report` lúc 2026-10-02T11:48:24.260Z.

## 1. Tổng quan

| | DB cũ (`lessons.db`) | DB mới (`hsk.db`) |
|---|---|---|
| Dung lượng | 98.0 MB | 56.7 MB |
| `integrity_check` | | ok |
| `foreign_key_check` | | không lỗi |

## 2. Đối chiếu số liệu — 22/22 đạt

| Nhóm | Kiểm tra | DB cũ | DB mới | Kỳ vọng | |
|---|---|---|---|---|---|
| Chữ Hán | kanji → characters (crawl_status = ok) | 11.906 | 11.905 | 11.905 (bỏ 1 dòng hỏng) | ✅ |
| Chữ Hán | Chữ có dữ liệu nét | 8.009 | 8.009 | bằng nhau | ✅ |
| Chữ Hán | Chữ có phân tích Ý/Âm | 642 | 642 | bằng nhau | ✅ |
| Chữ Hán | Dòng phân tích Ý/Âm | 1.145 | 1.145 | bằng nhau | ✅ |
| Chữ Hán | Chữ có bộ thủ | 11.905 | 11.905 | bằng nhau | ✅ |
| Từ vựng | Chữ trong vocab import có trong words | 4.925 | 4.925 | bằng nhau | ✅ |
| Từ vựng | Ví dụ của vocab → sense_examples | 5.067 | 5.067 | bằng nhau | ✅ |
| Từ vựng | (wordId, definition) Mandarin Bean → nghĩa en | 7.532 | 7.532 | bằng nhau | ✅ |
| Từ vựng | Chữ trong word_characters thiếu ở characters | 0 | 0 | bằng nhau | ✅ |
| Bài khóa | mb_lessons → passages | 729 | 729 | bằng nhau | ✅ |
| Bài khóa | Câu | 6.629 | 6.629 | bằng nhau | ✅ |
| Bài khóa | Token | 119.864 | 119.864 | bằng nhau | ✅ |
| Bài khóa | Token có wordId → token có nghĩa (s) | 99.846 | 99.846 | bằng nhau | ✅ |
| Bài khóa | Câu có mốc audio | 5.765 | 5.764 | 5.764 (bỏ 1 mốc dài 0 giây) | ✅ |
| Bài khóa | Bài "Checked" → review_status = checked | 507 | 507 | bằng nhau | ✅ |
| Bài khóa | Bài có văn bản khác content_text cũ | 0 | 0 | bằng nhau | ✅ |
| Ngữ pháp | hanzii_grammar + ngữ pháp bài upload → grammar_points | 1.744 | 1.744 | bằng nhau | ✅ |
| Ngữ pháp | hsk = "Khác" → nhóm Chưa xếp cấp | 437 | 437 | bằng nhau | ✅ |
| Ngữ pháp | Bài tập | 27 | 27 | bằng nhau | ✅ |
| Ngữ pháp | Điểm có formula trùng title | 0 | 0 | bằng nhau | ✅ |
| Ghi chú | note_folders | 2 | 2 | bằng nhau | ✅ |
| Ghi chú | note_items | 5 | 5 | bằng nhau | ✅ |

## 3. Mẫu ngẫu nhiên để xem tay

### 3.1 Chữ Hán (20)

| Chữ | Hán Việt | Bộ thủ | Lục thư | Phổ biến | Ý/Âm | Nét |
|---|---|---|---|---|---|---|
| 丿 | triệt.thiên.phiệt | 丿 triệt | ideograph | 1 |  | có |
| 粕 | phách | 米 mễ | phono_semantic | 2 |  | có |
| 颌 | hạp.cáp | 頁 hiệt | phono_semantic | 3 |  | có |
| 栿 | phúc | 木 mộc | phono_semantic | 1 |  | — |
| 竝 | tịnh | 立 lập | compound | 1 |  | — |
| 犯 | phạm | 犬 khuyển | phono_semantic | 5 |  | có |
| 橺 | giám | 木 mộc | phono_semantic | 1 |  | — |
| 绦 | thao | 糸 mịch | phono_semantic | 2 |  | có |
| 砝 | pháp.kiếp | 石 thạch | phono_semantic | 2 |  | có |
| 辛 | tân | 辛 tân | pictograph | 4 |  | có |
| 醚 | mê | 酉 dậu | phono_semantic | 2 |  | có |
| 牁 | ca | 爿 tường | phono_semantic | 1 |  | mảng trần |
| 菨 | sáp | 艸 thảo | phono_semantic | 1 |  | — |
| 乜 | mã.mị.khiết | 乙 ất | compound | 2 |  | có |
| 盍 | hạp | 皿 mẫn | compound | 2 |  | có |
| 缒 | truý | 糸 mịch | phono_semantic | 2 |  | có |
| 門 | môn | 門 môn | pictograph | 5 |  | có |
| 仑 | lôn.luân | 人 nhân | compound | 4 |  | có |
| 咧 | liệt | 口 khẩu | phono_semantic | 4 |  | có |
| 癶 | bát | 癶 bát | compound | 1 |  | có |

### 3.2 Từ vựng (20)

| Từ | Pinyin | HSK | Chủ đề | Nguồn | Nghĩa |
|---|---|---|---|---|---|
| 代 | dài | 5 |  | mandarin_bean | ?: generation; dynasty; age; period; (historical) era; (geological) eon |
| 编织 | biānzhī | 6 |  | import | v: đan, dệt |
| 祝 | zhù | 3 |  | import | ?: to pray for / to wish · v: chúc |
| 资源 | zīyuán | 5 |  | import | ?: natural resource / resource · n: nguồn tài nguyên |
| 滑雪场 | huáxuěchǎng |  |  | mandarin_bean | ?: ski slopes; ski resort |
| 疫情 | yìqíng |  |  | mandarin_bean | ?: epidemic situation |
| 景点 | jǐngdiǎn | 4 |  | mandarin_bean | ?: tourist attraction; scenic spot |
| 水平 | shuǐpíng | 3 |  | import | ?: a standard; a level (of ability, development etc) · n: trình độ |
| 应对 | yìngduì | 5 |  | mandarin_bean | ?: to handle; to deal with |
| 出汗 | chūhàn |  |  | mandarin_bean | ?: to perspire / to sweat |
| 秃 | tū | 6 |  | import | n: Hói |
| 耗费 | hàofèi | 6 |  | import | n: tiêu tốn, tiêu hao |
| 他 | tā | 1 |  | import | ?: he; him; his · pron: anh ấy, ông ấy |
| 经理 | jīnglǐ | 3 |  | mandarin_bean | ?: manager / director |
| 能够 | nénggòu | 4 |  | mandarin_bean | ?: to be capable of / to be able to · ?: can |
| 文 | wén | 7 |  | mandarin_bean | ?: language / culture / writing / Kangxi radical 67 |
| 不折不扣 | bùzhébùkòu | 7 |  | mandarin_bean | ?: a hundred percent / out-and-out |
| 检票 | jiǎnpiào | 3 |  | mandarin_bean | ?: to inspect a ticket / to examine a ballot |
| 费 | fèi | 4 |  | mandarin_bean | ?: fee / expenses |
| 二来 | èrlái |  |  | mandarin_bean | ?: secondly, ... |

### 3.3 Bài khóa (5 bài × 3 câu đầu)

**年龄歧视** (`age-discrimination`, HSK4, News, checked, 4 câu, 54 từ)

| # | Câu | Mốc audio | Token → nghĩa |
|---|---|---|---|
| 0 | 最近，广州出现了一个招聘环卫工人的广告，居然要求年龄在35岁以下。 | 3.7–12.84 | 最近: recently · 广州: Guangzhou; a major city in southern Chin · 出现: to appear / to arise / to emerge / to sh · 了: (completed action marker) / (modal parti |
| 1 | 这个广告引起了大家的愤怒，认为这是严重的年龄歧视。 | 13.76–20.42 | 这: this; these · 个: classifier for people or objects in gene · 广告: a commercial / advertisement · 引起: to give rise to; to lead to; to cause; t |
| 2 | 招聘方说这是因为工作内容对体力要求很高，需要上夜班等。 | 21–28.84 | 招聘: to invite applications for a job / to re · 方: power or involution (math.) / direction  · 说: to speak; to talk; to say · 这: this; these |

**闰年** (`leap-year`, HSK1, Culture, checked, 5 câu, 24 từ)

| # | Câu | Mốc audio | Token → nghĩa |
|---|---|---|---|
| 0 | 我们都知道，一年有12个月，365天。 | 0–11.3 | 我们: we; us; ourselves; our · 都: all; both; entirely · 知道: to know; to become aware of · 一: one / single / a (article) |
| 1 | 有365天的这一年，我们叫“平年”。 | 12.32–20.44 | 有: to have; there is · 365: — · 天: day · 的: possessive particle (of; 's) / modifying |
| 2 | 有时候，一年有366天，这一年叫“闰年”。 | 21.64–31.76 | 有时候: sometimes · 一: one / single / a (article) · 年: year · 有: to have; there is |

**新老板** (`new-boss`, HSK2, Fun, checked, 6 câu, 58 từ)

| # | Câu | Mốc audio | Token → nghĩa |
|---|---|---|---|
| 0 | 我们公司来了一个新老板。 | 3.86–7.9 | 我们: we; us; ourselves; our · 公司: company; firm; corporation · 来: to come · 了: (completed action marker) / (modal parti |
| 1 | 大家听说他有很高的要求，但是不知道他第一天会做什么。 | 8.88–18.3 | 大家: everyone · 听说: to hear (sth said) / one hears (that) · 他: he; him; his · 有: to have; there is |
| 2 | 他第一次来办公室的时候，看到大家桌子上有很多东西，他非常不高兴地说：“我希望你的思想不要和这儿的桌子一样。” | 19.56–37.46 | 他: he; him; his · 第: (prefix indicating ordinal number) · 一: one / single / a (article) · 次: classifier for enumerated events: time |

**星巴克在中国** (`starbucks-in-china`, HSK4, Lifestyle, checked, 7 câu, 101 từ)

| # | Câu | Mốc audio | Token → nghĩa |
|---|---|---|---|
| 0 | 作为世界著名的咖啡连锁店，星巴克已经成为了中国年轻人喝咖啡的首选。 | 6.14–16.86 | 作为: one's conduct / deed / activity / accomp · 世界: world · 著名: famous / noted / well-known / celebrated · 的: possessive particle (of; 's) / modifying |
| 1 | 无论是北京这样的大城市，还是一些偏远的小城市，你都能喝到星巴克咖啡。 | 17.76–28.68 | 无论: no matter what or how / regardless of wh · 是: to be (followed by substantives only) · 北京: Beijing municipality, capital of the Peo · 这样: (before a noun) this kind of; such |
| 2 | 很多人称星巴克为“星爸爸”。 | 29.5–33.46 | 很多: many; a lot of · 人: person; people · 称: to name · 星巴克: Starbucks, US coffee shop chain |

**小年** (`minor-chinese-new-year`, HSK3, Culture, checked, 7 câu, 60 từ)

| # | Câu | Mốc audio | Token → nghĩa |
|---|---|---|---|
| 0 | 今天是小年。 | 1–3.58 | 今天: today · 是: to be (followed by substantives only) · 小年: the day or period traditionally marking  |
| 1 | 每年的农历12月23或者24日这一天，是祭祀灶王爷的日子，称为“过小年”。 | 4.46–17.88 | 每: each / every · 年: year · 的: possessive particle (of; 's) / modifying · 农历: the traditional Chinese calendar / the l |
| 2 | 人们会做很多好吃的，希望新的一年平平安安。 | 18.82–25.56 | 人们: people · 会: to be likely to; to be sure to · 做: to make; to produce · 很: very; quite |

### 3.4 Ngữ pháp (10)

| Tiêu đề | Nguồn | HSK | Loại | Formula | Ví dụ đầu |
|---|---|---|---|---|---|
| Phó từ ngữ khí "倒是" | hanzii | 5 |  | Chủ ngữ + 倒是 + Hình dung từ/ Động từ | 哥哥倒是比姐姐高。 /Gēge dào shì bǐ jiějie gāo./ Anh trai vậy mà lại cao hơn cả chị gái. |
| Câu phức giả thiết "要是… …，(就)… …，否则… …" | hanzii | 5 |  |  | 要是想得到奖学金，就要奋斗， 否则谁也帮不上你。 /Yàoshi xiǎngdédào jiǎngxuéjīn, jiù yào fèndòu, fǒuzé shéi yě bāng bù shàng nǐ./ Nếu bạn muốn nhận được học bổng thì bạn phải cố gắng phấn, nếu không thì không ai có thể giúp bạn đâu. |
| 失业 | hanzii | chưa xếp cấp | Li hợp |  | 失业确实是一个大问题，我们必须想办法解决。 /Shīyè quèshí shì yīgè dà wèntí, wǒmen bìxū xiǎng bànfǎ jiějué./ Thất nghiệp thực sự là một vấn đề lớn, và chúng ta phải tìm cách giải quyết nó. |
| Động từ "不觉 (2)" | hanzii | 6 |  | 不觉 + 已经/ Động từ +… | 他干了这一天的活，也不觉累。 /Tā gànle zhè yītiān de huó, yě bù jué lèi./ Anh ấy đã làm công việc cả ngày mà không cảm thấy mệt mỏi. |
| Tính từ "一贯" | hanzii | 6 |  |  | 谦虚、朴素是他一贯的作风。 /Qiānxū, púsù shì tā yīguàn de zuòfēng./ Khiêm tốn và giản dị là phong cách trước giờ của anh ấy. |
| Trạng từ "连续" | hanzii | 5 |  | 连续 + Động từ ( 工作 /驾驶/ 发生 / 演出 ) | 我们向敌人连续射击。 /Wǒmen xiàng dírén liánxù shèjí./ Chúng tôi bắn liên tục vào địch. |
| Danh lượng từ "桩" | hanzii | 6 |  | Số từ + 桩 + Danh từ (事情、心愿、心事、婚事、大案…) | 这桩婚事是由我父母决定的。 /Zhè zhuāng hūnshì shì yóu wǒ fùmǔ juédìng de./ Cuộc hôn nhân này là do cha mẹ tôi quyết định. |
| 生效 | hanzii | chưa xếp cấp | Li hợp |  | 这份合同从签字之时即生效。 /Zhè fèn hétóng cóng qiānzì zhī shí jí shēngxiào./ Hợp đồng này có hiệu lực kể từ thời điểm ký kết. |
| 坐班 | hanzii | chưa xếp cấp | Li hợp |  | 他身体不好，领导特意批准他不用每天坐班。 /Tā shēntǐ bù hǎo, lǐngdǎo tèyì pīzhǔn tā bùyòng měitiān zuòbān./ Sức khỏe anh ấy không được tốt, lãnh đạo đặc biệt cho phép anh ấy không cần ngày nào cũng phải đi làm. |
| Phó từ ngữ khí "怪不得" | hanzii | 7 |  |  | 原来外边下雪了，怪不得这么冷。 /Yuánlái wàibian xià xuěle, guàibùdé zhème lěng./ Bên ngoài tuyết rơi, thảo nào trời lạnh đến thế. |

## 4. Danh sách cần duyệt từng phase

- [P2 — Từ vựng](p2-words.md)
- [P3 — Bài khóa](p3-passages.md)
