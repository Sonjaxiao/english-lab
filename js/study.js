/* =========================================================================
 * study.js — 学习页（核心页）
 * 播放引擎四模式：本地媒体 / TTS朗读 / YouTube IFrame API / B站iframe+计时同步
 * 单句循环 · AB循环 · 无级倍速 · 循环间隔 · 循环次数 · 句后暂停
 * 字幕五模式（双语/原文/译文/听写/挖空）· 点击查词 · 词卡收藏
 * 字幕收藏/笔记 · 逐句跟读录音 · 学习打卡
 * ========================================================================= */
(function () {
  "use strict";

  const CORPUS = window.CORPUS;
  const DB = window.DB;
  const YT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  /* ---------------- 工具 ---------------- */
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }
  function toast(msg) {
    document.dispatchEvent(new CustomEvent("cc-toast", { detail: msg }));
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function normalizeWord(w) {
    return (w || "").toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");
  }
  function tokenize(text) {
    return (text || "").split(/\s+/).filter(Boolean);
  }
  function normText(t) {
    return (t || "").toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function speakText(text, rate, lang, voiceName, onend) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || "en-US";
      u.rate = Math.min(2, Math.max(0.5, rate || 1));
      const vs = window.speechSynthesis.getVoices();
      const v = vs.find((x) => x.name === voiceName);
      if (v) u.voice = v;
      if (onend) u.onend = onend;
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn(e);
      if (onend) onend();
    }
  }
  let ytApiPromise = null;
  function loadYTApi(timeoutMs) {
    if (window.YT && window.YT.Player) return Promise.resolve(true);
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (prev) prev();
        finish(true);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => finish(false);
      document.head.appendChild(s);
      setTimeout(() => finish(false), timeoutMs || 8000);
    });
    return ytApiPromise;
  }

  /* ---------------- 播放引擎（非响应式，模块级单例） ---------------- */
  const engine = {
    kind: "tts",        // tts | audio | yt | bili
    audio: null,
    yt: null,
    timer: null,
    tick: null,
    stopped: true,
  };
  function clearTimers() {
    if (engine.timer) { clearTimeout(engine.timer); engine.timer = null; }
  }
  function stopEngine() {
    engine.stopped = true;
    clearTimers();
    try { window.speechSynthesis.cancel(); } catch (e) {}
    if (engine.audio) engine.audio.pause();
    if (engine.kind === "yt" && engine.yt && engine.yt.pauseVideo) {
      try { engine.yt.pauseVideo(); } catch (e) {}
    }
  }
  function destroyEngine() {
    stopEngine();
    if (engine.tick) { clearInterval(engine.tick); engine.tick = null; }
    if (engine.yt) { try { engine.yt.destroy(); } catch (e) {} engine.yt = null; }
    engine.audio = null;
    try { delete window.__ccEngine; } catch (e) {}
  }

  const StudyPage = {
    name: "StudyPage",
    props: { epId: String },
    data() {
      const ep = CORPUS.episodes.find((e) => e.id === this.epId) || CORPUS.episodes[0];
      const settings = DB.get("settings", {});
      return {
        ep,
        subs: ep.subtitles,
        idx: 0,
        playing: false,
        playMode: "sequence",      // sequence 顺序 | sentence 单句循环 | AB
        abA: -1, abB: -1,
        rate: settings.defaultRate || 1,
        gap: settings.loopGap != null ? settings.loopGap : 1,
        loopTimes: 0,              // 0=∞ 1,2,3 顺序模式下每句播放次数
        autoPause: !!settings.autoPause,
        subMode: settings.defaultMode || "bilingual",
        showPanel: null,           // null|'settings'|'note'
        noteDraft: "",
        noteSubId: "",
        card: null,
        dictInput: "",
        dictResult: null,
        clozeRevealed: false,
        clozeResults: {},
        clozeVersion: 0,
        recState: "idle",
        recList: [],
        recBlobUrl: null,
        recSec: 0,
        learned: !!((DB.get("episodeStatus", {})[ep.id] || {}).learned),
        voices: [],
        // B站计时同步状态
        biliRunning: false,
        biliT: 0,
        biliJumpSec: null,
        engineOverride: "",
        ytReady: false,
        ytLite: false,
        liteReason: "",
        _unwatch: null,
      };
    },
    computed: {
      cur() { return this.subs[this.idx] || this.subs[0]; },
      source() { return this.ep.source || null; },
      isYt() { return this.source && this.source.platform === "youtube"; },
      isBili() { return this.source && this.source.platform === "bilibili"; },
      biliSource() { return (this.source && this.source.bili) || null; },
      availableSources() {
        const list = [];
        if (this.isYt) list.push({ key: "yt", label: "YouTube" });
        if (this.isBili || this.biliSource) list.push({ key: "bili", label: "B站" });
        if (this.ep.mediaUrl) list.push({ key: "audio", label: "本地" });
        return list;
      },
      engineKind() {
        const o = this.engineOverride;
        if (o === "audio" && this.ep.mediaUrl) return "audio";
        if (o === "bili" && (this.isBili || this.biliSource)) return "bili";
        if (o === "yt" && this.isYt) return "yt";
        if (this.isYt) return "yt"; // 在线优先：YouTube 全功能 → B站在线 → 本地媒体 → TTS
        if (this.isBili || this.biliSource) return "bili";
        if (this.ep.mediaUrl) return "audio";
        return "tts";
      },
      mediaIsVideo() {
        return /\.(mp4|webm|m4v|mov)(\?|$)/i.test(this.ep.mediaUrl || "");
      },
      engineLabel() {
        if (this.ytLite) return "YouTube 内嵌播放（受限模式）";
        if (this.engineKind === "audio" && this.mediaIsVideo) return "本地媒体（视频原声 · 全功能）";
        return { yt: "YouTube 播放器（全功能控制）", bili: "B站播放器 + 计时跟读同步", audio: "本地媒体", tts: "TTS 朗读模式" }[this.engineKind];
      },
      ytLiteSrc() {
        if (!this.isYt) return "";
        return "https://www.youtube.com/embed/" + this.source.videoId + "?rel=0";
      },
      biliSrc() {
        const b = this.biliSource || (this.isBili ? { bvid: this.source.videoId, page: 1 } : null);
        if (!b) return "";
        let s = "https://player.bilibili.com/player.html?bvid=" + b.bvid + "&p=" + (b.page || 1) +
          "&high_quality=1&danmaku=0&autoplay=0&lazyload=1";
        if (this.biliJumpSec != null) s += "&t=" + Math.floor(this.biliJumpSec);
        return s;
      },
      progressPct() { return Math.round(((this.idx + 1) / this.subs.length) * 100); },
      isFavSub() { return DB.isFavSub(this.ep.id, this.cur.id); },
      clozePlan() {
        const plan = {};
        this.subs.forEach((s) => {
          const toks = tokenize(s.text);
          const targets = [];
          const h = hashStr(s.id);
          let count = 0;
          toks.forEach((t, i) => {
            if (normalizeWord(t).length >= 4) {
              count++;
              if (count % 3 === (h % 3)) targets.push(i);
            }
          });
          plan[s.id] = targets;
        });
        return plan;
      },
      favSubNote() {
        const f = DB.get("favSubs", []).find((s) => s.epId === this.ep.id && s.subId === this.cur.id);
        return f ? f.note : "";
      },
    },
    async mounted() {
      DB.touchEpisode(this.ep.id);
      DB.ensureDefaultBook();
      this.loadVoices();
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      await this.refreshRecList();
      window.addEventListener("keydown", this.onKey);
      document.addEventListener("cc-scroll-sub", this.scrollToCurrent);

      await this.setupEngine();

      this._unwatch = this.$watch("idx", () => {
        this.dictInput = ""; this.dictResult = null;
        this.clozeRevealed = false; this.clozeResults = {};
        if (DB.get("settings", {}).autoScroll !== false) this.$nextTick(this.scrollToCurrent);
        if (this.playing && this.playMode === "sequence") this.playCurrent();
      });
    },
    unmounted() {
      destroyEngine();
      this.releaseRec();
      window.removeEventListener("keydown", this.onKey);
      document.removeEventListener("cc-scroll-sub", this.scrollToCurrent);
      if (this._unwatch) this._unwatch();
    },
    methods: {
      fmt,
      loadVoices() {
        try { this.voices = window.speechSynthesis.getVoices().filter((v) => (v.lang || "").toLowerCase().startsWith((CORPUS.meta.learnLang || "en").slice(0, 2))); } catch (e) {}
      },

      /* ============ 引擎初始化 ============ */
      async setupEngine() {
        destroyEngine();
        engine.kind = this.engineKind;
        try { window.__ccEngine = engine; window.__ccVm = this; } catch (e) {}
        if (engine.kind === "audio") {
          await this.$nextTick();
          const v = document.getElementById("media-player");
          engine.audio = v || new Audio(this.ep.mediaUrl);
          engine.audio.preload = "auto";
        } else if (engine.kind === "yt") {
          await this.initYT();
        } else {
          this.startTick(); // bili 计时跟随 / tts
        }
      },
      async switchSource(key) {
        if (key === this.engineKind) return;
        this.pause();
        this.engineOverride = key;
        toast("播放源：" + ({ yt: "YouTube", bili: "B站在线", audio: "本地媒体" }[key] || key));
        await this.setupEngine();
      },
      async initYT() {
        // file:// 页面是 null origin，IFrame API 的 onReady 永不触发 → 直接用普通内嵌播放
        if (location.protocol === "file:" || new URLSearchParams(location.search).get("lite") === "1") {
          return this.enterFallback("file:// 直开受限");
        }
        const ok = await loadYTApi(6000);
        if (!ok) return this.enterFallback("YouTube 播放器脚本加载失败");
        const holder = document.getElementById("yt-player");
        if (!holder) return;
        await new Promise((resolve) => {
          engine.yt = new YT.Player(holder, {
            videoId: this.source.videoId,
            playerVars: { rel: 0, modestbranding: 1, playsinline: 1, cc_load_policy: 0 },
            events: {
              onReady: () => {
                this.ytReady = true;
                try { if (this.rate !== 1) engine.yt.setPlaybackRate(this.snapRate(this.rate)); } catch (e) {}
                resolve();
              },
              onStateChange: (e) => {
                if (e.data === YT.PlayerState.ENDED) { this.playing = false; }
              },
              onError: () => resolve(),
            },
          });
          setTimeout(resolve, 6000);
        });
        if (!this.ytReady) return this.enterFallback("YouTube 播放器初始化超时或被拦截");
        this.startTick();
      },
      async enterFallback(reason) {
        if (this._switching) return;
        this._switching = true;
        try {
          if (engine.yt) { try { engine.yt.destroy(); } catch (e) {} engine.yt = null; }
          this.playing = false;
          if (this.isBili || this.biliSource) {
            this.engineOverride = "bili";
            toast(reason + "，已切换 B站在线播放");
          } else if (this.ep.mediaUrl) {
            this.engineOverride = "audio";
            toast(reason + "，已切换本地媒体");
          } else {
            this.ytLite = true;
            this.liteReason = reason || "";
          }
          await this.setupEngine();
        } finally { this._switching = false; }
      },
      startTick() {
        if (engine.tick) clearInterval(engine.tick);
        engine.tick = setInterval(() => this.onTick(), 200);
      },
      snapRate(r) {
        let best = YT_RATES[0];
        for (const c of YT_RATES) if (Math.abs(c - r) < Math.abs(best - r)) best = c;
        return best;
      },
      idxAtTime(t) {
        let i = 0;
        for (let k = 0; k < this.subs.length; k++) {
          if ((this.subs[k].start || 0) <= t + 0.05) i = k; else break;
        }
        return i;
      },
      onTick() {
        if (engine.stopped || !this.playing) return;
        try {
          if (engine.kind === "yt" && engine.yt && this.ytReady) {
            const t = engine.yt.getCurrentTime();
            const end = this.cur.end || (this.cur.start || 0) + 5;
            window.__ccLastT = t;
            if (this.playing && !engine.timer) { // 播放中画面停滞检测
              const now = Date.now();
              if (this._ytLastT != null && t < this._ytLastT + 0.25) {
                if (!this._ytStallSince) this._ytStallSince = now;
                else if (now - this._ytStallSince > 6000) { this._ytStallSince = 0; this.enterFallback("YouTube 视频流无响应"); return; }
              } else this._ytStallSince = 0;
              this._ytLastT = t;
            } else { this._ytStallSince = 0; }
            if (t >= end - 0.03) {
              engine.yt.pauseVideo();
              if (!engine.timer) this.afterOne();
              return;
            }
            const want = this.idxAtTime(t);
            if (want !== this.idx && this.playMode !== "AB") this.idx = want;
          } else if (engine.kind === "bili") {
            if (!this.biliRunning) return;
            const dt = 0.2;
            this.biliT = Math.max(this.biliT, this.cur.start || 0) + dt;
            const end = this.cur.end || (this.cur.start || 0) + 5;
            if (this.biliT >= end) { this.biliRunning = false; if (!engine.timer) this.afterOne(); return; }
          }
        } catch (e) { /* 播放器未就绪等瞬态错误 */ }
      },

      /* ============ 播放调度 ============ */
      onKey(e) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.code === "Space") { e.preventDefault(); this.togglePlay(); }
        else if (e.code === "ArrowLeft") this.jump(this.idx - 1);
        else if (e.code === "ArrowRight") this.jump(this.idx + 1);
        else if (e.key === "l" || e.key === "L") this.toggleLoopMode();
      },
      toggleLoopMode() {
        if (this.playMode === "sequence") { this.playMode = "sentence"; toast("单句循环：开"); }
        else { this.playMode = "sequence"; toast("顺序播放"); }
      },
      togglePlay() {
        if (this.playing) this.pause();
        else this.playCurrent();
      },
      pause() {
        this.playing = false;
        this.biliRunning = false;
        stopEngine();
      },
      jump(i) {
        if (i < 0 || i >= this.subs.length) { this.pause(); return; }
        this.idx = i;
        const start = Math.max(0, (this.cur.start || 0) - 0.05);
        if (engine.kind === "audio" && engine.audio) {
          try { engine.audio.currentTime = start; } catch (e) {}
        } else if (engine.kind === "yt" && engine.yt && this.ytReady) {
          try { engine.yt.seekTo(start, true); } catch (e) {}
        } else if (engine.kind === "bili") {
          this.biliJumpSec = Math.floor(this.cur.start || 0);
        }
        if (this.playing) this.playCurrent();
        else this.$nextTick(this.scrollToCurrent);
      },
      playCurrent() {
        stopEngine();
        this.playing = true;
        const s = this.cur;
        const start = Math.max(0, (s.start || 0) - 0.05);
        const end = s.end || (s.start || 0) + 5;
        if (engine.kind === "yt") {
          if (this.ytLite) { this.playing = false; toast("受限模式：请在视频画面内点播放；完整功能请用本地服务器打开"); return; }
          if (!engine.yt || !this.ytReady) { this.playing = false; toast("播放器加载中，稍候再点"); return; }
          engine.stopped = false;
          this._ytStallSince = 0; this._ytLastT = null;
          try {
            engine.yt.seekTo(start, true);
            if (this.rate !== 1) engine.yt.setPlaybackRate(this.snapRate(this.rate));
            engine.yt.playVideo();
          } catch (e) { this.playing = false; }
        } else if (engine.kind === "bili") {
          engine.stopped = false;
          this.biliT = start;
          this.biliRunning = true;
        } else if (engine.kind === "audio") {
          engine.stopped = false;
          const onTime = () => {
            if (engine.stopped) return;
            if (engine.audio.currentTime >= end) {
              engine.audio.pause();
              engine.audio.removeEventListener("timeupdate", onTime);
              this.afterOne();
            }
          };
          engine.audio.currentTime = start;
          engine.audio.addEventListener("timeupdate", onTime);
          engine.audio.playbackRate = this.rate;
          engine.audio.play().catch(() => { this.playing = false; toast("媒体加载失败，请检查 mediaUrl"); });
        } else {
          engine.stopped = false;
          speakText(s.text, this.rate, CORPUS.meta.learnLang, DB.get("settings", {}).ttsVoice, () => {
            if (!engine.stopped && this.playing) this.afterOne();
          });
        }
      },
      afterOne() {
        if (!this.playing) return;
        if (engine.timer) return; // 防重入：tick 在等待 gap 期间会重复触发
        if (this.playMode === "AB" && this.idx === this.abB) { this.idx = this.abA; return this.playCurrent(); }
        if (this.playMode === "sentence") {
          engine.timer = setTimeout(() => this.playCurrent(), Math.max(0, this.gap) * 1000);
          return;
        }
        // sequence：loopTimes>0 时每句重复指定次数再前进
        const rep = (engine._rep = engine._rep || { i: -1, n: 0 });
        if (rep.i !== this.idx) { rep.i = this.idx; rep.n = 0; }
        if (this.loopTimes > 0 && rep.n + 1 < this.loopTimes) {
          rep.n++;
          engine.timer = setTimeout(() => this.playCurrent(), Math.max(0, this.gap) * 1000);
          return;
        }
        rep.n = 0;
        if (this.autoPause) { this.playing = false; this.biliRunning = false; return; }
        if (this.idx + 1 >= this.subs.length) { this.playing = false; this.biliRunning = false; toast("本集播完"); return; }
        engine.timer = setTimeout(() => { this.idx = this.idx + 1; }, Math.max(0, this.gap) * 1000);
      },
      setAB(which) {
        if (which === "A") { this.abA = this.idx; toast("A 点已设为第 " + (this.idx + 1) + " 句"); }
        else { this.abB = this.idx; toast("B 点已设为第 " + (this.idx + 1) + " 句"); }
        if (this.abA >= 0 && this.abB >= 0) {
          if (this.abA > this.abB) { const t = this.abA; this.abA = this.abB; this.abB = t; }
          this.playMode = "AB";
          this.playing = false;
          this.idx = this.abA;
          toast("AB 循环：第 " + (this.abA + 1) + " → " + (this.abB + 1) + " 句，点播放开始");
        }
      },
      cancelAB() {
        this.playMode = "sequence"; this.abA = -1; this.abB = -1; toast("已取消 AB 循环");
      },
      setRate(r) {
        this.rate = Math.round(r * 20) / 20;
        if (engine.kind === "audio" && engine.audio) engine.audio.playbackRate = this.rate;
        if (engine.kind === "yt" && engine.yt && this.ytReady) {
          try { engine.yt.setPlaybackRate(this.snapRate(this.rate)); } catch (e) {}
        }
      },
      biliAlign() {
        this.biliT = this.cur.start || 0;
        this.biliRunning = true;
        toast("已对齐到第 " + (this.idx + 1) + " 句开头，字幕开始跟随");
      },
      biliJumpToCur() {
        this.biliJumpSec = Math.max(0, Math.floor(this.cur.start || 0));
        this.pause();
        toast("已让B站播放器跳转到第 " + (this.idx + 1) + " 句（重新加载嵌入）");
      },

      /* ============ 查词 / 词卡 ============ */
      toks(s) { return (s.text || "").trim().split(/(\s+)/); },
      lookup(sub, tokIndex) {
        const toks = tokenize(sub.text);
        const at = (i) => (toks[i] ? normalizeWord(toks[i]) : "");
        const dict = CORPUS.dictionary || {};
        for (const span of [3, 2, 1]) {
          const phrase = [];
          for (let k = 0; k < span; k++) phrase.push(at(tokIndex + k));
          const key = phrase.filter(Boolean).join(" ");
          if (key && dict[key]) {
            this.card = { word: key, entry: dict[key], subId: sub.id, tokStart: tokIndex, tokEnd: tokIndex + span - 1 };
            return;
          }
        }
        const w = at(tokIndex);
        if (w && dict[w]) {
          this.card = { word: w, entry: dict[w], subId: sub.id, tokStart: tokIndex, tokEnd: tokIndex };
          return;
        }
        this.card = { word: w || "", entry: null, subId: sub.id, tokStart: tokIndex, tokEnd: tokIndex };
      },
      closeCard() { this.card = null; },
      speakCard() { if (this.card) speakText(this.card.word, 0.9, CORPUS.meta.learnLang); },
      copyCard() {
        if (!this.card) return;
        const e = this.card.entry;
        const text = e ? this.card.word + "\n" + (e.phonetic || "") + " " + (e.pos || "") + "\n" + (e.meaning || "") : this.card.word;
        navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast("已复制"));
      },
      isFavWord(word) { return DB.isFavEntry(word); },
      toggleFavWord() {
        if (!this.card) return;
        const fav = DB.toggleFavEntry(this.card.word);
        if (fav) toast("已收藏：" + this.card.word);
        else toast("已取消收藏");
        this.card = Object.assign({}, this.card);
      },
      entryBookIds(word) {
        const f = DB.get("favEntries", []).find((e) => e.word === word);
        return f ? f.bookIds : [];
      },
      entryTagIds(word) {
        const f = DB.get("favEntries", []).find((e) => e.word === word);
        return f ? f.tagIds : [];
      },
      toggleEntryBook(word, bookId) {
        const f = DB.get("favEntries", []).find((e) => e.word === word);
        if (!f) return;
        const has = f.bookIds.includes(bookId);
        const bookIds = has ? f.bookIds.filter((x) => x !== bookId) : f.bookIds.concat([bookId]);
        DB.updateFavEntry(word, { bookIds });
        this.card = Object.assign({}, this.card);
      },
      toggleEntryTag(word, tagId) {
        const f = DB.get("favEntries", []).find((e) => e.word === word);
        if (!f) return;
        const has = f.tagIds.includes(tagId);
        const tagIds = has ? f.tagIds.filter((x) => x !== tagId) : f.tagIds.concat([tagId]);
        DB.updateFavEntry(word, { tagIds });
        this.card = Object.assign({}, this.card);
      },

      /* ============ 字幕收藏 / 笔记 ============ */
      toggleSubFav(sub) {
        const fav = DB.toggleFavSub(this.ep.id, sub.id);
        toast(fav ? "字幕已收藏" : "已取消收藏字幕");
      },
      openNote(sub) {
        if (!DB.isFavSub(this.ep.id, sub.id)) DB.toggleFavSub(this.ep.id, sub.id);
        this.noteSubId = sub.id;
        this.noteDraft = this.favSubNote || "";
        this.showPanel = "note";
      },
      saveNote() {
        DB.setSubNote(this.ep.id, this.noteSubId, this.noteDraft);
        this.showPanel = null;
        toast("笔记已保存");
      },

      /* ============ 听写 ============ */
      checkDictation() {
        const target = normText(this.cur.text).split(" ").filter(Boolean);
        const input = normText(this.dictInput).split(" ").filter(Boolean);
        const targetSet = {};
        target.forEach((w) => { targetSet[w] = (targetSet[w] || 0) + 1; });
        const extra = [];
        input.forEach((w) => {
          if (targetSet[w] > 0) targetSet[w]--;
          else extra.push(w);
        });
        const miss = [];
        Object.keys(targetSet).forEach((w) => { for (let i = 0; i < targetSet[w]; i++) miss.push(w); });
        const score = target.length ? Math.round(((target.length - miss.length) / target.length) * 100) : 0;
        this.dictResult = { score, miss, extra };
        DB.saveDictation(this.ep.id, this.cur.id, this.dictInput, score);
        DB.addCheckin(this.ep.id);
      },
      clearDictHistory() {
        DB.clearDictation(this.ep.id);
        this.dictInput = ""; this.dictResult = null;
        toast("已清空本集听写记录");
      },

      /* ============ 挖空 ============ */
      clozeCheck() {
        const results = {};
        const targets = this.clozePlan[this.cur.id] || [];
        const toks = tokenize(this.cur.text);
        targets.forEach((i) => {
          const inputEl = document.querySelector('[data-cloze="' + this.cur.id + '-' + i + '"]');
          const val = inputEl ? inputEl.value.trim() : "";
          results[i] = normalizeWord(val) === normalizeWord(toks[i]);
        });
        this.clozeResults = Object.assign({}, results);
        if (targets.length && targets.every((i) => this.clozeResults[i])) {
          toast("全对！🎉");
          DB.addCheckin(this.ep.id);
        }
      },
      clozeShuffle() { this.clozeVersion++; this.clozeRevealed = false; this.clozeResults = {}; },
      clozeRevealAll() { this.clozeRevealed = true; },

      /* ============ 录音（跟读） ============ */
      async refreshRecList() {
        this.recList = await DB.Recordings.bySubtitle(this.ep.id, this.cur.id);
      },
      async toggleRecord() {
        if (this.recState === "recording") { this.stopRecord(); return; }
        if (this.recState !== "idle") return;
        if (!navigator.mediaDevices || !window.MediaRecorder) { toast("浏览器不支持录音，请用最新版 Chrome/Edge/Safari"); return; }
        try {
          this.recState = "requesting";
          this.recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
          this.recorder = new MediaRecorder(this.recStream, mime ? { mimeType: mime } : undefined);
          this.chunks = [];
          this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
          this.recorder.onstop = () => this.saveRecording();
          this.recorder.start();
          this.recState = "recording";
          this.recSec = 0;
          this.recTimer = setInterval(() => {
            this.recSec++;
            if (this.recSec >= 60) { toast("已达最长 60 秒，自动停止"); this.stopRecord(); }
          }, 1000);
        } catch (e) {
          this.recState = "idle";
          const name = e && e.name;
          if (name === "NotAllowedError") toast("麦克风权限被拒绝，请在浏览器地址栏允许访问");
          else if (name === "NotFoundError") toast("未找到麦克风设备");
          else toast("录音启动失败：" + (name || "未知错误"));
        }
      },
      stopRecord() {
        if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
        if (this.recTimer) { clearInterval(this.recTimer); this.recTimer = null; }
      },
      async saveRecording() {
        try {
          this.releaseRec();
          const blob = new Blob(this.chunks, { type: this.chunks[0] ? this.chunks[0].type : "audio/webm" });
          if (!blob.size) { toast("未收集到有效录音"); }
          else if (blob.size > 10 * 1024 * 1024) { toast("录音过大，请录制更短内容"); }
          else {
            await DB.Recordings.add({ epId: this.ep.id, subId: this.cur.id, duration: this.recSec }, blob);
            toast("录音已保存");
          }
        } catch (e) {
          toast("保存录音失败：" + (e && e.message));
        } finally {
          this.recStream && this.recStream.getTracks().forEach((t) => t.stop());
          this.recStream = null; this.recorder = null; this.chunks = [];
          this.recState = "idle"; this.recSec = 0;
          await this.refreshRecList();
        }
      },
      releaseRec() {
        if (this.recStream) this.recStream.getTracks().forEach((t) => t.stop());
        if (this.recTimer) clearInterval(this.recTimer);
      },
      async playRec(rec) {
        this.releasePlay();
        this.recBlobUrl = URL.createObjectURL(rec.blob);
        this.recAudio = new Audio(this.recBlobUrl);
        this.recState = "playing";
        this.recAudio.onended = () => { this.recState = "idle"; this.releasePlay(); };
        this.recAudio.play().catch(() => { this.recState = "idle"; });
      },
      releasePlay() {
        if (this.recAudio) { try { this.recAudio.pause(); } catch (e) {} this.recAudio = null; }
        if (this.recBlobUrl) { URL.revokeObjectURL(this.recBlobUrl); this.recBlobUrl = null; }
        if (this.recState === "playing") this.recState = "idle";
      },
      async delRec(rec) {
        if (!this._delArmed) { this._delArmed = rec.id; toast("再点一次删除按钮以确认删除"); setTimeout(() => { this._delArmed = null; }, 2500); return; }
        await DB.Recordings.remove(rec.id);
        this._delArmed = null;
        toast("录音已删除");
        this.refreshRecList();
      },
      playModel() {
        speakText(this.cur.text, this.rate, CORPUS.meta.learnLang);
      },

      /* ============ 打卡 / 学习状态 ============ */
      checkin() {
        DB.addCheckin(this.ep.id);
        toast("已打卡 ✅ 今日累计 " + DB.checkinDays() + " 天");
      },
      toggleLearned() {
        this.learned = !this.learned;
        DB.markLearned(this.ep.id, this.learned);
        toast(this.learned ? "已标记为已学习" : "已标回未学习");
      },
      scrollToCurrent() {
        const el = document.querySelector('[data-sub-active="1"]');
        if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      },
      saveSettings() {
        DB.set("settings", Object.assign(DB.get("settings", {}), {
          defaultRate: this.rate, loopGap: this.gap, autoPause: this.autoPause, defaultMode: this.subMode,
        }));
        toast("已设为默认");
      },
    },
    template: `
<div class="study-page">
  <header class="study-head">
    <button class="btn ghost" @click="$router.push('/')">← 目录</button>
    <div class="study-title">
      <h2>{{ ep.title }}</h2>
      <div class="study-meta">
        <span>{{ ep.speaker.flag }} {{ ep.speaker.name }}</span>
        <span class="stars"><i v-for="n in 5" :class="['st', n <= ep.stars ? 'on' : '']">★</i></span>
        <span class="tag-mini" v-for="t in ep.tags" :key="t">{{ t }}</span>
        <a v-if="source" class="tag-mini src-link" :href="source.url" target="_blank" rel="noopener">{{ source.platform === 'youtube' ? '▶ YouTube' : '▶ B站' }}原视频</a>
      </div>
    </div>
    <div class="study-actions">
      <button class="btn" :class="{primary: !learned}" @click="toggleLearned">{{ learned ? '✓ 已学习' : '标记已学' }}</button>
      <button class="btn" @click="checkin">打卡</button>
    </div>
  </header>

  <div class="study-grid">
    <!-- 左：播放器与控制 -->
    <section class="player-col">
      <div class="player-card">
        <div v-if="engineKind === 'audio' && mediaIsVideo" class="video-frame">
          <video id="media-player" :src="ep.mediaUrl" :poster="ep.cover || ''" controls playsinline preload="auto"></video>
        </div>
        <div v-else-if="engineKind === 'yt' && !ytLite" class="video-frame"><div id="yt-player"></div></div>
        <div v-else-if="engineKind === 'yt' && ytLite" class="video-frame">
          <iframe :src="ytLiteSrc" frameborder="0" title="YouTube player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
        </div>
        <div v-else-if="engineKind === 'bili'" class="video-frame">
          <iframe :src="biliSrc" scrolling="no" frameborder="no" allowfullscreen="true"
            referrerpolicy="no-referrer" allow="autoplay; encrypted-media"></iframe>
        </div>

        <div class="engine-tip">{{ engineLabel }}<template v-if="engineKind === 'bili'"> · 循环/倍速请在B站播放器内操作，本页字幕计时跟随</template></div>
        <div class="src-switch" v-if="availableSources.length > 1">
          <span>播放源</span>
          <button v-for="s in availableSources" :key="s.key" class="sw" :class="{ on: engineKind === s.key }" @click="switchSource(s.key)">{{ s.label }}</button>
        </div>
        <div v-if="ytLite" class="lite-tip">
          ⚠️ {{ liteReason }}：视频请在画面内点播放（原声正常）。逐句循环/AB/倍速联动不可用——完整功能请用本地服务器打开：<code>python -m http.server 8899 --directory corpus-app</code> → <a href="http://localhost:8899" target="_blank">localhost:8899</a>
        </div>
        <div class="now-idx">第 {{ idx + 1 }} / {{ subs.length }} 句 · {{ fmt(ep.duration) }}</div>
        <div class="progress-bar"><i :style="{width: progressPct + '%'}"></i></div>
        <div class="transport">
          <button class="tbtn" @click="jump(idx - 1)" title="上一句 (←)">⏮</button>
          <button class="tbtn big" @click="togglePlay" title="播放/暂停 (空格)">{{ playing ? '⏸' : '▶' }}</button>
          <button class="tbtn" @click="jump(idx + 1)" title="下一句 (→)">⏭</button>
          <button class="tbtn" :class="{active: playMode === 'sentence'}" @click="toggleLoopMode" title="单句循环 (L)">🔁</button>
          <button class="tbtn" :class="{active: playMode === 'AB'}" @click="playMode === 'AB' ? cancelAB() : setAB('A')" title="AB循环">AB</button>
          <button class="tbtn" v-if="playMode === 'AB'" @click="setAB('B')" title="设B点">B点</button>
          <button class="tbtn" v-if="engineKind === 'bili'" @click="biliAlign" title="B站播到本句开头时点我校准字幕">对齐</button>
          <button class="tbtn" v-if="engineKind === 'bili'" @click="biliJumpToCur" title="让B站播放器跳到本句（重载嵌入）">跳转</button>
        </div>
        <div v-if="playMode === 'AB'" class="ab-tip">AB 循环中：第 {{ abA + 1 }} → {{ abB + 1 }} 句 · <a @click.prevent="cancelAB" href="#">取消</a></div>
        <div class="rate-row">
          <span class="lbl">倍速</span>
          <input type="range" min="0.5" max="2" step="0.05" :value="rate" @input="setRate($event.target.value)">
          <b class="rate-num">{{ rate.toFixed(2) }}x</b>
          <span class="lbl">间隔</span>
          <input class="num" type="number" min="0" max="10" step="0.5" v-model.number="gap">s
          <span class="lbl">每句</span>
          <select class="num" v-model.number="loopTimes">
            <option :value="0">∞</option><option :value="1">1</option><option :value="2">2</option><option :value="3">3</option>
          </select>
          <label class="chk"><input type="checkbox" v-model="autoPause"> 句后暂停</label>
        </div>
        <div class="mode-row">
          <span class="lbl">字幕</span>
          <div class="seg">
            <button v-for="m in [['bilingual','双语'],['original','原文'],['translation','译文'],['dictation','听写'],['cloze','挖空']]" :key="m[0]"
              :class="['segbtn', subMode === m[0] ? 'on' : '']" @click="subMode = m[0]">{{ m[1] }}</button>
          </div>
          <button class="btn ghost sm" @click="showPanel = showPanel === 'settings' ? null : 'settings'">⚙ 播放设置</button>
        </div>
        <div v-if="showPanel === 'settings'" class="panel">
          <p class="hint">引擎：{{ engineLabel }}；TTS 可用语音 {{ voices.length }} 个。倍速对 YouTube 会吸附到官方档位（0.5/0.75/1/1.25/1.5/1.75/2）。</p>
          <button class="btn sm" @click="saveSettings">记住当前设置为默认</button>
        </div>
        <div v-if="showPanel === 'note'" class="panel">
          <h4>字幕笔记 · 第 {{ idx + 1 }} 句</h4>
          <textarea rows="3" v-model="noteDraft" placeholder="写点笔记……"></textarea>
          <div class="row-end">
            <button class="btn ghost sm" @click="showPanel = null">取消</button>
            <button class="btn primary sm" @click="saveNote">保存笔记</button>
          </div>
        </div>
      </div>

      <!-- 当前句工具条 -->
      <div class="sub-toolbar">
        <button class="btn sm" :class="{amber: isFavSub}" @click="toggleSubFav(cur)">★ {{ isFavSub ? '已收藏' : '收藏字幕' }}</button>
        <button class="btn sm" @click="openNote(cur)">📝 笔记</button>
        <button class="btn sm" :class="{red: recState === 'recording'}" @click="toggleRecord">
          {{ recState === 'recording' ? '⏹ 停止 ' + recSec + 's' : (recState === 'requesting' ? '准备中…' : '🎤 跟读') }}
        </button>
<button class="btn sm" @click="playModel" title="TTS 朗读本句（示范发音，非视频原声）">🔊 朗读示范</button>
        <button class="btn sm" v-if="subMode === 'dictation'" @click="clearDictHistory">清空听写记录</button>
        <span class="rec-count" v-if="recList.length">{{ recList.length }} 个录音</span>
      </div>
      <div class="rec-list" v-if="recList.length">
        <div class="rec-item" v-for="r in recList" :key="r.id">
          <span class="rec-time">{{ new Date(r.createdAt).toLocaleString() }} · {{ r.duration }}s</span>
          <button class="btn sm" @click="playRec(r)">{{ recState === 'playing' ? '⏸' : '▶' }} 播放</button>
          <button class="btn sm danger" @click="delRec(r)">删除</button>
        </div>
      </div>
    </section>

    <!-- 右：字幕列表 -->
    <section class="subs-col" :class="'mode-' + subMode">
      <div v-for="(s, i) in subs" :key="s.id" class="sub-row" :class="{active: i === idx}" :data-sub-active="i === idx ? '1' : ''" @click="jump(i)">
        <div class="sub-no">{{ i + 1 }}</div>
        <div class="sub-body">
          <template v-if="subMode !== 'translation'">
            <p class="sub-text" @click.stop>
              <template v-if="subMode === 'cloze'">
                <span v-if="(clozePlan[s.id] || []).length === 0">{{ s.text }}</span>
                <template v-else>
                  <template v-for="(t, ti) in toks(s)" :key="s.id + '-' + ti">
                    <template v-if="ti % 2 === 0 && t.trim()">
                      <input v-if="(clozePlan[s.id] || []).includes(ti / 2) && !clozeRevealed"
                        class="cloze-input" :data-cloze="s.id + '-' + (ti / 2)" size="6"
                        :class="{ok: clozeResults[ti / 2] === true, bad: clozeResults[ti / 2] === false}"
                        @click.stop @keydown.enter.stop="clozeCheck">
                      <span v-else :class="{blank: (clozePlan[s.id] || []).includes(ti / 2)}">{{ t }}</span>
                    </template>
                    <template v-else>{{ t }}</template>
                  </template>
                </template>
              </template>
              <template v-else>
                <span v-for="(t, ti) in toks(s)" :key="s.id + '-' + ti"
                  :class="['tok', ti % 2 === 0 && card && card.subId === s.id && ti / 2 >= card.tokStart && ti / 2 <= card.tokEnd ? 'tok-hit' : '', ti % 2 === 0 ? 'tok-word' : '']"
                  @click="ti % 2 === 0 && lookup(s, ti / 2)">{{ t }}</span>
              </template>
            </p>
          </template>
          <p class="sub-tr" v-if="subMode === 'bilingual' || subMode === 'translation'">{{ s.translation }}</p>

          <div v-if="subMode === 'dictation'" class="dict-area" @click.stop>
            <div class="dict-hint">{{ s.translation }}</div>
            <textarea rows="2" v-model="dictInput" placeholder="听音写句……" @keydown.enter.exact.prevent="checkDictation"></textarea>
            <div class="row-end">
              <button class="btn primary sm" @click="checkDictation">检查</button>
            </div>
            <div v-if="dictResult" class="dict-result">
              <span class="score" :class="dictResult.score >= 80 ? 'ok' : 'bad'">{{ dictResult.score }} 分</span>
              <div v-if="dictResult.miss.length" class="diff">漏词：<b v-for="w in dictResult.miss">{{ w }} </b></div>
              <div v-if="dictResult.extra.length" class="diff">多写：<b v-for="w in dictResult.extra">{{ w }} </b></div>
              <div class="diff answer">原句：{{ s.text }}</div>
            </div>
          </div>

          <div class="sub-mini-actions" @click.stop>
            <button class="mini" :class="{amber: DB.isFavSub(ep.id, s.id)}" @click="toggleSubFav(s)">★</button>
            <button class="mini" @click="openNote(s)">📝</button>
          </div>
        </div>
      </div>
    </section>
  </div>

  <!-- 词卡浮层 -->
  <div v-if="card" class="card-mask" @click.self="closeCard">
    <div class="word-card">
      <template v-if="card.entry">
        <div class="wc-head">
          <h3 @click="speakCard" title="点击朗读">{{ card.word }} <span class="wc-pho">{{ card.entry.phonetic }}</span></h3>
          <div class="row-gap">
            <button class="mini" @click="speakCard">🔊</button>
            <button class="mini" @click="copyCard">⧉</button>
            <button class="mini" :class="{amber: isFavWord(card.word)}" @click="toggleFavWord">★</button>
            <button class="mini" @click="closeCard">✕</button>
          </div>
        </div>
        <p class="wc-pos">{{ card.entry.pos }}</p>
        <p class="wc-mean">{{ card.entry.meaning }}</p>
        <p class="wc-line" v-if="card.entry.collocation"><b>搭配</b>{{ card.entry.collocation }}</p>
        <p class="wc-line" v-if="card.entry.expression"><b>地道</b>{{ card.entry.expression }}</p>
        <p class="wc-line" v-if="card.entry.example"><b>例句</b>{{ card.entry.example.en }}<br><i>{{ card.entry.example.zh }}</i></p>
        <div class="wc-exams" v-if="card.entry.examTags && card.entry.examTags.length">
          <span class="tag-mini exam" v-for="t in card.entry.examTags" :key="t">{{ t }}</span>
        </div>
        <div v-if="isFavWord(card.word)" class="wc-manage">
          <div class="wc-mrow"><span>单词本</span>
            <button v-for="b in DB.get('wordbooks', [])" :key="b.id" class="chip" :class="{on: entryBookIds(card.word).includes(b.id)}" @click="toggleEntryBook(card.word, b.id)">{{ b.name }}</button>
          </div>
          <div class="wc-mrow"><span>标签</span>
            <button v-for="t in DB.get('entryTags', [])" :key="t.id" class="chip" :class="{on: entryTagIds(card.word).includes(t.id)}" @click="toggleEntryTag(card.word, t.id)">{{ t.name }}</button>
          </div>
          <p class="hint">在「收藏」页可管理单词本与标签</p>
        </div>
      </template>
      <template v-else>
        <div class="wc-head"><h3>{{ card.word || '—' }}</h3><button class="mini" @click="closeCard">✕</button></div>
        <p class="hint">该词未收录进词典。可在词条文件中补充。</p>
      </template>
    </div>
  </div>
</div>
`,
  };

  window.StudyPage = StudyPage;
})();
