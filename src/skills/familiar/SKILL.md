---
name: familiar
version: 1.0.3
description: Use when the user references past on-screen activity, needs work summaries or status updates, wants to recall or reconstruct what happened, document, asks about decisions made, communication patterns, or time spent, or when brainstorming and planning would benefit from recent screen context.
---

# Familiar Stills Markdown

## Purpose

Use a repository of markdown files that represent all of the actions/interactions/visuals the user had on-screen.
The markdown files are ready to use with regular bash commands, they are already preprocessed with a defined structure.
If the skill is called without any extra inline date/prompt, treat it as if the user wants help with existing thread/issue and analyze how the data from Familiar can help.

## Locate The Data

1. Use the provided `contextFolderPath` if available.
2. Otherwise read `~/.familiar/settings.json` and use `contextFolderPath`.
3. Stills markdown root lives at `<contextFolderPath>/familiar/stills-markdown`.

## Directory Structure

- Session folder pattern: `<contextFolderPath>/familiar/stills-markdown/session-<timestamp>/`
- Capture file pattern: `<contextFolderPath>/familiar/stills-markdown/session-<timestamp>/<captureTimestamp>.md`

## Naming Conventions

- Session name format: `session-<timestamp>`
- `<timestamp>` is local time with `:` and `.` replaced by `-`.
- Example session: `session-2026-02-05T16-35-35-626`
- Example capture file: `2026-02-05T16-35-35-770.md`
- Lexicographic order matches chronological order.

## Content Format

Each file describes exactly one still image.

```
---
format: familiar-layout-v0
screen_resolution: <width>x<height>
grid: <cols>x<rows>
app: <app name or unknown>
window_title_raw: <raw title or unknown>
window_title_norm: <normalized title or unknown>
url: <url or unknown>
---


# OCR
- "Exact text line 1"
- "Exact text line 2"
```

Treat literal `unknown` and `UNCLEAR` as missing data.

Clipboard captures are stored alongside screen captures as `<captureTimestamp>.clipboard.txt` files in the same session folders. These contain text that was copied to the clipboard during that session.

## Working with a sequence of markdown files (important)

- a markdown file with timestamp X+1 occured before markdown with timestamp X+2. they are related in a way.
- if multiple markdown files are present in a session folder, reading them in the relevant order is super important to understand the context and how the series of events played out.
- super important when the goal is to analyze something that span over more than one "frame"
    - for example - "how did i eventually figure out the solution to X?" - the answer has to take into account the order of events that occured

## Filtering Options

- Time range: filter by session folder names or capture filenames. you want to fetch as many sessions as possible that apply to the time range
    - always assume more sessions is better than less sessions
    - "today" means to take all of the sessions in date X, not just the last one
    - "from X to Y" means to take all of the session from X until Y including X and including Y
- App targeting: filter on frontmatter `app`.
- Window targeting: filter on `window_title_norm` or `window_title_raw`.
- Web targeting: filter on `url`.
- Text search: search in `# OCR` lines for exact phrases.
- Clipboard search: search in `.clipboard.txt` files for copied text.
- Display targeting: filter on `screen_resolution`.

## Retrieval Strategy

1. Narrow to a time range first, target one or multiple sessions
2. Select sessions by the timestamp.
3. Read all of the relevant markdown files in the selected sessions, make sure you have them in the correct order
4. Use `# OCR` for exact text matches and frontmatter for app/window context.
5. try to avoid searching by keywords unless its really obvious that the user is asking you to find a very particular thing. if the request is a generic one (for example, "how did i do today? anything to improve?") then you need to read all of the relevant markdown files

## Guardrails

- Do not infer text that is not explicitly present.
- Treat `UNCLEAR` and `unknown` as missing data.
- Avoid scanning the entire history unless the user explicitly requests it.

## Troubleshooting

If expected Familiar history is missing, stale, incomplete, or only partially available, do not assume there is no data. First check whether Familiar is still collecting raw data but one processing path is failing.

General checks:

1. Locate `contextFolderPath` from the provided context or from `~/.familiar/settings.json`.
2. Check recent capture activity:
   - screenshots: `<contextFolderPath>/familiar/stills/session-*/*.webp`
   - OCR markdown: `<contextFolderPath>/familiar/stills-markdown/session-*/*.md`
   - clipboard captures: `<contextFolderPath>/familiar/stills-markdown/session-*/*.clipboard.txt`
3. Check the app log:
   - `~/Library/Logs/familiar-desktopapp/main.log`
   - look for recent `error`, `warn`, `SQLITE`, `OCR`, `stills`, `markdown`, `clipboard`, `permission`, or `capture` messages.
4. Summarize what is present and what is missing before suggesting a fix.

If screenshots, markdown, and clipboard are all missing, guide the user to check whether Familiar is running, whether recording is enabled, and whether macOS Screen Recording permission is granted.

If screenshots exist but OCR markdown is missing, follow the SQLite recovery path below.

## Recover Missing OCR Markdown

Use this path only when recent `.webp` screenshots exist under `familiar/stills`, but matching `.md` files are missing under `familiar/stills-markdown`.

Diagnosis:

1. Inspect `~/Library/Logs/familiar-desktopapp/main.log`.
2. Confirm evidence of SQLite queue failure, for example:
   - `SQLITE_CORRUPT`
   - `database disk image is malformed`
   - errors from `stills-queue.js`
   - repeated markdown worker messages with no pending items despite recent screenshots

If the evidence points to a corrupted stills database, explain the finding to the user before taking action. Do not run repair commands without explicit permission.

Ask:

`Familiar appears to still be capturing screenshots, but OCR markdown generation is blocked by a corrupted stills database. I can quit Familiar, quarantine the broken database, and reopen Familiar so it creates a fresh queue. This does not delete screenshots or existing markdown, but it resets the OCR queue. Should I proceed?`

Only after the user approves, run:

```shell
osascript -e 'quit app "Familiar"'
timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
db="<contextFolderPath>/familiar/stills.db"
[ -f "$db" ] && mv "$db" "$db.corrupt-$timestamp"
[ -f "$db-wal" ] && mv "$db-wal" "$db-wal.corrupt-$timestamp"
[ -f "$db-shm" ] && mv "$db-shm" "$db-shm.corrupt-$timestamp"
open -a Familiar
```

After restart, verify that new `.md` files begin appearing under `familiar/stills-markdown`.

Existing `.webp` screenshots remain on disk. This manual recovery creates a fresh queue for new captures; screenshots captured while the database was corrupt may not be automatically reprocessed. If the user needs older screenshots reprocessed, explain that this requires a separate backfill step and ask before attempting it.
