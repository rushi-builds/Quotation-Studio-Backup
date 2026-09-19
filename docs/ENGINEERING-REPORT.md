# KTM Quotation Studio — engineering audit and implementation report

**Review date:** 19 September 2026

**Baseline:** `0ab38eb41560e0ce8d02d4ede5dce0284463a65d`

**Branch:** `arena/01a0b8f1-quotation-studio-backup`

## Executive decision

**Do not describe the repository as unconditionally production-ready.**

The original static prototype has been replaced as the active application with a
real server-backed, single-company release candidate. Core records, cross-device
sharing, immutable revisions, input validation, replay-safe saves and recovery are
implemented and exercised, not simulated in localStorage.

The evidence supports controlled staging and further product development. Public
production launch still requires deployment/operations, independently approved
solar/tax/source data, broader browser/device verification, privacy policy and
security review. Customer interaction is explicitly **commercial intent**, not an
identity-verified signature. This distinction is visible in the UI and stored in
the consent/audit record.

## 1. Audit scope and method

The baseline contains five HTML entry points, ten application/data/engine JS
modules, six CSS files, local assets, two vendored browser libraries, a README and
one baseline Git commit. No package manifest, test suite, CI, backend, deployment
configuration or server-side authentication existed.

The review covered source/data flows, all entry-point script/style dependencies,
content references, form fields and labels, persistence, calculations, catalogue
claims, lifecycle actions, routing, sharing, PDF rendering, import/export,
responsive breakpoints, external requests and unsafe DOM insertion. Structural
scans included every HTML/JS/CSS file. Domain/storage defects were reproduced with
Node tests; the replacement was exercised in an actual browser and through HTTP.
This is an engineering audit, **not an external penetration test or proof that no
undiscovered defects exist**. Manufacturer PDFs and regulatory facts were not
independently authenticated; no such verification is claimed.

### Original-file disposition

| Files (now under `legacy/`) | Findings / action |
|---|---|
| `index.html`, `assets/js/dashboard.js`, `dashboard.css` | local-only statistics, unsanitized fields, unsafe import path; replaced by authenticated dashboard |
| `customers.html`, `assets/js/customers.js`, `customers.css` | undefined ID overwrite, partial escaping, weak validation; replaced by server UUIDs, schema validation and conflict handling |
| `builder.html`, `assets/js/builder.js`, `builder.css` | missing CONTENT paths, unsaved branding/images, metadata loss, defaults, layout restrictions; replaced by revisioned project editor |
| `proposal.html`, `assets/js/proposal.js`, `proposal.css` | wrong-record fallback, local sharing/acceptance, incorrect contacts, CDN chart, zero fallback; replaced by private revision reader |
| `quotation.html`, `assets/js/app.js`, `app.css` | duplicate calculation engine and unpersisted fixed-page quotation flow; retired from active routing |
| `assets/js/content.js` | unsupported survey, certification, portfolio, bill-saving and tariff-rise assertions; not copied into new offers |
| `assets/js/data/store.js` | localStorage data loss, ID overwrite, shallow merges, unsafe import, auto-seeding, no identity; replaced by transactional SQL |
| `assets/js/data/equipment.js` | “verified” source claims not accompanied by authenticated evidence; quarantined, not silently endorsed |
| `assets/js/engine/financial.js` | auto subsidy, unchecked values, unit error, methodology inconsistency; replaced with explicit shared engine |
| `assets/js/engine/solar.js` | impossible layouts, ignored MPPT/current/temperature constraints; replaced with limited conservative solver |
| `assets/css/design-system.css` | Google Fonts dependency contradicted offline claim; active styles use local fonts |
| vendor html2canvas / jsPDF | inactive and not publicly served; removed from active execution/PDF path |

The original files are preserved rather than destructively rewritten. The active
server has an allowlist; archive/server/database/Git paths return 404. Do not deploy
a generic static file server over the repository.

## 2. Major findings and disposition

| # | Severity / issue | Resolution or explicit boundary |
|---|---|---|
| 1 | Blocker: generated IDs overwritten by `id: undefined` | Server UUIDs; client IDs rejected; transport idempotency |
| 2 | Blocker: builder referenced 17 nonexistent CONTENT paths | Retired broken coupling; active UI does not depend on legacy CONTENT |
| 3 | Blocker: cross-device links lacked proposal data | Server persistence and random private tokens bound to stored revisions |
| 4 | Blocker: unknown proposal silently fell back to another/demo | Exact lookup; invalid/missing links and IDs fail closed |
| 5 | Blocker: no staff identity/access controls | Server sessions, operator provisioning, roles, active checks, CSRF/origin protection |
| 6 | High: localStorage sole database / no recovery | Persistent SQLite, transactions, encrypted full backup/restore tools |
| 7 | High: save overwrote view/acceptance metadata | Separate immutable revisions, acceptance and audit tables |
| 8 | High: multiple tabs/staff could overwrite records | Optimistic revision comparison; 409 instead of lost update |
| 9 | High: network retry could create duplicates | Committed idempotency response stored atomically for create/update/import |
| 10 | High: old links could race a revision save | Revocation with revision transaction; acceptance rechecks live link within transaction |
| 11 | High: local click represented as customer acceptance | Server consent record against exact digest; explicitly not identity-verified |
| 12 | High: staff could accidentally accept customer offer | Authenticated staff sessions denied acceptance; staff preview UI separated |
| 13 | High: export/import overwrote arbitrary local data | Strict schema/relationship/duplicate validation; additive atomic import with fresh IDs |
| 14 | High: HTML/attribute injection via fields/imports | Five-character context escaping, text-only inputs, strict CSP, no arbitrary executable URLs |
| 15 | High: zero tax/escalation/payment replaced by defaults | Null means missing; zero is preserved end-to-end and in PDF |
| 16 | High: auto subsidy applied beyond eligible contexts | No auto subsidy; positive residential amount needs explicit eligibility evidence |
| 17 | High: negative investment possible | Subsidy ≤ gross project cost; finite bounded numeric validation |
| 18 | High: invalid payment totals accepted | Explicit 0–100 entries, total 100% required |
| 19 | High: 3 modules could produce a 20-module string | Divisor-only string search; exact consumption and MPPT allocation |
| 20 | High: no temperature/current/DC-power checks | Explicit coefficients, cell-temperature endpoints, voltage/current/input/DC limits |
| 21 | High: unsupported equipment “verification” | Staff source records; no verified catalogue claim; final engineering remains external |
| 22 | High: financial outputs could change after future engine update | Frozen outputs + engine version inside immutable revision digest |
| 23 | Medium: million kWh labelled one MWh | Correct kWh/MWh/GWh conversions with regression cases |
| 24 | Medium: simple payback described as discounted | Explicit interpolated undiscounted cash flow; IRR root/sign checks; no DCF/NPV claim |
| 25 | Medium: revenue ignored consumption/export/O&M | Explicit blend and O&M; unmodelled financing/replacements/tax benefits disclosed |
| 26 | Medium: staff previews counted as customer activity | Excluded staff sessions; deduplicated browser-session/link visits, honest metric label |
| 27 | Medium: KTM contact actions used customer's phone | Company contact recorded explicitly and displayed separately |
| 28 | Medium: image/text customisation silently lost | Active editor persists its supported fields; legacy upload/brochure editor not offered |
| 29 | Medium: raster PDF fixed-page distortion/clipping risk | Natural A4 print layout with text, inputs, sources, digest and engineering disclosures |
| 30 | Medium: customer PDF button opened staff builder | Customer print action stays in customer view; no staff editor dependency |
| 31 | Medium: inaccessible narrow-screen tables | Keyboard-focusable uniquely named scroll regions; tested mobile overflow and axe |
| 32 | Medium: Google Fonts / Chart CDN dependencies | No external frontend requests in the active application |
| 33 | Medium: no meaningful error/conflict handling | Visible validation, no success on failure, preserved form inputs, generic server errors/request IDs |
| 34 | Medium: no tests or CI | Unit/API/recovery/browser/PDF/security tests and CI matrix added |
| 35 | Medium: documentation contradicted actual product | README rewritten; architecture, operations, limitations and migration impact documented |
| 36 | Medium: retained accepted offers could be edited | Locked proposal after intent record; database triggers protect immutable tables |
| 37 | Medium: portable import could silently change customer snapshot | Original snapshot explicitly exported/restored; directory changes remain separate |
| 38 | Medium: same ID/version used ambiguously | UUID stable identity; explicit monotonic revisions; derived lifecycle status |

## 3. Product and architecture changes

The system is now deliberately **server-dependent**, not deceptively offline. It
has a multi-staff single-company workspace, customer directory, proposal editor,
read-only revision preview, private customer view, audit/history and administrative
portable import/export.

The new visual system is light with deep green/gold accents, local Inter fonts,
responsive cards, explicit missing-data panels, consistent controls and visible
source/methodology sections. No fake stats, certification labels or project facts
are seeded to make it look complete.

### Deliberately removed/deferred product features

These are real scope changes, not hidden fixes:

- The fixed 11-page marketing brochure, arbitrary per-page text editor and local
  image/logo uploads are **not** active v2 features. They need a reviewed content
  model and private object storage before reintroduction.
- The unverified equipment dropdown catalogue is replaced by manual sourced inputs.
- No browser-only “sent/viewed/accepted” status editor. Status comes from actual
  server records; visits are not automatically treated as a customer identity.
- No localStorage offline editing, automatic legacy import, email delivery,
  identity-verified signing, MFA/SSO or password-reset UI.
- This is one company workspace, not tenant-isolated SaaS, a full CRM or final
  engineering CAD/design software.

### Legacy data migration

No existing browser records were deleted or imported. v1 backups are explicitly
rejected: old records can have missing IDs, incomplete assumptions and unreliable
acceptance/status metadata. A reviewed migration must reconcile IDs, map fields,
preserve originals and identify missing inputs. Inventing defaults to force those
records into the new schema would violate the no-guessing requirement.

## 4. Verification results

### Automated tests run in this workspace

`npm run test:all`:

- **39 Node tests passed; 0 failed, 0 skipped.** Domain, HTTP/API, persistence,
  roles/auth, CSRF/origin, numeric validation, unit conversions, string constraints,
  immutable outputs, import atomicity, replay-safe revision saves, password hashing,
  schema downgrade prevention, encrypted recovery and tamper rejection.
- **5 Chromium browser tests passed; 0 failed.** Full lifecycle; mobile/a11y;
  hostile field text + invalid link; UI JSON export/import; lost save acknowledgement.
- `npm run format:check`: passed.
- `npm audit`: no reported package vulnerabilities at the time of this run.
  This is not a security certification, and does not audit Node/OS/image assets.

The supported electrical sweep exercises counts 1–199 and verifies each returned
configuration consumes exactly the available modules and satisfies its supplied
voltage/current/input constraints. It does not certify every real-world topology.

### End-to-end workflow actually exercised

1. Sign in as a provisioned test staff account.
2. Create a customer through the UI.
3. Enter explicit project/financial values, including zero GST/escalation/advance.
4. Save to server; reload; assert zero values survive.
5. Edit and save revision 2; preview its frozen data.
6. Generate an A4 PDF using real Chromium printing and parse its contents.
7. Create a private link and open it in a **new browser context without staff cookies**.
8. Verify the correct proposal, mobile layout and no staff edit link.
9. Enter typed name/email and explicit consent; submit customer interaction.
10. Reload the customer view and verify the recorded result.
11. Reload staff editor; verify lock and `commercial-intent-recorded` audit event.

A separate real-browser test lets the server **commit a save**, then deliberately
aborts the response. The UI reports an unconfirmed save without clearing the form.
Retry returns the original revision-2 result; it does not create revision 3.

### PDF verification

- Generated by Chromium, not a mocked file or raster screenshot.
- Parsed every page with PDF.js; asserted A4 dimensions and text bounding limits.
- Checked customer offer title, commercial exclusions, Indian-format amounts,
  explicit engineering-unavailable warning, temperature input labels and digest label.
- Rendered the first PDF page to PNG and visually inspected it.
- PDF content is selectable text, not stretched page screenshots.
- Page count is content-dependent. The fixed 11-page marketing design is retired.
- Not certified PDF/A, digitally signed or manually reviewed for every font,
  language, extreme input length, browser printer option or physical printer.

### Browser / accessibility evidence

Chromium 153 headless was run with normal web security and the application's CSP.
Desktop and 390×844 mobile viewport workflows were exercised. Axe reported zero
violations on the tested dashboard/editor/customer proposal states. Horizontal
page overflow was checked. This does not replace screen-reader or physical-device
usability testing.

**Firefox and WebKit have not been executed in this sandbox.** Their normal binary
CDNs, and Debian package endpoints, were unreachable. An npm-packaged Chromium and
bundled libraries enabled actual Chromium tests. The committed CI configuration
runs Chromium/Firefox/WebKit where downloads are available; that GitHub CI job has
not been run or claimed green here.

### Test corrections and failures retained as learning

- Initial browser launches failed due unavailable downloads, then missing NSS/NSPR
  libraries. Bundled libraries resolved the environment problem.
- An initial PDF test expected Western grouping `250,000` and capitalized
  `Required`. The actual INR contract correctly produced `2,50,000`, and the actual
  warning is `Engineering review required`. Assertions were corrected to those
  exact intended outputs after inspecting the extracted PDF text.
- PDF.js cleanup used a nonexistent document method; corrected to the loading task.
- Mobile axe found a real non-focusable table region. Added keyboard focus; a second
  axe run caught duplicate region names. Added descriptive unique names. No axe
  rules were disabled and no failing tests were skipped.

## 5. Security assessment

Implemented protections include versioned salted scrypt, constant-time verification,
hashed session and share tokens, explicit HTTPS-production origin requirement,
CSRF + SameSite, fixed session lifetime, login throttling, account revocation,
strict JSON shape/size checks, prepared SQL, transaction-safe mutations, optimistic
concurrency, idempotent replay, output escaping, local assets, no inline script
policy, private static allowlist and immutable-record triggers.

Remaining security boundaries:

- A bearer link holder is not an authenticated person; typed identity can be false.
- No MFA/SSO, OTP/e-sign provider or self-service recovery.
- Audit digest/DB triggers are not tamper-proof against a database administrator.
- Live data needs encrypted volumes and secured, monitored infrastructure.
- Proxy-aware distributed rate limiting and DDoS defense belong at the edge.
- PII retention/deletion policy, privacy notice and independent penetration testing
  are not supplied by passing application tests.
- Staff roles share one company workspace; there is no tenant/RBAC-per-customer model.

## 6. Production infrastructure and external approvals still required

Use the actionable checklist in [OPERATIONS.md](OPERATIONS.md). In particular:

1. Provision TLS hosting, persistent local storage, secrets, operator accounts,
   protected staff access and tested deployment configuration.
2. Schedule encrypted off-host backups and test recovery under your organization.
3. Set availability/error/disk/backup/security monitoring and incident ownership.
4. Independently approve manufacturer datasheets, exact equipment variants, site
   inputs, electrical/structural design, yield model, tax/subsidy policy and offer terms.
5. Decide whether intent records suffice; integrate and verify a proper identity/
   signing provider if legally binding customer acceptance is required.
6. Complete Firefox/WebKit and real-device checks, long/multilingual PDF review,
   load testing, independent security assessment and privacy/retention review.
7. Review existing localStorage exports and implement a non-fabricating migration.

The Dockerfile and CI definition are configuration artifacts, **not evidence of
successful deployment, image build or GitHub check execution**. Node SQLite remains
experimental on the pinned runtime. No high-availability or large-scale performance
claim is made; staff lists currently load in full.

## 7. Git and handoff

All work stays on `arena/01a0b8f1-quotation-studio-backup`. The original implementation
is retained in `legacy/`. A local implementation commit is supplied in the final
handoff message; obtain its exact value with `git rev-parse HEAD`. No production
push, deployment, or pull request is implied. No secrets/customer datasets are
committed. Small synthetic screenshots are included as review evidence; runtime
DBs, browser traces, dependencies and generated test PDFs are ignored.

## Final readiness statement

**Implemented and verified:** the core server-backed quotation workflow, explicit
calculation contract, durable revision state, cross-browser-context sharing,
commercial-intent recording, recovery primitives and a responsive customer UI.

**Not signed off for unrestricted production:** identity-verified acceptance,
final engineering/regulatory correctness, migrated legacy data, broad browser/device
compatibility, operational deployment, capacity/security certification and legal/
privacy approval. The responsible next step is controlled staging plus completion
of these gates—not a “done” label based solely on passing tests.

### Saved review evidence

All pictured values are synthetic test fixtures, not real customer project data.

- [Desktop proposal](evidence/desktop-proposal.png)
- [Mobile customer proposal](evidence/mobile-customer.png)
- [Mobile dashboard](evidence/mobile-dashboard.png)
- [Rendered first PDF page](evidence/pdf-first-page.png)
- [Complete local test-run output](evidence/test-run.txt)

### Merge follow-up

The first remote full-browser CI run passed installation, formatting and Node tests,
but failed browser verification. Remote artifact/log downloads were inaccessible
from this sandbox. Inspection identified that the combined 15-test browser run
reused one account/database while login throttling permits 10 attempts per email
per window. CI now runs each browser in its own job/database (five sign-ins each),
without changing production throttling or weakening assertions. GitHub annotations
were enabled so any remaining browser failures are inspectable directly.
