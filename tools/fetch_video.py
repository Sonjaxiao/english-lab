# -*- coding: utf-8 -*-
"""
fetch_video.py — 从 YouTube / B站 链接抓取元数据与字幕，产出待加工 JSON。

用法:
    python tools/fetch_video.py <视频链接> [--srt 字幕.srt] [--out _pending]

产出: _pending/<platform>_<id>.json
    {
      "platform": "youtube" | "bilibili",
      "videoId": "...", "url": "...",
      "title": "...", "author": "...", "duration": 秒, "cover": "...",
      "lang": "en",
      "segments": [{"start": 秒, "end": 秒, "text": "..."}],
      "needs_subs": bool        # true = 没抓到字幕，需要补 SRT 或登录态
    }

说明:
- YouTube: yt-dlp 抓元数据 + 手动/自动字幕（json3），自动把碎片行合并成适合学习的句子行。
- B站: view/player API 抓元数据；字幕接口需要登录态（环境变量 BI_SESSDATA，绝不打印），
  未登录时用 --srt 提供的字幕文件，两者都没有则 needs_subs=true。
- B站封面图带防盗链，应用侧已用 referrerpolicy=no-referrer 处理。
"""
import io
import json
import os
import re
import sys
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def http_get(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_url(url):
    """返回 (platform, videoId) 或抛 ValueError"""
    m = re.search(r"(?:youtube\.com/(?:watch\?[^ ]*v=|shorts/|embed/)|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if m:
        return "youtube", m.group(1)
    m = re.search(r"bilibili\.com/video/(BV[A-Za-z0-9]+)", url)
    if m:
        return "bilibili", m.group(1)
    if "b23.tv" in url:  # 短链，跟随重定向
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            final = r.geturl()
        m = re.search(r"(BV[A-Za-z0-9]+)", final)
        if m:
            return "bilibili", m.group(1)
    raise ValueError("无法从链接识别平台/视频ID: " + url)


# ---------------- YouTube ----------------
CAPTION_TAG = re.compile(r"^\[.*\]$")


def _dedupe_rolling(prev_words, text):
    """去掉 ASR 滚动窗口导致的与前文重复的开头词"""
    words = text.split()
    for k in range(min(6, len(prev_words), len(words)), 0, -1):
        if prev_words[-k:] == words[:k]:
            return " ".join(words[k:])
    return text


def build_segments_from_lines(lines, max_chars=95, max_gap=2.5):
    """顺序化的字幕行 → 学习用整句段。end = min(自身start+dur, 下一行start)。"""
    import html as _h
    segs = []
    buf = []
    prev_words = []

    def flush(end):
        nonlocal buf, prev_words
        if not buf:
            return
        text = re.sub(r"\s+", " ", " ".join(b["text"] for b in buf)).strip()
        if text:
            segs.append({"start": round(buf[0]["start"], 2), "end": round(max(end, buf[0]["start"] + 0.6), 2), "text": text})
            prev_words = text.split()[-6:]
        buf = []

    for i, l in enumerate(lines):
        text = _h.unescape(l["text"]).strip()
        if not text or CAPTION_TAG.match(text):
            continue
        text = _dedupe_rolling(prev_words if not buf else " ".join(b["text"] for b in buf).split(), text)
        if not text:
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        eff_end = l["start"] + max(l["dur"], 0.5)
        if nxt:
            eff_end = min(eff_end, nxt["start"])
        buf.append({"start": l["start"], "text": text, "end": eff_end})
        chars = sum(len(b["text"]) for b in buf)
        gap = nxt["start"] - eff_end if nxt else 0
        sentence_end = bool(re.search(r"[.!?…。！？][\"']?$", text))
        if sentence_end or chars >= max_chars or gap >= max_gap:
            flush(buf[-1]["end"])
    if buf:
        flush(buf[-1]["end"])
    return segs


def group_asr_events(events):
    """YouTube json3 事件 → 顺序字幕行 → 整句段"""
    lines = []
    for ev in events:
        if ev.get("aAppend"):
            continue
        segs = ev.get("segs") or []
        text = "".join(s.get("utf8", "") for s in segs).replace("\n", " ").strip()
        if not text:
            continue
        lines.append({
            "start": (ev.get("tStartMs", 0)) / 1000.0,
            "dur": (ev.get("dDurationMs", 0)) / 1000.0,
            "text": text,
        })
    return build_segments_from_lines(lines)


INVIDIOUS_HOSTS = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yewtu.be",
    "https://iv.datura.network",
    "https://invidious.f5.si",
]

YT_CLIENTS = [None, "tv", "web_safari", "android_vr", "mweb"]
BOT_MARKS = ("Sign in to confirm", "confirm you", "not a bot")


def _yt_cookiefile():
    """YOUTUBE_COOKIES（Netscape cookies.txt 全文）写入临时文件，返回路径或 None"""
    rawv = os.environ.get("YOUTUBE_COOKIES", "").strip()
    if not rawv:
        return None
    import tempfile
    p = os.path.join(tempfile.gettempdir(), "yt_cookies.txt")
    body = rawv.replace("\\n", "\n") if ("\n" not in rawv and "\\n" in rawv) else rawv
    with open(p, "w", encoding="utf-8") as f:
        f.write(body)
    return p


def parse_vtt_lines(vtt):
    """VTT → [{start, dur, text}]，供 build_segments_from_lines 使用"""
    tc = re.compile(r"(\d+):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})\.(\d{3})")
    lines = []
    for b in re.split(r"\r?\n\r?\n+", vtt or ""):
        m = tc.search(b)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000.0
        end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000.0
        body = " ".join(ln.strip() for ln in b[m.end():].splitlines() if ln.strip())
        body = re.sub(r"<[^>]+>", "", body).strip()
        if body:
            lines.append({"start": start, "dur": max(0.4, end - start), "text": body})
    return lines


def fetch_youtube_invidious(video_id):
    """Invidious 公共实例兜底：数据中心 IP 被 YouTube 风控时用"""
    import requests
    for host in INVIDIOUS_HOSTS:
        try:
            r = requests.get(host + "/api/v1/videos/" + video_id, timeout=15,
                             headers={"User-Agent": UA})
            if r.status_code != 200:
                continue
            d = r.json()
            caps = d.get("captions") or []
            if not caps:
                continue
            chosen = None
            for c in caps:
                code = (c.get("language_code") or c.get("languageCode") or "").lower()
                if code.startswith("en"):
                    chosen = c
                    break
            if not chosen:
                chosen = caps[0]
            cap_path = chosen.get("url") or ""
            if cap_path.startswith("/"):
                cap_url = host + cap_path
            elif cap_path.startswith("http"):
                cap_url = cap_path
            else:
                cap_url = host + "/api/v1/captions/" + video_id + "?lang=" + (chosen.get("language_code") or "en")
            vtt = requests.get(cap_url, timeout=15, headers={"User-Agent": UA}).text
            lines = parse_vtt_lines(vtt)
            if not lines:
                continue
            print("[youtube] Invidious 兜底成功 via " + host, flush=True)
            return {
                "platform": "youtube",
                "videoId": video_id,
                "url": "https://www.youtube.com/watch?v=" + video_id,
                "title": d.get("title", ""),
                "author": d.get("author", ""),
                "duration": int(d.get("lengthSeconds") or 0),
                "cover": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % video_id,
                "lang": (chosen.get("language_code") or "en").split("-")[0],
                "segments": build_segments_from_lines(lines),
                "needs_subs": False,
            }
        except Exception as e:
            print("[invidious] %s failed: %s" % (host, str(e)[:100]), flush=True)
            continue
    return None


def fetch_youtube(video_id):
    import yt_dlp
    url = "https://www.youtube.com/watch?v=" + video_id
    cookiefile = _yt_cookiefile()
    info, first_meta, last_err = None, None, None
    for cl in YT_CLIENTS:
        opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        if cookiefile:
            opts["cookiefile"] = cookiefile
        if cl:
            opts["extractor_args"] = {"youtube": {"player_client": [cl]}}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                meta = ydl.extract_info(url, download=False)
        except Exception as e:
            last_err = e
            print("[youtube] client=%s failed: %s" % (cl or "default", str(e)[:110]), flush=True)
            continue
        if meta and not first_meta:
            first_meta = meta
        if meta and (meta.get("subtitles") or meta.get("automatic_captions")):
            info = meta
            break
    if info is None:
        inv = fetch_youtube_invidious(video_id)
        if inv and inv.get("segments"):
            return inv
        if first_meta:
            print("[youtube] 有元数据但各客户端均无字幕 → needs_subs", flush=True)
            info = first_meta
        else:
            raise SystemExit("YouTube 抓取失败（数据中心 IP 风控）。修复：仓库 Settings→Secrets and variables→Actions "
                             "添加 Secret YOUTUBE_COOKIES（值=浏览器导出的 cookies.txt 全文）后 reopen 重试；"
                             "或改用学习站「导入→手动导入」上传 SRT。")
    caps = {}
    for lang, fmts in (info.get("subtitles") or {}).items():
        caps.setdefault(lang, {}).update({"manual": True, "fmts": fmts})
    for lang, fmts in (info.get("automatic_captions") or {}).items():
        c = caps.setdefault(lang, {})
        if "manual" not in c:
            c["manual"] = False
            c["fmts"] = fmts

    def pick(langs_priority):
        for lang in langs_priority:
            c = caps.get(lang)
            if c and c["fmts"]:
                j3 = [f for f in c["fmts"] if f.get("ext") == "json3"]
                if j3:
                    return lang, c["manual"], j3[0]["url"]
        return None, None, None

    base = [info.get("language_code") or "en", "en", "en-orig", "en-US", "zh-Hans", "zh-CN", "ja"]
    lang, manual, cap_url = pick(base)
    if not cap_url:
        # 任意有 json3 的语言兜底
        for lang_c, c in caps.items():
            j3 = [f for f in (c.get("fmts") or []) if f.get("ext") == "json3"]
            if j3:
                lang, manual, cap_url = lang_c, c["manual"], j3[0]["url"]
                break
    segments = []
    if cap_url:
        data = json.loads(http_get(cap_url + "&fmt=json3").decode("utf-8"))
        segments = group_asr_events(data.get("events", []))
    return {
        "platform": "youtube",
        "videoId": video_id,
        "url": url,
        "title": info.get("title", ""),
        "author": info.get("uploader", info.get("channel", "")),
        "duration": int(info.get("duration") or 0),
        "cover": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % video_id,
        "lang": (lang or "en").split("-")[0],
        "segments": segments,
        "needs_subs": not segments,
    }


# ---------------- Bilibili ----------------
def parse_srt(path):
    """极简 SRT 解析 → segments"""
    raw = open(path, "r", encoding="utf-8", errors="ignore").read()
    blocks = re.split(r"\r?\n\r?\n+", raw.strip())
    segs = []
    tc = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)")
    for b in blocks:
        m = tc.search(b)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000.0
        end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000.0
        lines = [ln.strip() for ln in b[m.end():].strip().splitlines() if ln.strip()]
        text = " ".join(lines).strip()
        if text:
            segs.append({"start": round(start, 2), "end": round(end, 2), "text": text})
    return segs


def fetch_bilibili(video_id, srt_path=None, sessdata=None):
    url = "https://www.bilibili.com/video/" + video_id
    headers = {"Referer": "https://www.bilibili.com/"}
    if sessdata:
        headers["Cookie"] = "SESSDATA=" + sessdata
    meta = json.loads(http_get(
        "https://api.bilibili.com/x/web-interface/view?bvid=" + video_id, headers).decode("utf-8"))
    if meta.get("code") != 0:
        raise RuntimeError("B站 API 失败: " + str(meta.get("message")))
    d = meta["data"]
    cid = d["cid"]

    segments = []
    player = json.loads(http_get(
        "https://api.bilibili.com/x/player/v2?aid=%s&cid=%s" % (d["aid"], cid), headers).decode("utf-8"))
    subs = (player.get("data", {}).get("subtitle", {}) or {}).get("list", [])
    if subs:
        # 优先中文/英文，其次第一个可用的
        def sub_priority(s):
            return 0 if s["lan"] in ("zh-CN", "zh-Hans") else (1 if s["lan"].startswith("en") else 2)
        chosen = sorted(subs, key=sub_priority)[0]
        sub_url = chosen.get("subtitle_url") or ""
        if sub_url.startswith("//"):
            sub_url = "https:" + sub_url
        if sub_url:
            body = json.loads(http_get(sub_url, headers).decode("utf-8"))
            for it in body.get("body", []):
                segments.append({"start": round(it["from"], 2), "end": round(it["to"], 2),
                                 "text": re.sub(r"\s+", " ", it["content"]).strip()})
    if not segments and srt_path:
        segments = parse_srt(srt_path)

    return {
        "platform": "bilibili",
        "videoId": video_id,
        "url": url,
        "title": d.get("title", ""),
        "author": (d.get("owner") or {}).get("name", ""),
        "duration": int(d.get("duration") or 0),
        "cover": d.get("pic", ""),
        "lang": "zh",
        "segments": segments,
        "needs_subs": not segments,
    }


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--srt", default=None, help="B站字幕 SRT 文件路径（接口拿不到字幕时用）")
    ap.add_argument("--out", default=os.path.join(ROOT, "_pending"))
    a = ap.parse_args()

    platform, vid = parse_url(a.url)
    sessdata = os.environ.get("BI_SESSDATA")  # 只从环境读，绝不打印
    if platform == "youtube":
        data = fetch_youtube(vid)
    else:
        data = fetch_bilibili(vid, a.srt, sessdata)

    os.makedirs(a.out, exist_ok=True)
    out_path = os.path.join(a.out, "%s_%s.json" % (platform, vid))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    print("saved:", out_path)
    print("title:", data["title"])
    print("author:", data["author"], "| duration:", data["duration"], "s | lang:", data["lang"])
    print("segments:", len(data["segments"]), "| needs_subs:", data["needs_subs"])
    if data["segments"]:
        print("--- preview ---")
        for s in data["segments"][:6]:
            print("  %6.1f-%6.1f  %s" % (s["start"], s["end"], s["text"][:80]))


if __name__ == "__main__":
    main()
