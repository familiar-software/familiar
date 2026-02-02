# Recording Query

This module orchestrates the recording query workflow:

- Filter sessions in the recordings folder based on a date range.
- Concatenate matching segments into a single MP4.
- Speed up the concatenated video.
- Send the video to Gemini with a question.

Exports:

- `runRecordingQuery({ contextFolderPath, question, fromDate, toDate, apiKey, logger })`
