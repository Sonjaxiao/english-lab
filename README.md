# 语料自习室 · Corpus Companion

复刻 [TEco Lab](https://www.teco-lab.com/) 全套学习逻辑的**语料库无关**学习站。
纯前端实现（Vue3 本地运行时 + localStorage/IndexedDB），零依赖、零构建、零成本部署。

## 从 YouTube / B站 导入语料

```bash
# 1. 抓取（YouTube 全自动；B站字幕需登录态或 SRT，见下）
python tools/fetch_video.py "https://www.youtube.com/watch?v=XXXX"
#    → 产出 _pending/youtube_XXXX.json（含分句字幕）

# 2. 人工加工：翻译每段 + 编写词典词条
#    （把 pending JSON 复制为 *.ep.json，补 translation / dictionary / shortTitle / stars / tags）

# 3. 入库（自动分配 ep 编号、写入 episodes-imported.js）
python tools/build_episode.py _pending/youtube_XXXX.json --ep-json _pending/youtube_XXXX.ep.json
#    刷新网页即出现在目录页

# 4. （推荐）下载视频到本地：真实画面+原声、离线可播、file:// 直开也完整可用
python -m yt_dlp -f "bv*[height<=720]+ba/b[height<=720]" --merge-output-format mp4 ^
  -o "corpus-app/media/<epId>.%(ext)s" "<原视频URL>"
#    build_episode.py 入库时若发现 corpus-app/media/<epId>.* 会自动填 mediaUrl
#    应用引擎优先级：本地媒体 > YouTube/B站嵌入 > TTS
```

平台支持：
- **YouTube**：yt-dlp 抓元数据 + ASR 自动字幕（滚动窗口去重、按句归并、过滤 [Music] 标签），
  播放器用官方 IFrame API——循环/倍速/AB/跳句全部真实可控。
- **B站**：元数据自动；字幕内容接口需登录（`BI_SESSDATA` 环境变量，或 `--srt` 提供字幕文件），
  无字幕时标记 `needs_subs`。播放器用官方 iframe + 计时跟读同步（对齐/跳转按钮校准），
  循环/倍速在B站播放器内操作。

## 运行方式

任选其一：

1. **直接双击打开** `index.html`（普通 script 加载，file:// 协议可用）
2. 本地服务器：`python -m http.server 8899 --directory corpus-app`，访问 `http://localhost:8899`
3. 部署：把整个 `corpus-app/` 目录扔到任意静态托管（GitHub Pages / Vercel / OSS / Nginx）

## 功能对照（与原站同逻辑）

| 模块 | 功能 |
|---|---|
| 目录页 | 语料卡片（封面/时长/作者/星级/标签）、按作者性别·难度·话题·学习状态筛选、正倒序、学习统计 |
| 学习页 | 逐句播放：单句循环、AB循环、无级倍速(0.5-2x)、循环间隔、每句循环次数、句后暂停 |
| 字幕模式 | 双语 / 原文 / 译文 / 听写（自动评分+漏词多写对比）/ 挖空（确定性挖空+判分） |
| 查词词卡 | 点击任意单词或词组 → 音标/词性/释义/搭配/地道表达/例句/考试标签，一键收藏 |
| 词汇管理 | 单词本（收藏夹）+ 标签，词卡上直接归类，收藏页统一管理/筛选/备注 |
| 字幕收藏 | 整句收藏 + 逐句笔记，收藏页复习，点击跳回原句 |
| 跟读录音 | 逐句录音（60s 上限、权限友好提示）、回放对比原声、录音统一列表、二次确认删除 |
| 全库搜索 | 任意单词/短语/中文释义，跨全部字幕检索并高亮 |
| 学习管理 | 学习打卡、近7天打卡图、各集进度、听写统计、学习概览 |
| 其他 | 深浅色主题、TTS 语音选择、播放默认值记忆、学习数据导出/导入(JSON)、键盘快捷键 |

键盘快捷键：`空格` 播放/暂停 · `←` `→` 上一句/下一句 · `L` 单句循环开关

## 无音频文件也能用

`mediaUrl` 留空时自动切换 **TTS 朗读模式**：用浏览器语音合成逐句朗读，
单句循环/AB循环/倍速/间隔全部照常生效 —— 先跑通学习流程，音频后面随时补。

有音频时填 `mediaUrl`（本地路径 / URL / 音频或视频文件均可），播放器按字幕
`start/end` 时间轴精确定位逐句循环。

## 换语料库（核心设计）

**只改 `js/data.js` 一个文件，其余代码零改动。**

```js
window.CORPUS = {
  meta: {
    name: "你的语料库名",
    tagline: "一句话简介",
    learnLang: "ja-JP",     // 学习语言（TTS 朗读用）
    nativeLang: "zh-CN",
  },
  episodes: [{
    id: "ep001",            // 唯一 ID
    title: "完整标题",
    shortTitle: "卡片短标题",
    cover: null,            // 封面 URL，null 自动生成渐变占位
    duration: 120,          // 秒
    speaker: { name: "作者", gender: "F", flag: "🇯🇵" },
    stars: 3,               // 难度 1-5
    tags: ["话题"],
    mediaUrl: "",           // 音/视频地址，空 = TTS 模式
    subtitles: [{
      id: "s1",
      start: 0, end: 5.2,   // 有媒体时的时间轴；TTS 模式填 0
      text: "原文一句",
      translation: "中文翻译",
      words: ["可查词"],     // 提示本句重点词（可选）
    }],
  }],
  dictionary: {              // 内置词典，点击查词的数据源
    "单词": {
      phonetic: "/…/", pos: "n.", meaning: "释义",
      collocation: "搭配", expression: "地道表达",
      example: { en: "例句", zh: "例句翻译" },
      examTags: ["考试标签"],
    },
  },
};
```

批量导入字幕：把 SRT/VTT 解析成上面的 `subtitles` 数组即可（时间轴格式 `秒`）。

## 目录结构

```
corpus-app/
├── index.html            入口
├── css/app.css           全部样式（浅/深主题变量）
└── js/
    ├── vendor/vue.global.prod.js   Vue3 本地运行时（离线可用）
    ├── data.js           ★ 语料库数据（换语料只改这里）
    ├── db.js             存储层（localStorage + IndexedDB 录音）
    ├── study.js          学习页（播放引擎/字幕/词卡/录音）
    └── app.js            路由 + 目录/收藏/搜索/录音/概览/方法/设置
```

## 数据与隐私

个人自用模式：学习记录、收藏、笔记存浏览器 localStorage；录音存 IndexedDB。
「设置」页可一键导出/导入 JSON 备份。换设备前先导出。

## 升级路线（预留）

- **多用户/云同步**：`db.js` 是唯一数据出入口，把 `LS.get/set` 与 `Recordings.*`
  换成后端 API 调用即可，页面代码不用动。
- **付费/激活码**：在路由层加登录守卫 + 激活码校验页（原站逻辑：下单→激活码→解锁全库）。
- **在线词典**：词卡数据可改接免费词典 API（如 Free Dictionary API），`lookup()` 单点替换。
