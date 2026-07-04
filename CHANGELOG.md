# Changelog

This file records user-facing product iterations, experience improvements, and material stability fixes. Git commits and pull requests remain the source of truth for implementation-level changes.

Version numbers describe product releases rather than every individual commit. Related work completed on a feature branch is grouped under the version that is merged into `main` and released to production.

---

## [2.7.0] - 2026-07-04

### Switchable body trends

- Consolidated **weight, waist, and estimated RFM body fat** into one switchable trend area to reduce repeated scrolling.
- Added estimated RFM body-fat trends with 30-day, 90-day, and all-time ranges.
- Added touch selection for historical chart points while retaining the current estimate, waist-to-height ratio, formula, and measurement context.

### Plan-to-action loop (2.1–2.6 grouped in this release)

- Added onboarding prompts for core profile data, measurements, training level, and templates.
- Added reusable workout templates with duplication, ordering, and direct start actions from planning.
- Added weekly scheduling with dates, completion state, and links into specific workout days.
- Added backdated progress entries, movement/note search, workout-type filters, and time-range controls.
- Added 28-day and 90-day review summaries plus movement archives that can route users into the next matching workout.
- Added previous-set and best-set references, with reuse actions for recent or reference sets during training.
- Added data overview, import preview, pre-overwrite export protection, and CSV exports for training, body, and daily summaries.

### Release process

- Released through Pull Request #1 merged into `main`.
- The release combines three consecutive feature-branch commits: template planning flow (2.5), review-to-action flow (2.6), and switchable body trends (2.7).

---

## [2.0.2] - 2026-07-02

### Pulse stability and cardio flow

- Reworked the Pulse visual and interaction layer so it shares a stable page structure, safe-area contract, and card geometry with Lite mode.
- Reduced page-wide backgrounds, animation, and filter work that could affect scrolling and touch responsiveness.
- Clarified cardio information hierarchy and weekly-goal context to avoid presenting a single exercise session as a direct food allowance.
- Refined page headers, feedback, navigation, and safe-area behavior for iPhone use.

---

## [2.0.1] - 2026-07-01

### Mobile layout and interaction layer

- Fixed excessive bottom whitespace caused by duplicate iPhone navigation safe-area handling.
- Reframed Pulse as a stable presentation layer rather than a separate page layout.
- Improved press feedback, reduced-motion behavior, and accessibility support.

---

## [2.0.0] - 2026-07-01

### Unified fitness control center

- Connected cutting plans, training completion, nutrition logging, and activity tracking in one workflow.
- Added cutting energy and nutrition planning with fixed calorie budgets, body-fat targets, training-volume coverage, and weekly calibration.
- Added waist tracking and estimated RFM body-fat calculation.
- Unified cutting mode across training and nutrition views and rebuilt the planning/activity tracking flow.
- Introduced the unified dashboard entry point.

---

## [1.32.0 – 1.36.0] - 2026-06-23 to 2026-06-30

### Data integrity and deployment foundations

- Rebuilt and consolidated the early repository state into a stable mainline for continued iteration.
- Fixed cross-template contamination in the “previous workout” reference; historical context is now scoped to the correct template.
- Fixed an intermittent iOS issue where the bottom navigation could remain hidden after returning to the home screen.
- Pinned the Vercel runtime to Node.js 22 and switched builds to the public npm registry for more reproducible deployments.

---

## Commit and release conventions

- `feat:` — a user-visible capability.
- `fix:` — a functional, data, or deployment correction.
- `refactor:` — an internal structural change that preserves the product goal.
- `release:` — a confirmed deployable product version.
- Codex work is developed on `codex/...` branches and reviewed through Pull Request previews. A change is treated as a production release only after merging into `main`.
