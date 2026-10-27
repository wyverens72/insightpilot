# Interview walkthrough · October 28

## Start with the URL research workflow

1. Open **Web research** and paste a public product URL. Enter its exact name if the domain is ambiguous.
2. Click **Find sources**. Show the actual progress state and the saved research entry.
3. Explain the distinction between the company website, third-party material, a read page, and a search excerpt. Check source dates: a review from years ago may not describe the current product.
4. Select relevant sources and build the local source digest. Explain honestly that synthesis requires an OpenAI key, configurable through **Enable AI synthesis**. Do not call the extractive digest an AI analysis.
5. If a key is configured, opt in to AI search and synthesis. Show clickable citations and the explicit fallback if a provider request fails.
6. Reopen the research from history and export the Markdown report.

URL research does not produce a representative sentiment score or add article text to the review database. Keep that distinction clear during the demo.

## A three-minute CSV demo

1. Open the dashboard and load the sample workspace. Explain that the 36 reviews are fictional and the analytics are computed by the backend.
2. Point out the rating average, sentiment distribution, monthly volume, and topics. Explain that a review can mention several topics.
3. Open Review explorer and search for `crashes`. Show the original review, source, rating, and topic tags.
4. Open Insight brief while the search is active. Generate a local brief and show that its scope is one review and that it cites the original record.
5. Export the Markdown brief. Clear the search, then demonstrate a CSV upload using the downloadable template.
6. Reload the page to show that imported reviews persist in SQLite. Finish with the architecture and automated checks in the repository.

## Explain the engineering decisions

**Why this project?** It covers a complete product loop: ingest imperfect data, persist it, analyze it, expose an API, build an interactive interface, and turn evidence into a useful output.

**Why SQLite?** A local demo does not need another service. Transactions and a database uniqueness constraint provide real persistence and duplicate protection. PostgreSQL would be a sensible next step for shared use.

**Why rules before AI?** The dashboard should be reproducible and available without a paid provider. Rating-based sentiment and keyword topics are easy to explain and test. The brief generator adds an optional AI layer with explicit data-sharing controls and a visible fallback.

**How is quality checked?** API tests use fresh temporary databases. React tests check interactions and error states. A browser test exercises the built frontend against the real API. TypeScript checks and a production build catch integration errors.

**What are the limitations?** Keyword rules miss context, the sample is not representative, and AI suggestions require verification. The app has no authentication and is intended for a local single-user demo. Analytics and review pagination should move into SQL for substantially larger datasets.

## Describe your contribution accurately

The implementation was built with AI assistance. Before the interview, run it yourself, read the import flow and brief generation code, and practice explaining the tradeoffs. Describe what you understand, verified, and would improve; avoid presenting generated code as evidence of experience you do not yet have.
