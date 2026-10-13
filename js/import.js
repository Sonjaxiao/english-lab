/* =========================================================================
 * import.js — 「导入」页：贴视频链接 → 入库语料
 *  ① 自动入库：生成预填 GitHub issue → 云端 Actions 抓取+翻译+词典 → 自动上线
 *  ② 手动导入：粘贴 SRT/VTT/纯文本字幕 → 本地即刻入库（可选免费机翻）
 *  本文件在 app.js 之前加载：启动时把 localStorage 里的自定义集合并进 CORPUS。
 * ========================================================================= */
(function () {
  "use strict";
  const CORPUS = window.CORPUS;
  const DB = window.DB;
  const KEY = "customEpisodes";

  /* ---------- 本地自定义集：存储 + 启动合并 ---------- */
  const Custom = {
    all() { return DB.get(KEY, []); },
    save(list) { DB.set(KEY, list); },
    add(ep) { const list = Custom.all().filter((e) => e.id !== ep.id); list.push(ep); Custom.save(list); return ep; },
    remove(id) { Custom.save(Custom.all().filter((e) => e.id !== id)); },
    mergeIntoCorpus() {
      const ids = new Set(CORPUS.episodes.map((e) => e.id));
      Custom.all().forEach((ep) => { if (!ids.has(ep.id)) CORPUS.episodes.push(ep); });
    },
  };
  Custom.mergeIntoCorpus();

  /* ---------- 链接解析 ---------- */
  function parseVideoUrl(u) {
    u = (u || "").trim();
    let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return { platform: "youtube", videoId: m[1], url: "https://www.youtube.com/watch?v=" + m[1] };
    m = u.match(/bilibili\.com\/video\/(BV[\w]+)/i);
    if (m) {
      const p = u.match(/[?&]p=(\d+)/);
      return { platform: "bilibili", bvid: m[1], page: p ? parseInt(p[1], 10) : 1, url: "https://www.bilibili.com/video/" + m[1] };
    }
    if (/b23\.tv\//.test(u)) return { platform: "b23", url: u.trim() };
    return null;
  }

  function repoInfo() {
    const h = location.hostname || "";
    const m = h.match(/^([\w-]+)\.github\.io$/);
    if (m) {
      const seg = (location.pathname || "/").split("/").filter(Boolean);
      return { owner: m[1], repo: seg[0] || "english-lab" };
    }
    return { owner: "Sonjaxiao", repo: "english-lab" };
  }

  /* ---------- 元数据预览（尽力而为，失败不阻断） ---------- */
  async function fetchPreview(src) {
    const out = { title: "", author: "", cover: null };
    try {
      if (src.platform === "youtube") {
        const r = await fetch("https://noembed.com/embed?url=" + encodeURIComponent(src.url));
        const d = await r.json();
        if (d && d.title) { out.title = d.title; out.author = d.author_name || ""; out.cover = d.thumbnail_url || null; }
      } else if (src.platform === "bilibili") {
        const r = await fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + src.bvid);
        const d = await r.json();
        if (d && d.data && d.data.title) {
          out.title = d.data.title.replace(/<[^>]+>/g, "");
          out.author = d.data.owner ? d.data.owner.name : "";
          out.cover = d.data.pic || null;
        }
      }
    } catch (e) { /* 预览失败不阻断 */ }
    return out;
  }

  /* ---------- SRT / VTT / 纯文本 解析 ---------- */
  function tcToSec(tc) {
    const m = tc.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/);
    if (!m) return null;
    return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+((m[4] || "0") + "00").slice(0, 3)) / 1000;
  }
  function parseTimedText(raw) {
    const text = raw.replace(/\r/g, "").replace(/^WEBVTT[^\n]*\n/, "").replace(/<[^>]+>/g, "");
    const re = /(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|\n\d+\s*\n|$)/g;
    const subs = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const s = tcToSec(m[1]), e = tcToSec(m[2]);
      const body = m[3].split("\n").map((x) => x.trim()).filter(Boolean).join(" ");
      if (body && s != null && e != null) subs.push({ start: s, end: e, text: body });
    }
    return subs;
  }
  function parsePlainLines(raw) {
    return raw.split(/\n+/).map((x) => x.trim()).filter((x) => x.length > 1);
  }

  /* ---------- 免费机翻（Google gtx 接口，失败留空不阻断） ---------- */
  const gCache = {};
  async function gTranslate(text, tl) {
    if (gCache[text]) return gCache[text];
    const u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" + (tl || "zh-CN") + "&dt=t&q=" + encodeURIComponent(text);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 9000);
        const r = await fetch(u, { signal: ctl.signal });
        clearTimeout(t);
        const d = await r.json();
        const zh = (d[0] || []).map((x) => x[0]).join("");
        if (zh) { gCache[text] = zh; return zh; }
      } catch (e) { /* retry */ }
    }
    return "";
  }
  async function translateAll(lines, tl, onProgress) {
    const res = new Array(lines.length).fill("");
    const POOL = 3;
    let done = 0;
    async function worker(queue) {
      while (queue.length) {
        const i = queue.shift();
        res[i] = await gTranslate(lines[i], tl);
        done++;
        if (onProgress && done % 5 === 0) onProgress(done, lines.length);
      }
    }
    const queue = lines.map((_, i) => i);
    await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, () => worker(queue)));
    onProgress && onProgress(lines.length, lines.length);
    return res;
  }

  /* ---------- 生成 episode 对象 ---------- */
  function buildEpisode(src, meta, subs, translations) {
    const id = "cep" + Date.now().toString(36).slice(-6);
    const subtitles = subs.map((s, i) => ({
      id: "s" + (i + 1),
      start: s.start || 0,
      end: s.end || 0,
      text: s.text,
      translation: (translations && translations[i]) || s.zh || "",
      words: [],
    }));
    const ep = {
      id,
      title: meta.title || src.url,
      shortTitle: (meta.title || "导入视频").slice(0, 14),
      cover: meta.cover || null,
      duration: Math.round(subtitles.length ? subtitles[subtitles.length - 1].end : 0),
      speaker: { name: meta.author || "导入", gender: "F", flag: "🌍" },
      stars: 3,
      tags: ["导入"],
      mediaUrl: "",
      custom: true,
      importedUrl: src.url,
      subtitles,
    };
    if (src.platform === "youtube") ep.source = { platform: "youtube", videoId: src.videoId, url: src.url };
    else if (src.platform === "bilibili") ep.source = { platform: "bilibili", bili: { bvid: src.bvid, page: src.page || 1 }, url: src.url };
    return ep;
  }

  /* ---------- 导入页组件 ---------- */
  const ImportPage = {
    name: "ImportPage",
    data() {
      return {
        autoUrl: "", autoPreview: null, autoChecking: false, autoParsed: null,
        manUrl: "", manText: "", manTranslate: true, manBusy: false, manProgress: "",
        custom: Custom.all(),
      };
    },
    computed: {
      issueUrl() {
        if (!this.autoParsed) return "";
        const r = repoInfo();
        const body = "来源链接: " + this.autoParsed.url +
          "\n\n由学习站「导入」页自动生成。\n" +
          "云端机器人会抓取字幕、翻译并生成词典，完成后自动关闭本 issue 并上线新语料。\n" +
          "（预计 2-5 分钟，完成后刷新目录页即可看到新内容）";
        return "https://github.com/" + r.owner + "/" + r.repo + "/issues/new?title=" +
          encodeURIComponent("导入: " + this.autoParsed.url) + "&body=" + encodeURIComponent(body);
      },
    },
    methods: {
      toast(msg) { document.dispatchEvent(new CustomEvent("cc-toast", { detail: msg })); },
      async checkAuto() {
        const src = parseVideoUrl(this.autoUrl);
        this.autoParsed = null; this.autoPreview = null;
        if (!src) { this.toast(src === null && /b23/.test(this.autoUrl) ? "B站短链请先打开，复制完整链接再粘贴" : "无法识别链接，请粘贴 YouTube 或 B站 视频链接"); return; }
        if (src.platform === "b23") { this.toast("B站短链请先在浏览器打开，复制完整 www.bilibili.com 链接再粘贴"); return; }
        this.autoParsed = src;
        this.autoChecking = true;
        this.autoPreview = await fetchPreview(src);
        this.autoChecking = false;
      },
      goIssue() { if (this.issueUrl) window.open(this.issueUrl, "_blank"); },

      async doManual() {
        if (this.manBusy) return;
        const raw = this.manText.trim();
        if (!raw) { this.toast("请先粘贴 SRT/VTT 字幕或纯文本"); return; }
        const src = parseVideoUrl(this.manUrl);
        if (src && src.platform === "b23") { this.toast("B站短链请粘贴完整链接"); return; }
        let subs = parseTimedText(raw);
        let timed = true;
        if (!subs.length) { timed = false; const lines = parsePlainLines(raw); subs = lines.map((t) => ({ start: 0, end: 0, text: t })); }
        if (!subs.length) { this.toast("没有解析出任何句子"); return; }
        this.manBusy = true;
        try {
          let translations = null;
          if (this.manTranslate) {
            this.manProgress = "翻译中 0/" + subs.length;
            translations = await translateAll(subs.map((s) => s.text), "zh-CN", (d, n) => { this.manProgress = "翻译中 " + d + "/" + n; });
          }
          let meta = { title: "", author: "", cover: null };
          if (src) { this.manProgress = "获取视频信息…"; meta = await fetchPreview(src); }
          if (!timed) meta = { title: meta.title || "文本导入 " + new Date().toISOString().slice(5, 10).replace("-", "/"), author: meta.author, cover: null };
          const ep = buildEpisode(src || { platform: "none", url: "" }, meta, subs, translations);
          if (!timed) { delete ep.source; ep.duration = 0; }
          Custom.add(ep);
          this.custom = Custom.all();
          this.manText = ""; this.manUrl = ""; this.manProgress = "";
          this.toast("已导入「" + ep.shortTitle + "」，刷新页面后出现在目录");
        } finally { this.manBusy = false; }
      },
      delCustom(id) {
        if (!confirm("删除该导入集？学习记录保留，但目录不再显示。")) return;
        Custom.remove(id);
        this.custom = Custom.all();
        this.toast("已删除，刷新页面生效");
      },
    },
    template: `
<div class="page-narrow">
  <div class="page-head"><h2>导入视频</h2><span class="hint">贴链接，两种方式入库</span></div>

  <div class="panel imp-panel">
    <h3>① 自动入库 <span class="hint">推荐 · 云端全自动 · 全设备可见</span></h3>
    <div class="row-gap">
      <input class="imp-input" v-model="autoUrl" placeholder="粘贴 YouTube 或 B站 视频链接" @keyup.enter="checkAuto">
      <button class="btn primary" @click="checkAuto">识别链接</button>
    </div>
    <div v-if="autoChecking" class="hint">正在获取视频信息…</div>
    <div v-if="autoPreview" class="imp-preview">
      <img v-if="autoPreview.cover" :src="autoPreview.cover" class="imp-cover" alt="">
      <div>
        <b>{{ autoPreview.title || '(未能取到标题，不影响导入)' }}</b>
        <div class="hint" v-if="autoPreview.author">{{ autoPreview.author }}</div>
      </div>
    </div>
    <div v-if="autoParsed" class="row-gap">
      <button class="btn primary" @click="goIssue">→ 去 GitHub 提交导入请求</button>
      <span class="hint">提交后云端机器人自动：抓字幕 → 翻译 → 生成词典 → 上线。约 2-5 分钟，处理进度看 issue，完成后刷新目录页即可。</span>
    </div>
    <p class="hint">首次使用请在 GitHub 登录态下操作；不想等云端可用下面的手动导入。</p>
  </div>

  <div class="panel imp-panel">
    <h3>② 手动导入 <span class="hint">字幕在手 · 立即生效 · 仅本机</span></h3>
    <input class="imp-input" v-model="manUrl" placeholder="视频链接（可选：填了且字幕带时间轴即可在线播放）">
    <textarea class="imp-area" rows="7" v-model="manText" placeholder="粘贴 SRT / VTT 字幕内容，或每行一句的纯文本。&#10;SRT 示例：&#10;1&#10;00:00:01,000 --> 00:00:04,500&#10;Never gonna give you up"></textarea>
    <div class="row-gap wrap">
      <label class="hint"><input type="checkbox" v-model="manTranslate"> 自动翻译（免费接口，逐句机翻）</label>
      <span class="hint" v-if="manProgress">{{ manProgress }}</span>
    </div>
    <button class="btn primary" :disabled="manBusy" @click="doManual">{{ manBusy ? '处理中…' : '导入到本机语料库' }}</button>
    <p class="hint">带时间轴的 SRT/VTT + 视频链接 = 在线播放、逐句同步；纯文本 = TTS 逐句朗读模式。手动导入仅保存在本浏览器，可从下方删除。</p>
  </div>

  <div class="panel imp-panel" v-if="custom.length">
    <h3>本机已导入（{{ custom.length }}）</h3>
    <div class="imp-item" v-for="e in custom" :key="e.id">
      <span class="imp-item-t">{{ e.shortTitle }}</span>
      <span class="hint">{{ e.subtitles.length }} 句 · {{ e.source ? (e.source.platform === 'youtube' ? 'YouTube' : 'B站') : '纯文本' }}</span>
      <button class="tbtn" @click="delCustom(e.id)">删除</button>
    </div>
  </div>
</div>
`,
  };

  window.ImportPage = ImportPage;
  window.__ccImport = { Custom, parseVideoUrl, parseTimedText, parsePlainLines, buildEpisode, translateAll, repoInfo };
})();
