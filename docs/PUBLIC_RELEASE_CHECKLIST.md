# Public Showcase Release Checklist

This checklist exists because the active development repository contains real development history and should not be switched to public visibility without review.

## Do not publish the active development repository directly

Create a new public repository from a sanitized source snapshot. Do not push the `.git` history of the active repository into that public repository.

**Recommended structure**

```text
fitlog-dev     private; daily development, preview branches, production source
fitlog         public; sanitized portfolio snapshot, English documentation, demo assets
```

## Pre-publication audit

### Repository contents

- [ ] Confirm `.env`, `.env.*`, `.vercel`, `node_modules`, local exports, personal JSON backups, and screenshots with personal data are not included.
- [ ] Check `git log --all -- .env .vercel *.pem *.key` for historical sensitive files.
- [ ] Search the source for API keys, private keys, database URLs, tokens, emails, and personal measurements.
- [ ] Remove accidental `.git` metadata or recovery directories from the source snapshot.
- [ ] Keep only the current application source, package files, public assets, and portfolio documentation.

### Product privacy

- [ ] Remove or replace all real body metrics, workout records, food logs, names, and dates.
- [ ] Add a seeded demo profile with fictional data if the deployment will be publicly accessible.
- [ ] Verify JSON export examples do not contain real records.
- [ ] Review screenshots at full resolution for identifying information.

### Portfolio readiness

- [ ] English `README.md` is the repository landing page.
- [ ] English `CHANGELOG.md`, `docs/ARCHITECTURE.md`, and `docs/CASE_STUDY.md` are included.
- [ ] Add 3–5 screenshots or one short GIF showing the daily dashboard, active workout, progress trends, and data export flow.
- [ ] Add a concise project description and topics in GitHub: `nextjs`, `typescript`, `react`, `tailwindcss`, `pwa`, `fitness-tracking`, `local-first`.
- [ ] Add a deployment link only after testing in a clean browser profile.
- [ ] Add a license before making the repository public.

### Release validation

```bash
npm ci
npm run typecheck
npm run verify
npm run audit:prod
```

- [ ] Test the public build in an incognito/private browser window.
- [ ] Confirm the app starts with no personal localStorage state.
- [ ] Confirm every documentation link works from the public repository.
- [ ] Confirm Vercel environment variables contain no values that can be exposed to the client.

## Creating the public repository

When the sanitized snapshot is ready, create a **new public repository named `fitlog`**. Do not initialize it with a README, `.gitignore`, or license during creation.

Then, from the sanitized local project directory:

```bash
git init
git add .
git commit -m "chore: publish FitLog portfolio snapshot"
git branch -M main
git remote add origin https://github.com/<your-github-handle>/fitlog.git
git push -u origin main
```

The active private repository should remain connected to the current Vercel project. The public repository can later be connected to a separate Vercel project using demo-only data.
