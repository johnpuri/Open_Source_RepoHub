# SEO & Growth Playbooks

Companion list to the main [RepoHub README](README.md) — tactics and plays taken from
Instagram reels and carousels that are **not** GitHub repositories. Each entry records
what the original post claimed, what verification found, and which repo (if any) does
the actual work.

Keep this file for methods. Repositories still belong in the README.

---

## .gov backlinks for free — the dead-link route

**Source:** Instagram reel `DgIMBzhx90H` (SEO/Claude account).
**Repo for the work:** [Ryze-AI-Adgent/open-seo-mcp-skills](https://github.com/Ryze-AI-Adgent/open-seo-mcp-skills) ⭐10.7k (MIT) — in the README under *Coding & AI Development*.

### The premise
You cannot buy a `.gov` domain; only real US government offices can register one, and every
request is vetted. That is why links from `.gov` sites are rare and valuable.

The opening is dead links: the reel cites Pew Research checking 500,000 government pages,
finding **1 in 5 carries at least one broken link**. A broken link on an official page is a
page owner actively looking for a replacement.

### The three plays
1. **"Helpful links" pages.** Cities and states keep resource pages for industries. Find the
   dead outbound links, then write the replacement page on your own site and offer it.
2. **SAM.gov.** Free registration; tick the small-business box and you land in the SBA's
   small-business search — a public profile on a `.gov` site carrying your website.
3. **Your state's supplier portal.** Same profile, identical name/address/website, so every
   listing corroborates the others.

### Verification
- SAM.gov entity registration is **free**. Confirmed the word "free" appears throughout
  `sam.gov/content/entity-registration`. Anyone charging a fee is a middleman.
- The reel's own warning is the honest part of it: *"One thing you should never pay for:
  registering on SAM.gov is free."*
- The Pew figure (1 in 5 government pages with a dead link) was **not independently
  re-verified** — treat it as the post's claim, not a measured fact.

### Honest read
Play 2 (SAM.gov / SBA profile) is legitimate and permanent. It is also a **business**
registration — you are listing an entity, so the profile must be true.

Play 1 (dead-link replacement) works but is manual outreach; there is no automation that
lands you the link. Expect low hit rates and slow turnaround.

---

## Agent Skills & Plugins — why they live in their own section

**Source:** standing instruction from the user, 2026-11-24.

Skill packs, Claude Code plugins and MCP skill bundles are a distinct class of artifact
from applications and libraries: they contain no runtime of their own and only do anything
inside an agent. They were previously scattered across ten sections of the README.

All such rows now live in **🧩 Agent Skills & Plugins** in the main README, sorted by stars,
containing ~101 entries. When adding a new one, put it there rather than in the section of
the app it happens to extend.

**Boundary rule:** if the repo ships an app you run (a browser, a DB, a service), it stays in
its topic section. If the repo is *instructions an agent reads*, it goes to the skills section.

---

## Bluetooth jamming — how it works (research only)

**Source:** Instagram reel `DfoFBvTEojF` (@709Lab, same account as the Bruce reel).
**Repo for the work:** [BruceDevices/firmware](https://github.com/BruceDevices/firmware) ⭐7.4k — in the README under *Security & Pentesting*.

### Mechanic
Classic Bluetooth (BR/EDR) uses frequency-hopping spread spectrum: the link moves to a new
channel every **625 µs** — 1,600 hops per second across **79 channels**. Interference on any
one channel is therefore irrelevant, which is the whole point of the design.

A jammer defeats it by transmitting noise across **all** channels simultaneously. The sink
hops, finds noise everywhere, and the link drops. The reel illustrates this as a speaker
that "gives up" and goes silent.

### Practical detail from the post
- Range: roughly **20 m / 65 ft** — about one floor of a building.
- **Illegal in most jurisdictions.** This is the part the post states plainly, and it is
  the part that matters.

### Status
**No repository added.** The reel is educational, not a project drop. Nothing here is a
buildable artifact, and frequency jamming is illegal in the US under FCC rules (47 CFR
§15.1 et seq.) regardless of intent. Recorded for completeness because the same account
produced Bruce, which *is* a legitimately usable repo.

BLE is a different mechanism and is not defeated the same way — the post promises a part 2
on how earbuds evade it.
