# Verification record

Verified locally on October 27, 2026, on macOS with Python 3.9.6 and Node.js 25.9.0.

| Check | Result |
| --- | --- |
| Backend API and service tests | 9 passed |
| React interaction tests | 5 passed |
| Chromium workflow | 1 passed |
| TypeScript and production build | Passed |
| Python lint and formatting | Passed |
| Frontend dependency audit | 0 known vulnerabilities reported |
| Desktop and mobile screenshots | Inspected |

The browser workflow used the built frontend and a real FastAPI server with an isolated SQLite database. It covered sample import, search, scoped local briefs, Markdown download, partial CSV validation, persistence after reload, and a 390-pixel mobile viewport. Screenshots are in this folder.

The React suite also checks that a late brief response is discarded if the user changes the feedback scope while generation is in progress.

OpenAI success and failure paths were verified with mocked HTTP responses. No paid live model request was made. The GitHub Actions workflow is configured to repeat verification on Linux; its remote result is separate from these local checks.
