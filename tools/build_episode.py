# -*- coding: utf-8 -*-
"""
build_episode.py — 把抓取+人工加工完成的语料 JSON 写入应用（追加到 episodes-imported.js）

用法:
    python tools/build_episode.py <pending.json> [--ep-json 加工完成.json]

pending.json 可以直接用，也可以用 --ep-json 提供加工后的版本
（在 pending 基础上补齐: 每条 segment 的 translation、dictionary 词条、stars/tags/shortTitle 等）。

加工后的 episode JSON 结构（与 corpus-app/js/data.js 的 schema 一致）:
    {
      "shortTitle": "...", "stars": 3, "tags": ["..."],
      "subtitles": [{"id":"s1","start":0.4,"end":3.2,"text":"...","translation":"..."}],
      "dictionary": {"word": {"phonetic":"...","pos":"...","meaning":"...",...}}
    }
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPROOT = os.path.join(ROOT, "corpus-app") if os.path.isdir(os.path.join(ROOT, "corpus-app")) else ROOT
APP_JS = os.path.join(APPROOT, "js")
IMPORTED = os.path.join(APP_JS, "episodes-imported.js")
INDEX = os.path.join(APPROOT, "index.html")

FLAG = "/* __EPISODES_BELOW__ */"


def existing_ids():
    """从 episodes-imported.js + data.js 里数出已用 ep 编号"""
    ids = set()
    for path in (IMPORTED, os.path.join(APP_JS, "data.js")):
        if os.path.exists(path):
            ids |= set(re.findall(r'"id"\s*:\s*"(ep\d+)"', open(path, encoding="utf-8").read()))
            ids |= set(re.findall(r"id:\s*\"(ep\d+)\"", open(path, encoding="utf-8").read()))
    return ids


def next_ep_id():
    ids = existing_ids()
    n = 1
    while "ep%03d" % n in ids:
        n += 1
    return "ep%03d" % n


def js_str(s):
    return json.dumps(s or "", ensure_ascii=False)


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("pending")
    ap.add_argument("--ep-json", default=None, help="加工完成的 episode JSON（缺省直接用 pending）")
    a = ap.parse_args()

    src = a.ep_json or a.pending
    ep = json.load(open(src, encoding="utf-8"))
    pend = json.load(open(a.pending, encoding="utf-8")) if a.ep_json else ep

    ep_id = next_ep_id()
    subs = []
    for i, s in enumerate(ep.get("subtitles", []), 1):
        subs.append({
            "id": "s%d" % i,
            "start": s.get("start", 0),
            "end": s.get("end", 0),
            "text": (s.get("text") or "").strip(),
            "translation": (s.get("translation") or "").strip(),
            **({"words": s["words"]} if s.get("words") else {}),
        })
    if not subs:
        raise SystemExit("没有字幕：先解决 needs_subs（--srt 或 BI_SESSDATA）再入库")

    episode = {
        "id": ep_id,
        "title": ep.get("title") or pend.get("title") or "Untitled",
        "shortTitle": ep.get("shortTitle") or (ep.get("title") or "Untitled")[:12],
        "cover": ep.get("cover") or pend.get("cover") or None,
        "duration": ep.get("duration") or pend.get("duration") or int(subs[-1]["end"]),
        "speaker": {
            "name": ep.get("author") or pend.get("author") or "Unknown",
            "gender": ep.get("gender", "F"),
            "flag": ep.get("flag", "🌍"),
        },
        "stars": int(ep.get("stars", 3)),
        "tags": ep.get("tags", ["导入"]),
        "mediaUrl": (lambda d: next(("media/" + f for f in sorted(os.listdir(d)) if f.startswith(ep_id + ".")), "") if os.path.isdir(d) else "")(os.path.join(APPROOT, "media")),
        "source": {"platform": pend["platform"], "videoId": pend["videoId"], "url": pend["url"]},
        "subtitles": subs,
    }
    dictionary = ep.get("dictionary", {})

    block = "\n  /* ===== {id}: {title} ===== */\n".format(id=ep_id, title=episode["title"])
    block += "  window.CORPUS._imported.push({id});\n".format(id=js_str(ep_id))
    block += "  window.CORPUS.episodes.push(" + json.dumps(episode, ensure_ascii=False, indent=1) + ");\n"
    if dictionary:
        block += "  Object.assign(window.CORPUS.dictionary, " + json.dumps(dictionary, ensure_ascii=False, indent=1) + ");\n"

    content = open(IMPORTED, encoding="utf-8").read()
    content = content.replace(FLAG, FLAG + "\n" + block.rstrip() + "\n")
    open(IMPORTED, "w", encoding="utf-8").write(content)

    # 确保 index.html 引入了 episodes-imported.js
    html = open(INDEX, encoding="utf-8").read()
    if "episodes-imported.js" not in html:
        html = html.replace('<script src="js/db.js"></script>',
                            '<script src="js/episodes-imported.js"></script>\n  <script src="js/db.js"></script>')
        open(INDEX, "w", encoding="utf-8").write(html)

    print("OK:", ep_id, "《" + episode["title"] + "》")
    print("  字幕", len(subs), "条 | 词典", len(dictionary), "条 | 平台", episode["source"]["platform"])


if __name__ == "__main__":
    main()
