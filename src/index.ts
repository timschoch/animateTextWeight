/*
 * animateTextWeight: measure each rendered line of an animated element and
 * write the numbers that keep it at its width at every weight.
 *
 * A string's width at a weight depends on its letters, so no table per font
 * can hold every text to the same width, and one spacing per element can
 * hold one line only. So the element is split into its rendered lines, one
 * span per line. A line that animates whole gets eleven --atw-ls-<stop>
 * letter-spacings; a line that animates by character is split again and each
 * character gets eleven --atw-w-<stop> box widths, which add up to the line's
 * width at every stop. animateTextWeight.css reads them.
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
/** Class of whatever animates: the line, or one character inside it. */
export const UNIT = "animate-text-weight-unit";
/** Class of one character, which gives it a box of its own. */
export const CHAR = "animate-text-weight-char";
/**
 * The CSS map has STOPS values, --atw-ls-0 to --atw-ls-(STOPS - 1).
 *
 * An odd number, so the middle weight is one of them. A variable font is drawn
 * at a few weights and interpolated between them, and the middle of the range
 * is very often one of those drawings: measure it and the line holds all the
 * way through, miss it and the line dips by about two pixels halfway.
 */
const STOPS = 11;

/** What one unit is: a whole line, or a single character. */
export type Mode = "line" | "character";

/** Original child nodes of each split element, so it can be split again. */
const sources = new WeakMap<HTMLElement, Node[]>();

export interface Unit {
  text: string;
  /** Its kerned advance at the from weight, px. */
  target: number;
  /** The box it is given at each stop, px. These add up to the line's target. */
  boxes: number[];
  /** How many delays this unit waits before it starts. */
  delayCount: number;
}

export interface Line {
  text: string;
  /** The width the line is held at, px. */
  target: number;
  /** What the line would measure at each stop, left alone, px. */
  widths: number[];
  /** Line mode: its letter-spacing at each stop, px. Empty in character mode. */
  spacing: number[];
  /** How many delays it waits. Zero in character mode: its characters wait. */
  delayCount: number;
  /** One per character in character mode, empty in line mode. */
  units: Unit[];
}

export interface Report {
  from: number;
  to: number;
  /** What was actually split, which can be less than asked for. */
  by: Mode;
  /** The weight at each stop, from first to last. */
  weights: number[];
  lines: Line[];
}

/**
 * The weight range set in CSS, or null when the element does not animate.
 * --animate-weight-from is optional: the element's font-weight is the from weight.
 */
export function range(el: Element): { from: number; to: number; by: Mode } | null {
  const cs = getComputedStyle(el);
  const from = Number(cs.getPropertyValue("--animate-weight-from")) || Number(cs.fontWeight);
  const to = Number(cs.getPropertyValue("--animate-weight-to"));
  if (!from || !to || from === to) return null;
  const by = cs.getPropertyValue("--animate-weight-by").trim() === "character" ? "character" : "line";
  return { from, to, by };
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

/**
 * One value per stop, as --atw-<name>-<stop>.
 *
 * Three decimals. More makes Firefox shimmer, fewer leaves 0.04px gaps.
 */
function values(span: HTMLElement, name: string, list: number[]): void {
  list.forEach((v, k) => span.style.setProperty(`--atw-${name}-${k}`, `${v.toFixed(3)}px`));
}

/** Switch a span on: the weights it moves between, and its place in the wave. */
function unit(span: HTMLElement, from: number, to: number, delayCount: number): void {
  span.style.setProperty("--atw-from", String(from));
  span.style.setProperty("--atw-to", String(to));
  span.style.setProperty("--atw-delay-count", String(delayCount));
  span.classList.add(UNIT);
}

/** Graphemes of a text, so an accent or an emoji stays whole. */
function graphemes(text: string): string[] | null {
  if (typeof Intl.Segmenter !== "function") return null;
  const parts = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text);
  return [...parts].map((p) => p.segment);
}

/**
 * How far each part of a text node sits from the one before it, kerning and
 * all. Read as growing prefixes: the widths then add up to the line's own
 * width by construction, and right-to-left text works, where subtracting
 * left edges would give nonsense.
 */
function advances(node: Text, parts: string[]): number[] {
  const span = document.createRange();
  span.setStart(node, 0);
  let end = 0;
  let before = 0;
  return parts.map((part) => {
    end += part.length;
    span.setEnd(node, end);
    const upToHere = span.getBoundingClientRect().width;
    const advance = upToHere - before;
    before = upToHere;
    return advance;
  });
}

/**
 * How many places a span takes its letter-spacing, counted by probing rather
 * than by counting letters. A browser puts one after every character the font
 * draws, and a ligature is one character however many letters went into it, so
 * the text alone does not say. width is the span's width at rest spacing.
 */
function slots(span: HTMLElement, rest: number, width: number): number {
  const probe = 10;
  span.style.letterSpacing = `${rest + probe}px`;
  const wide = span.getBoundingClientRect().width;
  span.style.letterSpacing = `${rest}px`;
  return Math.max(Math.round((wide - width) / probe), 1);
}

/**
 * How much room every unit asks for at every stop, and what the line would
 * measure at each stop if nothing held it.
 *
 * A unit asks for its own kerned advance at that stop, less a reserve. The
 * reserve is one number for the whole line, so a unit's request depends on
 * nothing but itself and its own weight — which is what lets the characters
 * run out of step without upsetting the line.
 *
 * Asking for too little is the point. Whatever a line has left over, flexbox
 * hands out in equal parts, so each unit ends up with its own advance less an
 * even share of what the line is over by right now. At rest that share is
 * nothing, at the end it is what line mode's letter-spacing takes off, and in
 * between it is whatever it has to be for the line to stay the same width.
 *
 * The reserve itself cancels out of that, so its size does not matter as long
 * as there is always something left to hand out. It is taken from the widest
 * every unit ever gets, one by one, because they do not all get widest at the
 * same weight: a word space is at its widest at the lightest.
 */
function fit(advances: number[][], target: number): { boxes: number[][]; widths: number[] } {
  // At least one unit: splitChars returns early on a line that has none.
  const count = advances.length;
  const widths = (advances[0] ?? []).map((_, k) => advances.reduce((sum, a) => sum + (a[k] ?? 0), 0));
  const widest = advances.reduce((sum, own) => sum + Math.max(...own), 0);
  const reserve = Math.max(widest - target, 0) / count;
  return { boxes: advances.map((own) => own.map((advance) => advance - reserve)), widths };
}

/**
 * Split one line into character units and write their stops, or null when the
 * text cannot be split safely and the line must stay whole.
 *
 * Kerning is measured before the split and handed back after it, as the box
 * each character is given: the box is the advance the character had while the
 * line was still one piece, at that weight, less its share of the line's
 * growth. See fit().
 */
function splitChars(
  line: HTMLElement,
  text: string,
  weights: number[],
  from: number,
  to: number,
  base: number,
  target: number,
): { units: Unit[]; widths: number[] } | null {
  const parts = graphemes(text);
  const node = line.firstChild;
  if (!parts || !(node instanceof Text)) return null;

  // Every grapheme's kerned advance at every stop, while the line is still
  // one piece. One layout per stop, and the prefix sums are exact by
  // construction.
  //
  // Ligatures off, because each character will be drawn in a box of its own
  // and cannot ligate there. Measured with them on, an fi would give two boxes
  // of half a ligature each, to hold a whole f and a whole i.
  line.style.fontFeatureSettings = '"liga" 0, "clig" 0';
  const perStop = weights.map((weight) => {
    line.style.fontWeight = String(weight);
    return advances(node, parts);
  });
  line.style.removeProperty("font-weight");
  line.style.removeProperty("font-feature-settings");

  // A grapheme that takes no advance of its own belongs to the one before it
  // and shares its box. It still carries the element's own spacing, so what
  // counts as no advance is measured against that. The grouping is decided at
  // the from state and holds for every stop.
  const units: { text: string; start: number; parts: number }[] = [];
  (perStop[0] ?? []).forEach((advance, i) => {
    const open = units.at(-1);
    if (open && advance - base < 0.01) {
      open.text += parts[i] ?? "";
      open.parts += 1;
    } else units.push({ text: parts[i] ?? "", start: i, parts: 1 });
  });
  if (!units.length) return null;

  // A unit's advance is its graphemes', added up.
  const kerned = units.map((unit) =>
    perStop.map((row) => row.slice(unit.start, unit.start + unit.parts).reduce((sum, a) => sum + a, 0)),
  );

  const { boxes, widths } = fit(kerned, target);

  let count = -1;
  const made = units.map((u, i) => {
    const span = document.createElement("span");
    span.className = CHAR;
    span.textContent = u.text;
    // A space keeps the count of the letter before it, so the wave holds its
    // beat across a word gap instead of stalling on something invisible.
    const delayCount = /\S/.test(u.text) ? ++count : Math.max(count, 0);
    values(span, "w", boxes[i] ?? []);
    unit(span, from, to, delayCount);
    return { span, out: { text: u.text, target: kerned[i]?.[0] ?? 0, boxes: boxes[i] ?? [], delayCount } };
  });

  // The width the line is held at, and the only thing that decides it.
  line.style.setProperty("--atw-width", `${target.toFixed(3)}px`);
  line.replaceChildren(...made.map((m) => m.span));
  return { units: made.map((m) => m.out), widths };
}

/** Split one element into its lines, then its units, and write their values. */
export function calibrate(el: HTMLElement): Report | null {
  const r = range(el);
  if (!r) return null;
  const { from, to } = r;
  const weights = Array.from({ length: STOPS }, (_, k) => from + ((to - from) * k) / (STOPS - 1));
  // The element's own spacing is the from state; every stop adds to it.
  const base = parseFloat(getComputedStyle(el).letterSpacing) || 0;
  // Lines break at the from weight, so the element must sit there.
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

  // Falls back to whole lines if a line cannot be split into characters.
  let by: Mode = r.by;
  // Measure in place, before the next paint, with the tween switched off.
  const lines = spans.map((span, i): Line => {
    const text = texts[i] ?? "";
    span.style.transition = "none";
    span.style.letterSpacing = `${base}px`;
    const widthAt = (w: number) => {
      span.style.fontWeight = String(w);
      return span.getBoundingClientRect().width;
    };
    const target = widthAt(from);
    span.style.removeProperty("font-weight");

    const split = by === "character" ? splitChars(span, text, weights, from, to, base, target) : null;
    if (by === "character" && !split) by = "line";
    const done = () => {
      span.style.removeProperty("letter-spacing");
      span.style.removeProperty("transition");
    };

    if (split) {
      done();
      // The line only holds the break now; its characters carry the tween, and
      // their boxes carry the width.
      return { text, target, widths: split.widths, spacing: [], delayCount: 0, units: split.units };
    }

    // The slot count is measured at every stop, not counted from the text: a
    // ligature takes the spacing once, and whether the font makes one can
    // depend on the weight.
    const widths: number[] = [];
    const counts: number[] = [];
    for (const w of weights) {
      const width = widthAt(w);
      widths.push(width);
      counts.push(slots(span, base, width));
    }
    const spacing = widths.map((w, k) => base + (target - w) / (counts[k] ?? 1));
    values(span, "ls", spacing);
    // One line, one delay: the block arrives line by line.
    unit(span, from, to, i);
    span.style.removeProperty("font-weight");
    done();
    return { text, target, widths, spacing, delayCount: i, units: [] };
  });
  return { from, to, by, weights, lines };
}

/** Calibrate every animated element under root, now and after each resize. */
export function calibrateAll(root: ParentNode = document): HTMLElement[] {
  const els = findAll(root);
  els.forEach((el) => calibrate(el));
  let width = innerWidth;
  let pending = 0;
  // A line is laid out once per stop, and character mode reads every character
  // out of each of those, so a dragged window edge must not recalibrate on
  // every event it fires.
  addEventListener("resize", () => {
    if (innerWidth === width) return;
    width = innerWidth;
    clearTimeout(pending);
    pending = setTimeout(() => els.forEach((el) => calibrate(el)), 150);
  });
  return els;
}

/** Wait for the fonts, then calibrate the page. */
export function init(root: ParentNode = document): Promise<HTMLElement[]> {
  return document.fonts.ready.then(() => calibrateAll(root));
}
