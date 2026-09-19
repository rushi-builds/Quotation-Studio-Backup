"use strict";
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
function openDB(file) {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(file);
  if (db.prepare("PRAGMA user_version").get().user_version > 1) {
    db.close();
    throw Error(
      "Database schema is newer than this application. Refusing to downgrade.",
    );
  }
  if (file !== ":memory:") fs.chmodSync(file, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','staff')),active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,customer_id TEXT REFERENCES customers(id),created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS revisions(proposal_id TEXT REFERENCES proposals(id),revision INTEGER NOT NULL,data TEXT NOT NULL,digest TEXT NOT NULL,author TEXT REFERENCES users(id),created TEXT NOT NULL,PRIMARY KEY(proposal_id,revision));
 CREATE TABLE IF NOT EXISTS shares(hash TEXT PRIMARY KEY,proposal_id TEXT NOT NULL,revision INTEGER NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,FOREIGN KEY(proposal_id,revision) REFERENCES revisions(proposal_id,revision));
 CREATE TABLE IF NOT EXISTS views(share_hash TEXT REFERENCES shares(hash),visitor_hash TEXT,created TEXT NOT NULL,PRIMARY KEY(share_hash,visitor_hash));
 CREATE TABLE IF NOT EXISTS acceptances(proposal_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,share_hash TEXT REFERENCES shares(hash),name TEXT NOT NULL,email TEXT NOT NULL,consent TEXT NOT NULL,digest TEXT NOT NULL,created TEXT NOT NULL,FOREIGN KEY(proposal_id,revision) REFERENCES revisions(proposal_id,revision));
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,event TEXT NOT NULL,entity TEXT NOT NULL,detail TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS idempotency(user_id TEXT NOT NULL,route TEXT NOT NULL,key TEXT NOT NULL,digest TEXT NOT NULL,response TEXT NOT NULL,status INTEGER NOT NULL,PRIMARY KEY(user_id,route,key));
 CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS revision_no_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'Revisions are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS revision_no_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'Revisions are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit records are append-only'); END;
 CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit records are append-only'); END;
 CREATE TRIGGER IF NOT EXISTS acceptance_no_update BEFORE UPDATE ON acceptances BEGIN SELECT RAISE(ABORT,'Acceptance records are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS acceptance_no_delete BEFORE DELETE ON acceptances BEGIN SELECT RAISE(ABORT,'Acceptance records are immutable'); END;
 PRAGMA user_version=1;`);
  return db;
}
const now = () => new Date().toISOString(),
  id = () => crypto.randomUUID(),
  hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function audit(db, actor, event, entity, detail = {}) {
  db.prepare(
    "INSERT INTO audit(actor,event,entity,detail,created) VALUES(?,?,?,?,?)",
  ).run(actor, event, entity, JSON.stringify(detail), now());
}
// Explicit, versioned scrypt parameters (32 MiB / parallelization 3).
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return (
    "scrypt-v1:" +
    salt +
    ":" +
    crypto.scryptSync(password, salt, 64, SCRYPT).toString("hex")
  );
}
async function passwordVerify(password, stored) {
  const valid = /^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored || "");
  const [, salt, expected] = (
    valid ? stored : "scrypt-v1:" + "0".repeat(32) + ":" + "0".repeat(128)
  ).split(":");
  const candidate = await require("node:util").promisify(crypto.scrypt)(
    password,
    salt,
    64,
    SCRYPT,
  );
  return (
    crypto.timingSafeEqual(candidate, Buffer.from(expected, "hex")) && valid
  );
}
module.exports = {
  openDB,
  now,
  id,
  hash,
  transaction,
  audit,
  passwordHash,
  passwordVerify,
};
