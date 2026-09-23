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
          const active = [...document.querySelectorAll(".page-section.active")].map((element) => element.id);
          const across = [...document.querySelectorAll(".page-section")].filter((section) => {
            const box = section.getBoundingClientRect();
            return box.top <= middle && box.bottom > middle;
          });
          const arrived = `${active}` === `${across.map((section) => section.id)}`;
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
    const isOn = (element) => element && getComputedStyle(element).getPropertyValue("--animate-weight").trim() === "true";
    const lit = (elements) => elements.filter(isOn).length;
    const ids = (elements) => elements.map((element) => element.id);
    const across = sections.filter((section) => {
      const box = section.getBoundingClientRect();
      return box.top <= middle && box.bottom > middle;
    });
    return {
      expected: { active: ids(across), links: across.length, headings: across.length },
      actual: {
        active: ids(sections.filter((section) => section.classList.contains("active"))),
        links: lit([...document.querySelectorAll(".page-nav a")]),
        headings: lit([...document.querySelectorAll(".page-section > h3")]),
      },
      linked: across.every((section) => isOn(document.querySelector(`.page-nav a[href="#${section.id}"]`))),
    };
  });

/** The switches since last asked, in the order they happened. */
const marks = (page) => page.evaluate(() => window.marks.splice(0));

/** The walk from one section to another: each one let go, the next one on. */
function walk(ids, from, to) {
  const way = Math.sign(to - from);
  const out = [];
  for (let index = from; index !== to; index += way) out.push(`${ids[index]} off`, `${ids[index + way]} on`);
  return out;
}

async function validate(page, label, id) {
  await settle(page);
  const { expected, actual, linked } = await read(page);
  if (id) assert.deepEqual(expected.active, [id], `${label}: expected ${id} across the middle`);
  assert.deepEqual(actual, expected, `${label}: marked sections, links and headings`);
  assert.ok(linked, `${label}: the active section's own link is the lit one`);
}

test("only the section across the middle stays marked through Home, End and anchor jumps", async (context) => {
  const server = await serve();
  const browser = await puppeteer.launch({ channel: "chrome", headless: true });
  context.after(async () => {
    await browser.close();
    server.close();
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`${server.url}/demo/index.html`);
  await page.waitForSelector("#sec-about.active");
  await validate(page, "load", "sec-about");
  const ids = await page.evaluate(() => {
    window.marks = [];
    const sections = [...document.querySelectorAll(".page-section")];
    const heard = new MutationObserver((records) => {
      // Off the value before, as the section may have moved again since.
      for (const { target, oldValue } of records)
        window.marks.push(`${target.id} ${/\bactive\b/.test(oldValue) ? "off" : "on"}`);
    });
    for (const section of sections) heard.observe(section, { attributeFilter: ["class"], attributeOldValue: true });
    return sections.map((section) => section.id);
  });
  await page.emulateCPUThrottling(4);

  for (let round = 0; round < ROUNDS; round++) {
    await page.keyboard.press("End");
    await validate(page, `round ${round} End`, ids.at(-1));
    assert.deepEqual(await marks(page), walk(ids, 0, ids.length - 1), `round ${round} End: sections passed`);
    await page.keyboard.press("Home");
    await validate(page, `round ${round} Home`, "sec-about");
    assert.deepEqual(await marks(page), walk(ids, ids.length - 1, 0), `round ${round} Home: sections passed`);
  }
  for (const hash of ["#sec-thanks", "#sec-use"]) {
    await page.click(`.page-nav a[href="${hash}"]`);
    await validate(page, hash);
  }
});
