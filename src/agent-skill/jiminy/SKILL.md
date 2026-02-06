---
name: jiminy
description: Locate, interpret, and filter the user's past behavior. Use when the harness needs to answer questions about past activity, repeated behaviors, or question where on-screen behavior can be helpful.
---

# Jiminy Stills Markdown

## Purpose

Use a repository of markdown files that represent all of the actions/interactions/visuals the user had on-screen.
The markdown files are ready to use with regular bash commands, they are already preprocessed with a defined structure.

## Locate The Data

1. Use the provided `contextFolderPath` if available.
2. Otherwise read `~/.jiminy/settings.json` and use `contextFolderPath`.
3. Stills markdown root lives at `<contextFolderPath>/jiminy/stills-markdown`.

## Directory Structure

- Session folder pattern: `<contextFolderPath>/jiminy/stills-markdown/session-<timestamp>/`
- Capture file pattern: `<contextFolderPath>/jiminy/stills-markdown/session-<timestamp>/<captureTimestamp>.md`

## Naming Conventions

- Session name format: `session-<timestamp>`
- `<timestamp>` is ISO-8601 with `:` and `.` replaced by `-`.
- Example session: `session-2026-02-05T16-35-35-626Z`
- Example capture file: `2026-02-05T16-35-35-770Z.md`
- Lexicographic order matches chronological order.

## Content Format

Each file describes exactly one still image.

```
---
format: jiminy-layout-v0
screen_resolution: <width>x<height>
grid: <cols>x<rows>
app: <app name or unknown>
window_title_raw: <raw title or unknown>
window_title_norm: <normalized title or unknown>
url: <url or unknown>
---
# Layout Map
SCREEN <width>x<height>
GRID <cols>x<rows>
[HEADER] (x1,y1)-(x2,y2) text: "..."
[SIDEBAR] (x1,y1)-(x2,y2) text: "..."
[CONTENT] (x1,y1)-(x2,y2) text: "..."
[IMAGE] (x1,y1)-(x2,y2) desc: "..."

# OCR
- "Exact text line 1"
- "Exact text line 2"
```

Treat literal `unknown` and `UNCLEAR` as missing data.

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
- Layout semantics: match on `[HEADER]`, `[SIDEBAR]`, `[CONTENT]`, `[IMAGE]` blocks and their text or desc.
- Display targeting: filter on `screen_resolution` or `grid`.

## Retrieval Strategy

1. Narrow to a time range first, target one or multiple sessions
2. Select sessions by the timestamp.
3. Read all of the relevant markdown files in the selected sessions, make sure you have them in the correct order
4. Use `# OCR` for exact text matches and `Layout Map` for structure clues.
5. try to avoid searching by keywords unless its really obvious that the user is asking you to find a very particular thing. if the request is a generic one (for example, "how did i do today? anything to improve?") then you need to read all of the relevant markdown files

## Guardrails

- Do not infer text that is not explicitly present.
- Treat `UNCLEAR` and `unknown` as missing data.
- Avoid scanning the entire history unless the user explicitly requests it.
