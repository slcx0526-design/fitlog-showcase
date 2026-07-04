# FitLog Architecture

## System boundary

FitLog is a **client-first Next.js application**. Core functionality is intentionally available without a user account, API server, or hosted database.

```text
Browser UI
  └─ React / Next.js client components
       ├─ local state and domain helpers
       ├─ browser localStorage persistence
       ├─ JSON export / restore
       ├─ CSV export
       └─ charts and progress calculations
```

The Vercel deployment serves the application shell. Personal workout and nutrition records remain in the user’s browser unless the user explicitly exports a file.

## Data model principles

### 1. Plans and completed work are separate

A schedule or template describes intended work. A completed workout record describes what actually happened. The system does not silently promote planned work into a training log.

**Reason:** planned volume should not distort performance history, review metrics, or progress decisions.

### 2. Templates provide context, not fabricated data

Templates contain exercises, target sets, and workout structure. Training records retain date-specific sets, weights, repetitions, and notes.

Previous-session comparisons are scoped by template identity where possible.

**Reason:** two workout days may include similar movements but have different goals. Using the most recent similar movement without template context can present misleading reference sets.

### 3. Derived health metrics are labeled as estimates

RFM body-fat estimates, BMR values, calorie targets, and maintenance trends are derived values rather than clinical measurements.

**Reason:** the UI should support consistent self-tracking without overstating the precision of consumer-entered data.

### 4. Explicit data ownership

The product defaults to local persistence and exposes export/restore actions.

**Reason:** a personal tool should not require an account to be useful, and users should be able to back up or migrate their own records.

## Major modules

| Module | Responsibility |
| --- | --- |
| Today | Daily context: body check-in, planned training entry, nutrition status, and cardio context. |
| Training | Templates, active workout sessions, set logging, completion checks, and session review. |
| Planning | Weekly schedules, planned template assignment, and links into specific workout dates. |
| Progress | Body trends, training summaries, history search/filtering, and movement archives. |
| Nutrition | Calories, macros, cutting targets, and daily intake logs. |
| Cardio | Activity duration/intensity context and weekly goal review. |
| Settings & Data | Profile fields, backup/restore, CSV export, and import safety controls. |

## UI and interaction approach

- **Mobile first:** phone layouts are the primary interaction target.
- **Safe-area aware:** bottom navigation and page padding account for modern iPhone browser insets.
- **Touch-oriented:** inputs and action controls use direct, low-latency interactions.
- **Motion restraint:** the interface supports `prefers-reduced-motion` and avoids page-wide visual effects that compromise scrolling performance.
- **Theme separation:** Lite and Pulse share the same data and page structure; the alternate mode changes presentation rather than product behavior.

## Release workflow

```text
Feature branch (codex/...)
  → Pull Request
  → Vercel Preview deployment
  → review / validation
  → merge into main
  → Vercel Production deployment
```

This keeps experimental work out of production while preserving a verifiable deployment trail.

## Trade-offs and next steps

| Current choice | Benefit | Trade-off | Potential next step |
| --- | --- | --- | --- |
| localStorage-first | No account required; direct ownership | No automatic multi-device sync | Optional authenticated sync with encrypted server-side storage |
| Client-side calculations | Simple, fast, private | Limited validation outside the browser | Schema validation and versioned migrations |
| Manual JSON backup | Transparent and portable | Relies on user action | Encrypted cloud backup as an opt-in feature |
| Chinese-first UI | Optimized for current daily use | Less accessible to international demo users | Add a complete English locale with seeded demo data |
