const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { finance } = require("../fixtures.cjs");
async function signIn(page) {
  await page.goto("/");
  await page.getByLabel("Work email").fill("qa@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-fixture-password-only");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Proposals", exact: true }),
  ).toBeVisible();
}
async function makeCustomer(page, name) {
  await page.getByRole("link", { name: "Customers", exact: true }).click();
  await page.getByLabel("Full name *", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page.getByLabel("Phone", { exact: true }).fill("+91 9000000000");
  await page.getByLabel("Customer category *").selectOption("residential");
  await page.getByLabel("Site / billing address").fill("QA fixture site, Pune");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function makeProposal(page, name) {
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .getByRole("link", { name: "New proposal" })
    .click();
  await page.getByLabel("Proposal title *").fill("QA solar offer — " + name);
  await page.getByLabel("Offer valid through").fill("2030-12-31");
  await page.getByLabel("KTM contact phone").fill("+91 9000000001");
  await page.getByLabel("KTM contact email").fill("ktm@example.test");
  for (const [k, v] of Object.entries(finance)) {
    const el = page.locator("#f_" + k);
    if (await el.count()) {
      if (k === "subsidyEligibility") await el.selectOption(v);
      else await el.fill(String(v));
    }
  }
  await page
    .getByLabel("Included equipment, work & deliverables")
    .fill(
      "Verified scope must be supplied in a real project. QA fixture supply and installation.",
    );
  await page
    .getByLabel("Exclusions — explicitly")
    .fill("Grid fees; financing; replacement costs.");
  await page
    .getByLabel("Terms, warranty references")
    .fill(
      "Qualified site review and a signed contract required before installation.",
    );
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Saved on server", { exact: true }),
  ).toBeVisible();
}
test("real staff → revision → print/PDF → clean-browser share → acceptance → stored history", async ({
  page,
  browser,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  const name = "Lifecycle " + Date.now();
  await makeCustomer(page, name);
  await makeProposal(page, name);
  const url = page.url();
  await page.reload();
  await expect(page.locator("#f_gstPercent")).toHaveValue("0");
  await expect(page.locator("#f_payAdvance")).toHaveValue("0");
  await page.getByLabel("Proposal title *").fill("Revised customer offer");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(page.getByText(/Revision 2 ·/)).toBeVisible();
  await page.getByRole("link", { name: "Preview / PDF" }).click();
  await expect(
    page.getByRole("heading", { name: "Revised customer offer" }),
  ).toBeVisible();
  await expect(
    page.getByText("Engineering review required", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath("desktop-proposal.png"),
    fullPage: true,
  });
  if (testInfo.project.name === "chromium") {
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    require("node:fs").writeFileSync(
      testInfo.outputPath("verified-proposal.pdf"),
      pdf,
    );
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfTask = pdfjs.getDocument({
      data: new Uint8Array(pdf),
      useSystemFonts: true,
    });
    const doc = await pdfTask.promise;
    let text = "";
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const content = await p.getTextContent();
      text += content.items.map((x) => x.str).join(" ");
      for (const item of content.items.filter((x) => x.str?.trim())) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(20);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(
          p.view[2] - 20,
        );
      }
      expect(p.view[2]).toBeCloseTo(595, 0);
      expect(p.view[3]).toBeCloseTo(842, 0);
    }
    expect(doc.numPages).toBeGreaterThan(2);
    expect(doc.numPages).toBeLessThan(15);
    expect(text).toContain("Revised customer offer");
    expect(text).toContain("Grid fees");
    expect(text).toContain("Engineering review required");
    expect(text).toContain("Minimum cell temperature");
    expect(text).toContain("2,50,000");
    expect(text.replace(/\s+/g, " ")).toContain("Revision SHA-256");
    const first = await doc.getPage(1);
    const viewport = first.getViewport({ scale: 1.3 });
    const canvas = require("@napi-rs/canvas").createCanvas(
      viewport.width,
      viewport.height,
    );
    await first.render({ canvasContext: canvas.getContext("2d"), viewport })
      .promise;
    require("node:fs").writeFileSync(
      testInfo.outputPath("pdf-first-page.png"),
      canvas.toBuffer("image/png"),
    );
    await pdfTask.destroy();
  }
  await page.goto(url);
  await page.getByRole("button", { name: "Create secure link" }).click();
  const link = await page.locator("#shareUrl").inputValue();
  expect(link).toContain("/proposal#");
  const clean = await browser.newContext();
  const customerPage = await clean.newPage();
  customerPage.on("pageerror", (e) => errors.push(e.message));
  await customerPage.goto(link);
  await expect(
    customerPage.getByRole("heading", { name: "Revised customer offer" }),
  ).toBeVisible();
  await expect(
    customerPage.getByRole("link", { name: "Back to workspace" }),
  ).toHaveCount(0);
  await customerPage.setViewportSize({ width: 390, height: 844 });
  expect(
    await customerPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page: customerPage }).analyze();
  expect(accessibility.violations).toEqual([]);
  await customerPage.screenshot({
    path: testInfo.outputPath("mobile-customer.png"),
    fullPage: true,
  });
  await customerPage.getByLabel("Your full name").fill(name);
  await customerPage.getByLabel("Your email").fill("customer@example.test");
  await customerPage.getByRole("checkbox").check();
  await customerPage
    .getByRole("button", { name: "Record intent to proceed" })
    .click();
  await expect(
    customerPage.getByRole("heading", {
      name: "Thank you. Your intent is recorded.",
    }),
  ).toBeVisible();
  await customerPage.reload();
  await expect(
    customerPage.getByRole("heading", {
      name: "Thank you. Your intent is recorded.",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save new revision" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "History" }).click();
  await expect(
    page.getByText("commercial-intent-recorded", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await clean.close();
});
test("mobile form, desktop dashboard and customer directory accessibility", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("mobile-dashboard.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let a = await new AxeBuilder({ page }).analyze();
  expect(a.violations).toEqual([]);
  await page.getByRole("link", { name: "New proposal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Build something brighter." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("#f_capacity")).toHaveValue("");
  await expect(
    page.getByText("Calculation unavailable", { exact: true }),
  ).toBeVisible();
  a = await new AxeBuilder({ page }).analyze();
  expect(a.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("mobile-builder.png"),
    fullPage: true,
  });
});
test("XSS payload is inert text, invalid link never falls back", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const payload = '<img src=x onerror="window.pwned=1">';
  await makeCustomer(page, payload);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  const clean = await browser.newContext();
  const p = await clean.newPage();
  await p.goto("/proposal#" + "a".repeat(64));
  await expect(
    p.getByRole("heading", { name: "We couldn’t open this page." }),
  ).toBeVisible();
  await expect(
    p.getByText("This link has expired or been revoked"),
  ).toBeVisible();
  await clean.close();
});
test("portable export/import via UI and missing proposal handling", async ({
  page,
}) => {
  await signIn(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const file = await download;
  const text = require("node:fs").readFileSync(await file.path(), "utf8");
  const data = JSON.parse(text);
  expect(data.format).toBe("ktm-portable");
  page.once("dialog", (d) => d.accept());
  await page.locator("#import").setInputFiles({
    name: "portable.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(page.locator("#notice")).toContainText("Imported");
  await page.goto("/builder?id=does-not-exist");
  await expect(
    page.getByText("Proposal not found", { exact: true }),
  ).toBeVisible();
});
test("lost save acknowledgement retries without duplicate revisions or lost form input", async ({
  page,
}) => {
  await signIn(page);
  const name = "Retry " + Date.now();
  await makeCustomer(page, name);
  await makeProposal(page, name);
  await page.getByLabel("Proposal title *").fill("Retry-safe revision");
  let intercepted = false;
  await page.route("**/api/proposals/*", async (route) => {
    if (route.request().method() === "PUT" && !intercepted) {
      intercepted = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(page.locator("#saveError")).toContainText(
    "not been confirmed saved",
  );
  await expect(page.locator("#title")).toHaveValue("Retry-safe revision");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(page.getByText(/Revision 2 ·/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Revision 2 ·/)).toBeVisible();
});
