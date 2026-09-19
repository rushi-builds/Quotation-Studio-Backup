module.exports = async () => {
  if (process.env.BROWSER_MATRIX === "full") return;
  const fs = require("node:fs"),
    zlib = require("node:zlib"),
    { execFileSync } = require("node:child_process");
  const bin = require("node:path").join(
    require.resolve("@sparticuz/chromium"),
    "../../bin/al2023.tar.br",
  );
  execFileSync("tar", ["-x", "-C", "/tmp"], {
    input: zlib.brotliDecompressSync(fs.readFileSync(bin)),
  });
  await require("@sparticuz/chromium").default.executablePath();
};
