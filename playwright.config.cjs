const { defineConfig, devices } = require("@playwright/test");
const chromium = require("@sparticuz/chromium").default;
module.exports = defineConfig({
  testDir: "tests/browser",
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-results.json" }],
  ],
  globalSetup: require.resolve("./tests/browser-setup.cjs"),
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects:
    process.env.BROWSER_MATRIX === "full"
      ? [
          { name: "chromium", use: { ...devices["Desktop Chrome"] } },
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : [
          {
            name: "chromium",
            use: {
              browserName: "chromium",
              launchOptions: {
                executablePath: "/tmp/chromium",
                args: [
                  "--no-sandbox",
                  "--disable-dev-shm-usage",
                  "--no-zygote",
                ],
                env: { ...process.env, LD_LIBRARY_PATH: "/tmp/lib" },
              },
            },
          },
        ],
  webServer: {
    command: "node scripts/test-server.cjs",
    url: "http://127.0.0.1:3101/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
