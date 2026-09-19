/* Operator-only staff provisioning. Password supplied via env, never command arguments. */
const {
  openDB,
  id,
  passwordHash,
  audit,
  transaction,
} = require("../server/db.cjs");
const [email, role = "staff"] = process.argv.slice(2),
  password = process.env.STAFF_PASSWORD;
if (
  !email ||
  !/^\S+@\S+\.\S+$/.test(email) ||
  !["admin", "staff"].includes(role) ||
  !password ||
  password.length < 14 ||
  password.length > 1024 ||
  !password.trim() ||
  email.length > 200
) {
  console.error(
    "Usage: STAFF_PASSWORD=<14+ characters> npm run staff -- email admin|staff. Existing users have passwords rotated and sessions revoked.",
  );
  process.exit(1);
}
const db = openDB(process.env.DB_PATH || ".runtime/studio.sqlite");
const existing = db
    .prepare("SELECT id FROM users WHERE email=?")
    .get(email.toLowerCase()),
  uid = existing?.id || id();
const encoded = passwordHash(password);
transaction(db, () => {
  db.prepare(
    "INSERT INTO users VALUES(?,?,?,?,1) ON CONFLICT(email) DO UPDATE SET password=excluded.password,role=excluded.role,active=1",
  ).run(uid, email.toLowerCase(), encoded, role);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(uid);
  audit(
    db,
    "operator",
    existing ? "staff-credentials-rotated" : "staff-provisioned",
    uid,
  );
});
db.close();
console.log("Staff account provisioned; previous sessions revoked.");
