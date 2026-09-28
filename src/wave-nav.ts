/*
 * waveNav: a nav whose links follow the page, one section at a time.
 *
 * The current section is the one across the middle of the screen, worked out
 * afresh from where things are on every scroll, never from what changed: a
 * jump by Home or End passes every section in a few frames, and a switch that
 * trusts enter and exit events is left on by the one that goes missing.
 *
 * A jump does not skip what it passes. The switch walks there one section at
 * a time, each link on and then off again, and takes the next step once the
 * wave has crossed the link it just switched on: its delay once per unit. So
 * the links pick the wave up one from the other, and a jump sends one wave
 * through the whole nav rather than a small one through each link.
 *
 * Optional, and apart from the library: nothing in index.ts imports it.
 */

import { UNIT } from "./index.js";

export interface WaveNavOptions {
  /** Toggled on the current link, as well as aria-current. */
  linkClass?: string;
  /** Toggled on the current link's section, which aria-current cannot mark. */
  sectionClass?: string;
}

/** At least a frame per step, so no link goes on and off before it is drawn. */
const MIN_STEP = 17;

/**
 * Mark the link of the section across the middle of the screen with
 * aria-current="true". Each link's section is the element its hash names;
 * a link without one is left out. Returns a function that stops following.
 */
export function waveNav(
  links: Iterable<HTMLAnchorElement>,
  options: WaveNavOptions = {}
): () => void {
  const pairs = [...links].flatMap((link) => {
    const section = document.getElementById(link.hash.slice(1));
    return section ? [{ link, section }] : [];
  });

  function setCurrent(index: number, on: boolean) {
    const pair = pairs[index];
    if (!pair) return;
    if (on) pair.link.setAttribute("aria-current", "true");
    else pair.link.removeAttribute("aria-current");
    if (options.linkClass) pair.link.classList.toggle(options.linkClass, on);
    if (options.sectionClass) pair.section.classList.toggle(options.sectionClass, on);
  }

  /** The section across the middle, by index: -1 above the first, the length past the last. */
  function getIndex() {
    const middle = innerHeight / 2;
    const below = pairs.findIndex(
      ({ section }) => section.getBoundingClientRect().bottom > middle
    );
    if (below === -1) return pairs.length;
    return pairs[below]!.section.getBoundingClientRect().top <= middle
      ? below
      : below - 1;
  }

  /** How long the wave takes to cross a link, in ms: its delay once per unit. */
  function getCrossing(link: HTMLElement) {
    const delay = getComputedStyle(link)
      .getPropertyValue("--animate-weight-delay")
      .trim();
    const milliseconds = parseFloat(delay) * (delay.endsWith("ms") ? 1 : 1000);
    return link.querySelectorAll(`.${UNIT}`).length * milliseconds || 0;
  }

  let current = getIndex();
  let target = current;
  // The next step, while the wave is still crossing the last link.
  let timer = 0;
  setCurrent(current, true);

  /** One section nearer the target, and the next once the wave is across. */
  function update() {
    timer = 0;
    if (current === target) return;
    const next = current + Math.sign(target - current);
    setCurrent(current, false);
    setCurrent(next, true);
    current = next;
    const link = pairs[next]?.link;
    timer = setTimeout(
      update,
      Math.max(MIN_STEP, link ? getCrossing(link) : 0)
    );
  }

  function handleMove() {
    target = getIndex();
    if (!timer) update();
  }

  // Scroll events already come once a frame. A section that changes height
  // moves the ones below it without a scroll, and a resize moves the middle.
  addEventListener("scroll", handleMove, { passive: true });
  addEventListener("resize", handleMove);
  const observer = new ResizeObserver(handleMove);
  for (const { section } of pairs) observer.observe(section);

  return () => {
    removeEventListener("scroll", handleMove);
    removeEventListener("resize", handleMove);
    observer.disconnect();
    clearTimeout(timer);
  };
}
