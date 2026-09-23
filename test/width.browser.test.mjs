/*
 * Proves the library's main promise in a real browser: a line's rendered
 * width does not move between the from weight and the to weight. band.test.mjs
 * and waves.test.mjs replay the timing formulas against plain numbers; this is
 * the one test that actually renders the CSS and measures pixels.
 *
 * Three fixtures in test/fixtures/width.html, each --animate-weight-duration:
 * 0s so the "on" state lands immediately: a single line and a wrapped
 * multi-line block (both line mode, letter-spacing correction), and one word
 * split into characters (character mode, flex-basis correction). All animate
 * 100 -> 900, the full range, which is where a width drift is largest.
 *
 * TOLERANCE_PX is a sub-pixel rendering budget, not slack for the algorithm:
 * measured diffs on this fixture are 0.00-0.02px, so 0.5px leaves ample room
 * before a real regression would slip through. A neutralised correction (line
 * mode's letter-spacing, character mode's fixed container width) moves lines
 * by 12-34px on the same fixture, which is what this test is meant to catch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { serve } from "./serve.mjs";

const TOLERANCE_PX = 0.5;

/** Measure each rendered line's width, and one unit's computed font-weight. */
async function measure(page, containerId) {
  return page.evaluate((id) => {
    const root = document.getElementById(id);
    const lines = [...root.querySelectorAll(".animate-text-weight-line")];
    const unit = root.querySelector(".animate-text-weight-unit");
    return {
      widths: lines.map((line) => line.getBoundingClientRect().width),
      fontWeight: unit ? getComputedStyle(unit).fontWeight : null,
    };
  }, containerId);
}

test("line widths do not move from the from weight to the to weight", async (context) => {
  const server = await serve();
  const browser = await puppeteer.launch({ channel: "chrome", headless: true });
  context.after(async () => {
    await browser.close();
    server.close();
  });

  const page = await browser.newPage();
  await page.goto(`${server.url}/test/fixtures/width.html`);
  await page.waitForSelector("html[data-ready]");

  const cases = ["line-single", "line-multi", "char-mode"];

  for (const id of cases) {
    await context.test(id, async () => {
      const rest = await measure(page, id);
      assert.ok(rest.widths.length > 0, `${id}: expected at least one line`);

      await page.evaluate((id) => {
        document.querySelector(`#${id} .subject`).classList.add("on");
      }, id);
      // The transition span is at least 1ms even at duration: 0s (see
      // animateTextWeight.css, --atw-span). A frame is enough to settle it.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const on = await measure(page, id);

      await page.evaluate((id) => {
        document.querySelector(`#${id} .subject`).classList.remove("on");
      }, id);

      assert.notStrictEqual(
        on.fontWeight,
        rest.fontWeight,
        `${id}: font-weight did not change, the assertion below would be vacuous`,
      );
      assert.strictEqual(on.widths.length, rest.widths.length, `${id}: line count changed`);
      on.widths.forEach((width, index) => {
        const diff = Math.abs(width - rest.widths[index]);
        assert.ok(
          diff <= TOLERANCE_PX,
          `${id}: line ${index} moved ${diff.toFixed(3)}px (${rest.widths[index].toFixed(3)} -> ${width.toFixed(3)})`,
        );
      });
    });
  }
});
