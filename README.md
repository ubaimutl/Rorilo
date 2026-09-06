# Rorilo

**Local-first AI job search and application assistant.**

Rorilo helps you discover jobs across multiple sources, compare them against your CV, prepare tailored application materials, and track every application from one place.

Your profile, jobs, drafts, and settings stay on your machine. Rorilo is intentionally **not** a blind auto-apply tool: it prepares and organizes the repetitive parts while you stay in control of what gets submitted.

## Download

Desktop builds are available from the [latest GitHub release](https://github.com/ubaimutl/Rorilo/releases/latest).

| Platform | Package |
| --- | --- |
| Windows | `.exe` installer or `.msi` |
| macOS Apple Silicon | `aarch64.dmg` |
| macOS Intel | `x64.dmg` |
| Debian / Ubuntu | `.deb` |
| Arch Linux | `.pkg.tar.zst` |

The desktop app includes the local runtime and database setup. You do **not** need Node.js, npm, Docker, or a separate database server to use the desktop build.

## Features

- Search jobs from free feeds, public company career boards, and optional Apify actors.
- Match jobs against your CV, skills, preferences, location, language, and salary targets.
- Deduplicate repeated listings across different sources.
- Avoid re-adding jobs you already deleted or excluded.
- Generate grounded cover letters, recruiter emails, and screening-question answers.
- Use your preferred OpenAI-compatible AI provider.
- Export application materials as styled PDFs.
- Track applications through draft, applied, interview, offer, rejection, and archive states.
- Create Gmail drafts for review before sending.
- Keep your core data in a local SQLite database.

## How it works

1. Configure an AI provider.
2. Upload or paste your CV.
3. Fill in your profile and job preferences.
4. Choose the job sources you want to use.
5. Review discovered jobs and remove anything irrelevant.
6. Prepare application material for jobs worth applying to.
7. Submit applications yourself and track their progress in Rorilo.

The setup wizard handles the initial configuration, and everything can be changed later from Settings.

## Job sources

Rorilo supports several source types so you are not locked to one job platform.

### Free and public sources

Built-in sources can be enabled from Settings or the search dialog. Some require no account at all, while others such as Adzuna or Techmap use optional free API credentials.

### Apify

Apify is optional and useful for sources such as LinkedIn, Indeed, StepStone, or custom Actors. Multiple Actors can be saved and selected per search.

### Company career boards

Rorilo can search public Greenhouse, Lever, Ashby, and Personio boards. You can add the companies you care about without depending on a separate job aggregator.

## Privacy

Rorilo is designed as a single-user, local-first application.

Your CV text, profile, search history, job data, generated drafts, and settings are stored in a local SQLite database. External calls happen only when required by integrations you choose to enable, such as:

- your configured AI provider
- job-search sources
- Apify Actors
- Logo.dev for company logos
- Gmail for draft creation

Rorilo does not submit job applications automatically.

## Docker

For self-hosting or server use, a Docker image is also published.

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

## Development from source

Requirements:

- Node.js 22 or newer
- npm

```bash
git clone https://github.com/ubaimutl/Rorilo.git rorilo
cd rorilo
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

Open `http://localhost:3000`.

Most keys can be entered directly in the app, so `.env` can stay minimal for local development.

### Useful commands

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run desktop:build
```

Database changes during development:

```bash
npx prisma db push
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Prisma database connection. Defaults to local SQLite in `.env.example`. |
| `AI_BASE_URL` | no | OpenAI-compatible API base URL. |
| `AI_API_KEY` | no | Model provider key. Can also be saved from Settings. |
| `AI_MODEL` | no | Default model name. |
| `APIFY_TOKEN` | no | Enables Apify-based job search. |
| `APIFY_ACTOR_ID` | no | Optional default Apify Actor. Multiple Actors can be managed in Settings. |
| `ADZUNA_APP_ID` | no | Enables Adzuna search. |
| `ADZUNA_APP_KEY` | no | Enables Adzuna search. |
| `TECHMAP_API_KEY` | no | Enables Techmap search. |
| `LOGO_DEV_TOKEN` | no | Logo.dev publishable key for company logos. |
| `GOOGLE_CLIENT_ID` | no | Gmail draft integration. |
| `GOOGLE_CLIENT_SECRET` | no | Gmail draft integration. |
| `GOOGLE_REDIRECT_URI` | no | OAuth callback URL for Gmail integration. |

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
src-tauri/           Desktop shell and bundled local runtime
tests/               Vitest tests
```

## Contributing

Contributions are welcome, especially for:

- job sources for additional countries and regions
- public ATS and career-board integrations
- source reliability improvements
- desktop packaging and platform fixes
- accessibility and UX improvements

Please keep integrations modular and normalize discovered jobs through Rorilo's existing job-source interfaces.

## Current limitations

- Rorilo prepares applications but does not submit forms on external career sites.
- Scrapers and third-party APIs can change without warning.
- The app is currently designed for one user on one machine.
- Generated application material should always be reviewed before sending.

## License

Rorilo is released under the [MIT License](LICENSE).
