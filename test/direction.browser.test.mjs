/*
 * An element that stops following the pointer lets go of the waves the
 * pointer sent. The demo's About heading is switched on at load, in pointer
 * mode, so the pointer sends its waves there; switched to scroll, it must go
 * light again when the page scrolls past it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { serve } from "./serve.mjs";

const progress = (page, id) =>
  page.evaluate(
    (id) =>
      Number(
        getComputedStyle(document.querySelector(`#${id} > h3 .animate-text-weight-unit`)).getPropertyValue(
          "--animate-weight-progress",
        ),
      ),
    id,
  );

test("a heading switched from pointer to scroll still goes light", async () => {
  const server = await serve();
  const browser = await puppeteer.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(`${server.url}/demo/index.html`);
    await page.waitForSelector("#sec-about.active > h3 .animate-text-weight-unit");
    await page.select("#direction", "scroll");
    await page.evaluate(() => {
      const use = document.querySelector("#sec-use");
      scrollTo(0, use.getBoundingClientRect().top + scrollY - innerHeight / 2 + 50);
    });
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await progress(page, "sec-about"), 0, "About let go");
    assert.equal(await progress(page, "sec-use"), 1, "Use switched on");
  } finally {
    await browser.close();
    server.close();
  }
});

/*
 * A heading that follows the page gets the same least band as one that
 * follows the pointer. A jump by End switches every section it passes on and
 * off again a frame later; left to the stylesheet, the two waves ran together
 * and those headings never got any weight at all.
 */
test("a heading switched on for a frame in scroll mode still waves", async () => {
  const server = await serve();
  const browser = await puppeteer.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(`${server.url}/demo/index.html`);
    await page.waitForSelector("#sec-about.active > h3 .animate-text-weight-unit");
    await page.select("#direction", "scroll");
    await new Promise((r) => setTimeout(r, 500));
    // On for one frame, then off, and the highest the first unit got after.
    const peak = await page.evaluate(
      () =>
        new Promise((done) => {
          const heading = document.querySelector("#sec-use > h3");
          const unit = heading.querySelector(".animate-text-weight-unit");
          const until = performance.now() + 1500;
          let most = 0;
          const frame = () => {
            most = Math.max(most, Number(getComputedStyle(unit).getPropertyValue("--animate-weight-progress")));
            if (performance.now() < until) requestAnimationFrame(frame);
            else done(most);
          };
          // Two callbacks, because the first one runs before the frame the
          // switch is drawn in, and on and off in one frame is no switch at all.
          requestAnimationFrame(() => {
            heading.style.setProperty("--animate-weight", "true");
            requestAnimationFrame(() => {
              heading.style.removeProperty("--animate-weight");
              requestAnimationFrame(frame);
            });
          });
        }),
    );
    assert.ok(peak > 0.5, `the band reached ${peak}`);
    assert.equal(await progress(page, "sec-use"), 0, "Use let go again");
  } finally {
    await browser.close();
    server.close();
  }
});
