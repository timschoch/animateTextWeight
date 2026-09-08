/*
 * animateTextWeight: measure each rendered line of an animated element and
 * write the letter-spacing that keeps it at its width at every weight.
 *
 * A string's width at a weight depends on its letters, so no table per font
 * can hold every text to the same width, and one spacing per element can
 * hold one line only. So the element is split into its rendered lines, one
 * span per line, and each span gets its own ten --atw-ls-<stop> values.
 * animateTextWeight.css reads them.
 *
 * The element says what it wants in CSS: --animate-weight-from and
 * --animate-weight-to. The script finds every element that carries both.
 *
 * Line breaks are read from the live element with a Range. The spans are
 * nowrap and joined by <br>, so the lines are frozen: they can get wider or
 * narrower, never reflow. Runs again on resize, from the original content,
 * which is kept aside.
 */

/** Class of one rendered line, styled by animateTextWeight.css. */
export const LINE = "animate-text-weight-line";
/** The CSS map has STOPS values, --atw-ls-0 to --atw-ls-(STOPS - 1). */
const STOPS = 10;

/** Original child nodes of each split element, so it can be split again. */
const sources = new WeakMap<HTMLElement, Node[]>();

export interface Line {
  text: string;
  /** Width at the rest weight, px. */
  target: number;
  /** Natural width at each stop, px. */
  widths: number[];
  /** Letter spacing that brings each stop back to the target, px. */
  spacing: number[];
}

export interface Report {
  from: number;
  to: number;
  /** The weight at each stop, from first to last. */
  weights: number[];
  lines: Line[];
}

/**
 * The weight range set in CSS, or null when the element does not animate.
 * --animate-weight-from is optional: the element's font-weight is the rest.
 */
export function range(el: Element): { from: number; to: number } | null {
  const cs = getComputedStyle(el);
  const from = Number(cs.getPropertyValue("--animate-weight-from")) || Number(cs.fontWeight);
  const to = Number(cs.getPropertyValue("--animate-weight-to"));
  if (!from || !to || from === to) return null;
  return { from, to };
}

/** Elements under root that carry a weight range and hold text directly. */
export function findAll(root: ParentNode = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    if (el.classList.contains(LINE)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && /\S/.test(n.textContent ?? ""));
    if (hasText && range(el)) out.push(el);
  }
  return out;
}

/** Words of the live element grouped by rendered line. */
export function readLines(el: HTMLElement): string[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const lines: { top: number; words: string[] }[] = [];
  const rangeOf = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    const re = /\S+/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      rangeOf.setStart(node, m.index);
      rangeOf.setEnd(node, m.index + m[0].length);
      const rect = rangeOf.getBoundingClientRect();
      const line = lines.find((l) => Math.abs(l.top - rect.top) < 1);
      if (line) line.words.push(m[0]);
      else lines.push({ top: rect.top, words: [m[0]] });
    }
  }
  return lines.sort((a, b) => a.top - b.top).map((l) => l.words.join(" "));
}

/**
 * Put the original content back, so lines can be read afresh. Content that
 * is not split any more was replaced from outside: that is the new source.
 */
function restore(el: HTMLElement): void {
  const source = sources.get(el);
  if (source && el.querySelector(`.${LINE}`)) el.replaceChildren(...source.map((n) => n.cloneNode(true)));
  else sources.set(el, [...el.childNodes].map((n) => n.cloneNode(true)));
}

/** Split one element into its lines and write each line's values. */
export function calibrate(el: HTMLElement): Report | null {
  const r = range(el);
  if (!r) return null;
  const { from, to } = r;
  const weights = Array.from({ length: STOPS }, (_, k) => from + ((to - from) * k) / (STOPS - 1));
  // The element's own spacing is the rest state; every stop adds to it.
  const base = parseFloat(getComputedStyle(el).letterSpacing) || 0;
  // Lines break at the rest weight, so the element must sit there.
  if (Number(getComputedStyle(el).fontWeight) !== from) el.style.fontWeight = String(from);

  restore(el);
  const texts = readLines(el);
  const spans = texts.map((text) => {
    const span = document.createElement("span");
    span.className = LINE;
    span.textContent = text;
    return span;
  });
  el.replaceChildren(...spans.flatMap((s, i) => (i ? [document.createElement("br"), s] : [s])));

  // Measure in place, before the next paint, with the tween switched off.
  const lines = spans.map((span, i) => {
    const text = texts[i] ?? "";
    span.style.transition = "none";
    span.style.letterSpacing = `${base}px`;
    const widthAt = (w: number) => {
      span.style.fontWeight = String(w);
      return span.getBoundingClientRect().width;
    };
    const chars = Math.max(text.length, 1);
    const target = widthAt(from);
    const widths = weights.map(widthAt);
    const spacing = widths.map((w) => base + (target - w) / chars);
    // Three decimals. More makes Firefox shimmer, fewer leaves 0.04px gaps.
    spacing.forEach((s, k) => span.style.setProperty(`--atw-ls-${k}`, `${s.toFixed(3)}px`));
    span.style.setProperty("--atw-from", String(from));
    span.style.setProperty("--atw-to", String(to));
    span.style.removeProperty("font-weight");
    span.style.removeProperty("letter-spacing");
    span.style.removeProperty("transition");
    return { text, target, widths, spacing };
  });
  return { from, to, weights, lines };
}

/** Calibrate every animated element under root, now and after each resize. */
export function calibrateAll(root: ParentNode = document): HTMLElement[] {
  const els = findAll(root);
  els.forEach((el) => calibrate(el));
  let width = innerWidth;
  addEventListener("resize", () => {
    if (innerWidth === width) return;
    width = innerWidth;
    els.forEach((el) => calibrate(el));
  });
  return els;
}

/** Wait for the fonts, then calibrate the page. */
export function init(root: ParentNode = document): Promise<HTMLElement[]> {
  return document.fonts.ready.then(() => calibrateAll(root));
}
