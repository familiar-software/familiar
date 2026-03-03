## Release Notes

- Updating the context folder now moves the existing `familiar` data folder to the new location and updates references in one flow.
- Added automatic Familiar skill alignment at startup: if the installed skill version differs from the source `SKILL.md` marker, configured harnesses are reinstalled automatically.
- Capture files/folders now use localized timestamps (local time components instead of UTC `Z` notation) for naming markdown captures and stills sessions.
- Storage/context folder controls now treat the folder display area as an open action for the current folder and use a dedicated change flow for selecting a new context folder.
- Updated Familiar skill metadata and fallback behavior so it can operate when invoked without extra inline date/prompt input.
