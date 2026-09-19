const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { execFileSync, spawnSync } = require("node:child_process"),
  { openDB, id, passwordHash } = require("../server/db.cjs");
test("encrypted full backup restores records, audit, hashes and invalidates sessions; tampering rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ktm-recovery-")),
    source = path.join(dir, "source.sqlite"),
    dest = path.join(dir, "restore.sqlite"),
    backup = path.join(dir, "backup.enc"),
    key = require("node:crypto").randomBytes(32).toString("hex");
  try {
    let db = openDB(source);
    const uid = id();
    db.prepare("INSERT INTO users VALUES(?,?,?,?,1)").run(
      uid,
      "test@example.test",
      passwordHash("test-password-only"),
      "admin",
    );
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      "hash",
      uid,
      "csrf",
      Date.now() + 1000000,
    );
    db.prepare(
      "INSERT INTO audit(actor,event,entity,detail,created) VALUES(?,?,?,?,?)",
    ).run(uid, "fixture", "workspace", "{}", "2026-01-01T00:00:00Z");
    const cid = id(),
      pid = id(),
      t = "2026-01-01T00:00:00Z",
      digest = require("../server/db.cjs").hash("{}");
    db.prepare("INSERT INTO customers VALUES(?,1,?,?,?)").run(
      cid,
      JSON.stringify(require("./fixtures.cjs").customer),
      t,
      t,
    );
    db.prepare("INSERT INTO proposals VALUES(?,1,?,?,?)").run(pid, cid, t, t);
    db.prepare("INSERT INTO revisions VALUES(?,1,?,?,?,?)").run(
      pid,
      "{}",
      digest,
      uid,
      t,
    );
    db.prepare("INSERT INTO shares VALUES(?,?,1,?,0,?)").run(
      "test-share-hash",
      pid,
      Date.now() + 1000000,
      t,
    );
    db.prepare("INSERT INTO acceptances VALUES(?,1,?,?,?,?,?,?)").run(
      pid,
      "test-share-hash",
      "Test Customer",
      "test@example.test",
      "Test explicit consent",
      digest,
      t,
    );
    db.close();
    const env = { ...process.env, DB_PATH: source, BACKUP_KEY_HEX: key };
    execFileSync(process.execPath, ["scripts/backup.cjs", backup], { env });
    assert.equal(
      fs.readFileSync(backup).subarray(0, 10).toString(),
      "KTMBACKUP2",
    );
    execFileSync(process.execPath, ["scripts/restore.cjs", backup, dest], {
      env,
    });
    db = openDB(dest);
    assert.equal(db.prepare("SELECT id FROM users").get().id, uid);
    assert.equal(db.prepare("SELECT count(*) n FROM audit").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM sessions").get().n, 0);
    assert.equal(
      db.prepare("SELECT digest FROM revisions WHERE proposal_id=?").get(pid)
        .digest,
      digest,
    );
    assert.equal(
      db.prepare("SELECT digest FROM acceptances WHERE proposal_id=?").get(pid)
        .digest,
      digest,
    );
    assert.equal(
      db.prepare("SELECT hash FROM shares WHERE proposal_id=?").get(pid).hash,
      "test-share-hash",
    );
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    db.close();
    const bytes = fs.readFileSync(backup);
    bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(backup, bytes);
    const fail = spawnSync(
      process.execPath,
      ["scripts/restore.cjs", backup, path.join(dir, "bad.sqlite")],
      { env },
    );
    assert.notEqual(fail.status, 0);
    assert.equal(fs.existsSync(path.join(dir, "bad.sqlite")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("password hashes are salted, versioned and whitespace-preserving", async () => {
  const { passwordHash, passwordVerify } = require("../server/db.cjs");
  const a = passwordHash("  long test password  "),
    b = passwordHash("  long test password  ");
  assert.notEqual(a, b);
  assert.match(a, /^scrypt-v1:/);
  assert.equal(await passwordVerify("  long test password  ", a), true);
  assert.equal(await passwordVerify("long test password", a), false);
  assert.equal(await passwordVerify("anything", null), false);
});
test("database rejects schema downgrades and immutable-history updates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ktm-schema-")),
    file = path.join(dir, "schema.sqlite");
  try {
    const db = openDB(file);
    db.prepare(
      "INSERT INTO audit(actor,event,entity,detail,created) VALUES(?,?,?,?,?)",
    ).run("test", "test", "test", "{}", "2026-01-01");
    assert.throws(
      () => db.prepare("UPDATE audit SET actor='tampered'").run(),
      /append-only/,
    );
    db.exec("PRAGMA user_version=2");
    db.close();
    assert.throws(() => openDB(file), /newer/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
