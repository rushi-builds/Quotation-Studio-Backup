/* Full-fidelity encrypted SQLite backup. Encryption key belongs in an operator secret manager. */
const { backup } = require("node:sqlite"),
  { openDB } = require("../server/db.cjs"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const key = process.env.BACKUP_KEY_HEX;
  if (!/^[a-fA-F0-9]{64}$/.test(key || ""))
    throw Error(
      "BACKUP_KEY_HEX must be a 32-byte hex key from your secret manager",
    );
  const destination = process.argv[2];
  if (!destination || fs.existsSync(destination))
    throw Error("Provide a NEW output file path");
  const source = process.env.DB_PATH || ".runtime/studio.sqlite";
  if (!fs.existsSync(source)) throw Error("Database does not exist");
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temp =
    destination + "." + crypto.randomBytes(12).toString("hex") + ".tmp";
  const db = openDB(source);
  try {
    await backup(db, temp);
    fs.chmodSync(temp, 0o600);
    const iv = crypto.randomBytes(12),
      cipher = crypto.createCipheriv(
        "aes-256-gcm",
        Buffer.from(key, "hex"),
        iv,
      ),
      payload = Buffer.concat([
        cipher.update(fs.readFileSync(temp)),
        cipher.final(),
      ]);
    fs.writeFileSync(
      destination,
      Buffer.concat([
        Buffer.from("KTMBACKUP2"),
        iv,
        cipher.getAuthTag(),
        payload,
      ]),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      "Encrypted full backup created. Perform a restore drill before relying on it.",
    );
  } finally {
    db.close();
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
