# Deployment and recovery runbook

## Supported architecture

Single Node 22.22.3 process, one local SQLite database on persistent storage,
same-origin frontend/API behind a TLS reverse proxy. No third-party production
npm packages are required. SQLite uses foreign keys, WAL, transactions and a
5-second busy timeout. The DB directory is created with mode 0700; DB mode 0600.

Do not use an ephemeral filesystem, network-mounted SQLite, multiple application
replicas or multiple tenants. Large workspaces need pagination, load testing and
potential migration to PostgreSQL. Lists are currently loaded in full.

## Production configuration

Required environment:

- `NODE_ENV=production`
- `APP_ORIGIN=https://your-real-domain.example` (exact origin, no trailing slash)
- `DB_PATH=/persistent/private/studio.sqlite`
- `PORT=3000` (or explicitly selected internal port)

Terminate TLS at a maintained reverse proxy; keep the Node port private. Preserve
the browser's `Origin` header. Never log Cookie, X-CSRF-Token, X-Share-Token,
Idempotency-Key or request bodies. Never include link fragments in analytics.
No CORS is enabled. Forwarded IP headers are deliberately not trusted.

Configure proxy body limit 2 MB, request/header timeouts, per-client rate limiting,
connection limits and abuse protection. Application login limits are persistent
and keyed by email hash + socket address; public limits are per socket address.
Behind a proxy the latter is a shared, coarse limit. Do not remove edge limits
or blindly trust user-supplied X-Forwarded-For.

Production refuses to start without an HTTPS origin. It sets HttpOnly/Secure/
SameSite=Strict session cookies, CSP (no inline scripts), HSTS, no-referrer,
no-store on sensitive responses and frame denial. Development alone allows Arena
preview embedding and recognizes an exact e2b.app request host as HTTPS. Development
mode must never be used as the public deployment configuration.

A Dockerfile is provided for the single-instance topology. It was **not built or
run in this sandbox**; validate image availability, runtime permissions and your
persistent volume before deployment. The source is not a deployment by itself.

## Staff lifecycle

Provision/rotate using an operator-controlled environment (not a web signup):

```sh
# STAFF_PASSWORD supplied via secret manager/environment, not shell history.
npm run staff -- employee@company.example staff
npm run staff -- administrator@company.example admin
node scripts/disable-staff.cjs employee@company.example
```

Passwords use salted, versioned scrypt (N=32768, r=8, p=3); comparisons are
constant-time. Sessions expire after 8 hours. Credential rotation and disabling
accounts revoke sessions. Admins can export/import portable data; ordinary staff
cannot. Both roles can work on proposals within the same company.

There is no self-service reset, MFA, SSO or email delivery. Deploy behind an
organization identity-aware access layer or implement/verify MFA before handling
high-value sensitive operations on an unrestricted public staff login.

## Links and acceptance

A release generates 256-bit random bearer material. Only its SHA-256 hash is
stored. The browser URL places it in the fragment; API calls use X-Share-Token.
Links are bound to an immutable revision and expiry. Saving a revision revokes all
prior links; staff can revoke explicitly. Revocation cannot recall a downloaded
PDF or information already read. Never treat an unguessable link as verified
identity.

Acceptance is an idempotent commercial-intent record, including typed name/email,
server time, consent text, revision and digest. Staff sessions cannot accept.
A holder can still act from another browser; no OTP or independent identity proof
exists. Customer fields are self-asserted, not authenticated. Accepted proposals
cannot be edited. Create a new proposal for a new offer. Legal enforceability and
signatory authorization require a separate approved signing process.

A visit is one browser-cookie session per link. Cookies can be cleared, copied or
blocked; bots can visit. These are neither verified people nor proof of reading.

## Backups: two different artifacts

### Portable JSON (admin UI)

Current customer/proposal inputs and original proposal customer snapshots only.
Imports validate shape, numeric constraints, duplicate IDs and relationships before
an atomic additive insert with fresh IDs. They create new drafts, not old acceptances.
Old revision/audit history, staff identities, share tokens and acceptance evidence
are deliberately **not** imported. Reimporting intentionally creates another set;
transport retries with the same Idempotency-Key do not.

Maximum request 2 MB; maximum 1,000 customers and 1,000 proposals per import. Very
large exports must be split/handled operationally, not blindly reimported. Legacy
v1 JSON is rejected rather than silently fabricating missing assumptions.

### Full encrypted database (operator)

```sh
# BACKUP_KEY_HEX: 32 random bytes encoded as 64 hex characters, managed separately.
node scripts/backup.cjs /private-backups/studio-YYYY-MM-DD.enc
node scripts/restore.cjs /private-backups/studio-YYYY-MM-DD.enc /new-volume/restored.sqlite
```

Backup uses SQLite's online backup API, then AES-256-GCM. Backup includes revisions,
acceptances, audit, user credential hashes and sessions. Restore requires a NEW
path, authenticates ciphertext before writing, checks SQLite integrity/foreign
keys and invalidates staff sessions. It never overwrites a live database.

1. Schedule encrypted backups; copy off-host to controlled, versioned storage.
2. Store encryption keys separately with access logs and recovery owners.
3. Stop the app before cutover to a restored DB; retain the pre-restore DB.
4. Validate record counts, latest revisions, acceptance digests and app login.
5. Revoke customer links after compromise or when old backup state might resurrect
   previously revoked links. A restore rolls back state; it cannot know later events.
6. Start against the restored path and run a clean-browser verification.
7. Set recovery point/time objectives and conduct regular restore drills.

Backups are encrypted; the live DB is **not application-encrypted**. Use encrypted
volumes and operating-system access controls. Secure erasure of temporary backup
plaintext on SSDs cannot be guaranteed; use encrypted local storage. Monitoring of
backup failures, disk space and retention is an operational requirement.

## Deployment acceptance checklist (not yet signed off)

- [ ] TLS domain, persistent volume, private backend and reverse proxy configured
- [ ] Staff MFA/identity-aware gate, provisioning and offboarding tested
- [ ] Encrypted off-host backups scheduled; organization restore drill completed
- [ ] Monitoring/alerting for 5xx, disk, backup failure, availability, abuse
- [ ] Browser matrix: Chrome, Firefox, Safari/WebKit; real iOS/Android devices
- [ ] Long-content/multilingual PDF visual review and print-dialog instructions
- [ ] Independent security review and adversarial testing
- [ ] Load/concurrency tests against expected workspace size
- [ ] Supplier datasheets and model variants reviewed by qualified engineer
- [ ] Site yield, temperature, electrical protection and structure reviewed
- [ ] Current GST/subsidy treatment and offer terms approved by appropriate reviewer
- [ ] Commercial-intent vs binding acceptance policy agreed; OTP/e-sign if required
- [ ] Privacy notice, PII retention, deletion process and audit retention approved
- [ ] Existing browser data inventoried and migrated by a reviewed explicit process

## Failure behavior

No localStorage fallback, automatic seeded records or fake successful saves. The
UI preserves unsaved inputs on a failed request. Optimistic conflicts ask staff to
reload rather than overwrite another revision. Transport retries use idempotency
keys for create/update/import. Keys survive only the current page session: after a
crash/reload, inspect server records before resubmitting a new creation.

SQLite/HTTP error details are not returned to customers. Server errors carry a
request ID; connect structured logs to your monitoring system. `/api/health` is a
liveness check, not proof of backup freshness or disk capacity. The audit is
append-only via DB triggers but not externally signed/tamper-proof against a DB
administrator. External audit anchoring is required if that guarantee is needed.
