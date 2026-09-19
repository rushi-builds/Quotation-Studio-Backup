const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../server/index.cjs"),
  { id, passwordHash } = require("../server/db.cjs");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ktm-browser-"));
const app = createApp({
  dbPath: path.join(dir, "test.sqlite"),
  origin: "http://127.0.0.1:3101",
});
app.db
  .prepare("INSERT INTO users VALUES(?,?,?,?,1)")
  .run(
    id(),
    "qa@example.test",
    passwordHash("test-fixture-password-only"),
    "admin",
  );
app.server.listen(3101, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    app.close().then(() => {
      fs.rmSync(dir, { recursive: true, force: true });
      process.exit(0);
    }),
  );
