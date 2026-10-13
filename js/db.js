/* =========================================================================
 * db.js — 本地存储层
 * 个人自用模式：全部数据存浏览器（localStorage + IndexedDB）。
 * 后续升级云端账号时，仅需将本文件的 get/set 接到后端 API，页面代码不动。
 * ========================================================================= */
(function () {
  "use strict";

  const PREFIX = "cc_";
  const LS = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        console.warn("[db] read failed:", key, e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn("[db] write failed:", key, e);
        return false;
      }
    },
    remove(key) {
      localStorage.removeItem(PREFIX + key);
    },
    dump() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = LS.get(k.slice(PREFIX.length));
      }
      return out;
    },
    restore(data, mode) {
      if (mode === "replace") {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PREFIX)) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
      }
      Object.keys(data || {}).forEach((k) => LS.set(k, data[k]));
    },
  };

  /* ---------- IndexedDB（录音二进制，localStorage 装不下） ---------- */
  let idbPromise = null;
  function idb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("corpus-companion", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("recordings")) {
          db.createObjectStore("recordings", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbPromise;
  }

  const Recordings = {
    async add(meta, blob) {
      const db = await idb();
      return new Promise((resolve, reject) => {
        const rec = Object.assign({}, meta, { id: "r" + Date.now() + Math.random().toString(36).slice(2, 7), blob, createdAt: Date.now() });
        const tx = db.transaction("recordings", "readwrite");
        tx.objectStore("recordings").put(rec);
        tx.oncomplete = () => resolve(rec);
        tx.onerror = () => reject(tx.error);
      });
    },
    async all() {
      const db = await idb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("recordings", "readonly");
        const req = tx.objectStore("recordings").getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
        req.onerror = () => reject(req.error);
      });
    },
    async bySubtitle(epId, subId) {
      const all = await Recordings.all();
      return all.filter((r) => r.epId === epId && (!subId || r.subId === subId));
    },
    async remove(id) {
      const db = await idb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("recordings", "readwrite");
        tx.objectStore("recordings").delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    },
    async removeAll() {
      const db = await idb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("recordings", "readwrite");
        tx.objectStore("recordings").clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    },
  };

  /* ---------- 业务数据的默认结构 ---------- */
  const DEFAULTS = {
    theme: "light",
    settings: { defaultMode: "bilingual", defaultRate: 1, loopGap: 1, autoPause: false, autoScroll: true, ttsVoice: "" },
    // 目录页学习状态 { epId: { learned: bool, startedAt, finishedAt, learnCount } }
    episodeStatus: {},
    // 打卡 [{ date: 'YYYY-MM-DD', epId, at }]
    checkins: [],
    // 词条收藏 [{ word, bookIds: [id], tagIds: [id], note, addedAt }]
    favEntries: [],
    // 单词本 [{ id, name, desc, createdAt }]
    wordbooks: [],
    // 词条标签 [{ id, name }]
    entryTags: [],
    // 字幕收藏 [{ epId, subId, note, addedAt }]
    favSubs: [],
    // 听写记录 { [epId]: { [subId]: { input, score, at } } }
    dictation: {},
    // 学习方法页完成标记 { methodKey: true }
    methodDone: {},
  };

  function ensureDefaults() {
    Object.keys(DEFAULTS).forEach((k) => {
      if (LS.get(k) === undefined) LS.set(k, DEFAULTS[k]);
    });
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  const Store = {
    get: LS.get,
    set: LS.set,
    remove: LS.remove,
    dump: LS.dump,
    restore: LS.restore,
    ensureDefaults,
    Recordings,
    today,

    /* ---- 打卡 ---- */
    addCheckin(epId) {
      const list = LS.get("checkins", []);
      const d = today();
      if (!list.some((c) => c.date === d && c.epId === epId)) {
        list.push({ date: d, epId, at: Date.now() });
        LS.set("checkins", list);
      }
      return list;
    },
    checkinDays() {
      const list = LS.get("checkins", []);
      return new Set(list.map((c) => c.date)).size;
    },

    /* ---- 词条收藏 ---- */
    isFavEntry(word) {
      return LS.get("favEntries", []).some((e) => e.word === word);
    },
    toggleFavEntry(word) {
      let list = LS.get("favEntries", []);
      if (list.some((e) => e.word === word)) {
        list = list.filter((e) => e.word !== word);
      } else {
        const books = LS.get("wordbooks", []);
        const def = books.find((b) => b.name === "默认单词本");
        list.push({ word, bookIds: def ? [def.id] : [], tagIds: [], note: "", addedAt: Date.now() });
      }
      LS.set("favEntries", list);
      return list.some((e) => e.word === word);
    },
    updateFavEntry(word, patch) {
      const list = LS.get("favEntries", []).map((e) => (e.word === word ? Object.assign({}, e, patch) : e));
      LS.set("favEntries", list);
    },

    /* ---- 字幕收藏 ---- */
    isFavSub(epId, subId) {
      return LS.get("favSubs", []).some((s) => s.epId === epId && s.subId === subId);
    },
    toggleFavSub(epId, subId) {
      let list = LS.get("favSubs", []);
      if (list.some((s) => s.epId === epId && s.subId === subId)) {
        list = list.filter((s) => !(s.epId === epId && s.subId === subId));
      } else {
        list.push({ epId, subId, note: "", addedAt: Date.now() });
      }
      LS.set("favSubs", list);
      return list.some((s) => s.epId === epId && s.subId === subId);
    },
    setSubNote(epId, subId, note) {
      const list = LS.get("favSubs", []).map((s) => (s.epId === epId && s.subId === subId ? Object.assign({}, s, { note }) : s));
      LS.set("favSubs", list);
    },

    /* ---- 单词本 / 标签 ---- */
    ensureDefaultBook() {
      const books = LS.get("wordbooks", []);
      if (!books.some((b) => b.name === "默认单词本")) {
        books.push({ id: "b" + Date.now(), name: "默认单词本", desc: "未手动归类的新收藏", createdAt: Date.now() });
        LS.set("wordbooks", books);
      }
    },
    addBook(name, desc) {
      const books = LS.get("wordbooks", []);
      if (books.some((b) => b.name === name)) return { ok: false, msg: "收藏夹名称已存在" };
      books.push({ id: "b" + Date.now(), name, desc: desc || "", createdAt: Date.now() });
      LS.set("wordbooks", books);
      return { ok: true };
    },
    updateBook(id, patch) {
      const books = LS.get("wordbooks", []).map((b) => (b.id === id ? Object.assign({}, b, patch) : b));
      LS.set("wordbooks", books);
    },
    removeBook(id) {
      LS.set("wordbooks", LS.get("wordbooks", []).filter((b) => b.id !== id));
      LS.set(
        "favEntries",
        LS.get("favEntries", []).map((e) => Object.assign({}, e, { bookIds: e.bookIds.filter((x) => x !== id) }))
      );
    },
    addTag(name) {
      const tags = LS.get("entryTags", []);
      if (tags.some((t) => t.name === name)) return { ok: false, msg: "标签已存在" };
      tags.push({ id: "t" + Date.now(), name });
      LS.set("entryTags", tags);
      return { ok: true };
    },
    updateTag(id, patch) {
      LS.set("entryTags", LS.get("entryTags", []).map((t) => (t.id === id ? Object.assign({}, t, patch) : t)));
    },
    removeTag(id) {
      LS.set("entryTags", LS.get("entryTags", []).filter((t) => t.id !== id));
      LS.set(
        "favEntries",
        LS.get("favEntries", []).map((e) => Object.assign({}, e, { tagIds: e.tagIds.filter((x) => x !== id) }))
      );
    },

    /* ---- 学习状态 ---- */
    markLearned(epId, learned) {
      const st = LS.get("episodeStatus", {});
      const cur = st[epId] || { learnCount: 0 };
      cur.learned = learned;
      if (learned && !cur.finishedAt) cur.finishedAt = Date.now();
      if (!learned) delete cur.finishedAt;
      st[epId] = cur;
      LS.set("episodeStatus", st);
    },
    touchEpisode(epId) {
      const st = LS.get("episodeStatus", {});
      const cur = st[epId] || { learnCount: 0 };
      cur.learnCount = (cur.learnCount || 0) + 1;
      if (!cur.startedAt) cur.startedAt = Date.now();
      st[epId] = cur;
      LS.set("episodeStatus", st);
    },

    /* ---- 听写 ---- */
    saveDictation(epId, subId, input, score) {
      const d = LS.get("dictation", {});
      if (!d[epId]) d[epId] = {};
      d[epId][subId] = { input, score, at: Date.now() };
      LS.set("dictation", d);
    },
    clearDictation(epId) {
      const d = LS.get("dictation", {});
      if (epId) delete d[epId];
      else Object.keys(d).forEach((k) => delete d[k]);
      LS.set("dictation", d);
    },
  };

  window.DB = Store;
})();
