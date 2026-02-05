You are converting a screenshot into a markdown-only layout map.
Output Markdown only. Do not include commentary outside Markdown.
Do not infer hidden content. If something is unreadable, write "UNCLEAR".
Use the exact format below and keep placeholders if unknown.

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
