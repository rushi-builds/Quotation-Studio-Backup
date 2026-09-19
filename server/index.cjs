"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const {
    openDB,
    now,
    id,
    hash,
    transaction,
    audit,
    passwordVerify,
  } = require("./db.cjs"),
  M = require("./model.cjs"),
  D = require("../public/domain.js");
const root = path.resolve(__dirname, "..");
function freezeEstimates(p) {
  p.estimates = {
    engineVersion: D.version,
    financial: D.compute(p.finance),
    design: D.design(p.engineering),
  };
  return p;
}
const CONSENT =
  "I have reviewed this exact proposal revision, its scope, exclusions, estimates and assumptions. I record my commercial intent to proceed. This is not an identity-verified electronic signature or engineering installation approval.";
function createApp({
  dbPath = process.env.DB_PATH || path.join(root, ".runtime/studio.sqlite"),
  production = process.env.NODE_ENV === "production",
  origin = process.env.APP_ORIGIN,
} = {}) {
  if (production && (!origin || !origin.startsWith("https://")))
    throw Error("Production requires an explicit HTTPS APP_ORIGIN");
  if (origin && new URL(origin).origin !== origin)
    throw Error(
      "APP_ORIGIN must be an exact origin without path or trailing slash",
    );
  const db = openDB(dbPath),
    secure = production || origin?.startsWith("https://");
  const cookie = (name, value, age) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
  const parseCookies = (req) =>
    Object.fromEntries(
      (req.headers.cookie || "").split(";").map((s) => s.trim().split("=")),
    );
  const record = (table, idValue) =>
    db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(idValue);
  function rate(key, max, seconds) {
    const t = Date.now();
    db.prepare("DELETE FROM limits WHERE expires<?").run(t);
    let row = db.prepare("SELECT * FROM limits WHERE key=?").get(key);
    if (row && row.count >= max)
      M.fail("Too many requests. Try again later.", 429);
    db.prepare(
      "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
    ).run(key, t + seconds * 1000);
  }
  function staff(req) {
    const raw = parseCookies(req).session;
    if (!raw) M.fail("Sign in required", 401);
    const row = db
      .prepare(
        "SELECT u.id,u.email,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.active=1",
      )
      .get(hash(raw), Date.now());
    if (!row) M.fail("Session expired. Sign in again.", 401);
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== row.csrf
    )
      M.fail("Invalid CSRF token", 403);
    req.actor = row.id;
    return row;
  }
  function publicStaffSession(req) {
    const session = parseCookies(req).session;
    return Boolean(
      session &&
      db
        .prepare(
          "SELECT s.hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.active=1",
        )
        .get(hash(session), Date.now()),
    );
  }
  function remember(req, data, status) {
    if (req.idempotency) {
      const i = req.idempotency;
      db.prepare("INSERT INTO idempotency VALUES(?,?,?,?,?,?)").run(
        req.actor,
        req.url,
        i.key,
        i.digest,
        JSON.stringify(data),
        status,
      );
    }
  }
  function getProposal(pid) {
    const row = db
      .prepare(
        "SELECT p.*,r.data,r.digest FROM proposals p JOIN revisions r ON r.proposal_id=p.id AND r.revision=p.revision WHERE p.id=?",
      )
      .get(pid);
    if (!row) M.fail("Proposal not found", 404);
    const accepted = db
      .prepare(
        "SELECT revision,name,email,created,digest FROM acceptances WHERE proposal_id=?",
      )
      .get(pid);
    const views = db
      .prepare(
        "SELECT COUNT(*) n FROM views v JOIN shares s ON v.share_hash=s.hash WHERE s.proposal_id=?",
      )
      .get(pid).n;
    return {
      ...JSON.parse(row.data),
      id: row.id,
      revision: row.revision,
      digest: row.digest,
      created: row.created,
      updated: row.updated,
      acceptance: accepted || null,
      status: accepted
        ? "intent-recorded"
        : db
              .prepare(
                "SELECT 1 FROM shares WHERE proposal_id=? AND revision=? AND revoked=0 AND expires>?",
              )
              .get(pid, row.revision, Date.now())
          ? "released"
          : db
                .prepare(
                  "SELECT 1 FROM shares WHERE proposal_id=? AND revision=? AND revoked=0 AND expires<=?",
                )
                .get(pid, row.revision, Date.now())
            ? "expired"
            : "draft",
      views,
    };
  }
  function publicShare(req) {
    const token = req.headers["x-share-token"];
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      M.fail("This link is invalid or unavailable", 404);
    const s = db
      .prepare("SELECT * FROM shares WHERE hash=? AND revoked=0 AND expires>?")
      .get(hash(token), Date.now());
    if (!s) M.fail("This link has expired or been revoked", 404);
    const row = db
      .prepare(
        "SELECT data,digest FROM revisions WHERE proposal_id=? AND revision=?",
      )
      .get(s.proposal_id, s.revision);
    return {
      share: s,
      proposal: {
        ...JSON.parse(row.data),
        id: s.proposal_id,
        revision: s.revision,
        digest: row.digest,
      },
    };
  }
  async function body(req) {
    if (!String(req.headers["content-type"]).startsWith("application/json"))
      M.fail("JSON content type required", 415);
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) M.fail("Request exceeds 2 MB", 413);
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString());
      M.keys(value, Object.keys(value));
      if (
        ((req.method === "POST" &&
          ["/api/customers", "/api/proposals", "/api/import"].includes(
            req.url,
          )) ||
          (req.method === "PUT" &&
            /^\/api\/(customers|proposals)\/[\w-]+$/.test(req.url))) &&
        req.headers["idempotency-key"]
      ) {
        const key = req.headers["idempotency-key"];
        if (!/^[a-zA-Z0-9-]{16,100}$/.test(key))
          M.fail("Invalid idempotency key", 400);
        const digest = hash(JSON.stringify(value)),
          cached = db
            .prepare(
              "SELECT * FROM idempotency WHERE user_id=? AND route=? AND key=?",
            )
            .get(req.actor, req.url, key);
        if (cached) {
          if (cached.digest !== digest)
            M.fail("Idempotency key reused for different input", 409);
          const e = Error("Cached response");
          e.cached = cached;
          throw e;
        }
        req.idempotency = { key, digest };
      }
      return value;
    } catch (e) {
      if (e.status || e.cached) throw e;
      M.fail("Malformed JSON", 400);
    }
  }
  function json(res, data, status = 200) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data));
  }
  const server = http.createServer(async (req, res) => {
    const requestId = id();
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (production) res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors ${production ? "'none'" : "'self' https://arena.ai https://*.arena.ai https://*.e2b.app"}; form-action 'self'`,
    );
    if (production)
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    try {
      const url = new URL(req.url, "http://internal"),
        p = url.pathname,
        method = req.method;
      if (!["GET", "HEAD", "POST", "PUT", "DELETE"].includes(method))
        M.fail("Method not allowed", 405);
      if (!["GET", "HEAD"].includes(method)) {
        const preview =
          !production &&
          /^[a-zA-Z0-9-]+\.e2b\.app$/.test(req.headers.host || "");
        const expected =
          origin || `${preview ? "https" : "http"}://${req.headers.host}`;
        // Sandbox HTTPS proxy is supported explicitly via APP_ORIGIN, never a trusted forwarded header.
        if (req.headers.origin !== expected) M.fail("Origin not allowed", 403);
      }
      if (p === "/api/health" && method === "GET")
        return json(res, { ok: true });
      if (p === "/api/login" && method === "POST") {
        rate("login-ip:" + req.socket.remoteAddress, 30, 900);
        const b = await body(req);
        M.keys(b, ["email", "password"]);
        const email = M.text(b.email, "Email", 200, true).toLowerCase();
        rate("login-email:" + hash(email), 10, 900);
        const user = db
          .prepare("SELECT * FROM users WHERE email=? AND active=1")
          .get(email);
        M.text(b.password, "Password", 1024, true);
        const valid = await passwordVerify(b.password, user?.password);
        if (!user || !valid) M.fail("Invalid email or password", 401);
        const token = crypto.randomBytes(32).toString("hex"),
          csrf = crypto.randomBytes(32).toString("hex");
        db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
        db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
          hash(token),
          user.id,
          csrf,
          Date.now() + 8 * 3600000,
        );
        audit(db, user.id, "login", user.id);
        res.setHeader("Set-Cookie", cookie("session", token, 28800));
        return json(res, { email: user.email, role: user.role, csrf });
      }
      if (p.startsWith("/api/public/")) {
        rate("public:" + req.socket.remoteAddress, 300, 60);
        const { share, proposal } = publicShare(req);
        if (p === "/api/public/proposal" && method === "GET")
          return json(res, {
            proposal,
            financial: proposal.estimates.financial,
            design: proposal.estimates.design,
            consent: CONSENT,
            staffPreview: publicStaffSession(req),
            acceptance:
              db
                .prepare(
                  "SELECT created,revision FROM acceptances WHERE proposal_id=?",
                )
                .get(proposal.id) || null,
          });
        if (p === "/api/public/view" && method === "POST") {
          // Staff previews never inflate customer metrics; anonymous sessions are not verified humans.
          const session = parseCookies(req).session;
          if (
            session &&
            db
              .prepare("SELECT hash FROM sessions WHERE hash=? AND expires>?")
              .get(hash(session), Date.now())
          )
            return json(res, { recorded: false });
          let visitor = parseCookies(req).visitor;
          if (!/^[a-f0-9]{64}$/.test(visitor || "")) {
            visitor = crypto.randomBytes(32).toString("hex");
            res.setHeader("Set-Cookie", cookie("visitor", visitor, 86400 * 30));
          }
          db.prepare("INSERT OR IGNORE INTO views VALUES(?,?,?)").run(
            share.hash,
            hash(visitor),
            now(),
          );
          return json(res, { recorded: true });
        }
        if (p === "/api/public/accept" && method === "POST") {
          if (publicStaffSession(req))
            M.fail("Staff sessions cannot record customer intent", 403);
          const b = await body(req);
          M.keys(b, ["name", "email", "consent", "digest"]);
          if (b.consent !== true || b.digest !== proposal.digest)
            M.fail("Explicit consent to the exact revision is required", 409);
          const name = M.text(b.name, "Full name", 200, true),
            email = M.text(b.email, "Email", 200, true);
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            M.fail("Valid email required");
          const result = transaction(db, () => {
            const live = publicShare(req);
            if (live.proposal.digest !== b.digest)
              M.fail("Revision changed", 409);
            const existing = db
              .prepare(
                "SELECT created,revision FROM acceptances WHERE proposal_id=?",
              )
              .get(proposal.id);
            if (existing) return existing;
            const created = now();
            db.prepare("INSERT INTO acceptances VALUES(?,?,?,?,?,?,?,?)").run(
              proposal.id,
              proposal.revision,
              share.hash,
              name,
              email,
              CONSENT,
              proposal.digest,
              created,
            );
            audit(
              db,
              "bearer-link",
              "commercial-intent-recorded",
              proposal.id,
              {
                revision: proposal.revision,
                digest: proposal.digest,
                identityVerified: false,
              },
            );
            return { created, revision: proposal.revision };
          });
          return json(res, result);
        }
        M.fail("Not found", 404);
      }
      if (p.startsWith("/api/")) {
        const user = staff(req);
        if (p === "/api/me" && method === "GET") return json(res, user);
        if (p === "/api/logout" && method === "POST") {
          db.prepare("DELETE FROM sessions WHERE hash=?").run(
            hash(parseCookies(req).session),
          );
          res.setHeader("Set-Cookie", cookie("session", "", 0));
          return json(res, { ok: true });
        }
        if (p === "/api/customers" && method === "GET")
          return json(
            res,
            db
              .prepare("SELECT * FROM customers ORDER BY updated DESC")
              .all()
              .map((r) => ({
                ...JSON.parse(r.data),
                id: r.id,
                revision: r.revision,
              })),
          );
        if (p === "/api/customers" && method === "POST") {
          const data = M.customer(await body(req)),
            cid = id(),
            t = now();
          transaction(db, () => {
            db.prepare("INSERT INTO customers VALUES(?,1,?,?,?)").run(
              cid,
              JSON.stringify(data),
              t,
              t,
            );
            audit(db, user.id, "customer-created", cid);
            remember(req, { ...data, id: cid, revision: 1 }, 201);
          });
          return json(res, { ...data, id: cid, revision: 1 }, 201);
        }
        const cm = p.match(/^\/api\/customers\/([\w-]+)$/);
        if (cm && method === "PUT") {
          const b = await body(req);
          M.keys(b, ["revision", "data"]);
          const data = M.customer(b.data);
          transaction(db, () => {
            const r = record("customers", cm[1]);
            if (!r) M.fail("Customer not found", 404);
            if (b.revision !== r.revision)
              M.fail("Customer changed. Reload before saving.", 409);
            db.prepare(
              "UPDATE customers SET revision=revision+1,data=?,updated=? WHERE id=?",
            ).run(JSON.stringify(data), now(), cm[1]);
            audit(db, user.id, "customer-updated", cm[1], {
              revision: r.revision + 1,
            });
            remember(
              req,
              { ...data, id: cm[1], revision: r.revision + 1 },
              200,
            );
          });
          return json(res, { ...data, id: cm[1], revision: b.revision + 1 });
        }
        if (p === "/api/proposals" && method === "GET")
          return json(
            res,
            db
              .prepare("SELECT id FROM proposals ORDER BY updated DESC")
              .all()
              .map((r) => getProposal(r.id)),
          );
        if (p === "/api/proposals" && method === "POST") {
          const data = M.proposal(await body(req));
          const c = record("customers", data.customerId);
          if (!c) M.fail("Select an existing customer");
          data.customer = JSON.parse(c.data);
          data.finance.customerType = data.customer.type;
          const errors = D.validateFinance(data.finance);
          if (errors.length) M.fail(errors.join("; "));
          freezeEstimates(data);
          const pid = id(),
            t = now(),
            serialized = JSON.stringify(data);
          transaction(db, () => {
            db.prepare("INSERT INTO proposals VALUES(?,1,?,?,?)").run(
              pid,
              data.customerId,
              t,
              t,
            );
            db.prepare("INSERT INTO revisions VALUES(?,1,?,?,?,?)").run(
              pid,
              serialized,
              hash(serialized),
              user.id,
              t,
            );
            audit(db, user.id, "proposal-created", pid, { revision: 1 });
            remember(req, getProposal(pid), 201);
          });
          return json(res, getProposal(pid), 201);
        }
        const pm = p.match(
          /^\/api\/proposals\/([\w-]+)(?:\/(share|revoke|history))?$/,
        );
        if (pm) {
          const pid = pm[1],
            action = pm[2],
            current = getProposal(pid);
          if (!action && method === "GET") return json(res, current);
          if (!action && method === "PUT") {
            const b = await body(req);
            M.keys(b, ["revision", "data"]);
            const data = M.proposal(b.data);
            const c = record("customers", data.customerId);
            if (!c) M.fail("Customer not found");
            data.customer = JSON.parse(c.data);
            data.finance.customerType = data.customer.type;
            const errors = D.validateFinance(data.finance);
            if (errors.length) M.fail(errors.join("; "));
            transaction(db, () => {
              const latest = getProposal(pid);
              if (latest.acceptance)
                M.fail(
                  "Accepted proposals are immutable. Create a new proposal for a new offer.",
                  409,
                );
              if (latest.revision !== b.revision)
                M.fail(
                  "Proposal changed. Reload before saving to avoid overwriting another staff member.",
                  409,
                );
              freezeEstimates(data);
              const n = latest.revision + 1,
                t = now(),
                serialized = JSON.stringify(data);
              db.prepare(
                "UPDATE proposals SET revision=?,customer_id=?,updated=? WHERE id=?",
              ).run(n, data.customerId, t, pid);
              db.prepare("INSERT INTO revisions VALUES(?,?,?,?,?,?)").run(
                pid,
                n,
                serialized,
                hash(serialized),
                user.id,
                t,
              );
              db.prepare("UPDATE shares SET revoked=1 WHERE proposal_id=?").run(
                pid,
              );
              audit(db, user.id, "proposal-revised", pid, { revision: n });
              remember(req, getProposal(pid), 200);
            });
            return json(res, getProposal(pid));
          }
          if (action === "history" && method === "GET")
            return json(res, {
              revisions: db
                .prepare(
                  "SELECT revision,digest,created,author FROM revisions WHERE proposal_id=? ORDER BY revision",
                )
                .all(pid),
              events: db
                .prepare(
                  "SELECT event,detail,created,actor FROM audit WHERE entity=? ORDER BY id",
                )
                .all(pid),
            });
          if (action === "share" && method === "POST") {
            const b = await body(req);
            M.keys(b, ["revision"]);
            const latest = getProposal(pid);
            if (b.revision !== latest.revision)
              M.fail("Save/reload the latest revision before sharing", 409);
            if (latest.acceptance) M.fail("Proposal already accepted", 409);
            const errors = M.shareErrors(latest);
            if (errors.length) M.fail(errors.join("; "));
            const token = crypto.randomBytes(32).toString("hex"),
              expires = Date.parse(latest.validUntil + "T23:59:59Z");
            transaction(db, () => {
              db.prepare("INSERT INTO shares VALUES(?,?,?,?,0,?)").run(
                hash(token),
                pid,
                latest.revision,
                expires,
                now(),
              );
              audit(db, user.id, "share-created", pid, {
                revision: latest.revision,
                expires,
              });
            });
            return json(res, { path: "/proposal#" + token, expires }, 201);
          }
          if (action === "revoke" && method === "POST") {
            transaction(db, () => {
              db.prepare("UPDATE shares SET revoked=1 WHERE proposal_id=?").run(
                pid,
              );
              audit(db, user.id, "shares-revoked", pid);
            });
            return json(res, { ok: true });
          }
        }
        if (p === "/api/export" && method === "GET") {
          if (user.role !== "admin") M.fail("Administrator required", 403);
          const data = {
            format: "ktm-portable",
            version: 2,
            exportedAt: now(),
            customers: db
              .prepare("SELECT id,data FROM customers")
              .all()
              .map((r) => ({ id: r.id, data: JSON.parse(r.data) })),
            proposals: db
              .prepare("SELECT id FROM proposals")
              .all()
              .map((r) => {
                const p = getProposal(r.id);
                const {
                  customer,
                  id,
                  revision,
                  digest,
                  created,
                  updated,
                  acceptance,
                  views,
                  status,
                  estimates,
                  ...data
                } = p;
                return { id, data, customerSnapshot: customer };
              }),
          };
          audit(db, user.id, "portable-export", "workspace");
          return json(res, data);
        }
        if (p === "/api/import" && method === "POST") {
          if (user.role !== "admin") M.fail("Administrator required", 403);
          const b = await body(req);
          M.keys(b, [
            "format",
            "version",
            "exportedAt",
            "customers",
            "proposals",
          ]);
          if (
            b.format !== "ktm-portable" ||
            b.version !== 2 ||
            !Array.isArray(b.customers) ||
            !Array.isArray(b.proposals) ||
            b.customers.length > 1000 ||
            b.proposals.length > 1000
          )
            M.fail(
              "Invalid portable import. Maximum 1,000 customers and proposals. Legacy backups require explicit migration.",
            );
          const seen = new Set(),
            customers = b.customers.map((r) => {
              M.keys(r, ["id", "data"]);
              const oldId = M.text(r.id, "Import ID", 100, true);
              if (seen.has(oldId)) M.fail("Duplicate customer ID in import");
              seen.add(oldId);
              return { oldId, id: id(), data: M.customer(r.data) };
            });
          const mapping = new Map(customers.map((c) => [c.oldId, c]));
          seen.clear();
          const proposals = b.proposals.map((r) => {
            M.keys(r, ["id", "data", "customerSnapshot"]);
            const oldId = M.text(r.id, "Import ID", 100, true);
            if (seen.has(oldId)) M.fail("Duplicate proposal ID in import");
            seen.add(oldId);
            const data = M.proposal(r.data),
              c = mapping.get(data.customerId);
            if (!c) M.fail("Broken customer relationship in import");
            data.customerId = c.id;
            data.customer = r.customerSnapshot
              ? M.customer(r.customerSnapshot)
              : c.data;
            data.finance.customerType = data.customer.type;
            const errors = D.validateFinance(data.finance);
            if (errors.length) M.fail(errors.join("; "));
            freezeEstimates(data);
            return { id: id(), data };
          });
          transaction(db, () => {
            const t = now();
            for (const c of customers)
              db.prepare("INSERT INTO customers VALUES(?,1,?,?,?)").run(
                c.id,
                JSON.stringify(c.data),
                t,
                t,
              );
            for (const p of proposals) {
              db.prepare("INSERT INTO proposals VALUES(?,1,?,?,?)").run(
                p.id,
                p.data.customerId,
                t,
                t,
              );
              const s = JSON.stringify(p.data);
              db.prepare("INSERT INTO revisions VALUES(?,1,?,?,?,?)").run(
                p.id,
                s,
                hash(s),
                user.id,
                t,
              );
            }
            audit(db, user.id, "portable-import", "workspace", {
              customers: customers.length,
              proposals: proposals.length,
            });
            remember(
              req,
              { customers: customers.length, proposals: proposals.length },
              200,
            );
          });
          return json(res, {
            customers: customers.length,
            proposals: proposals.length,
          });
        }
        M.fail("Not found", 404);
      }
      if (method !== "GET" && method !== "HEAD")
        M.fail("Method not allowed", 405);
      const routes = [
        "/",
        "/customers",
        "/builder",
        "/proposal",
        "/index.html",
        "/customers.html",
        "/builder.html",
        "/proposal.html",
        "/quotation.html",
      ];
      let file;
      if (routes.includes(p)) file = path.join(root, "public/index.html");
      else if (["/app.js", "/domain.js", "/styles.css"].includes(p))
        file = path.join(root, "public", p);
      else if (/^\/assets\/(fonts|images)\/[a-zA-Z0-9_.-]+$/.test(p))
        file = path.join(root, p);
      else M.fail("Not found", 404);
      if (!fs.existsSync(file)) M.fail("Not found", 404);
      const type =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".woff2": "font/woff2",
        }[path.extname(file)] || "application/octet-stream";
      res.setHeader("Content-Type", type);
      if (p.startsWith("/assets/fonts/"))
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      if (p.startsWith("/assets/images/"))
        res.setHeader("Cache-Control", "public, max-age=3600");
      if (method === "HEAD") return res.end();
      fs.createReadStream(file)
        .on("error", () => res.destroy())
        .pipe(res);
    } catch (e) {
      if (e.cached)
        return json(res, JSON.parse(e.cached.response), e.cached.status);
      if (res.headersSent) return res.destroy();
      if (!e.status)
        console.error(JSON.stringify({ requestId, error: e.message }));
      json(
        res,
        {
          error: e.status
            ? e.message
            : "An unexpected error occurred. Your operation was not confirmed.",
          requestId,
        },
        e.status || 500,
      );
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    db,
    close: () =>
      new Promise((resolve) =>
        server.close(() => {
          db.close();
          resolve();
        }),
      ),
  };
}
if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  app.server.listen(port, "0.0.0.0", () =>
    console.log(`KTM Studio listening on ${port}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => app.close().then(() => process.exit(0)));
}
module.exports = { createApp, CONSENT };
