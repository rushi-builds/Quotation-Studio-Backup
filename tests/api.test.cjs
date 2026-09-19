const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createApp, CONSENT } = require("../server/index.cjs"),
  { id, passwordHash } = require("../server/db.cjs"),
  { customer, proposal } = require("./fixtures.cjs");
let app, base, cookie, csrf, dir;
const adminId = id();
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ktm-test-"));
  app = createApp({ dbPath: path.join(dir, "test.sqlite") });
  app.db
    .prepare("INSERT INTO users VALUES(?,?,?,?,1)")
    .run(
      adminId,
      "admin@example.test",
      passwordHash("long-test-password-only"),
      "admin",
    );
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + app.server.address().port;
  const r = await fetch(base + "/api/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.test",
      password: "long-test-password-only",
    }),
  });
  cookie = r.headers.get("set-cookie").split(";")[0];
  csrf = (await r.json()).csrf;
});
after(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function req(route, method = "GET", data, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    Origin: base,
    ...(!options.public ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
    ...options.headers,
  };
  const r = await fetch(base + route, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: r.status, data: await r.json(), headers: r.headers };
}
async function make() {
  const c = await req("/api/customers", "POST", customer);
  assert.equal(c.status, 201);
  const p = await req("/api/proposals", "POST", proposal(c.data.id));
  assert.equal(p.status, 201);
  return { c: c.data, p: p.data };
}
test("auth, CSRF, origin, roles, strict serving and security headers", async () => {
  assert.equal(
    (await req("/api/customers", "GET", undefined, { public: true })).status,
    401,
  );
  assert.equal(
    (
      await req("/api/customers", "POST", customer, {
        headers: { "X-CSRF-Token": "bad" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req("/api/customers", "POST", customer, {
        headers: { Origin: "https://evil.test" },
      })
    ).status,
    403,
  );
  for (const p of [
    "/legacy/builder.html",
    "/legacy/assets/js/app.js",
    "/.git/config",
    "/.runtime/studio.sqlite",
    "/server/index.cjs",
  ])
    assert.equal((await fetch(base + p)).status, 404);
  const r = await fetch(base + "/");
  assert.ok(
    r.headers.get("content-security-policy").includes("object-src 'none'"),
  );
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.ok(r.headers.get("content-type").includes("text/html"));
});
test("full create-save-reopen-revise-export-share-clean-client-accept lifecycle", async () => {
  const { p, c } = await make();
  assert.match(p.id, /^[\da-f-]{36}$/);
  assert.equal(p.customerId, c.id);
  const saved = await req("/api/proposals/" + p.id);
  assert.equal(saved.data.finance.payAdvance, 0);
  const data = { ...proposal(c.id), title: "Revised offer" };
  const edit = await req("/api/proposals/" + p.id, "PUT", {
    revision: 1,
    data,
  });
  assert.equal(edit.data.revision, 2);
  assert.equal(
    (await req("/api/proposals/" + p.id + "/history")).data.revisions.length,
    2,
  );
  const ex = await req("/api/export");
  assert.ok(ex.data.proposals.some((x) => x.id === p.id));
  const share = await req("/api/proposals/" + p.id + "/share", "POST", {
    revision: 2,
  });
  assert.equal(share.status, 201);
  const token = share.data.path.split("#")[1],
    options = { public: true, headers: { "X-Share-Token": token } };
  const publicP = await req("/api/public/proposal", "GET", undefined, options);
  assert.equal(publicP.data.proposal.title, "Revised offer");
  assert.equal(publicP.data.proposal.revision, 2);
  assert.equal(publicP.data.financial.gstAmount, 0);
  const view = await req("/api/public/view", "POST", {}, options);
  const visitor = view.headers.get("set-cookie").split(";")[0];
  await req(
    "/api/public/view",
    "POST",
    {},
    { ...options, headers: { ...options.headers, Cookie: visitor } },
  );
  assert.equal((await req("/api/proposals/" + p.id)).data.views, 1);
  const bad = await req(
    "/api/public/accept",
    "POST",
    {
      name: "Customer",
      email: "c@example.test",
      consent: false,
      digest: publicP.data.proposal.digest,
    },
    options,
  );
  assert.equal(bad.status, 409);
  const payload = {
    name: "Customer",
    email: "c@example.test",
    consent: true,
    digest: publicP.data.proposal.digest,
  };
  assert.equal(
    (await req("/api/public/accept", "POST", payload, options)).status,
    200,
  );
  const repeat = await req("/api/public/accept", "POST", payload, options);
  assert.equal(repeat.status, 200);
  const final = (await req("/api/proposals/" + p.id)).data;
  assert.equal(final.acceptance.revision, 2);
  assert.equal(final.acceptance.digest, publicP.data.proposal.digest);
  assert.equal(
    app.db
      .prepare("SELECT count(*) n FROM acceptances WHERE proposal_id=?")
      .get(p.id).n,
    1,
  );
  assert.equal(
    (await req("/api/proposals/" + p.id, "PUT", { revision: 2, data })).status,
    409,
  );
  assert.ok(CONSENT.includes("not an identity-verified"));
});
test("concurrent revisions conflict and old links revoked", async () => {
  const { p, c } = await make();
  const s = await req("/api/proposals/" + p.id + "/share", "POST", {
    revision: 1,
  });
  const token = s.data.path.split("#")[1];
  const results = await Promise.all([
    req("/api/proposals/" + p.id, "PUT", { revision: 1, data: proposal(c.id) }),
    req("/api/proposals/" + p.id, "PUT", { revision: 1, data: proposal(c.id) }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await req("/api/public/proposal", "GET", undefined, {
        public: true,
        headers: { "X-Share-Token": token },
      })
    ).status,
    404,
  );
});
test("invalid/nonexistent and expired links never return another proposal", async () => {
  assert.equal((await req("/api/proposals/nonexistent")).status, 404);
  assert.equal(
    (await req("/api/public/proposal", "GET", undefined, { public: true }))
      .status,
    404,
  );
  const { p } = await make();
  const s = await req("/api/proposals/" + p.id + "/share", "POST", {
    revision: 1,
  });
  app.db.prepare("UPDATE shares SET expires=0 WHERE proposal_id=?").run(p.id);
  assert.equal(
    (
      await req("/api/public/proposal", "GET", undefined, {
        public: true,
        headers: { "X-Share-Token": s.data.path.split("#")[1] },
      })
    ).status,
    404,
  );
});
test("staff view does not increment analytics; explicit revoke works", async () => {
  const { p } = await make();
  const s = await req("/api/proposals/" + p.id + "/share", "POST", {
      revision: 1,
    }),
    token = s.data.path.split("#")[1];
  const r = await req(
    "/api/public/view",
    "POST",
    {},
    { headers: { "X-Share-Token": token } },
  );
  assert.equal(r.data.recorded, false);
  await req("/api/proposals/" + p.id + "/revoke", "POST", {});
  assert.equal(
    (
      await req("/api/public/proposal", "GET", undefined, {
        public: true,
        headers: { "X-Share-Token": token },
      })
    ).status,
    404,
  );
});
test("empty/incomplete drafts save but cannot release; invalid inputs rejected", async () => {
  const c = (await req("/api/customers", "POST", customer)).data;
  const data = proposal(c.id);
  data.finance = {};
  assert.equal((await req("/api/proposals", "POST", data)).status, 201);
  const p = (await req("/api/proposals", "POST", data)).data;
  assert.equal(
    (await req("/api/proposals/" + p.id + "/share", "POST", { revision: 1 }))
      .status,
    422,
  );
  data.finance = { ...proposal(c.id).finance, payCompletion: 99 };
  assert.equal((await req("/api/proposals", "POST", data)).status, 422);
  data.customerId = "missing";
  assert.equal((await req("/api/proposals", "POST", data)).status, 422);
});
test("customer revision updates preserve old proposal snapshot", async () => {
  const { c, p } = await make();
  assert.equal(
    (
      await req("/api/customers/" + c.id, "PUT", {
        revision: 1,
        data: { ...customer, name: "New name" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/api/proposals/" + p.id)).data.customer.name,
    customer.name,
  );
  assert.equal(
    (
      await req("/api/customers/" + c.id, "PUT", {
        revision: 1,
        data: customer,
      })
    ).status,
    409,
  );
});
test("portable import is validated, additive and atomic", async () => {
  const before = app.db.prepare("SELECT count(*) n FROM customers").get().n;
  const b = {
    format: "ktm-portable",
    version: 2,
    customers: [{ id: "c1", data: customer }],
    proposals: [{ id: "p1", data: proposal("c1") }],
  };
  const r = await req("/api/import", "POST", b);
  assert.equal(r.status, 200);
  assert.equal(
    app.db.prepare("SELECT count(*) n FROM customers").get().n,
    before + 1,
  );
  const imported = (await req("/api/proposals")).data.find(
    (p) => p.customerId !== "c1" && p.title === b.proposals[0].data.title,
  );
  assert.ok(imported);
  for (const bad of [
    { ...b, version: 1 },
    { ...b, customers: [...b.customers, ...b.customers] },
    { ...b, proposals: [{ id: "bad", data: proposal("absent") }] },
    { ...b, customers: [{ id: "x", data: { name: 4, type: "residential" } }] },
  ]) {
    const n = app.db.prepare("SELECT count(*) n FROM customers").get().n;
    assert.equal((await req("/api/import", "POST", bad)).status, 422);
    assert.equal(app.db.prepare("SELECT count(*) n FROM customers").get().n, n);
  }
});
test("legacy import rejected, dangerous keys rejected, hostile strings stored as inert data", async () => {
  assert.equal(
    (await req("/api/import", "POST", { version: 1, customers: [] })).status,
    422,
  );
  const c = await req("/api/customers", "POST", {
    ...customer,
    name: "<img src=x onerror=alert(1)>",
  });
  assert.equal(c.status, 201);
  assert.equal(c.data.name, "<img src=x onerror=alert(1)>");
  assert.equal(
    (await req("/api/customers", "POST", { ...customer, id: undefined }))
      .status,
    201,
  );
  assert.equal(
    (await req("/api/customers", "POST", { ...customer, id: "forced" })).status,
    422,
  );
});
test("SQLite records persist across an independent connection", () => {
  const { openDB } = require("../server/db.cjs");
  const second = openDB(path.join(dir, "test.sqlite"));
  assert.ok(second.prepare("SELECT count(*) n FROM proposals").get().n > 0);
  assert.ok(
    second.prepare("PRAGMA integrity_check").get().integrity_check === "ok",
  );
  assert.equal(second.prepare("PRAGMA foreign_key_check").all().length, 0);
  second.close();
});
test("creation/import retries are idempotent, differing replay payloads conflict", async () => {
  const key = id(),
    opts = { headers: { "Idempotency-Key": key } };
  const a = await req("/api/customers", "POST", customer, opts),
    b = await req("/api/customers", "POST", customer, opts);
  assert.equal(a.data.id, b.data.id);
  assert.equal(
    (
      await req(
        "/api/customers",
        "POST",
        { ...customer, name: "different" },
        opts,
      )
    ).status,
    409,
  );
  const payload = proposal(a.data.id),
    options = { headers: { "Idempotency-Key": id() } },
    p = await req("/api/proposals", "POST", payload, options),
    p2 = await req("/api/proposals", "POST", payload, options);
  assert.equal(p.data.id, p2.data.id);
});
test("non-admin export/import denied; disabled users lose live sessions", async () => {
  const uid = id();
  app.db
    .prepare("INSERT INTO users VALUES(?,?,?,?,1)")
    .run(
      uid,
      "staff@example.test",
      passwordHash("test-staff-password-only"),
      "staff",
    );
  const r = await req(
    "/api/login",
    "POST",
    { email: "staff@example.test", password: "test-staff-password-only" },
    { public: true },
  );
  const options = {
    headers: {
      Cookie: r.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": r.data.csrf,
    },
  };
  assert.equal(
    (await req("/api/export", "GET", undefined, options)).status,
    403,
  );
  assert.equal((await req("/api/import", "POST", {}, options)).status, 403);
  assert.equal(
    (await req("/api/customers", "GET", undefined, options)).status,
    200,
  );
  app.db.prepare("UPDATE users SET active=0 WHERE id=?").run(uid);
  assert.equal(
    (await req("/api/customers", "GET", undefined, options)).status,
    401,
  );
});
test("invalid dates and capacity mismatch cannot be released", async () => {
  const { p, c } = await make();
  assert.equal(
    (
      await req("/api/proposals", "POST", {
        ...proposal(c.id),
        validUntil: "2026-99-99",
      })
    ).status,
    422,
  );
  const data = proposal(c.id);
  data.engineering = { moduleCount: 10, wp: 600 };
  const edit = await req("/api/proposals/" + p.id, "PUT", {
    revision: 1,
    data,
  });
  assert.equal(edit.status, 200);
  assert.equal(
    (await req("/api/proposals/" + p.id + "/share", "POST", { revision: 2 }))
      .status,
    422,
  );
});
test("portable round-trip preserves original customer snapshots, no acceptance imported", async () => {
  const { p, c } = await make();
  await req("/api/customers/" + c.id, "PUT", {
    revision: 1,
    data: { ...customer, name: "Updated directory name" },
  });
  const ex = (await req("/api/export")).data;
  const portable = {
    ...ex,
    customers: ex.customers.filter((x) => x.id === c.id),
    proposals: ex.proposals.filter((x) => x.id === p.id),
  };
  assert.equal(portable.proposals[0].customerSnapshot.name, customer.name);
  const before = new Set((await req("/api/proposals")).data.map((p) => p.id));
  assert.equal((await req("/api/import", "POST", portable)).status, 200);
  const imported = (await req("/api/proposals")).data.find(
    (p) => !before.has(p.id),
  );
  assert.equal(imported.customer.name, customer.name);
  assert.equal(imported.acceptance, null);
  assert.equal(imported.revision, 1);
  assert.equal(imported.finance.gstPercent, 0);
});
test("immutable estimates carry engine version and are read from revision snapshots", async () => {
  const { p } = await make();
  assert.equal(p.estimates.engineVersion, "2.0.0");
  const row = app.db
    .prepare(
      "SELECT data,digest FROM revisions WHERE proposal_id=? AND revision=1",
    )
    .get(p.id);
  assert.equal(require("../server/db.cjs").hash(row.data), row.digest);
  assert.equal(JSON.parse(row.data).estimates.financial.netInvestment, 250000);
});
test("oversized JSON, malformed body and wrong content type fail closed", async () => {
  let r = await fetch(base + "/api/customers", {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
    },
    body: "{bad",
  });
  assert.equal(r.status, 400);
  r = await fetch(base + "/api/customers", {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "X-CSRF-Token": csrf,
      "Content-Type": "text/plain",
    },
    body: "{}",
  });
  assert.equal(r.status, 415);
  r = await fetch(base + "/api/customers", {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "x".repeat(2 * 1024 * 1024) }),
  });
  assert.equal(r.status, 413);
});
test("production refuses missing HTTPS origin and uses secure session headers", async () => {
  assert.throws(
    () => createApp({ production: true, dbPath: ":memory:" }),
    /HTTPS/,
  );
  const secureApp = createApp({
    production: true,
    origin: "https://studio.example.test",
    dbPath: ":memory:",
  });
  secureApp.db
    .prepare("INSERT INTO users VALUES(?,?,?,?,1)")
    .run(
      id(),
      "admin@test.example",
      passwordHash("fixture password with spaces"),
      "admin",
    );
  await new Promise((r) => secureApp.server.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch(
      "http://127.0.0.1:" + secureApp.server.address().port + "/api/login",
      {
        method: "POST",
        headers: {
          Origin: "https://studio.example.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "admin@test.example",
          password: "fixture password with spaces",
        }),
      },
    );
    assert.equal(r.status, 200);
    assert.match(
      r.headers.get("set-cookie"),
      /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/,
    );
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.match(
      r.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    assert.ok(r.headers.get("strict-transport-security"));
  } finally {
    await secureApp.close();
  }
});
test("staff cannot record customer intent through their authenticated session", async () => {
  const { p } = await make();
  const s = await req("/api/proposals/" + p.id + "/share", "POST", {
      revision: 1,
    }),
    token = s.data.path.split("#")[1];
  const options = { headers: { "X-Share-Token": token } };
  assert.equal(
    (await req("/api/public/proposal", "GET", undefined, options)).data
      .staffPreview,
    true,
  );
  assert.equal(
    (
      await req(
        "/api/public/accept",
        "POST",
        {
          name: "Staff",
          email: "staff@example.test",
          consent: true,
          digest: p.digest,
        },
        options,
      )
    ).status,
    403,
  );
  assert.equal((await req("/api/proposals/" + p.id)).data.acceptance, null);
});
test("future calculation changes do not mutate released financial snapshots", async () => {
  const { p } = await make();
  const s = await req("/api/proposals/" + p.id + "/share", "POST", {
    revision: 1,
  });
  const domain = require("../public/domain.js"),
    original = domain.compute;
  try {
    domain.compute = () => ({
      available: false,
      errors: ["simulated future engine"],
    });
    const result = await req("/api/public/proposal", "GET", undefined, {
      public: true,
      headers: { "X-Share-Token": s.data.path.split("#")[1] },
    });
    assert.equal(result.data.financial.available, true);
    assert.equal(result.data.financial.netInvestment, 250000);
  } finally {
    domain.compute = original;
  }
});
test("credential guessing is rate limited", async () => {
  for (let n = 0; n < 10; n++)
    assert.equal(
      (
        await req(
          "/api/login",
          "POST",
          { email: "guess@example.test", password: "incorrect-test-password" },
          { public: true },
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await req(
        "/api/login",
        "POST",
        { email: "guess@example.test", password: "incorrect-test-password" },
        { public: true },
      )
    ).status,
    429,
  );
});
test("revision update retry returns original committed response without another revision", async () => {
  const { p, c } = await make(),
    options = { headers: { "Idempotency-Key": id() } },
    data = { revision: 1, data: proposal(c.id) };
  const a = await req("/api/proposals/" + p.id, "PUT", data, options),
    b = await req("/api/proposals/" + p.id, "PUT", data, options);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.data.revision, 2);
  assert.deepEqual(a.data, b.data);
  assert.equal(
    (await req("/api/proposals/" + p.id + "/history")).data.revisions.length,
    2,
  );
});
