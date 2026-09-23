/*
 * The demo's one switch: exactly the section across the middle of the screen
 * is active, and only its nav link and heading carry --animate-weight: true.
 *
 * A jump by Home or End passes every section in a few frames. A switch driven
 * by enter and exit events loses one now and then when the main thread is
 * busy, and leaves that section's link bold for good. The CPU is slowed down
 * so a busy main thread is the rule here, not luck.
 *
 * Nor may a jump skip what it passes: every section between the two ends is
 * switched on and off again in page order, so the nav waves along the way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { serve } from "./serve.mjs";

const ROUNDS = 4;

/**
 * Wait until the walk has reached the section across the middle and neither
 * the page nor the switch has moved for a run of frames. The walk steps once a
 * link's wave is across, so it can be still for longer than that run while it
 * is under way. Gives up after a while, for check() to say what is wrong.
 */
const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((done) => {
        const middle = innerHeight / 2;
        const until = performance.now() + 15000;
        let last = "";
        let still = 0;
        const frame = () => {
          const active = [...document.querySelectorAll(".page-section.active")].map((el) => el.id);
          const across = [...document.querySelectorAll(".page-section")].filter((s) => {
            const box = s.getBoundingClientRect();
            return box.top <= middle && box.bottom > middle;
          });
          const arrived = `${active}` === `${across.map((s) => s.id)}`;
          const now = `${scrollY} ${active}`;
          if (now !== last) [last, still] = [now, 0];
          else if ((arrived && ++still > 10) || performance.now() > until) return done();
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );

/** What is marked, next to what should be: the section across the middle. */
const read = (page) =>
  page.evaluate(() => {
    const middle = innerHeight / 2;
    const sections = [...document.querySelectorAll(".page-section")];
    // The switch as the tween reads it: the computed value, whatever set it.
    const on = (el) => el && getComputedStyle(el).getPropertyValue("--animate-weight").trim() === "true";
    const lit = (els) => els.filter(on).length;
    const ids = (els) => els.map((el) => el.id);
    const across = sections.filter((s) => {
      const box = s.getBoundingClientRect();
      return box.top <= middle && box.bottom > middle;
    });
    return {
      expected: { active: ids(across), links: across.length, headings: across.length },
      actual: {
        active: ids(sections.filter((s) => s.classList.contains("active"))),
        links: lit([...document.querySelectorAll(".page-nav a")]),
        headings: lit([...document.querySelectorAll(".page-section > h3")]),
      },
      linked: across.every((s) => on(document.querySelector(`.page-nav a[href="#${s.id}"]`))),
    };
  });

/** The switches since last asked, in the order they happened. */
const marks = (page) => page.evaluate(() => window.marks.splice(0));

/** The walk from one section to another: each one let go, the next one on. */
function walk(ids, from, to) {
  const way = Math.sign(to - from);
  const out = [];
  for (let i = from; i !== to; i += way) out.push(`${ids[i]} off`, `${ids[i + way]} on`);
  return out;
}

async function check(page, label, id) {
  await settle(page);
  const { expected, actual, linked } = await read(page);
  if (id) assert.deepEqual(expected.active, [id], `${label}: expected ${id} across the middle`);
  assert.deepEqual(actual, expected, `${label}: marked sections, links and headings`);
  assert.ok(linked, `${label}: the active section's own link is the lit one`);
}

test("only the section across the middle stays marked through Home, End and anchor jumps", async (t) => {
  const server = await serve();
  const browser = await puppeteer.launch({ channel: "chrome", headless: true });
  t.after(async () => {
    await browser.close();
    server.close();
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`${server.url}/demo/index.html`);
  await page.waitForSelector("#sec-about.active");
  await check(page, "load", "sec-about");
  const ids = await page.evaluate(() => {
    window.marks = [];
    const sections = [...document.querySelectorAll(".page-section")];
    const heard = new MutationObserver((records) => {
      // Off the value before, as the section may have moved again since.
      for (const { target, oldValue } of records)
        window.marks.push(`${target.id} ${/\bactive\b/.test(oldValue) ? "off" : "on"}`);
    });
    for (const s of sections) heard.observe(s, { attributeFilter: ["class"], attributeOldValue: true });
    return sections.map((s) => s.id);
  });
  await page.emulateCPUThrottling(4);

  for (let i = 0; i < ROUNDS; i++) {
    await page.keyboard.press("End");
    await check(page, `round ${i} End`, ids.at(-1));
    assert.deepEqual(await marks(page), walk(ids, 0, ids.length - 1), `round ${i} End: sections passed`);
    await page.keyboard.press("Home");
    await check(page, `round ${i} Home`, "sec-about");
    assert.deepEqual(await marks(page), walk(ids, ids.length - 1, 0), `round ${i} Home: sections passed`);
  }
  for (const hash of ["#sec-thanks", "#sec-use"]) {
    await page.click(`.page-nav a[href="${hash}"]`);
    await check(page, hash);
  }
});
