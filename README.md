# Rorilo

[GitHub: ubaimutl/Rorilo](https://github.com/ubaimutl/Rorilo)

Rorilo is a local job-search workspace. It helps you collect job posts, compare them against your CV, prepare application materials, and keep track of where each application stands.

It is intentionally not an auto-apply tool. The app can draft and organize the boring parts, but the user stays in control of what gets sent.

## What it does

- Stores a candidate profile, CV text, target roles, notes, writing preferences, and blocked companies.
- Searches jobs from free feeds, optional Apify actors, and user-added company career boards.
- Deduplicates repeated jobs across sources and avoids re-adding jobs that were already deleted.
- Scores jobs with a deterministic matching engine and can add a separate model-based recommendation.
- Preserves job status through the workflow: discover, draft, applied, interview, offer, rejected, or archived.
- Generates cover letters, emails, and answers to common screening questions using an OpenAI-compatible provider.
- Can fall back to other OpenAI-compatible providers when the primary provider fails.
- Exports application material as a styled PDF.
- Shows company logos through Logo.dev when a publishable key is configured.
- Can create Gmail drafts for review before sending.

## Workflow

1. Set up the model provider.
2. Upload or paste a CV.
3. Fill in profile details and job preferences.
4. Choose search sources.
5. Review discovered jobs and delete anything unwanted.
6. Prepare application material for jobs worth applying to.
7. Track applications until they are closed.

The setup wizard walks through the same steps, and the full settings page remains available for later changes.

## Search sources

Rorilo supports three kinds of sources.

Free sources are built into the app and can be enabled from Settings or the search dialog. Some work without any account. Others, such as Adzuna or Techmap, need a free API key.

Apify sources are optional. They are useful when you want to plug in a LinkedIn, Indeed, StepStone, or custom actor. Multiple actors can be saved and selected per search.

Company career boards are opt-in. Add only the companies you care about, using public Greenhouse, Lever, Ashby, or Personio board identifiers. Rorilo does not ship a default company watchlist.

## Requirements

- Node.js 22 or newer
- npm
- SQLite by default, through Prisma

## Local setup

```bash
git clone https://github.com/ubaimutl/Rorilo.git rorilo
cd rorilo
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

Open `http://localhost:3000`.

Most keys can be entered in the app, so `.env` can stay minimal for local use.

## Docker

Run the published image:

```bash
docker run --rm -p 3000:3000 \
  -v rorilo-data:/data \
  ghcr.io/ubaimutl/rorilo:latest
```

Or use Compose:

```bash
docker compose up -d
```

The container stores the SQLite database in `/data/rorilo.db`. Keep the volume if you want to preserve your profile, settings, jobs, and drafts.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Prisma database connection. Defaults to local SQLite in `.env.example`. |
| `AI_BASE_URL` | no | OpenAI-compatible API base URL. |
| `AI_API_KEY` | no | Model provider key. Can also be saved from Settings. |
| `AI_MODEL` | no | Default model name. |
| `APIFY_TOKEN` | no | Enables Apify-based job search. |
| `APIFY_ACTOR_ID` | no | Optional default Apify actor. Multiple actors can be managed in Settings. |
| `ADZUNA_APP_ID` | no | Enables Adzuna search. |
| `ADZUNA_APP_KEY` | no | Enables Adzuna search. |
| `TECHMAP_API_KEY` | no | Enables Techmap search. |
| `LOGO_DEV_TOKEN` | no | Logo.dev publishable key for company logos. |
| `GOOGLE_CLIENT_ID` | no | Gmail draft integration. |
| `GOOGLE_CLIENT_SECRET` | no | Gmail draft integration. |
| `GOOGLE_REDIRECT_URI` | no | OAuth callback URL for Gmail integration. |

## Useful commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```

Database changes during development:

```bash
npx prisma db push
```

## Project structure

```text
app/                 Next.js pages and API routes
components/          React components and UI primitives
lib/ai/              OpenAI-compatible provider client and model helpers
lib/application/     Cover letter, email, and Q&A generation
lib/cv/              CV parsing and profile extraction
lib/job-sources/     Free sources, Apify adapters, ATS board search
lib/jobs/            Normalization, dedupe, exclusions, triage, history
lib/matching/        Deterministic scoring engine
lib/pdf/             PDF export
prisma/              Database schema
tests/               Vitest tests
```

## Privacy notes

Rorilo is designed as a single-user local app. The database lives where `DATABASE_URL` points. CV text, search history, generated drafts, and settings are stored locally unless you configure external services.

External calls happen only for the sources and integrations you enable:

- model provider for drafting, triage, and explanations
- job sources for search
- Logo.dev for company logos
- Gmail for draft creation

## Current limits

- It prepares applications, but it does not submit forms on external career sites.
- Scrapers and third-party APIs can change without warning.
- The app is built for one user on one machine.
- Drafted material should always be reviewed before sending.
