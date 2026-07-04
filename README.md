# FitLog

A local-first fitness, nutrition, cardio, and body-composition dashboard built for structured self-tracking on mobile.

**Live demo:** [fitlog-showcase.vercel.app](https://fitlog-showcase.vercel.app/)

FitLog is designed around one practical loop:

> plan a workout → log real execution → review performance → adjust the next session

The current product interface is Chinese-first because it is built for personal daily use. This repository and its engineering documentation are maintained in English for portfolio review.

## Demo notes

The public demo starts with browser-local state. Any records entered in the demo remain in that browser unless exported by the user. The deployment contains no personal workout, nutrition, or body-composition data.

## What it solves

Fitness tracking is usually fragmented across notes, workout apps, nutrition apps, and spreadsheets. FitLog keeps training, nutrition, cardio, body measurements, and a cutting plan in one browser-based workspace while preserving direct user control over data.

## Core capabilities

- **Training workflow** — weekly planning, reusable templates, live workout logging, completion checks, and post-workout review.
- **Progress review** — body weight, waist measurements, estimated RFM body-fat trend, training volume, and searchable history.
- **Nutrition and cutting** — calorie and macro logging, cutting targets, energy planning, weekly calibration, and context-aware cardio tracking.
- **Actionable exercise history** — previous sets, best sets, movement archives, and shortcuts from review back into the next matching session.
- **Portable data** — browser-first persistence, JSON backup/restore, CSV exports, and import preview before overwriting local data.
- **Mobile-first interaction** — safe-area handling, touch-oriented controls, reduced-motion support, and a lightweight alternate Pulse visual theme.

## Engineering decisions

### Local-first by default

FitLog uses browser `localStorage` as its default persistence layer. There is no mandatory account or backend dependency for core tracking.

This trades cross-device sync for:

- immediate startup;
- no account onboarding;
- direct data ownership;
- simple backup and restore;
- a lower operational surface area for a personal tool.

JSON export and restore are explicit because clearing browser data or changing devices can otherwise remove locally stored records.

### Plans are not logs

A planned session is never automatically treated as completed training. Actual workout logs remain separate from templates and scheduling. This prevents planned volume from contaminating performance history.

### Template-specific history

Previous-session references are scoped to the same workout template. This prevents the app from accidentally showing a previous set from a different workout type when templates share similar exercises.

### Progressive enhancement for mobile

The UI is designed for phone-sized screens first. It accounts for mobile browser safe areas, avoids expensive page-wide effects, and honors `prefers-reduced-motion` for users who request reduced animation.

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 15 |
| UI | React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS + CSS custom properties |
| Persistence | Browser `localStorage` |
| Export | JSON backup/restore and CSV export |
| Runtime | Node.js 22 |
| Deployment | Vercel |

## Product evolution

Current version: **2.7.0**

Recent iterations include:

- a unified cutting, nutrition, training, and activity workflow;
- stable mobile safe-area behavior and a simplified Pulse presentation layer;
- planning → template → execution → review flow improvements;
- switchable body trends for weight, waist, and RFM estimated body fat.

See [CHANGELOG.md](./CHANGELOG.md) for the product-level release history.

## Repository guide

- [Architecture](./docs/ARCHITECTURE.md) — data boundaries, modules, and design trade-offs.
- [Case Study](./docs/CASE_STUDY.md) — problem framing, iteration choices, and engineering evidence.
- [Public Release Checklist](./docs/PUBLIC_RELEASE_CHECKLIST.md) — steps required before publishing a clean showcase repository.

## Local development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run verify
npm run audit:prod
```

## Data and health disclaimer

RFM body-fat estimates, BMR calculations, and maintenance-calorie trends are estimates, not clinical or DXA measurements. Cardio records are intended for activity and recovery review, not as a precise same-day food allowance.

## License

This repository is published for portfolio evaluation and code review. See [LICENSE](./LICENSE) for usage restrictions.
