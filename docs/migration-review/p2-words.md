# Duyệt kết quả P2 — Từ vựng

Sinh từ lần chạy `npm run migrate:v4` ngày 2026-10-02. Đánh dấu `[x]` dòng đúng; dòng sai thì ghi cách sửa bên cạnh, tôi sẽ đưa vào `scripts/migrate-v4/seed/vocab-fixes.json`.

## 1. Lỗi gõ đã sửa sẵn (`seed/vocab-fixes.json`)

| Chữ | Pinyin trong file import | Sửa thành |
|---|---|---|
| 空调 | kòngtiáo | kōngtiáo |
| 着急 | zhāojí | zháojí |
| 阻止 | zǔzhī | zǔzhǐ |
| 下载 | xiàzǎi | xiàzài |
| 会计 | kuàìjì | kuàijì |

## 2. Ô bị làm sạch (bỏ chú thích trong ngoặc, lấy cách đọc đầu)

- [ ] 哪里 (哪儿) [nǎlǐ (nǎr)] → 哪里 [nǎlǐ]
- [ ] 谁 [shuí/ shéi] → 谁 [shuí]
- [ ] 爱情 [ài qíng [ái tình]] → 爱情 [ài qíng]
- [ ] 安排 [ān pái [an bài]] → 安排 [ān pái]
- [ ] 安全 [ān quán [an toàn]] → 安全 [ān quán]
- [ ] 得（助动词） [de （ zhù dòng cí ）] → 得 [de]
- [ ] 等（助词） [děng （ zhù cí ）] → 等 [děng]
- [ ] 吐 [tǔ/tù] → 吐 [tǔ]

Ghi chú: `得（助动词）` có ví dụ 学得很好 và nghĩa "trợ từ", nên thực chất là trợ từ **de**; chú thích 助动词 trong file gốc sai. Dòng HSK2 `得 děi` có nghĩa "phải, đạt được" gộp nghĩa của děi và dé vào 1 ô.

## 3. Từ import gắn vào mục từ điển có cách viết khác (99)

Phần lớn là thanh nhẹ (file import ghi thanh đầy đủ) hoặc khác chữ hoa/dấu `'`. Pinyin được giữ theo từ điển (bên phải mũi tên).

- [ ] 不客气 bùkèqì → bùkèqi
- [ ] 东西 dōngxī → dōngxi
- [ ] 对不起 duìbùqǐ → duìbuqǐ
- [ ] 时候 shíhòu → shíhou
- [ ] 喜欢 xǐhuān → xǐhuan
- [ ] 先生 xiānshēng → xiānsheng
- [ ] 谢谢 xièxiè → xièxie
- [ ] 弟弟 dìdì → dìdi
- [ ] 告诉 gàosù → gàosu
- [ ] 便宜 piányí → piányi
- [ ] 事情 shìqíng → shìqing
- [ ] 晚上 wǎnshàng → wǎnshang
- [ ] 右边 yòubiān → yòubian
- [ ] 早上 zǎoshàng → zǎoshang
- [ ] 左边 zuǒbiān → zuǒbian
- [ ] 故事 gùshì → gùshi
- [ ] 还是 háishì → háishi
- [ ] 记得 jìdé → jìde
- [ ] 明白 míngbái → míngbai
- [ ] 清楚 qīngchǔ → qīngchu
- [ ] 行李箱 xínglǐxiāng → xínglixiāng
- [ ] 月亮 yuèliàng → yuèliang
- [ ] 照顾 zhàogu → zhàogù
- [ ] 部分 bùfèn → bùfen
- [ ] 差不多 chàbùduō → chàbuduō
- [ ] 长城 chángchéng → Chángchéng
- [ ] 长江 chángjiāng → ChángJiāng
- [ ] 窗户 chuānghù → chuānghu
- [ ] 打扮 dǎbàn → dǎban
- [ ] 打招呼 dǎzhāohū → dǎzhāohu
- [ ] 功夫 gōngfū → gōngfu
- [ ] 互联网 hùliánwǎng → Hùliánwǎng
- [ ] 护士 hùshì → hùshi
- [ ] 困难 kùnnán → kùnnan
- [ ] 来不及 láibùjí → láibují
- [ ] 力气 lìqì → lìqi
- [ ] 厉害 lìhài → lìhai
- [ ] 凉快 liángkuài → liángkuai
- [ ] 母亲 mǔqin → mǔqīn
- [ ] 脾气 píqì → píqi
- [ ] 葡萄 pútáo → pútao
- [ ] 热闹 rènào → rènao
- [ ] 任务 rènwù → rènwu
- [ ] 商量 shāngliáng → shāngliang
- [ ] 生意 shēngyì → shēngyi
- [ ] 师傅 shīfù → shīfu
- [ ] 收拾 shōushí → shōushi
- [ ] 熟悉 shúxī → shúxi
- [ ] 数字 shùzi → shùzì
- [ ] 笑话 xiàohuà → xiàohua
- [ ] 呀 yā → ya
- [ ] 亚洲 yàzhōu → Yàzhōu
- [ ] 要是 yàoshì → yàoshi
- [ ] 知识 zhīshí → zhīshi
- [ ] 主意 zhǔyì → zhǔyi
- [ ] 玻璃 bōlí → bōli
- [ ] 称呼 chēnghū → chēnghu
- [ ] 除夕 chúxī → Chúxī
- [ ] 答应 dāyìng → dāying
- [ ] 大方 dàfāng → dàfang
- [ ] 豆腐 dòufǔ → dòufu
- [ ] 怪不得 guàibùdé → guàibude
- [ ] 国庆节 guóqìngjié → Guóqìngjié
- [ ] 讲究 jiǎngjiū → jiǎngjiu
- [ ] 戒指 jièzhǐ → jièzhi
- [ ] 舅舅 jiùjiù → jiùjiu
- [ ] 老婆 lǎopó → lǎopo
- [ ] 老实 lǎoshí → lǎoshi
- [ ] 粮食 liángshí → liángshi
- [ ] 了不起 liǎobùqǐ → liǎobuqǐ
- [ ] 馒头 mántóu → mántou
- [ ] 脑袋 nǎodài → nǎodai
- [ ] 欧洲 ōuzhōu → Ōuzhōu
- [ ] 忍不住 rěnbùzhù → rěnbuzhù
- [ ] 舍不得 shěbùdé → shěbude
- [ ] 说不定 shuōbùdìng → shuōbudìng
- [ ] 尾巴 wěibā → wěiba
- [ ] 显得 xiǎndé → xiǎnde
- [ ] 应付 yìngfù → yìngfu
- [ ] 元旦 yuándàn → Yuándàn
- [ ] 运气 yùnqì → yùnqi
- [ ] 在乎 zàihū → zàihu
- [ ] 报酬 bàochóu → bàochou
- [ ] 灯笼 dēnglóng → dēnglong
- [ ] 地道 dìdao → dìdào
- [ ] 动静 dòngjìng → dòngjing
- [ ] 端午节 duānwǔjié → Duānwǔjié
- [ ] 对付 duìfù → duìfu
- [ ] 队伍 duìwǔ → duìwu
- [ ] 福气 fúqì → fúqi
- [ ] 记性 jìxìng → jìxing
- [ ] 家伙 jiāhuǒ → jiāhuo
- [ ] 口音 kǒuyīn → kǒuyin
- [ ] 联想 liánxiǎng → Liánxiǎng
- [ ] 摄氏度 shèshìdù → Shèshìdù
- [ ] 媳妇 xífù → xífu
- [ ] 薪水 xīnshuǐ → xīnshui
- [ ] 正月 zhēngyuè → Zhēngyuè
- [ ] 网上 wǎngshàng → wǎngshang

## 4. Cùng chữ, cùng pinyin không dấu nhưng giữ thành từ riêng (48)

Đa âm hoặc mục từ điển khác nhau (họ, tên riêng, thương hiệu). `[import]` = cách đọc chỉ có trong file import, không có trong từ điển Mandarin Bean — nên kiểm tra kỹ các dòng này.

- [ ] 要: yào | yāo
- [ ] 钱: qián | Qián
- [ ] 得: de | dé
- [ ] 苹果: píngguǒ | Píngguǒ
- [ ] 多少: duōshao | duōshǎo
- [ ] 过: guo | guò
- [ ] 只: zhǐ | zhī
- [ ] 边: biān | bian
- [ ] 教: jiāo | jiào
- [ ] 喂: wéi | wèi
- [ ] 啊: a | ā | á | à
- [ ] 张: zhāng | Zhāng
- [ ] 当: dāng | dàng
- [ ] 地方: dìfang | dìfāng
- [ ] 马: mǎ | Mǎ
- [ ] 切: qiē | qiè[import]
- [ ] 发: fā | fà
- [ ] 空: kòng | kōng[import]
- [ ] 哦: ò | ó | o
- [ ] 数: shǔ | shù
- [ ] 为: wèi | wéi
- [ ] 中: zhòng | zhōng | Zhōng
- [ ] 种: zhǒng | zhòng
- [ ] 美: měi | Měi
- [ ] 出来: chulai | chūlái
- [ ] 东北: Dōngběi | dōngběi
- [ ] 背: bèi | bēi
- [ ] 干: gàn | gān
- [ ] 量: liàng | liáng
- [ ] 嗯: èn | ēn[import]
- [ ] 唉: ài | āi[import]
- [ ] 假: jià | jiǎ
- [ ] 精神: jīngshén | jīngshen
- [ ] 场: chǎng | cháng
- [ ] 倒: dào | dǎo
- [ ] 划: huà | huá
- [ ] 网络: wǎngluò | Wǎngluò
- [ ] 磨: mó | mò
- [ ] 神: Shén | shén
- [ ] 强: qiáng | qiǎng
- [ ] 台: Tái | tái
- [ ] 处: chù | chǔ
- [ ] 钉: dìng | dīng
- [ ] 通用: Tōngyòng | tōngyòng
- [ ] 尽: jǐn | jìn
- [ ] 雨水: yǔshuǐ | Yǔshuǐ
- [ ] 东方: Dōngfāng | dōngfāng
- [ ] 沙: Shā | shā
