#!/usr/bin/env python3
"""Parse the Open_Source_RepoHub README into structured JSON for the web UI."""
import json
import re
import sys
from pathlib import Path

ROW_RE = re.compile(
    r"^\|+\s*\[(?P<label>[^\]]+)\]\((?P<url>https?://[^)]+)\)\s*\|\s*(?P<desc>.*?)\s*\|?\s*$"
)
STARS_RE = re.compile(r"⭐\s*([\d.]+)\s*([kKmM]?)")
BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
EMOJI_RE = re.compile(
    "[" "\U0001F300-\U0001FAFF" "\U0001F000-\U0001F2FF" "\u2600-\u27BF" "\uFE0F" "\u2B00-\u2BFF" "]"
)


def human_stars(text):
    """Parse '⭐71.6k' -> 71600 for sorting; None if absent."""
    m = STARS_RE.search(text)
    if not m:
        return None
    val = float(m.group(1))
    suf = m.group(2).lower()
    if suf == "k":
        val *= 1_000
    elif suf == "m":
        val *= 1_000_000
    return int(val)


def clean(desc):
    """Strip markdown noise, keep it readable as plain text."""
    desc = BOLD_RE.sub(r"\1", desc)
    desc = re.sub(r"`([^`]*)`", r"\1", desc)
    desc = desc.replace("\\|", "|").replace("\\_", "_").replace("\\*", "*")
    # Drop a leading "⭐71.6k — " prefix: the UI shows stars as its own badge
    desc = re.sub(r"^⭐\s*[\d.]+\s*[kKmM]?\s*[—\-–:]\s*", "", desc)
    desc = re.sub(r"\s+", " ", desc).strip()
    return desc


def slug(text):
    t = text.lower().strip()
    t = EMOJI_RE.sub("", t)
    t = re.sub(r"[^\w\s-]", "", t)
    t = re.sub(r"\s+", "-", t.strip())
    return re.sub(r"-+", "-", t).strip("-")


def parse(readme_path):
    lines = Path(readme_path).read_text(encoding="utf-8").splitlines()

    sections = []
    cur = None
    repo_count = 0

    for line in lines:
        stripped = line.strip()

        # Section headings
        m = re.match(r"^##\s+(?P<title>.+?)\s*$", stripped)
        if m:
            title = m.group("title").strip()
            if title.lower().startswith(("📌 table of contents", "table of contents")):
                cur = None
                continue
            emoji = EMOJI_RE.findall(title)
            cur = {
                "title": EMOJI_RE.sub("", title).strip(),
                "raw_title": title,
                "emoji": emoji[0] if emoji else "",
                "slug": slug(title),
                "repos": [],
            }
            sections.append(cur)
            continue

        if cur is None:
            continue

        # Skip table header / separator rows
        if re.match(r"^\|+\s*(Project|Name|Tool)\s*\|", stripped, re.I):
            continue
        if re.match(r"^\|+[\s\-:|]+\|*\s*$", stripped):
            continue
        if stripped.startswith(">") or stripped.startswith("#"):
            continue

        m = ROW_RE.match(stripped)
        if not m:
            continue

        label = clean(m.group("label"))
        url = m.group("url").strip()
        raw_desc = m.group("desc")
        stars = human_stars(raw_desc)  # must read raw: clean() strips the ⭐ prefix
        desc = clean(raw_desc)

        # GitHub repos get full owner/repo metadata; other links are kept as resources
        is_gh = "github.com" in url
        owner = name = ""
        if is_gh:
            parts = url.rstrip("/").split("github.com/")[-1].split("/")
            owner = parts[0] if parts else ""
            name = parts[1] if len(parts) > 1 else ""
            if not owner or not name:
                continue

        emoji = EMOJI_RE.findall(label)
        name_clean = EMOJI_RE.sub("", label).strip()
        if not name_clean:
            name_clean = name or label

        cur["repos"].append(
            {
                "name": name_clean,
                "owner": owner,
                "repo": name,
                "full_name": f"{owner}/{name}" if is_gh else url.split("//")[-1].split("/")[0],
                "url": f"https://github.com/{owner}/{name}" if is_gh else url,
                "desc": desc,
                "stars": stars,
                "emoji": emoji[0] if emoji else "",
                "section": cur["title"],
                "section_slug": cur["slug"],
                "kind": "repo" if is_gh else "link",
            }
        )
        repo_count += 1

    sections = [s for s in sections if s["repos"]]
    return sections, repo_count


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "README.md"
    out = sys.argv[2] if len(sys.argv) > 2 else "web/data.json"

    sections, total = parse(src)

    # Global rank by stars for the "top" view
    all_repos = [r for s in sections for r in s["repos"]]
    ranked = sorted(
        [r for r in all_repos if r["stars"]], key=lambda r: r["stars"], reverse=True
    )
    for i, r in enumerate(ranked, 1):
        r["global_rank"] = i

    payload = {
        "generated_from": src,
        "total_repos": total,
        "total_sections": len(sections),
        "sections": sections,
    }

    dest = Path(out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"sections: {len(sections)}")
    print(f"repos:    {total}")
    print(f"with stars: {len(ranked)}")
    print(f"wrote:    {dest} ({dest.stat().st_size:,} bytes)")
    for s in sections:
        print(f"  {s['emoji']:2} {s['title'][:44]:44} {len(s['repos']):4}")


if __name__ == "__main__":
    main()
