# -*- coding: utf-8 -*-
"""
action_import.py — GitHub Actions 云端导入流水线
输入: issue 标题/正文里的视频链接（YouTube / B站）
流程: 去重检查 → fetch_video.py 抓取 → LLM(可选)或Google机翻 → build_episode.py 入库
输出: GITHUB_OUTPUT  result=imported|exists|error  ep_id  title  mode  reason
"""
import io
import json
import os
import re
import subprocess
import sys
import time
import glob

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(ROOT, "tools")
IMPORTED = os.path.join(ROOT, "js", "episodes-imported.js")
BUILTIN = os.path.join(ROOT, "js", "data.js")


def out(k, v):
    line = "%s=%s\n" % (k, str(v).replace("\n", " "))
    p = os.environ.get("GITHUB_OUTPUT")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write(line)
    print("[output]", line.strip(), flush=True)


YT = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|live/)|youtu\.be/)([\w-]{11})")
BILI = re.compile(r"bilibili\.com/video/(BV[\w]+)", re.I)


def parse_url(u):
    m = YT.search(u)
    if m:
        return {"platform": "youtube", "videoId": m.group(1), "url": "https://www.youtube.com/watch?v=" + m.group(1)}
    m = BILI.search(u)
    if m:
        return {"platform": "bilibili", "videoId": m.group(1), "url": "https://www.bilibili.com/video/" + m.group(1)}
    return None


def run_fetch(url):
    pend_dir = os.path.join(ROOT, "_pending")
    os.makedirs(pend_dir, exist_ok=True)
    before = set(glob.glob(os.path.join(pend_dir, "*.json")))
    r = subprocess.run(
        [sys.executable, os.path.join(TOOL, "fetch_video.py"), url, "--out", pend_dir],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=420)
    print((r.stdout or "")[-1500:], flush=True)
    if r.returncode != 0:
        err = ((r.stderr or "")[-400:] or (r.stdout or "")[-400:])
        if "Sign in to confirm" in err or "not a bot" in err or "风控" in err:
            raise RuntimeError("YouTube 对 GitHub 云端 IP 风控。修复：仓库 Settings→Secrets and variables→Actions "
                               "添加 Secret YOUTUBE_COOKIES（值=浏览器导出的 cookies.txt 全文）后 reopen 本 issue 重试；"
                               "或改用学习站「导入→手动导入」上传 SRT 字幕。")
        raise RuntimeError("抓取失败: " + err)
    new = [p for p in glob.glob(os.path.join(pend_dir, "*.json"))
           if p not in before and "_meta" not in p]
    if not new:
        raise RuntimeError("抓取未产出 pending 文件")
    return max(new, key=os.path.getmtime)


def parse_json_block(s):
    s = re.sub(r"^```(?:json)?|```\s*$", "", (s or "").strip(), flags=re.M).strip()
    i, j = s.find("{"), s.rfind("}")
    if i >= 0 and j > i:
        s = s[i:j + 1]
    return json.loads(s)


def llm_chat(base, key, model, system, user):
    import requests
    r = requests.post(base.rstrip("/") + "/chat/completions",
                      headers={"Authorization": "Bearer " + key},
                      json={"model": model, "temperature": 0.3,
                            "messages": [{"role": "system", "content": system},
                                         {"role": "user", "content": user}]},
                      timeout=240)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def llm_enrich(texts):
    base = os.environ.get("LLM_BASE_URL") or "https://open.bigmodel.cn/api/paas/v4"
    key = os.environ["LLM_API_KEY"]
    model = os.environ.get("LLM_MODEL") or "glm-4-flash"
    sysmsg_t = ("你是字幕翻译。把 JSON 数组中每条英文字幕翻译成自然、口语化的简体中文，保留语气。"
                "只返回 JSON：{\"translations\": [\"...\"]}，条数必须与输入一致。")
    trans = []
    CH = 20
    for i in range(0, len(texts), CH):
        chunk = texts[i:i + CH]
        got = None
        for attempt in (1, 2):
            try:
                d = parse_json_block(llm_chat(base, key, model, sysmsg_t,
                                              json.dumps(chunk, ensure_ascii=False)))
                tr = d.get("translations") or []
                if isinstance(tr, list) and len(tr) >= len(chunk):
                    got = [str(x) for x in tr[:len(chunk)]]
                    break
            except Exception as e:
                print("LLM chunk %d attempt %d failed: %s" % (i, attempt, e), flush=True)
                time.sleep(3)
        if got is None:
            raise RuntimeError("LLM 翻译失败（chunk %d），可在仓库 Secrets 检查 LLM_API_KEY，或删除该 Secret 走免费机翻" % i)
        trans.extend(got)

    dictionary = {}
    sample = " ".join(texts)[:3000]
    sysmsg_d = ("从英语字幕中挑选最多12个最值得学习的词/短语，生成学习词典。只返回 JSON："
                "{\"dictionary\": {\"word\": {\"phonetic\":\"音标\",\"pos\":\"词性\",\"meaning\":\"简短中文释义\","
                "\"collocation\":\"常见搭配\",\"expression\":\"一个地道表达\",\"example\":{\"en\":\"...\",\"zh\":\"...\"},"
                "\"examTags\":[\"从 中考/高考/四级/六级/考研/雅思/托福 中选0-2个\"]}}}，key 用小写原词。")
    try:
        d = parse_json_block(llm_chat(base, key, model, sysmsg_d, sample))
        if isinstance(d.get("dictionary"), dict):
            dictionary = d["dictionary"]
    except Exception as e:
        print("词典生成失败（不阻断）:", e, flush=True)
    return trans, dictionary


def google_enrich(texts):
    import requests
    trans = []
    for t in texts:
        zh = ""
        for _ in (1, 2):
            try:
                r = requests.get("https://translate.googleapis.com/translate_a/single",
                                 params={"client": "gtx", "sl": "en", "tl": "zh-CN", "dt": "t", "q": t},
                                 timeout=15)
                d = r.json()
                zh = "".join(x[0] for x in (d[0] or []) if x and x[0])
                if zh:
                    break
            except Exception:
                time.sleep(1)
        trans.append(zh)
        time.sleep(0.2)
    return trans, {}


def import_link_only(src):
    """Register a playable video without contacting the video host or requiring cookies."""
    body = os.environ.get("ISSUE_BODY", "")
    def field(name):
        # Only consume this line: \s may otherwise swallow the next field.
        m = re.search(r"^" + re.escape(name) + r"[ \t]*:[ \t]*([^\r\n]*)\r?$", body, re.M)
        return re.sub(r"[\r\n*/]", " ", m.group(1)).strip()[:180] if m else ""

    title = field("标题") or ("YouTube 视频 " if src["platform"] == "youtube" else "B站视频 ") + src["videoId"]
    author = field("作者") or "导入"
    cover = field("封面")
    if not cover.startswith("https://"):
        cover = "https://i.ytimg.com/vi/%s/hqdefault.jpg" % src["videoId"] if src["platform"] == "youtube" else ""
    pending = {**src, "title": title, "author": author, "cover": cover, "duration": 0, "segments": []}
    pend_dir = os.path.join(ROOT, "_pending")
    os.makedirs(pend_dir, exist_ok=True)
    pend_path = os.path.join(pend_dir, "link_%s.json" % src["videoId"])
    with io.open(pend_path, "w", encoding="utf-8") as f:
        json.dump(pending, f, ensure_ascii=False)
    r = subprocess.run([sys.executable, os.path.join(TOOL, "build_episode.py"), pend_path, "--allow-empty"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    print((r.stdout or "") + (r.stderr or ""), flush=True)
    if r.returncode != 0:
        raise RuntimeError("入库失败: " + ((r.stderr or "")[-400:] or (r.stdout or "")[-400:]))
    m = re.search(r"OK:\s*(ep\d+)", r.stdout or "")
    out("result", "video_only")
    out("ep_id", m.group(1) if m else "")
    out("title", title)


def main():
    text = sys.argv[1] if len(sys.argv) > 1 else ""
    src = parse_url(text)
    if not src:
        out("result", "error")
        out("reason", "未找到可识别的视频链接（支持 YouTube / B站 视频页链接）")
        return
    if any(src["videoId"] in io.open(path, encoding="utf-8").read() for path in (IMPORTED, BUILTIN)):
        out("result", "exists")
        out("reason", "该视频已在语料库中")
        return

    if os.environ.get("IMPORT_MODE") == "link":
        import_link_only(src)
        return

    pend_path = run_fetch(src["url"])
    pend = json.load(io.open(pend_path, encoding="utf-8"))
    segs = pend.get("segments") or pend.get("subtitles") or []
    if not segs:
        out("result", "error")
        out("reason", "抓取成功但拿不到字幕。" +
            ("B站字幕需要登录态，请改用学习站「导入→手动导入」上传 SRT 字幕。"
             if src["platform"] == "bilibili" else
             "该视频没有可用的自动字幕，请换一个有 CC 字幕的视频，或用手动导入。"))
        return

    raw = [s.get("text", "").strip() for s in segs]
    todo_idx = [i for i, t in enumerate(raw) if t]
    if os.environ.get("LLM_API_KEY"):
        mode = "LLM"
        got = llm_enrich([raw[i] for i in todo_idx])
    else:
        mode = "免费机翻"
        got = google_enrich([raw[i] for i in todo_idx])
    trans_map = dict(zip(todo_idx, got[0]))
    trans = [trans_map.get(i, "") for i in range(len(segs))]
    subs = [{"start": s.get("start", 0), "end": s.get("end", 0), "text": t, "translation": tr}
            for s, t, tr in zip(segs, raw, trans)]
    print("翻译完成: %d 句, 模式 %s, 词典 %d 条" % (len(subs), mode, len(got[1])), flush=True)

    enriched = {
        "title": pend.get("title"),
        "author": pend.get("author"),
        "shortTitle": (pend.get("title") or "导入")[:14],
        "stars": 3,
        "tags": ["导入"],
        "flag": "🌍",
        "gender": "F",
        "subtitles": subs,
        "dictionary": got[1],
    }
    ep_path = pend_path[:-5] + ".ep.json" if pend_path.endswith(".json") else pend_path + ".ep.json"
    with io.open(ep_path, "w", encoding="utf-8") as f:
        json.dump(enriched, f, ensure_ascii=False, indent=1)

    r = subprocess.run(
        [sys.executable, os.path.join(TOOL, "build_episode.py"), pend_path, "--ep-json", ep_path],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    print((r.stdout or "") + (r.stderr or ""), flush=True)
    if r.returncode != 0:
        raise RuntimeError("入库失败: " + ((r.stderr or "")[-400:] or (r.stdout or "")[-400:]))
    m = re.search(r"OK:\s*(ep\d+)", r.stdout or "")
    out("result", "imported")
    out("ep_id", m.group(1) if m else "")
    out("title", pend.get("title") or "")
    out("mode", mode)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        out("result", "error")
        out("reason", str(e)[:300])
    sys.exit(0)
