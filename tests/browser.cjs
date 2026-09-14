const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const { csvProfile } = require("../js/filters.js");
const data = JSON.parse(fs.readFileSync("data/nhanes_data.json", "utf8"));
const root = path.resolve(".");
const allowed = new Set([
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/charts.js",
  "/js/filters.js",
  "/data/nhanes_data.json",
  "/data/sources.json",
]);
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost").pathname;
  if (!allowed.has(url)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = path.join(root, url === "/" ? "index.html" : url.slice(1));
  res.writeHead(200, {
    "Content-Type": types[path.extname(file)] + "; charset=utf-8",
  });
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  try {
    fs.mkdirSync("test-results", { recursive: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.locator("#results").waitFor({ state: "visible" });
    assert.equal(await page.locator("#cycle").inputValue(), "2017-2018");
    await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
    for (const m of data.mappings)
      for (const sex of ["all", "1", "2"]) {
        await page.locator("#cycle").selectOption(m.cycle);
        await page.locator("#biomarker").selectOption(m.biomarker);
        await page.locator("#sex").selectOption(sex);
        if (!m.available) {
          assert.equal(await page.locator("#results").isVisible(), false);
          assert.match(
            await page.locator("#status").innerText(),
            /unavailable/,
          );
          continue;
        }
        const rows = data.data.filter(
          (r) =>
            r.cycle === m.cycle && r.biomarker === m.biomarker && r.sex === sex,
        );
        assert.equal(await page.locator("#table-body tr").count(), 7);
        assert.equal(await page.locator("#chart circle").count(), 7);
        const summary = await page.locator("#summary").innerText();
        const overall = rows.find((r) => r.age_group === "all");
        assert.ok(summary.includes(overall.n.toLocaleString("en-US")));
        const first = rows.find((r) => r.age_group === "20-29");
        assert.ok(
          (await page.locator("#table-body tr").first().innerText()).includes(
            first.mean.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          ),
        );
        assert.ok(
          !(await page.locator("#sources").innerText()).includes(
            "[object Object]",
          ),
        );
      }
    await page.locator("#biomarker").selectOption("glucose");
    await page.locator("#sex").selectOption("1");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloadPromise;
    const target = "test-results/profile.csv";
    await download.saveAs(target);
    const expected = data.data.filter(
      (r) =>
        r.cycle === "2017-2018" && r.biomarker === "glucose" && r.sex === "1",
    );
    assert.equal(fs.readFileSync(target, "utf8"), csvProfile(expected));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#biomarker").selectOption("total_cholesterol");
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.equal(
      await page.locator("#chart svg").getAttribute("viewBox"),
      "0 0 360 385",
    );
    await page.evaluate(() => (document.documentElement.style.zoom = "2"));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: "test-results/mobile-zoom.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    const failed = await browser.newPage();
    await failed.route("**/data/nhanes_data.json", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await failed.goto(base);
    await failed.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.includes("could not be loaded"),
    );
    assert.equal(await failed.locator("#results").isVisible(), false);
    assert.equal(await failed.locator("#cycle").isDisabled(), true);
    console.log(
      "PASS: 324 cycle/biomarker/sex states; CSV; mobile; 200% zoom; load failure; no JS errors.",
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
