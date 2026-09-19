const { openDB, audit, transaction } = require("../server/db.cjs");
const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/disable-staff.cjs email");
  process.exit(1);
}
const db = openDB(process.env.DB_PATH || ".runtime/studio.sqlite");
const u = db
  .prepare("SELECT id FROM users WHERE email=?")
  .get(email.toLowerCase());
if (!u) {
  console.error("User not found");
  db.close();
  process.exit(1);
}
transaction(db, () => {
  db.prepare("UPDATE users SET active=0 WHERE id=?").run(u.id);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
  audit(db, "operator", "staff-disabled", u.id);
});
db.close();
console.log("Access revoked.");
