# KTM Quotation Studio · v2

A server-backed, single-company solar quotation workspace with staff accounts,
immutable proposal revisions, private customer links, explicit assumptions and
printable A4 proposals.

**Status: verified release candidate for controlled staging, not an unconditional
production sign-off.** Read [the engineering report](docs/ENGINEERING-REPORT.md)
and [the deployment checklist](docs/OPERATIONS.md) before using real customer data.

## Start locally

Use Node **22.22.3** (see `.nvmrc`). Node's built-in SQLite API is experimental in
this runtime; the exact tested version is pinned for repeatability.

```sh
npm ci
# Set STAFF_PASSWORD securely in your shell/secret manager, then:
npm run staff -- you@your-company.example admin
npm start
```

Open `http://localhost:3000`. The server binds `0.0.0.0`. No default account,
password, demo customer, tariff, tax rate, generation factor or subsidy is seeded.
`STAFF_PASSWORD` must contain at least 14 characters; the operator command creates
or rotates an account and invalidates its sessions. Do not put secrets in Git.

This is **not a static site**. GitHub Pages, opening an HTML file, or serving the
repository with a generic static server is not a supported deployment.

## Repository map

| Path | Purpose |
|---|---|
| `public/` | Active frontend, local styles, shared deterministic domain functions |
| `server/index.cjs` | HTTP API, authentication, authorization, sharing and lifecycle |
| `server/db.cjs` | SQLite schema, transactions, audit and password primitives |
| `server/model.cjs` | Strict request schemas and release requirements |
| `scripts/` | Staff provisioning/revocation, encrypted backup/restore, test server |
| `tests/` | Unit, API, recovery and real-browser regression tests |
| `assets/fonts`, `assets/images` | Existing local brand assets; no external CDN |
| `legacy/` | Original five HTML pages, ten JS modules and six CSS files; reference only |
| `docs/` | Audit, operational boundaries, evidence and release requirements |

The server uses an explicit file allowlist. It never serves `legacy/`, the
SQLite database, source server files, credentials, or `.git`. Old HTML URL paths
resolve to the authenticated application shell, not the old localStorage app.

## Verified workflows

- Create/update customers with server IDs and optimistic revision checks.
- Save drafts, reopen, revise, preserve customer and calculation snapshots.
- Validate explicit prices, tax, yield, tariffs, subsidy evidence and payments.
- Store immutable revisions with engine version and SHA-256 digest.
- Release private links, open on another browser, revoke or expire them.
- Record **commercial intent**, with explicit consent against one revision.
- Prevent staff-session acceptance and distinguish staff previews from visits.
- Print readable/selectable A4 PDFs with the same frozen inputs and estimates.
- Export portable JSON; atomically import **new drafts**, never overwrite records.
- Create and restore encrypted full SQLite backups for disaster recovery.

PDF uses the browser's **Print / Save PDF** dialog, not a one-click server PDF
service. Page count follows actual content; the old fixed 11-page brochure is not
retained as the active quotation renderer.

## Tests

```sh
npm test                 # domain, API, persistence, security, recovery
npm run test:browser     # bundled headless Chromium on Linux x64
npm run test:all
npm run format:check

# Standard installed browsers / broader release verification:
npx playwright install --with-deps chromium firefox webkit
BROWSER_MATRIX=full npm run test:browser
```

Tests use synthetic data and temporary databases. Browser artifacts are in
`test-results/` and are ignored by Git. The default test setup extracts a pinned
Chromium binary and its bundled libraries into `/tmp`, avoiding dependence on the
browser download CDN. It does **not** disable browser web security or CSP.

## Important boundaries

- Engineering output is a **preliminary constraint check**, never an approved
  installation design. Unsupported or missing inputs return explicit issues.
- Equipment source notes are staff-supplied. The legacy catalogue's “VERIFIED”
  labels have not been independently substantiated and are not used.
- No automatic legal/tax/subsidy advice. Positive subsidy requires explicit
  residential eligibility evidence; other incentive schemes are unsupported.
- Customer links are bearer credentials. Commercial intent is **not** an
  identity-verified signature. OTP/e-signature remains a separate integration.
- All staff share one company workspace. This is not multi-tenant SaaS.
- Legacy localStorage data is not automatically migrated or erased. Export and
  preserve it before switching. See the report for the migration limitation.
