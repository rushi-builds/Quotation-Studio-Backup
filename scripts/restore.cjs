/* Restore to a NEW database path while the application is stopped. */
const fs = require("node:fs"),
  crypto = require("node:crypto"),
  path = require("node:path"),
  { openDB } = require("../server/db.cjs");
try {
  const [source, dest] = process.argv.slice(2),
    key = process.env.BACKUP_KEY_HEX;
  if (!/^[a-fA-F0-9]{64}$/.test(key || ""))
    throw Error("BACKUP_KEY_HEX required");
  if (!source || !dest || fs.existsSync(dest))
    throw Error("Usage: node scripts/restore.cjs backup.enc NEW.sqlite");
  const b = fs.readFileSync(source);
  if (b.subarray(0, 10).toString() !== "KTMBACKUP2")
    throw Error("Unknown backup format");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    b.subarray(10, 22),
  );
  decipher.setAuthTag(b.subarray(22, 38));
  const plain = Buffer.concat([
    decipher.update(b.subarray(38)),
    decipher.final(),
  ]);
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.writeFileSync(dest, plain, { flag: "wx", mode: 0o600 });
  const db = openDB(dest);
  try {
    if (
      db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
      db.prepare("PRAGMA foreign_key_check").all().length
    )
      throw Error("Database integrity check failed");
    db.prepare("DELETE FROM sessions").run();
    console.log(
      "Restored; integrity checked; staff sessions invalidated. Rotate/revoke customer links if restoring after an incident.",
    );
  } finally {
    db.close();
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
