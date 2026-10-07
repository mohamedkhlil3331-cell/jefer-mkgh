# Hostinger staging deployment

This configuration creates a separate staging copy of the ERP. Replit production, its DNS records, and the domain registration remain unchanged until the Hostinger copy has been tested and approved.

## Hostinger Node.js app settings

- Framework: Express
- Node.js: 22
- Repository root: the workspace root (the directory containing `pnpm-workspace.yaml`)
- Build command: `pnpm run hostinger:build`
- Entry file: `artifacts/api-server/dist/index.mjs`
- Output directory: leave empty

The build bundles the `erp-arabic` Vite frontend and API server into one Node.js app. The API serves the frontend and its SPA routes on the same domain.

## Runtime environment

Set these in Hostinger's app environment settings:

```text
NODE_ENV=production
ERP_STORAGE_BACKEND=filesystem
ERP_DATA_DIR=~/domains/<domain>/erp-data
HOSTINGER_SERVE_FRONTEND=1
HOSTINGER_SITE_ANALYTICS=1
```

Hostinger supplies `PORT`; do not replace it with a fixed port. The app creates `erp-data` if needed. Keep it outside both `hbuilds` and `public_html`; the app rejects paths inside those deployment-managed directories. This path must be writable by the Node.js app and must remain present across a redeploy. Verify that behavior in staging before importing live data.

Keep `SESSION_SECRET` the same as the current system's value. The database contains encrypted values that depend on it, and the backup download uses it to sign short-lived links. Add it only through Hostinger's secret/environment settings; never put it in this repository or send it in chat.

Set additional integration variables only for features that need them:

- AI features: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Email: `GMAIL_USER`, `GMAIL_APP_PASSWORD`
- SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_FROM_NUMBER`
- Map service: `TAWASOLMAP_USER`, `TAWASOLMAP_PASS`, `TAWASOLMAP_TOKEN`
- Rental account integration: `RENTAL_ACCOUNTS_PASSWORD`

Do not configure Replit Object Storage variables on this app. The Hostinger mode stores SQLite, legacy uploads, and object files under `ERP_DATA_DIR`; the default Replit mode is unchanged.

## Copying data for the staging test

1. Create a full system backup from the current production app and keep the archive private. It contains the database, uploaded files, and active sessions.
2. Upload the archive to a local computer or a private Hostinger directory. Extract it outside `hbuilds` and `public_html`.
3. Copy `database/erp.db` to `erp-data/erp.db`, `storage/*` to `erp-data/objects/*`, and `uploads/*` to `erp-data/uploads/*`, preserving subdirectories and filenames.
4. Restart the Hostinger app after the copy, then verify sign-in, customer/employee portals, file previews/downloads, and a harmless test upload.
5. Keep the Replit production app and DNS unchanged throughout staging. Do not use Hostinger as the production source of truth until the user explicitly approves the cutover.

The existing system-backup restore endpoint also supports the filesystem backend after an administrator can sign in. For a fresh staging database, importing the archive directly into the data directory avoids needing an account before the copied database is available.

## Traffic reporting

Hostinger's hPanel traffic statistics cover requests and bandwidth. The staging build also enables first-party page-view and referral-host reporting in the admin dashboard. It stores sanitized page paths, a tab-scoped random visitor ID, and the referring host only; it does not store IP addresses or referrer paths.
