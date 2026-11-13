#!/usr/bin/env python3
"""Enrich web/data.json with GitHub metadata: topics, language, licence, type.

Two modes:
  python3 enrich.py            # incremental: only rows missing metadata
  python3 enrich.py --all      # refetch everything
  python3 enrich.py --limit N  # stop after N API calls (stay under rate limit)

Writes both web/data.json and web/meta-cache.json so repeat runs are free.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data.json"
CACHE = HERE / "meta-cache.json"

# ---------------------------------------------------------------- type rules
# Ordered: first match wins, so each repo gets exactly one primary type.
# Topic matches are strongest; description regex is the fallback.
TOPIC_TYPES = [
    ("Awesome List", {"awesome", "awesome-list", "curated-list", "list"}),
    # "mcp" alone means "speaks MCP" — that includes clients and agents.
    # Only an explicit server/implementation topic makes it an MCP Server.
    ("MCP Server", {"mcp-server", "model-context-protocol", "mcp-server-template"}),
    ("Skill", {"skill", "skills", "claude-skill", "agent-skills", "prompt-engineering"}),
    ("Browser Ext", {"browser-extension", "chrome-extension", "firefox-extension", "extension"}),
    ("Desktop App", {"desktop", "electron", "tauri", "native-app", "gui"}),
    ("CLI / TUI", {"cli", "command-line", "terminal", "tui", "command-line-tool"}),
    ("Web App", {"web-app", "self-hosted", "dashboard", "web-ui", "frontend", "webapp"}),
    ("Model", {"llm", "machine-learning", "deep-learning", "model", "inference", "fine-tuning",
               "transformers", "pytorch", "text-generation", "weights"}),
    ("Bot", {"bot", "chatbot", "discord-bot", "telegram-bot", "slack-bot"}),
    ("Runtime / Toolchain", {"runtime", "compiler", "bundler", "interpreter", "toolchain",
                             "package-manager", "build-tool", "programming-language"}),
    ("Infra / Network", {"proxy", "vpn", "networking", "dns", "server", "devops",
                         "infrastructure", "kubernetes", "docker", "self-hosted-service"}),
    ("Docs / Guide", {"documentation", "tutorial", "guide", "book", "course", "education",
                      "learning", "roadmap", "interview"}),
    ("App", {"app", "application", "file-sharing", "productivity", "notes", "editor",
             "video", "audio", "image", "media", "social-media", "scheduling"}),
    ("Framework", {"framework", "library", "sdk", "agent-framework"}),
    ("Agent", {"agent", "agents", "ai-agent", "ai-agents", "agentic-ai", "multi-agent",
               "agent-orchestration", "llm-agent"}),
]

DESC_TYPES = [
    ("Awesome List", r"\bawesome\b|curated (list|collection)"),
    ("MCP Server", r"\bmcp\b|model context protocol"),
    ("Skill", r"\bskills?\b"),
    ("Browser Ext", r"browser extension|chrome extension|firefox extension"),
    ("Desktop App", r"\bdesktop\b|electron app|native (app|gui)|menu bar"),
    ("CLI / TUI", r"\bcli\b|command[\s-]line tool|\btui\b|terminal (app|ui)"),
    ("Web App", r"web ?app|self[\s-]?host|dashboard|web ?ui"),
    ("Model", r"\bweights\b|inference|fine[\s-]?tun|checkpoints?\b"),
    ("Bot", r"\bbot\b"),
    ("Runtime / Toolchain", r"\bruntime\b|\bcompiler\b|\bbundler\b|\binterpreter\b"),
    ("Infra / Network", r"\bproxy\b|\bvpn\b|\bdns\b|reverse proxy|load balanc"),
    ("Docs / Guide", r"\bguide\b|\btutorial\b|\bcourse\b|roadmap|\bdocumentation\b"),
    ("App", r"file sharing|screenshot|screen record|video editor|note[- ]taking|\beditor\b"),
    ("Framework", r"\bframework\b|\blibrary\b|\bsdk\b"),
    ("Agent", r"\bagents?\b"),
]


# Topic specificity: how decisive a match on this topic is. A repo tagged
# "mcp-server" among 20 topics that is really an agent framework should lose to
# "agent-framework". Weights let the *most specific* signal win instead of the
# first rule in the list.
TOPIC_WEIGHT = {
    "awesome-list": 100, "mcp-server": 95, "browser-extension": 95,
    "agent-skills": 90, "claude-skill": 90, "claude-code-skill": 90,
    "cli": 85, "command-line": 85, "tui": 85, "desktop-app": 85, "electron": 80,
    "runtime": 80, "compiler": 80, "bundler": 80, "proxy": 80, "vpn": 75,
    "documentation": 75, "tutorial": 75, "course": 75,
    "agent-framework": 70, "framework": 62, "library": 58, "sdk": 58,
    "web-app": 66, "self-hosted": 60, "dashboard": 60, "web-ui": 60,
    "llm": 50, "model": 55, "inference": 55, "fine-tuning": 55,
    "bot": 60, "chatbot": 60,
    "agent": 45, "ai-agent": 46, "ai-agents": 46, "agentic-ai": 46,
    "multi-agent": 44, "agent-orchestration": 44, "llm-agent": 44,
    "app": 40, "productivity": 38, "editor": 40,
}

# Map each topic key to the type it implies
TOPIC_LABEL = {}
for _label, _keys in TOPIC_TYPES:
    for _k in _keys:
        TOPIC_LABEL[_k] = _label


def classify(meta, name, desc):
    """Return (type, matched_on).

    Strategy: name shape is decisive; otherwise score every topic by how
    specific it is and take the strongest; description is the last resort.
    """
    import re

    bare = (name or "").strip().lower()
    topics = {t.lower() for t in (meta.get("topics") or [])}

    # Name shape wins: a repo that calls itself a list or a skill is one,
    # regardless of which of its 20 topics happen to make it look like a server.
    if bare.startswith("awesome-") or bare in {"awesome", "awesome-list"}:
        return "Awesome List", "name"
    if re.search(r"[-_]?skills?$", bare) and "awesome-list" not in topics:
        return "Skill", "name"

    # Identity topics describe what a repo *is*; feature topics describe what it
    # also does. An agent harness that happens to expose MCP is an agent harness.
    AGENT_IDENTITY = {"agent-framework", "agent-harness", "agent-os",
                      "agent-orchestration", "multi-agent-systems", "ai-agent"}
    if topics & AGENT_IDENTITY and "mcp-server" in topics:
        topics = topics - {"mcp-server", "model-context-protocol"}

    # Score topics: highest weight wins, so a genuine agent framework beats an
    # incidental "mcp-server" tag.
    best_label, best_weight = None, 0
    for t in topics:
        label = TOPIC_LABEL.get(t)
        if not label:
            continue
        if label == "MCP Server" and t == "mcp":
            continue  # bare "mcp" only means it speaks the protocol
        w = TOPIC_WEIGHT.get(t, 40)
        if w > best_weight:
            best_label, best_weight = label, w
    # Require a reasonably decisive topic (>= 55) to answer on topics alone.
    if best_label and best_weight >= 55:
        return best_label, "topic"

    blob = f"{name} {desc}".lower()
    for label, pat in DESC_TYPES:
        if re.search(pat, blob):
            return label, "desc"
    if best_label:
        return best_label, "topic-weak"
    return "Other", "none"


# ---------------------------------------------------------------- fetching
def gh(path):
    """Call gh api, return parsed JSON or None."""
    try:
        p = subprocess.run(
            ["gh", "api", path],
            capture_output=True, text=True, timeout=30,
        )
        if p.returncode != 0:
            return None, p.stderr.strip()[:200]
        return json.loads(p.stdout), None
    except Exception as e:
        return None, str(e)[:200]


def main():
    args = sys.argv[1:]
    refetch_all = "--all" in args
    limit = None
    if "--limit" in args:
        limit = int(args[args.index("--limit") + 1])

    data = json.loads(DATA.read_text(encoding="utf-8"))
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    repos = [r for s in data["sections"] for r in s["repos"]]
    todo = [
        r for r in repos
        if r.get("owner") and (refetch_all or r["full_name"] not in cache)
    ]

    print(f"repos total : {len(repos)}")
    print(f"cached      : {len(cache)}")
    print(f"to fetch    : {len(todo)}")
    if limit:
        todo = todo[:limit]
        print(f"capped at   : {limit}")

    ok = fail = 0
    for i, r in enumerate(todo, 1):
        meta, err = gh(f"repos/{r['owner']}/{r['repo']}")
        if meta is None:
            fail += 1
            if fail <= 5:
                print(f"  ! {r['full_name']}: {err}")
            # remember the miss so we don't retry every run
            cache[r["full_name"]] = {"_missing": True}
            continue
        ok += 1
        cache[r["full_name"]] = {
            "topics": meta.get("topics") or [],
            "language": meta.get("language"),
            "license": (meta.get("license") or {}).get("spdx_id"),
            "archived": meta.get("archived", False),
            "fork": meta.get("fork", False),
            "pushed_at": meta.get("pushed_at"),
            "stars_live": meta.get("stargazers_count"),
            "homepage": meta.get("homepage"),
            "description": (meta.get("description") or "")[:400],
        }
        if i % 25 == 0:
            CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
            print(f"  ... {i}/{len(todo)} (ok {ok}, fail {fail})")

    CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    print(f"fetched ok  : {ok}")
    print(f"failed      : {fail}")

    # ------------------------------------------------------------ apply
    applied = 0
    for r in repos:
        m = cache.get(r["full_name"]) or {}
        if m.get("_missing"):
            continue
        if not m:
            continue
        applied += 1
        r["topics"] = m.get("topics") or []
        r["language"] = m.get("language")
        # Prefer the live SPDX id; fall back to what the README claimed
        r["licence_live"] = m.get("license")
        r["archived"] = m.get("archived", False)
        r["pushed_at"] = m.get("pushed_at")
        t, src = classify(m, r["name"], r["desc"])
        r["type"] = t
        r["type_src"] = src

    # Any repo we never fetched still needs a type + language keys
    for r in repos:
        r.setdefault("type", "Other")
        r.setdefault("type_src", "none")
        r.setdefault("language", None)
        r.setdefault("topics", [])
        r.setdefault("licence_live", None)
        r.setdefault("archived", False)

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    # Summary
    from collections import Counter
    types = Counter(r["type"] for r in repos)
    langs = Counter(r["language"] for r in repos if r["language"])
    lics = Counter(r["licence_live"] for r in repos if r["licence_live"])
    print()
    print(f"enriched    : {applied}/{len(repos)}")
    print("\ntypes:")
    for k, v in types.most_common():
        print(f"  {k:14} {v:4}")
    print(f"\nlanguages: {len(langs)} distinct")
    for k, v in langs.most_common(10):
        print(f"  {k:14} {v:4}")
    print(f"\nlive licences: {sum(lics.values())} of {len(repos)}")
    for k, v in lics.most_common(8):
        print(f"  {k:14} {v:4}")


if __name__ == "__main__":
    main()
