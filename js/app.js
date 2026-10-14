/* =========================================================================
 * app.js — 应用壳 + 目录/收藏/搜索/录音/概览/方法/设置
 * 极简 hash 路由：#/ 目录 · #/study/:id 学习 · #/favorites · #/search
 *             #/recordings · #/summary · #/methods · #/settings
 * ========================================================================= */
(function () {
  "use strict";
  const CORPUS = window.CORPUS;
  const DB = window.DB;

  /* ---------- 微路由 ---------- */
  const Router = {
    current() {
      const h = (location.hash || "#/").slice(1);
      const parts = h.split("/").filter(Boolean);
      if (!parts.length) return { name: "home" };
      if (parts[0] === "study") return { name: "study", param: parts[1] };
      return { name: parts[0] };
    },
    push(path) { location.hash = path.startsWith("#") ? path : "#" + path; },
  };

  function toast(msg) { document.dispatchEvent(new CustomEvent("cc-toast", { detail: msg })); }
  function fmtDur(s) { return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); }

  /* ---------- 目录页 ---------- */
  const HomePage = {
    name: "HomePage",
    data() {
      return {
        eps: CORPUS.episodes,
        fGender: "", fStar: 0, fTag: "", fStatus: "", sortDesc: false,
        query: "",
        status: DB.get("episodeStatus", {}),
        favSubs: DB.get("favSubs", []),
      };
    },
    computed: {
      allTags() {
        const s = new Set();
        this.eps.forEach((e) => (e.tags || []).forEach((t) => s.add(t)));
        return Array.from(s);
      },
      filtered() {
        let list = this.eps.filter((e) => {
          if (this.fGender && e.speaker.gender !== this.fGender) return false;
          if (this.fStar && e.stars !== this.fStar) return false;
          if (this.fTag && !(e.tags || []).includes(this.fTag)) return false;
          if (this.fStatus) {
            const st = !!((this.status[e.id] || {}).learned);
            if (this.fStatus === "learned" && !st) return false;
            if (this.fStatus === "unlearned" && st) return false;
            if (this.fStatus === "fav" && !this.favSubs.some((s) => s.epId === e.id)) return false;
          }
          if (this.query) {
            const q = this.query.toLowerCase();
            const hay = (e.title + e.shortTitle + e.speaker.name + (e.tags || []).join()).toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        list = list.slice().sort((a, b) => (this.sortDesc ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id)));
        return list;
      },
      stats() {
        const learned = this.eps.filter((e) => (this.status[e.id] || {}).learned).length;
        return { total: this.eps.length, learned, fav: new Set(this.favSubs.map((s) => s.epId)).size, days: DB.checkinDays() };
      },
      hasFilter() { return this.fGender || this.fStar || this.fTag || this.fStatus || this.query; },
    },
    methods: {
      go(ep) { Router.push("/study/" + ep.id); },
      clearAll() { this.fGender = ""; this.fStar = 0; this.fTag = ""; this.fStatus = ""; this.query = ""; },
      fmtDur,
      stars(n) { return "★★★★★".slice(0, n); },
      learnedOf(ep) { return !!(this.status[ep.id] || {}).learned; },
      grad(ep) {
        const h = (ep.id.charCodeAt(ep.id.length - 1) * 37) % 360;
        return "linear-gradient(135deg, hsl(" + h + ",45%,88%), hsl(" + ((h + 60) % 360) + ",40%,80%))";
      },
    },
    template: `
<div class="home-page">
  <div class="hero">
    <div>
      <p class="hero-kicker">{{ CORPUS.meta.name }}</p>
      <h1>{{ CORPUS.meta.tagline }}</h1>
    </div>
    <div class="hero-stats">
      <div class="hstat"><b>{{ stats.total }}</b><span>当前期数</span></div>
      <div class="hstat"><b>{{ stats.learned }}</b><span>已学习</span></div>
      <div class="hstat"><b>{{ stats.days }}</b><span>打卡天数</span></div>
      <div class="hstat"><b>{{ stats.fav }}</b><span>收藏视频</span></div>
    </div>
  </div>

  <div class="filter-bar">
    <input class="search-input" v-model.trim="query" placeholder="搜索标题 / 作者 / 标签…">
    <select v-model="fGender"><option value="">全部作者</option><option value="F">女性</option><option value="M">男性</option></select>
    <select v-model.number="fStar"><option :value="0">星难度</option><option v-for="n in 5" :key="n" :value="n">{{ n }} 星</option></select>
    <select v-model="fTag"><option value="">全部标签</option><option v-for="t in allTags" :key="t" :value="t">{{ t }}</option></select>
    <select v-model="fStatus"><option value="">学习状态</option><option value="learned">已学习</option><option value="unlearned">未学习</option><option value="fav">已收藏</option></select>
    <select v-model="sortDesc"><option :value="false">正序</option><option :value="true">倒序</option></select>
    <button class="btn ghost sm" v-if="hasFilter" @click="clearAll">清除全部</button>
  </div>

  <div class="ep-grid">
    <div v-for="ep in filtered" :key="ep.id" class="ep-card" @click="go(ep)">
      <div class="ep-cover" :style="{background: ep.cover ? undefined : grad(ep)}">
        <img v-if="ep.cover" :src="ep.cover" :alt="ep.shortTitle" loading="lazy" referrerpolicy="no-referrer">
        <span v-else class="ep-initial">{{ ep.shortTitle.slice(0,2) }}</span>
        <span class="ep-dur" v-if="ep.duration">{{ fmtDur(ep.duration) }}</span>
        <span class="ep-pending" v-if="!ep.subtitles || !ep.subtitles.length">待加字幕</span>
        <span class="ep-status" v-if="learnedOf(ep)">已学习</span>
      </div>
      <div class="ep-info">
        <div class="ep-author"><span>{{ ep.speaker.flag }}</span><b>{{ ep.speaker.name }}</b></div>
        <div class="ep-title">{{ ep.shortTitle }}</div>
        <div class="ep-foot">
          <span class="stars" :title="ep.stars + ' 星难度'">{{ stars(ep.stars) }}</span>
          <span class="tag-mini" v-for="t in ep.tags" :key="t">{{ t }}</span>
        </div>
      </div>
    </div>
  </div>
  <p v-if="!filtered.length" class="empty">没有符合条件的语料</p>
</div>
`,
  };

  /* ---------- 收藏页（词条 + 字幕） ---------- */
  const FavoritesPage = {
    name: "FavoritesPage",
    data() {
      return {
        tab: "entries",
        favEntries: DB.get("favEntries", []),
        favSubs: DB.get("favSubs", []),
        wordbooks: DB.get("wordbooks", []),
        entryTags: DB.get("entryTags", []),
        fBook: "", fTag: "", fQuery: "",
        manage: null, // null|'books'|'tags'
        newBookName: "", newBookDesc: "", newTagName: "",
        editNote: "",
      };
    },
    computed: {
      filteredEntries() {
        return this.favEntries.filter((e) => {
          if (this.fBook && !e.bookIds.includes(this.fBook)) return false;
          if (this.fTag && !e.tagIds.includes(this.fTag)) return false;
          if (this.fQuery && !e.word.toLowerCase().includes(this.fQuery.toLowerCase())) return false;
          return true;
        }).slice().reverse();
      },
      filteredSubs() {
        return this.favSubs.slice().reverse().map((s) => {
          const ep = CORPUS.episodes.find((e) => e.id === s.epId);
          const sub = ep && ep.subtitles.find((x) => x.id === s.subId);
          return Object.assign({}, s, { ep, sub });
        }).filter((s) => s.sub);
      },
    },
    methods: {
      entry(word) { return (CORPUS.dictionary || {})[word]; },
      refresh() {
        this.favEntries = DB.get("favEntries", []);
        this.favSubs = DB.get("favSubs", []);
        this.wordbooks = DB.get("wordbooks", []);
        this.entryTags = DB.get("entryTags", []);
      },
      goStudy(s) { Router.push("/study/" + s.epId); },
      unfavEntry(word) { DB.toggleFavEntry(word); this.refresh(); toast("已取消收藏"); },
      addBook() {
        if (!this.newBookName.trim()) return;
        const r = DB.addBook(this.newBookName.trim(), this.newBookDesc.trim());
        if (!r.ok) { toast(r.msg); return; }
        this.newBookName = ""; this.newBookDesc = ""; this.refresh(); toast("单词本已创建");
      },
      delBook(b) {
        if (!confirm('确认删除「' + b.name + '」吗？已收藏词条将不再按这个单词本筛选。')) return;
        DB.removeBook(b.id); this.refresh(); toast("单词本已删除");
      },
      addTag() {
        if (!this.newTagName.trim()) return;
        const r = DB.addTag(this.newTagName.trim());
        if (!r.ok) { toast(r.msg); return; }
        this.newTagName = ""; this.refresh(); toast("标签已创建");
      },
      delTag(t) {
        if (!confirm("确认删除 #" + t.name + " 吗？该标签将不再参与筛选。")) return;
        DB.removeTag(t.id); this.refresh(); toast("标签已删除");
      },
      saveSubNote(s) { DB.setSubNote(s.epId, s.subId, s.note); toast("笔记已保存"); },
      unfavSub(s) { DB.toggleFavSub(s.epId, s.subId); this.refresh(); toast("已取消收藏字幕"); },
    },
    template: `
<div class="page-narrow">
  <div class="page-head">
    <h2>我的收藏</h2>
    <div class="seg">
      <button :class="['segbtn', tab === 'entries' ? 'on' : '']" @click="tab = 'entries'">词条 {{ favEntries.length }}</button>
      <button :class="['segbtn', tab === 'subs' ? 'on' : '']" @click="tab = 'subs'">字幕 {{ favSubs.length }}</button>
    </div>
  </div>

  <template v-if="tab === 'entries'">
    <div class="filter-bar">
      <input class="search-input" v-model.trim="fQuery" placeholder="搜单词…">
      <select v-model="fBook"><option value="">全部单词本</option><option v-for="b in wordbooks" :key="b.id" :value="b.id">{{ b.name }}</option></select>
      <select v-model="fTag"><option value="">全部标签</option><option v-for="t in entryTags" :key="t.id" :value="t.id">{{ t.name }}</option></select>
      <button class="btn sm" @click="manage = manage === 'books' ? null : 'books'">管理单词本</button>
      <button class="btn sm" @click="manage = manage === 'tags' ? null : 'tags'">管理标签</button>
    </div>

    <div v-if="manage === 'books'" class="panel">
      <div class="book-row" v-for="b in wordbooks" :key="b.id">
        <div><b>{{ b.name }}</b> <span class="hint">{{ b.desc }}</span></div>
        <button class="btn sm danger" @click="delBook(b)">删除</button>
      </div>
      <div class="book-row">
        <input v-model.trim="newBookName" placeholder="新单词本名称">
        <input v-model.trim="newBookDesc" placeholder="描述（可选）">
        <button class="btn primary sm" @click="addBook">创建</button>
      </div>
    </div>
    <div v-if="manage === 'tags'" class="panel">
      <div class="book-row" v-for="t in entryTags" :key="t.id">
        <div>#{{ t.name }}</div>
        <button class="btn sm danger" @click="delTag(t)">删除</button>
      </div>
      <div class="book-row">
        <input v-model.trim="newTagName" placeholder="新标签名称">
        <button class="btn primary sm" @click="addTag">创建</button>
      </div>
    </div>

    <div v-if="filteredEntries.length" class="fav-entries">
      <div class="fav-entry" v-for="e in filteredEntries" :key="e.word">
        <div class="fe-head">
          <b class="fe-word">{{ e.word }}</b>
          <span class="hint" v-if="entry(e.word)">{{ entry(e.word).phonetic }} {{ entry(e.word).pos }}</span>
          <div class="row-gap">
            <button class="mini" @click="speak(e.word)">🔊</button>
            <button class="mini danger" @click="unfavEntry(e.word)">✕</button>
          </div>
        </div>
        <p class="fe-mean" v-if="entry(e.word)">{{ entry(e.word).meaning }}</p>
        <p class="fe-line" v-if="entry(e.word) && entry(e.word).collocation"><b>搭配</b>{{ entry(e.word).collocation }}</p>
        <p class="fe-line" v-if="entry(e.word) && entry(e.word).expression"><b>地道</b>{{ entry(e.word).expression }}</p>
        <div class="wc-mrow"><span>单词本</span>
          <button v-for="b in wordbooks" :key="b.id" class="chip" :class="{on: e.bookIds.includes(b.id)}" @click="entryBookToggle(e, b.id)">{{ b.name }}</button>
          <span class="hint" v-if="!wordbooks.length">暂无单词本，点上方「管理单词本」创建</span>
        </div>
        <div class="wc-mrow"><span>标签</span>
          <button v-for="t in entryTags" :key="t.id" class="chip" :class="{on: e.tagIds.includes(t.id)}" @click="entryTagToggle(e, t.id)">{{ t.name }}</button>
          <span class="hint" v-if="!entryTags.length">暂无标签</span>
        </div>
        <textarea class="fe-note" rows="1" v-model="e.note" placeholder="备注…" @change="DB.updateFavEntry(e.word, {note: e.note}); toastMsg('已保存')"></textarea>
      </div>
    </div>
    <p v-else class="empty">没有找到匹配的收藏词条。去学习页点字幕查词、收藏吧。</p>
  </template>

  <template v-else>
    <div class="fav-subs">
      <div class="fav-sub" v-for="s in filteredSubs" :key="s.epId + s.subId">
        <div class="fs-ep" @click="goStudy(s)">{{ s.ep.shortTitle }} · 第 {{ s.ep.subtitles.findIndex(x => x.id === s.subId) + 1 }} 句</div>
        <p class="fs-text">{{ s.sub.text }}</p>
        <p class="fs-tr">{{ s.sub.translation }}</p>
        <textarea class="fe-note" rows="1" v-model="s.note" placeholder="笔记…" @change="saveSubNote(s)"></textarea>
        <button class="btn sm danger" @click="unfavSub(s)">取消收藏</button>
      </div>
    </div>
    <p v-if="!filteredSubs.length" class="empty">还没有收藏字幕。</p>
  </template>
  <methods-entry v-if="false"></methods-entry>
</div>
`,
    created() { this.DB = DB; },
  };

  /* 上面模板里用到的收藏词条本/标签切换 */
  FavoritesPage.methods.toastMsg = toast;
  FavoritesPage.methods.speak = function (word) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = CORPUS.meta.learnLang || "en-US";
      speechSynthesis.speak(u);
    } catch (e) {}
  };
  FavoritesPage.methods.entryBookToggle = function (e, bookId) {
    const has = e.bookIds.includes(bookId);
    const bookIds = has ? e.bookIds.filter((x) => x !== bookId) : e.bookIds.concat([bookId]);
    DB.updateFavEntry(e.word, { bookIds });
    this.refresh();
  };
  FavoritesPage.methods.entryTagToggle = function (e, tagId) {
    const has = e.tagIds.includes(tagId);
    const tagIds = has ? e.tagIds.filter((x) => x !== tagId) : e.tagIds.concat([tagId]);
    DB.updateFavEntry(e.word, { tagIds });
    this.refresh();
  };

  /* ---------- 全库搜索 ---------- */
  const SearchPage = {
    name: "SearchPage",
    data() { return { q: "", results: null, searched: false }; },
    computed: {
      count() { return this.results ? this.results.length : 0; },
    },
    methods: {
      doSearch() {
        if (!this.q.trim()) { this.results = null; this.searched = false; return; }
        const q = this.q.toLowerCase();
        const out = [];
        CORPUS.episodes.forEach((ep) => {
          ep.subtitles.forEach((s, i) => {
            if (s.text.toLowerCase().includes(q) || (s.translation || "").includes(this.q)) {
              out.push({ ep, sub: s, idx: i + 1 });
            }
          });
        });
        this.results = out;
        this.searched = true;
      },
      go(r) { Router.push("/study/" + r.ep.id); },
      hl(text) {
        const q = this.q;
        if (!q) return text;
        return text.replace(new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$") + ")", "gi"), "<mark>$1</mark>");
      },
    },
    template: `
<div class="page-narrow">
  <div class="page-head"><h2>语料搜索</h2></div>
  <form class="search-big" @submit.prevent="doSearch">
    <input v-model.trim="q" placeholder="输入单词或短语，在全部字幕中检索…" autofocus>
    <button class="btn primary" type="submit">搜索</button>
  </form>
  <p class="hint" v-if="searched">共找到 {{ count }} 条字幕</p>
  <div class="search-results">
    <div class="sres" v-for="r in results" :key="r.ep.id + r.sub.id" @click="go(r)">
      <div class="fs-ep">{{ r.ep.shortTitle }} · 第 {{ r.idx }} 句</div>
      <p class="fs-text" v-html="hl(r.sub.text)"></p>
      <p class="fs-tr">{{ r.sub.translation }}</p>
    </div>
  </div>
  <p v-if="searched && !count" class="empty">没有找到包含「{{ q }}」的字幕。</p>
</div>
`,
  };

  /* ---------- 录音列表 ---------- */
  const RecordingsPage = {
    name: "RecordingsPage",
    data() { return { recs: [], playingId: null, armedId: null }; },
    async mounted() { this.recs = await DB.Recordings.all(); },
    methods: {
      epOf(r) { return CORPUS.episodes.find((e) => e.id === r.epId); },
      subOf(r) { const ep = this.epOf(r); return ep && ep.subtitles.find((s) => s.id === r.subId); },
      go(r) { Router.push("/study/" + r.epId); },
      play(r) {
        if (this._audio) { try { this._audio.pause(); } catch (e) {} }
        const url = URL.createObjectURL(r.blob);
        this._audio = new Audio(url);
        this.playingId = r.id;
        this._audio.onended = () => { this.playingId = null; URL.revokeObjectURL(url); };
        this._audio.play().catch(() => { this.playingId = null; });
      },
      async del(r) {
        if (this.armedId === r.id) {
          await DB.Recordings.remove(r.id);
          this.recs = await DB.Recordings.all();
          this.armedId = null;
          toast("录音已删除");
        } else {
          this.armedId = r.id;
          toast("再点一次删除以确认");
          setTimeout(() => { this.armedId = null; }, 2500);
        }
      },
    },
    template: `
<div class="page-narrow">
  <div class="page-head"><h2>跟读录音</h2><span class="hint">共 {{ recs.length }} 条</span></div>
  <div class="rec-big-list">
    <div class="rec-item big" v-for="r in recs" :key="r.id">
      <div class="ri-main" @click="go(r)">
        <b>{{ (epOf(r) || {}).shortTitle || r.epId }}</b>
        <span class="hint">{{ (subOf(r) || {}).text || r.subId }}</span>
      </div>
      <span class="rec-time">{{ new Date(r.createdAt).toLocaleString() }} · {{ r.duration }}s</span>
      <button class="btn sm" @click="play(r)">{{ playingId === r.id ? '⏸' : '▶' }}</button>
      <button class="btn sm danger" @click="del(r)">{{ armedId === r.id ? '确认?' : '删除' }}</button>
    </div>
  </div>
  <p v-if="!recs.length" class="empty">还没有录音。去学习页用 🎤 跟读吧。</p>
</div>
`,
  };

  /* ---------- 学习概览 ---------- */
  const SummaryPage = {
    name: "SummaryPage",
    data() {
      const st = DB.get("episodeStatus", {});
      const dict = DB.get("dictation", {});
      const checkins = DB.get("checkins", []);
      let dictCount = 0, dictScoreSum = 0;
      Object.keys(dict).forEach((ep) => Object.keys(dict[ep]).forEach((s) => { dictCount++; dictScoreSum += dict[ep][s].score || 0; }));
      return {
        eps: CORPUS.episodes,
        status: st,
        checkins,
        favEntries: DB.get("favEntries", []),
        favSubs: DB.get("favSubs", []),
        dictCount,
        dictAvg: dictCount ? Math.round(dictScoreSum / dictCount) : 0,
        days: DB.checkinDays(),
      };
    },
    computed: {
      learned() { return this.eps.filter((e) => (this.status[e.id] || {}).learned).length; },
      recent7() {
        const out = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
          out.push({ date: key.slice(5), n: this.checkins.filter((c) => c.date === key).length });
        }
        return out;
      },
    },
    methods: {
      go(ep) { Router.push("/study/" + ep.id); },
      maxN() { return Math.max(1, ...this.recent7.map((r) => r.n)); },
    },
    template: `
<div class="page-narrow">
  <div class="page-head"><h2>学习概览</h2></div>
  <div class="stat-grid">
    <div class="stat"><b>{{ learned }}/{{ eps.length }}</b><span>已学习集数</span></div>
    <div class="stat"><b>{{ days }}</b><span>累计打卡天数</span></div>
    <div class="stat"><b>{{ favEntries.length }}</b><span>收藏词条</span></div>
    <div class="stat"><b>{{ favSubs.length }}</b><span>收藏字幕</span></div>
    <div class="stat"><b>{{ dictCount }}</b><span>听写句子数</span></div>
    <div class="stat"><b>{{ dictAvg }}%</b><span>听写平均分</span></div>
  </div>
  <h3 class="sec-title">近 7 天打卡</h3>
  <div class="week-chart">
    <div class="wc-col" v-for="d in recent7" :key="d.date">
      <i :style="{height: Math.round(d.n / maxN() * 64) + 'px'}" :class="{zero: !d.n}"></i>
      <span>{{ d.date }}</span>
      <em>{{ d.n || '' }}</em>
    </div>
  </div>
  <h3 class="sec-title">各集进度</h3>
  <div class="ep-progress">
    <div class="epr" v-for="e in eps" :key="e.id" @click="go(e)">
      <span class="epr-title">{{ e.shortTitle }}</span>
      <div class="progress-bar"><i :style="{width: ((status[e.id]||{}).learned ? 100 : Math.min(90, ((status[e.id]||{}).learnCount||0) * 30)) + '%'}"></i></div>
      <span class="hint">{{ (status[e.id]||{}).learned ? '已完成' : ((status[e.id]||{}).learnCount||0) > 0 ? '学过 ' + (status[e.id]||{}).learnCount + ' 次' : '未开始' }}</span>
    </div>
  </div>
</div>
`,
  };

  /* ---------- 学习方法 ---------- */
  const MethodsPage = {
    name: "MethodsPage",
    data() { return { methods: [
      { key: "loop", name: "单句循环", desc: "选一句听不懂的句子，设成单句循环，重复 10-20 遍，直到每个音节都听清。配合 0.8x 慢速起步，逐步提到 1.2x。" },
      { key: "echo", name: "回音法", desc: "听一句 → 在脑中回放一遍原声 → 再模仿说出来。不是跟着读，而是先「回音」再开口，对语音语调的塑造更有效。" },
      { key: "dictation", name: "精听听写", desc: "切到「听写」模式，只看中文提示，逐句写下你听到的内容。写完点检查，把漏掉的音反复听，直到 90 分以上再进入下一句。" },
      { key: "shadow", name: "影子跟读", desc: "原声播放的同时几乎同步地跟读（落后 1-2 个词），不看文本。录下自己的声音，与原声对比，修正发音。" },
      { key: "cloze", name: "挖空自测", desc: "切到「挖空」模式，关键词被隐藏。播放句子，凭听力和语感填空，检验你是否真的听懂了。" },
      { key: "vocab", name: "词卡积累", desc: "遇到生词点一下就能查词卡。把值得记的词收藏进单词本，打上标签，在「收藏」页定期复习。" },
    ] }; },
    template: `
<div class="page-narrow">
  <div class="page-head"><h2>学习方法</h2><span class="hint">一步一步教你学</span></div>
  <div class="method-card" v-for="m in methods" :key="m.key">
    <h3>{{ m.name }}</h3>
    <p>{{ m.desc }}</p>
  </div>
  <p class="hint center">键盘快捷键：空格 播放/暂停 · ← → 切句 · L 切换单句循环</p>
</div>
`,
  };

  /* ---------- 设置 ---------- */
  const SettingsPage = {
    name: "SettingsPage",
    data() {
      return {
        theme: DB.get("theme", "light"),
        settings: DB.get("settings", {}),
        voices: [],
        importText: "",
        recCount: 0,
      };
    },
    async mounted() {
      try { this.voices = speechSynthesis.getVoices().filter((v) => (v.lang || "").toLowerCase().startsWith((CORPUS.meta.learnLang || "en").slice(0, 2))); } catch (e) {}
      this.recCount = (await DB.Recordings.all()).length;
    },
    methods: {
      setTheme(t) { this.theme = t; DB.set("theme", t); document.documentElement.setAttribute("data-theme", t); },
      saveSettings() {
        DB.set("settings", Object.assign({}, this.settings));
        toast("设置已保存");
      },
      exportData() {
        const data = DB.dump();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "corpus-companion-backup-" + DB.today() + ".json";
        a.click();
        toast("已导出学习数据（不含录音文件）");
      },
      importData() {
        try {
          const data = JSON.parse(this.importText);
          DB.restore(data, "merge");
          toast("导入成功，刷新页面生效");
        } catch (e) {
          toast("导入失败：JSON 格式错误");
        }
      },
      async clearRecordings() {
        if (!confirm("确认删除全部 " + this.recCount + " 条录音？不可恢复。")) return;
        await DB.Recordings.removeAll();
        this.recCount = 0;
        toast("录音已清空");
      },
    },
    template: `
<div class="page-narrow">
  <div class="page-head"><h2>设置</h2></div>

  <h3 class="sec-title">外观</h3>
  <div class="seg">
    <button :class="['segbtn', theme === 'light' ? 'on' : '']" @click="setTheme('light')">☀ 浅色</button>
    <button :class="['segbtn', theme === 'dark' ? 'on' : '']" @click="setTheme('dark')">🌙 深色</button>
  </div>

  <h3 class="sec-title">播放默认值</h3>
  <div class="set-row"><span>默认字幕模式</span>
    <select v-model="settings.defaultMode">
      <option value="bilingual">双语</option><option value="original">原文</option><option value="translation">译文</option>
      <option value="dictation">听写</option><option value="cloze">挖空</option>
    </select>
  </div>
  <div class="set-row"><span>默认倍速</span><input type="number" step="0.05" min="0.5" max="2" v-model.number="settings.defaultRate"></div>
  <div class="set-row"><span>循环间隔（秒）</span><input type="number" step="0.5" min="0" max="10" v-model.number="settings.loopGap"></div>
  <div class="set-row"><span>TTS 朗读语音</span>
    <select v-model="settings.ttsVoice"><option value="">自动</option><option v-for="v in voices" :key="v.name" :value="v.name">{{ v.name }} ({{ v.lang }})</option></select>
  </div>
  <button class="btn primary" @click="saveSettings">保存设置</button>

  <h3 class="sec-title">数据</h3>
  <p class="hint">个人自用模式下，学习数据保存在当前浏览器。换设备/清缓存前请先导出备份。</p>
  <div class="row-gap wrap">
    <button class="btn" @click="exportData">⬇ 导出学习数据</button>
    <span class="hint">录音文件：{{ recCount }} 条（导出暂不包含，可用学习页逐条下载）</span>
  </div>
  <div class="panel">
    <p class="hint">粘贴备份 JSON 后点击导入（合并模式，不覆盖未提及的键）：</p>
    <textarea rows="4" v-model="importText" placeholder='{"checkins": [...], "favEntries": [...]}'></textarea>
    <button class="btn" @click="importData">导入数据</button>
  </div>
  <button class="btn danger" @click="clearRecordings">清空全部录音</button>
</div>
`,
  };

  /* ---------- 根组件 ---------- */
  const App = {
    name: "App",
    data() {
      return {
        route: Router.current(),
        toasts: [],
        navOpen: false,
        importKey: 0,
      };
    },
    computed: {
      isStudy() { return this.route.name === "study"; },
      corpus() { return CORPUS; },
    },
    mounted() {
      document.documentElement.setAttribute("data-theme", DB.get("theme", "light"));
      DB.ensureDefaults();
      window.addEventListener("hashchange", () => {
        this.route = Router.current();
        this.navOpen = false;
        window.scrollTo(0, 0);
      });
      document.addEventListener("cc-toast", (e) => {
        const id = Date.now() + Math.random();
        this.toasts.push({ id, msg: e.detail });
        setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id); }, 2600);
      });
    },
    methods: {
      go(p) { Router.push(p); },
      openFreshImport() {
        sessionStorage.removeItem("ccSubtitleTarget");
        this.importKey++;
        Router.push("/import");
      },
    },
    template: `
<div class="app-shell">
  <nav class="topnav">
    <a class="brand" @click.prevent="go('/')" href="#/">
      <span class="brand-mark">语</span>
      <span class="brand-text"><b>{{ corpus.meta.name }}</b><i>{{ corpus.meta.tagline }}</i></span>
    </a>
    <div class="nav-links" :class="{open: navOpen}">
      <a href="#/" :class="{on: route.name === 'home'}">目录</a>
      <a href="#/favorites" :class="{on: route.name === 'favorites'}">收藏</a>
      <a href="#/search" :class="{on: route.name === 'search'}">搜索</a>
      <a href="#/recordings" :class="{on: route.name === 'recordings'}">录音</a>
      <a href="#/summary" :class="{on: route.name === 'summary'}">概览</a>
      <a href="#/methods" :class="{on: route.name === 'methods'}">学习方法</a>
      <a href="#/settings" :class="{on: route.name === 'settings'}">设置</a>
    </div>
    <a class="nav-import" href="#/import" :aria-current="route.name === 'import' ? 'page' : null" @click.prevent="openFreshImport">＋ 导入视频</a>
    <button class="nav-burger" aria-label="展开导航" @click="navOpen = !navOpen">☰</button>
  </nav>

  <main class="app-main">
    <home-page v-if="route.name === 'home'"></home-page>
    <study-page v-else-if="isStudy" :key="route.param" :ep-id="route.param"></study-page>
    <favorites-page v-else-if="route.name === 'favorites'"></favorites-page>
    <search-page v-else-if="route.name === 'search'"></search-page>
    <import-page v-else-if="route.name === 'import'" :key="importKey"></import-page>
    <recordings-page v-else-if="route.name === 'recordings'"></recordings-page>
    <summary-page v-else-if="route.name === 'summary'"></summary-page>
    <methods-page v-else-if="route.name === 'methods'"></methods-page>
    <settings-page v-else-if="route.name === 'settings'"></settings-page>
    <div v-else class="page-narrow"><h2>404</h2><p class="empty">页面不存在，<a href="#/">回目录</a>。</p></div>
  </main>

  <div class="toast-wrap">
    <div class="toast" v-for="t in toasts" :key="t.id">{{ t.msg }}</div>
  </div>
</div>
`,
  };

  const app = Vue.createApp(App);
  app.config.globalProperties.DB = DB;
  app.config.globalProperties.CORPUS = CORPUS;
  app.component("home-page", HomePage);
  app.component("study-page", window.StudyPage);
  app.component("favorites-page", FavoritesPage);
  app.component("search-page", SearchPage);
  app.component("import-page", window.ImportPage);
  app.component("recordings-page", RecordingsPage);
  app.component("summary-page", SummaryPage);
  app.component("methods-page", MethodsPage);
  app.component("settings-page", SettingsPage);
  app.mount("#app");
})();
