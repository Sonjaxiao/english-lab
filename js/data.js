/* =========================================================================
 * 语料库数据文件（唯一需要替换的文件）
 * -------------------------------------------------------------------------
 * 换语料库 = 只改这个文件，应用逻辑完全不用动。
 *
 * Schema 说明：
 *   meta            语料库元信息
 *     .name         语料库名称（显示在导航/标题）
 *     .tagline      一句话简介
 *     .learnLang    学习语言 BCP-47（TTS 朗读用，如 en-US / ja-JP / zh-CN）
 *     .nativeLang   母语（翻译列语言）
 *   episodes[]      每集语料
 *     .id           唯一 ID（URL 用，建议 ep001 递增）
 *     .title        完整标题
 *     .shortTitle   卡片短标题
 *     .cover        封面图 URL；留空 null 则自动生成渐变占位封面
 *     .duration     时长（秒），仅展示用
 *     .speaker      { name, gender: "M"|"F", flag } 出镜者
 *     .stars        难度 1-5（目录页星标 + 筛选）
 *     .tags[]       话题标签（目录页筛选）
 *     .mediaUrl     音/视频地址；留空 "" 则自动切换为 TTS 逐句朗读模式
 *     .subtitles[]  逐句字幕
 *        .id         句 ID
 *        .start/.end 起止秒（有媒体时用于定位；TTS 模式可留 0）
 *        .text       原文
 *        .translation 译文
 *        .words[]    本句可查词的单词（需在 dictionary 中有对应词条）
 *   dictionary{}    内置词典：key 为小写单词
 *     .phonetic 音标  .pos 词性  .meaning 释义
 *     .collocation 常见搭配  .expression 地道表达
 *     .example 例句 {en, zh}  .examTags[] 考试标签
 * ========================================================================= */

window.CORPUS = {
  meta: {
    name: "示例英语播客库",
    tagline: "真实语料学英语 · 同逻辑复刻演示",
    learnLang: "en-US",
    nativeLang: "zh-CN",
  },

  episodes: [
    {
      id: "ep001",
      title: "My Slow Morning Routine",
      shortTitle: "慢节奏晨间日常",
      cover: null,
      duration: 42,
      speaker: { name: "Amy", gender: "F", flag: "🇬🇧" },
      stars: 2,
      tags: ["日常", "生活方式"],
      mediaUrl: "",
      subtitles: [
        { id: "s1", start: 0, end: 4, text: "I used to hit the snooze button at least five times every morning.", translation: "我以前每天早上至少要按五次贪睡按钮。", words: ["snooze", "used to"] },
        { id: "s2", start: 4, end: 8, text: "But lately I have been waking up at six without an alarm.", translation: "但最近我不用闹钟也能六点自然醒。", words: ["lately", "alarm"] },
        { id: "s3", start: 8, end: 13, text: "The first thing I do is open the curtains and let the sunlight in.", translation: "我做的第一件事就是拉开窗帘，让阳光照进来。", words: ["curtain"] },
        { id: "s4", start: 13, end: 18, text: "Then I make myself a cup of black coffee — no sugar, no milk.", translation: "然后给自己泡一杯黑咖啡——不加糖也不加奶。", words: ["make"] },
        { id: "s5", start: 18, end: 23, text: "While the coffee is brewing, I jot down three things I want to get done today.", translation: "趁咖啡在煮，我顺手写下今天想完成的三件事。", words: ["brew", "jot down", "get done"] },
        { id: "s6", start: 23, end: 28, text: "It sounds simple, but this little ritual keeps me grounded.", translation: "听起来很简单，但这个小仪式让我保持踏实。", words: ["ritual", "grounded"] },
        { id: "s7", start: 28, end: 33, text: "I stopped scrolling my phone in bed, and honestly, it changed everything.", translation: "我戒掉了躺在床上刷手机，说实话，这改变了一切。", words: ["scroll", "honestly"] },
        { id: "s8", start: 33, end: 38, text: "Mornings used to feel like a rush; now they feel like mine.", translation: "以前早晨像是在赶时间；现在早晨是属于我自己的。", words: ["rush"] },
      ],
    },
    {
      id: "ep002",
      title: "Ordering at a Coffee Shop",
      shortTitle: "咖啡店点单实战",
      cover: null,
      duration: 48,
      speaker: { name: "Ben", gender: "M", flag: "🇺🇸" },
      stars: 3,
      tags: ["日常", "口语实战"],
      mediaUrl: "",
      subtitles: [
        { id: "s1", start: 0, end: 4, text: "Hi there! What can I get started for you today?", translation: "你好！今天想喝点什么？", words: ["get started"] },
        { id: "s2", start: 4, end: 9, text: "Could I get a medium oat milk latte, less hot please?", translation: "我要一杯中杯燕麦拿铁，麻烦温度低一点。", words: ["oat", "latte"] },
        { id: "s3", start: 9, end: 14, text: "Sure thing. Would you like that with an extra shot?", translation: "没问题。需要加一份浓缩吗？", words: ["shot", "extra"] },
        { id: "s4", start: 14, end: 19, text: "Actually, yes — I could use the caffeine this afternoon.", translation: "好吧，加一份——今天下午全靠咖啡因撑着了。", words: ["caffeine", "could use"] },
        { id: "s5", start: 19, end: 24, text: "Any pastry to go with that? Our croissants just came out of the oven.", translation: "要配点什么点心吗？我们的可颂刚出炉。", words: ["pastry", "croissant", "to go with"] },
        { id: "s6", start: 24, end: 29, text: "That's tempting, but I'll pass. I'm good with just the coffee.", translation: "很诱人，但就不用了。只要咖啡就好。", words: ["tempting", "pass", "I'm good"] },
        { id: "s7", start: 29, end: 34, text: "No worries. That'll be five twenty-five. Card or cash?", translation: "没关系。一共五块二毛五。刷卡还是现金？", words: ["That'll be"] },
        { id: "s8", start: 34, end: 39, text: "Card, please. Oh, and could I get it in a to-go cup?", translation: "刷卡。哦对了，能用外带杯装吗？", words: ["to-go"] },
        { id: "s9", start: 39, end: 44, text: "Of course. Your order will be right up at the end of the bar.", translation: "当然可以。您的单子马上就好，在吧台尽头取餐。", words: ["right up"] },
        { id: "s10", start: 44, end: 48, text: "Thanks a lot! Have a great one.", translation: "多谢！祝你今天愉快。", words: ["Have a great one"] },
      ],
    },
    {
      id: "ep003",
      title: "A Weekend Hiking Trip",
      shortTitle: "周末徒步vlog",
      cover: null,
      duration: 55,
      speaker: { name: "Chloe", gender: "F", flag: "🇦🇺" },
      stars: 4,
      tags: ["户外", "vlog"],
      mediaUrl: "",
      subtitles: [
        { id: "s1", start: 0, end: 5, text: "We set off at dawn to beat the crowds and the midday heat.", translation: "我们天一亮就出发，避开人流和正午的高温。", words: ["set off", "beat"] },
        { id: "s2", start: 5, end: 10, text: "The trail was steeper than we expected, but the view made up for it.", translation: "山路比预想的陡，但风景完全值回票价。", words: ["trail", "make up for"] },
        { id: "s3", start: 10, end: 15, text: "Halfway up, we stumbled upon a waterfall hidden behind the trees.", translation: "爬到半山腰，我们意外发现一处藏在树后的瀑布。", words: ["stumble upon", "hidden"] },
        { id: "s4", start: 15, end: 20, text: "We took a breather there and refilled our water bottles.", translation: "我们在那儿歇了口气，把水壶也灌满了。", words: ["breather", "refill"] },
        { id: "s5", start: 20, end: 25, text: "Funny enough, the hardest part wasn't the climb — it was the descent.", translation: "有趣的是，最难的不是上山，而是下山。", words: ["descent"] },
        { id: "s6", start: 25, end: 30, text: "My knees were killing me by the time we reached the trailhead.", translation: "走到登山口的时候，我的膝盖已经疼得不行了。", words: ["killing", "trailhead"] },
        { id: "s7", start: 30, end: 35, text: "Still, there's something about being out in nature that resets your brain.", translation: "不过，置身自然总有种能让大脑重启的力量。", words: ["reset"] },
        { id: "s8", start: 35, end: 40, text: "No notifications, no noise — just wind, birdsong and gravel underfoot.", translation: "没有通知，没有噪音——只有风声、鸟鸣和脚下的碎石。", words: ["gravel", "underfoot"] },
        { id: "s9", start: 40, end: 45, text: "We were completely worn out, but it was the good kind of tired.", translation: "我们累坏了，但那种累很值。", words: ["worn out"] },
        { id: "s10", start: 45, end: 50, text: "We already picked next weekend's trail — a lake route this time.", translation: "我们已经选好下周的路线了——这次走一条环湖线。", words: [] },
        { id: "s11", start: 50, end: 55, text: "If you've been stuck in a rut, I can't recommend a hike enough.", translation: "如果你最近陷入倦怠，我强烈推荐去徒步一次。", words: ["stuck in a rut", "recommend"] },
      ],
    },
  ],

  dictionary: {
    "used to": { phonetic: "", pos: "phr.", meaning: "过去常常（现在不再）", collocation: "used to do sth", expression: "I used to think... 我以前以为……", example: { en: "I used to live in Shanghai.", zh: "我以前住在上海。" }, examTags: ["中考", "高考"] },
    "snooze": { phonetic: "/snuːz/", pos: "n./v.", meaning: "贪睡（按钮）；小睡", collocation: "hit the snooze button 按贪睡键", expression: "five more minutes 再睡五分钟", example: { en: "I hit the snooze button twice.", zh: "我按了两次贪睡按钮。" }, examTags: [] },
    "lately": { phonetic: "/ˈleɪtli/", pos: "adv.", meaning: "近来，最近", collocation: "lately + 现在完成进行时", expression: "How have you been lately? 最近怎么样？", example: { en: "I've been reading a lot lately.", zh: "我最近读了很多书。" }, examTags: ["中考", "高考"] },
    "alarm": { phonetic: "/əˈlɑːm/", pos: "n.", meaning: "闹钟；警报", collocation: "set an alarm 定闹钟；wake up without an alarm 不用闹钟自然醒", expression: "alarm went off 闹钟响了", example: { en: "My alarm goes off at six.", zh: "我的闹钟六点响。" }, examTags: ["中考", "高考", "四级"] },
    "curtain": { phonetic: "/ˈkɜːtn/", pos: "n.", meaning: "窗帘；幕布", collocation: "open/draw the curtains 拉开/拉上窗帘", expression: "curtain call 谢幕", example: { en: "She drew the curtains open.", zh: "她拉开了窗帘。" }, examTags: ["中考", "高考"] },
    "make": { phonetic: "/meɪk/", pos: "v.", meaning: "制作；使得", collocation: "make myself a cup of coffee 给自己泡杯咖啡", expression: "make it 赶到；成功", example: { en: "Let me make you some tea.", zh: "我给你泡杯茶。" }, examTags: ["中考", "高考"] },
    "brew": { phonetic: "/bruː/", pos: "v.", meaning: "冲泡；酿；酝酿", collocation: "coffee is brewing 咖啡在煮；a storm is brewing 暴风雨将至", expression: "brew trouble 惹麻烦", example: { en: "The tea is still brewing.", zh: "茶还在泡着。" }, examTags: [] },
    "jot down": { phonetic: "", pos: "phr.", meaning: "匆匆记下", collocation: "jot down a note", expression: " jot it down 随手记下来", example: { en: "Let me jot down your number.", zh: "我记一下你的电话。" }, examTags: [] },
    "get done": { phonetic: "", pos: "phr.", meaning: "完成，做完", collocation: "get things done 把事办成", expression: "Get it done and dusted 彻底搞定", example: { en: "I have three things to get done today.", zh: "我今天有三件事要办。" }, examTags: [] },
    "ritual": { phonetic: "/ˈrɪtʃuəl/", pos: "n./adj.", meaning: "仪式；惯例", collocation: "daily ritual 每日惯例", expression: "morning ritual 晨间仪式", example: { en: "Reading is part of my nightly ritual.", zh: "阅读是我睡前仪式的一部分。" }, examTags: ["六级", "考研"] },
    "grounded": { phonetic: "/ˈɡraʊndɪd/", pos: "adj.", meaning: "踏实的；稳重的；（俚）被禁足", collocation: "keep/feel grounded 保持踏实", expression: "stay grounded 脚踏实地", example: { en: "Yoga helps me feel grounded.", zh: "瑜伽让我感到踏实。" }, examTags: [] },
    "scroll": { phonetic: "/skrəʊl/", pos: "v./n.", meaning: "滚动浏览；卷轴", collocation: "scroll through one's phone 刷手机", expression: "doomscrolling 无止境刷坏消息", example: { en: "I scrolled through the news for an hour.", zh: "我刷了一个小时的新闻。" }, examTags: [] },
    "honestly": { phonetic: "/ˈɒnɪstli/", pos: "adv.", meaning: "说实话；诚实地", collocation: "honestly speaking", expression: "Honestly? 说真的？", example: { en: "Honestly, I forgot about it.", zh: "说实话，我把这事忘了。" }, examTags: ["中考"] },
    "rush": { phonetic: "/rʌʃ/", pos: "n./v.", meaning: "匆忙；催促", collocation: "morning rush 早高峰；in a rush 匆忙", expression: "no rush 不着急", example: { en: "There's no rush — take your time.", zh: "不着急，慢慢来。" }, examTags: ["中考", "高考", "四级"] },
    "get started": { phonetic: "", pos: "phr.", meaning: "开始（服务用语：您要点什么）", collocation: "What can I get started for you?", expression: "get started on sth 开始做某事", example: { en: "What can I get started for you?", zh: "您想点点什么？" }, examTags: [] },
    "oat": { phonetic: "/əʊt/", pos: "n.", meaning: "燕麦", collocation: "oat milk 燕麦奶；oatmeal 燕麦粥", expression: "sow one's wild oats 放纵青春", example: { en: "I'll have an oat milk latte.", zh: "我要一杯燕麦拿铁。" }, examTags: [] },
    "latte": { phonetic: "/ˈlɑːteɪ/", pos: "n.", meaning: "拿铁咖啡", collocation: "a medium latte 中杯拿铁", expression: "latte art 咖啡拉花", example: { en: "One latte, please.", zh: "一杯拿铁。" }, examTags: [] },
    "shot": { phonetic: "/ʃɒt/", pos: "n.", meaning: "一份浓缩咖啡；射门；拍摄", collocation: "an extra shot 加一份浓缩", expression: "give it a shot 试一试", example: { en: "Add an extra shot, please.", zh: "请加一份浓缩。" }, examTags: ["高考"] },
    "extra": { phonetic: "/ˈekstrə/", pos: "adj./n.", meaning: "额外的；附加物", collocation: "extra shot/time", expression: "go the extra mile 加倍努力", example: { en: "I need some extra time.", zh: "我需要一些额外的时间。" }, examTags: ["中考", "高考", "四级"] },
    "caffeine": { phonetic: "/ˈkæfiːn/", pos: "n.", meaning: "咖啡因", collocation: "caffeine fix 咖啡因补给", expression: "running on caffeine 靠咖啡因续命", example: { en: "This drink contains no caffeine.", zh: "这款饮品不含咖啡因。" }, examTags: [] },
    "could use": { phonetic: "", pos: "phr.", meaning: "（口语）很需要；来一点就好了", collocation: "I could use a break", expression: "I could use some help 我需要帮手", example: { en: "I could use some sleep.", zh: "我真需要睡一觉。" }, examTags: [] },
    "pastry": { phonetic: "/ˈpeɪstri/", pos: "n.", meaning: "油酥点心", collocation: "Danish pastry 丹麦酥", expression: "", example: { en: "Which pastry do you recommend?", zh: "你推荐哪款点心？" }, examTags: ["六级"] },
    "croissant": { phonetic: "/ˈkrwʌsɒ̃/", pos: "n.", meaning: "牛角包，可颂", collocation: "butter croissant", expression: "", example: { en: "The croissants are fresh out of the oven.", zh: "可颂刚出炉。" }, examTags: [] },
    "to go with": { phonetic: "", pos: "phr.", meaning: "与……搭配； accompanying", collocation: "What goes with this?", expression: "", example: { en: "What would you like to go with your coffee?", zh: "咖啡要配点什么？" }, examTags: [] },
    "tempting": { phonetic: "/ˈtemptɪŋ/", pos: "adj.", meaning: "诱人的", collocation: "be tempting to do", expression: "That's tempting! 真诱人！", example: { en: "The offer is very tempting.", zh: "这个提议很诱人。" }, examTags: ["高考", "四级", "六级"] },
    "pass": { phonetic: "/pɑːs/", pos: "v.", meaning: "拒绝（口语）；经过；传递", collocation: "I'll pass 这次算了", expression: "pass on sth 放弃某物", example: { en: "Thanks, but I'll pass.", zh: "谢谢，不过我就不用了。" }, examTags: ["中考", "高考"] },
    "I'm good": { phonetic: "", pos: "phr.", meaning: "（口语）不用了；我好了", collocation: "I'm good, thanks", expression: "You good? 你还好吗？", example: { en: "More coffee? — I'm good.", zh: "再来点咖啡？——不用了。" }, examTags: [] },
    "That'll be": { phonetic: "", pos: "phr.", meaning: "（结账）一共是……", collocation: "That'll be five dollars", expression: "", example: { en: "That'll be twelve yuan.", zh: "一共十二元。" }, examTags: [] },
    "to-go": { phonetic: "", pos: "adj.", meaning: "外带的", collocation: "a to-go cup 外带杯；to-go order", expression: "for here or to go? 堂食还是外带？", example: { en: "One coffee to go, please.", zh: "一杯咖啡，带走。" }, examTags: [] },
    "right up": { phonetic: "", pos: "phr.", meaning: "马上就好", collocation: "Your order will be right up", expression: "be right back 马上回来", example: { en: "Your food will be right up.", zh: "您的餐马上就好。" }, examTags: [] },
    "Have a great one": { phonetic: "", pos: "phr.", meaning: "祝你愉快（告别语）", collocation: "", expression: "Have a good one! 祝你愉快！", example: { en: "Thanks! Have a great one!", zh: "谢谢！祝你愉快！" }, examTags: [] },
    "set off": { phonetic: "", pos: "phr.", meaning: "出发；引发", collocation: "set off for somewhere", expression: "set off a chain reaction 引发连锁反应", example: { en: "We set off early in the morning.", zh: "我们一早就出发了。" }, examTags: ["中考", "高考", "四级"] },
    "beat": { phonetic: "/biːt/", pos: "v.", meaning: "抢先避开；击败；跳动", collocation: "beat the crowds 避开人流；beat the heat 避暑", expression: "Can you beat that? 还有比这更绝的吗？", example: { en: "Leave early to beat the traffic.", zh: "早点出发避开堵车。" }, examTags: ["中考", "高考", "四级"] },
    "trail": { phonetic: "/treɪl/", pos: "n./v.", meaning: "小径；追踪", collocation: "hiking trail 徒步路线；off the trail 偏离小路", expression: "hit the trail 上路", example: { en: "This trail leads to the summit.", zh: "这条小路通往山顶。" }, examTags: ["高考", "四级"] },
    "make up for": { phonetic: "", pos: "phr.", meaning: "弥补", collocation: "make up for lost time", expression: "", example: { en: "The view made up for the hard climb.", zh: "风景弥补了攀登的辛苦。" }, examTags: ["高考", "四级", "六级"] },
    "stumble upon": { phonetic: "", pos: "phr.", meaning: "偶然发现", collocation: "stumble upon/across", expression: "", example: { en: "I stumbled upon an old photo.", zh: "我偶然翻到一张老照片。" }, examTags: ["六级", "考研"] },
    "hidden": { phonetic: "/ˈhɪdn/", pos: "adj.", meaning: "隐藏的", collocation: "hidden gem 隐藏的宝藏；hidden danger", expression: "", example: { en: "The village is a hidden gem.", zh: "这个村子是个隐藏的宝藏。" }, examTags: ["中考", "高考"] },
    "breather": { phonetic: "/ˈbriːðə/", pos: "n.", meaning: "短暂休息", collocation: "take a breather 歇口气", expression: "", example: { en: "Let's take a breather.", zh: "我们歇会儿吧。" }, examTags: [] },
    "refill": { phonetic: "/ˌriːˈfɪl/", pos: "v./n.", meaning: "重新填满；续杯", collocation: "refill water bottles；free refill 免费续杯", expression: "", example: { en: "Can I get a refill?", zh: "能帮我续杯吗？" }, examTags: [] },
    "descent": { phonetic: "/dɪˈsent/", pos: "n.", meaning: "下降；下山；血统", collocation: "steep descent 陡坡；of Chinese descent 华裔", expression: "", example: { en: "The descent took two hours.", zh: "下山花了两个小时。" }, examTags: ["六级", "考研"] },
    "killing": { phonetic: "/ˈkɪlɪŋ/", pos: "phr.", meaning: "（口语）my knees are killing me 疼死了", collocation: "be killing sb（某处疼得要命）", expression: "It's killing me! 疼死/烦死我了！", example: { en: "My feet are killing me.", zh: "我的脚疼死了。" }, examTags: [] },
    "trailhead": { phonetic: "/ˈtreɪlhed/", pos: "n.", meaning: "登山口，小径起点", collocation: "", expression: "", example: { en: "We met at the trailhead at six.", zh: "我们六点在登山口集合。" }, examTags: [] },
    "reset": { phonetic: "/ˌriːˈset/", pos: "v./n.", meaning: "重置；重启", collocation: "reset your brain/mind", expression: "hit the reset button 按下重启键", example: { en: "A short walk resets my mood.", zh: "散步一小会儿就能调整我的情绪。" }, examTags: ["高考"] },
    "gravel": { phonetic: "/ˈɡrævl/", pos: "n.", meaning: "碎石，砾石", collocation: "gravel road 碎石路", expression: "", example: { en: "We walked on the gravel path.", zh: "我们走在碎石路上。" }, examTags: [] },
    "underfoot": { phonetic: "/ˌʌndəˈfʊt/", pos: "adv.", meaning: "在脚下", collocation: "grass/gravel underfoot", expression: "", example: { en: "The snow crunched underfoot.", zh: "雪在脚下咯吱作响。" }, examTags: [] },
    "worn out": { phonetic: "", pos: "adj.", meaning: "筋疲力尽的；磨损的", collocation: "be worn out；worn-out shoes", expression: "", example: { en: "I was worn out after the trip.", zh: "旅行结束后我累坏了。" }, examTags: ["中考", "高考"] },
    "stuck in a rut": { phonetic: "", pos: "phr.", meaning: "陷入（一成不变的）倦怠期", collocation: "be/stick in a rut", expression: "get out of a rut 走出倦怠", example: { en: "I felt stuck in a rut at work.", zh: "我那时觉得工作一成不变很倦怠。" }, examTags: [] },
    "recommend": { phonetic: "/ˌrekəˈmend/", pos: "v.", meaning: "推荐；建议", collocation: "can't recommend sth enough 强烈推荐", expression: "", example: { en: "I can't recommend this book enough.", zh: "我强烈推荐这本书。" }, examTags: ["中考", "高考", "四级"] },
  },
};
