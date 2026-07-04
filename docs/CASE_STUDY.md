# FitLog Case Study

## Overview

FitLog is a personal fitness operating system for training, nutrition, cardio, and body-composition tracking. It was built as a real daily-use product rather than a static portfolio mockup.

The project’s central design question was:

> How can a single mobile-first tool help a user move from a planned workout to a logged result, then turn that result into a better next session without forcing an account or cloud backend?

## Problem framing

Many fitness tools specialize in one area:

- workout logging without nutrition context;
- calorie tracking without a training plan;
- spreadsheet-style body measurements without a feedback loop;
- templates that are disconnected from actual completed sessions.

For a cutting phase, this fragmentation makes daily decisions harder. FitLog brings the essential context into one local-first workspace while keeping data portable.

## Product decisions

### Keep planning distinct from execution

The app makes a clear distinction between a scheduled workout, a reusable template, and an actual completed training record.

This is a data integrity choice. A scheduled chest session should not appear as completed volume simply because it exists on the calendar.

### Use historical context without false comparisons

The app surfaces previous sets and best sets during active logging. A later iteration fixed a failure mode where similar exercises from different templates could leak into the “previous session” context.

The correction was to scope history to the correct template rather than relying only on movement similarity.

### Make local data export explicit

Because data lives in the browser by default, the product includes JSON backup/restore, import preview, pre-overwrite export protection, and CSV exports.

This treats data loss as a product concern rather than a hidden implementation detail.

### Reduce cognitive load in body tracking

Weight, waist, and estimated RFM body fat were initially separate views. In version 2.7, they were consolidated into a switchable trend area so that users can compare related signals without adding another permanent chart.

## Technical execution

- **Next.js 15 + React 19** for the application framework.
- **TypeScript** for domain-model and UI reliability.
- **Tailwind CSS + custom properties** for layout and theme composition.
- **localStorage-first persistence** for privacy and zero-account startup.
- **JSON and CSV export** for portability.
- **Vercel** for preview and production deployment.

## Delivery workflow

The project now uses a branch-based delivery process:

```text
Codex feature branch
→ Pull Request
→ Vercel Preview
→ manual review
→ merge to main
→ Production deployment
```

The 2.7 release was the first documented example of this workflow: three consecutive feature commits were developed on a branch, previewed, and then merged to `main` as one production release.

## Evidence of iteration

| Version range | Focus |
| --- | --- |
| 1.32–1.36 | Repository stabilization, mobile navigation fixes, template-history data integrity, reproducible Vercel builds. |
| 2.0 | Unified cutting, nutrition, training, and activity tracking. |
| 2.0.1–2.0.2 | Mobile safe-area correction, Pulse theme stabilization, and cardio-flow refinement. |
| 2.1–2.6 | Profile completion, templates, planning, logging, review, archives, exports, and action shortcuts. |
| 2.7 | Switchable weight, waist, and RFM body-trend presentation. |

## Current limitations

- No automatic cross-device sync; records are local unless manually exported.
- The production UI is Chinese-first because it is used as a real personal daily tool.
- Estimated body-fat and energy metrics are not medical measurements.
- Public showcase publication requires a sanitized repository snapshot and seeded demo data.

## Next portfolio-quality milestones

1. Add an English locale and a one-click demo dataset.
2. Add automated tests around persistence migrations and template-scoped history.
3. Publish a sanitized snapshot repository with screenshots and a demo deployment.
4. Add optional account-based sync while preserving local-first behavior.
