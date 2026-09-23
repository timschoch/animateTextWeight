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

import {
  entered,
  left,
  settled,
  target,
  type End,
  type Way,
  type Waves,
} from "./waves.js";

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
  // The far end of this line's wave, for a direction that counts from there.
  line.style.setProperty("--atw-delay-total", String(Math.max(...made.map((m) => m.out.delayCount))));
  line.replaceChildren(...made.map((m) => m.span));
  return { units: made.map((m) => m.out), widths };
}

/** Which end of an element a wave starts at. */
type Side = "start" | "end";

/**
 * What the element asked its direction to follow, if it asked for anything.
 *
 * A list, because an element can follow both. Each watcher writes the same
 * one end, so whichever moved last has the say: scroll the page under a
 * resting pointer and the page decides, cross the element and the pointer
 * does.
 */
function follows(el: HTMLElement): Set<string> {
  const asked = getComputedStyle(el).getPropertyValue("--animate-weight-direction").trim();
  return new Set(asked ? asked.split(/\s+/) : []);
}

/** The other one of the two. */
const OTHER_END: Record<Side, Side> = { start: "end", end: "start" };

/**
 * What a flip reads as for a given end, which is inverted while the pair of
 * waves is running back down.
 *
 * A wave climbing 0 to 1 lets go of the unit with the shortest wait first; the
 * same wave falling 1 to 0 lets go of the longest wait first, so it crosses
 * the text the other way. The flip has to invert with it, or a visit that runs
 * the pair home would put its band on backwards.
 */
const flipFor = (el: HTMLElement, side: Side): string =>
  (side === "end") !== (target(waves(el).way) === "0") ? "1" : "0";

/**
 * Point a wave at one of its ends, for animateTextWeight.css to read.
 *
 * A flip rather than a word, because that is what the units count from, and
 * they inherit it straight off this element. A word the stylesheet had to turn
 * into a flip would go through a style container query, which settles one pass
 * later than an inherited value does.
 */
function aim(el: HTMLElement, wave: "in" | "out", side: Side): void {
  const name = `--atw-flip-${wave}`;
  const flip = flipFor(el, side);
  // The same end again would still throw the element's style away and have it
  // worked out afresh, for nothing.
  if (el.style.getPropertyValue(name) === flip) return;
  el.style.setProperty(name, flip);
}

/** The end one of an element's waves points at. Nothing written is a flip of 0. */
function aimed(el: HTMLElement, wave: "in" | "out" = "in"): Side {
  const flip = el.style.getPropertyValue(`--atw-flip-${wave}`) || "0";
  return flip === flipFor(el, "end") ? "end" : "start";
}

/**
 * An element's waves that are still on their way somewhere, either the leading
 * one or both.
 */
function running(el: HTMLElement, which: "in" | "both"): Animation[] {
  const wanted = which === "in" ? "--atw-wave-in" : "--atw-wave";
  return el
    .getAnimations({ subtree: true })
    .filter((run) =>
      String((run as { transitionProperty?: string }).transitionProperty).startsWith(wanted),
    );
}

/**
 * Whether one of an element's waves is parked at an end on every line, which
 * is the only place its own flip may be moved.
 *
 * Parked, every unit reads that wave as the same number, so counting it from
 * the other end changes nothing. Anywhere in between the units disagree, and
 * the flip re-sorts the line in a single frame.
 */
function parked(el: HTMLElement, which: "in" | "out"): boolean {
  return [...el.querySelectorAll<HTMLElement>(`.${LINE}`)].every((line) => {
    const wave = Number(getComputedStyle(line).getPropertyValue(`--atw-wave-${which}`));
    // Not 0 and 1 exactly: a crossing can land a frame after the wave left an
    // end, and that early the units still nearly agree.
    return wave < 0.02 || wave > 0.98;
  });
}

/** The end each element's leading wave is to point at, once it may be moved. */
const turning = new WeakMap<HTMLElement, Side>();

/**
 * Point an element's leading wave at one of its ends, as soon as it may be.
 *
 * Every unit works its own share out of the flip live, so moving the flip
 * under a running wave re-sorts the whole line in a single frame: the letters
 * the wave has reached and the ones it has not trade places on the spot.
 * Parked at either end the units all agree, and only there is the flip free.
 * So a turn that lands mid-wave waits for the wave to arrive somewhere.
 *
 * The leading wave only, and never the trailing one. This end is the one the
 * rise counts from, so what it costs is decided by where the rise is and by
 * nothing else. Waiting on a trailing wave as well would hold the end back for
 * a whole further crossing, and it would land in the middle of the next one.
 */
function turn(el: HTMLElement, side: Side): void {
  if (aimed(el) === side) return void turning.delete(el);
  turning.set(el, side);
  const later = (): void => {
    // A turn since has asked for something else, and it does the waiting.
    if (turning.get(el) !== side) return;
    const waves = running(el, "in");
    // Parked, or nothing left to arrive because a wave was dropped where it
    // stood: either way the flip is as cheap now as it will ever be.
    if (parked(el, "in") || !waves.length) {
      turning.delete(el);
      return aim(el, "in", side);
    }
    // allSettled, because a wave turned round on the way rejects rather than
    // resolves. Either way it is nearer an end than it was, so look again.
    void Promise.allSettled(waves.map((run) => run.finished)).then(later);
  };
  later();
}

/**
 * Where an element's waves were last sent, off its own inline style. Nothing
 * written reads as a fresh element: both waves home, running up from the start.
 */
function waves(el: HTMLElement): Waves {
  const end = (name: string): End =>
    el.style.getPropertyValue(name) === "1" ? "1" : "0";
  const way: Way = el.style.getPropertyValue("--atw-way") === "-1" ? "-1" : "1";
  return { in: end("--atw-in"), out: end("--atw-out"), way };
}

/**
 * Send an element's waves where a crossing says. All three every time: one
 * already in place writes nothing new, and saying only the half that changed
 * would mean guessing which half that is.
 */
function send(el: HTMLElement, w: Waves): void {
  el.style.setProperty("--atw-in", w.in);
  el.style.setProperty("--atw-out", w.out);
  el.style.setProperty("--atw-way", w.way);
}

/**
 * Wait for a band to come off the text, then turn the pair round ready for the
 * next one.
 *
 * Nothing is put back. The waves finish a visit at the end they were sent to,
 * and the next visit runs them home again; --atw-way is the sign that keeps
 * the gap between them the right way up either way round. Putting them back
 * instead would mean a whole further crossing of nothing to look at, and any
 * crossing that landed in it would find both waves mid-flight, where neither
 * end may be moved.
 *
 * Worked out from where the waves were sent rather than turned over, so that
 * saying it twice says the same thing: a pointer that comes and goes during
 * one band leaves a wait behind for every leaving, and they all finish on the
 * same answer. And only where the two were sent to the same end, which is what
 * a band that came off leaves behind and the only state this may read. A
 * pointer sitting on the text has them at opposite ends holding it at full
 * weight, and turning the pair round under that would let go of all of it.
 */
function settle(el: HTMLElement): void {
  const runs = running(el, "both");
  if (runs.length) {
    void Promise.allSettled(runs.map((run) => run.finished)).then(() => settle(el));
    return;
  }
  // A flip means an end only for the way the pair is running, so turning the
  // pair round writes both again for the ends they meant. Left alone, a page
  // that switches the text on next would send it from the wrong end.
  const ends = { in: aimed(el, "in"), out: aimed(el, "out") };
  send(el, settled(waves(el)));
  aim(el, "in", ends.in);
  aim(el, "out", ends.out);
}

/** Elements whose wave follows the page. */
const scrollers = new Set<HTMLElement>();
/** The end the page last moved toward, which is what a new scroller starts at. */
let scrolledToward: Side = "start";
/**
 * The order things happened in: each one takes the next number. A switch can
 * be flipped by the pointer or by the page, and which moved last says which.
 */
let clock = 0;
/** When the page last scrolled, on that clock. */
let scrolledAt = 0;

let watchingScroll = false;

/**
 * Watch the page, once, for all of them. An element no longer in the document
 * is dropped, not turned.
 */
function watchScroll(): void {
  if (watchingScroll) return;
  watchingScroll = true;
  let at = scrollY;
  addEventListener(
    "scroll",
    () => {
      const moved = scrollY - at;
      at = scrollY;
      if (!moved) return;
      scrolledAt = ++clock;
      // Down the page reads the way the text does, from the start; back up
      // reads from the end. Only a turn is worth writing.
      const now: Side = moved > 0 ? "start" : "end";
      if (now === scrolledToward) return;
      scrolledToward = now;
      for (const el of scrollers) {
        if (!el.isConnected) forget(el);
        else if (follows(el).has("scroll")) turn(el, now);
      }
    },
    { passive: true },
  );
}

/**
 * Elements whose waves the script sends, what takes their listeners down, and
 * whether the pointer is one of the things they follow.
 */
const sending = new Map<HTMLElement, { off: AbortController; pointer: boolean }>();

/**
 * Follow the pointer across one element: a wave in after it and one out
 * behind it.
 *
 * Going in points the leading wave at the end the pointer crossed, so the
 * weight runs after the pointer. Coming out sends the trailing wave from the
 * far end, so the weight lets go behind it. Cross a word left to right and one
 * band of weight travels left to right; turn back at the edge you came in by
 * and the band comes back with you.
 *
 * Writing this on the crossing itself only works because no tween starts on a
 * crossing any more. The units read the flips in the open, every frame, so a
 * wave that is already running turns round when one does. The browser is
 * welcome to switch :hover on before it says a word about it.
 *
 * One band at a time, and the waves themselves say which one. Both at rest is
 * a fresh visit, where either end may be moved. Anything else is the last band
 * still coming off, and a switch that comes back on then turns the trailing
 * wave round rather than starting a second: no end moves, nothing jumps, and
 * the weight fills back in behind the pointer in the order it let go.
 *
 * The pointer only aims. What sends the waves is the page's switch, heard
 * through --atw-on, because a hover is only one of the things that hold it: a
 * nav link the page marks as current stays bold after the pointer has been
 * and gone, and goes light when the page lets go of it, from the end the page
 * scrolled toward.
 *
 * So an element that follows only the page hears the switch the same way, with
 * no pointer to aim for it. Left to the stylesheet, its two waves would run
 * together, and a switch that a jump by End flips on and off again a frame
 * later would show nothing at all; sent from here, it gets the least band.
 */
function cross(el: HTMLElement, signal: AbortSignal, pointer: boolean): void {
  // On the clock, so the switch can tell which of them flipped it.
  let enteredAt = 0;
  let leftAt = 0;
  let onAt = 0;
  // When the switch last came on, in ms: how long the band has had.
  let arrived = 0;
  // The end the trailing wave is to come off from, if the pointer lets go.
  let exit: Side = "start";
  const near = (e: PointerEvent): Side => {
    const box = el.getBoundingClientRect();
    // Line by line the wave runs top to bottom, so the height the pointer
    // crossed at is what says which end it is nearest.
    if (!el.querySelector(`.${CHAR}`)) return e.clientY < box.top + box.height / 2 ? "start" : "end";
    // Along a line, the left half is the start unless the text runs the other way.
    const rtl = getComputedStyle(el).direction === "rtl";
    return e.clientX < box.left + box.width / 2 !== rtl ? "start" : "end";
  };
  // Taken down when the element is dropped: one that comes back gets a fresh
  // set, never a second one on top.
  if (pointer) {
    el.addEventListener("pointerenter", (e) => {
      enteredAt = ++clock;
      // Only where the leading wave is parked: every unit reads it as the same
      // number there, so counting it from the other end changes nothing.
      if (parked(el, "in")) aim(el, "in", near(e));
    }, { signal });
    el.addEventListener("pointerleave", (e) => {
      leftAt = ++clock;
      exit = OTHER_END[near(e)];
    }, { signal });
  }
  /*
   * The doorbell rings on transitionrun. A switch that flips back before the
   * browser has drawn a frame, which a jump by Home or End does to every
   * section it passes, finds the doorbell still at its old value: the browser
   * cancels it rather than running it again. The cancel is the same news.
   */
  const hear = (e: TransitionEvent): void => {
    // One per line, and the first speaks for all of them.
    if (e.propertyName !== "--atw-on" || e.target !== el.querySelector(`.${LINE}`)) return;
    const scroll = scrollers.has(el);
    if (switchedOn(el)) {
      onAt = ++clock;
      arrived = e.timeStamp;
      // The page switched it on, not the pointer: from the end it scrolled
      // toward, whatever the last pointer to pass left behind.
      if (scroll && scrolledAt > enteredAt && parked(el, "in")) aim(el, "in", scrolledToward);
      // Leading wave to the far end, trailing wave home again, every time. On a
      // fresh visit the trailing one is already home and only the leading one
      // moves, which opens the band; mid-band the leading one has already
      // arrived and only the trailing one moves, which sends the weight back in
      // in the order it let go. Saying both either way is what stops this
      // being a no-op, which is a switch that does nothing at all.
      el.style.removeProperty("--atw-out-wait");
      send(el, entered(waves(el)));
      return;
    }
    // Only where the trailing wave is parked: one sent home again mid-band
    // keeps the end it had, and an end moved mid-crossing re-sorts the line.
    // The pointer's end if leaving is what let go, else the page's.
    const end = leftAt > Math.max(onAt, scrolledAt) ? exit : scroll ? scrolledToward : aimed(el);
    if (parked(el, "out")) aim(el, "out", end);
    // How far the trailing wave follows the leading one by: however long the
    // switch was on, and never less than --atw-wave-min-delay. Brush a link in
    // a moment and the band would otherwise be a letter wide and show nothing.
    // The subtraction is left to CSS, which knows what that floor is.
    el.style.setProperty(
      "--atw-out-wait",
      `max(0s, calc(var(--atw-wave-min-delay) - ${Math.round(e.timeStamp - arrived)}ms))`,
    );
    send(el, left(waves(el)));
    settle(el);
  };
  el.addEventListener("transitionrun", hear, { signal });
  el.addEventListener("transitioncancel", hear, { signal });
}

/** Whether the page's switch is on for an element right now. */
const switchedOn = (el: HTMLElement): boolean =>
  getComputedStyle(el).getPropertyValue("--animate-weight").trim() === "true";

/**
 * Follow whatever the element asked its direction to follow. Both watchers
 * write one end and nothing else, so the wave can turn round at any moment
 * and nothing is measured again.
 *
 * Each is joined on its own, and an element told to follow something else
 * later is simply dropped from the one it left.
 */
function watch(el: HTMLElement): void {
  const modes = follows(el);
  const pointer = modes.has("pointer");
  const scroll = modes.has("scroll");
  if (scroll) {
    watchScroll();
    scrollers.add(el);
    turn(el, scrolledToward);
  } else {
    scrollers.delete(el);
  }
  // Calibration runs again on every resize; the listeners stay for as long as
  // the element follows the same things, so they are hung once for that.
  const had = sending.get(el);
  if (had && had.pointer !== pointer) {
    had.off.abort();
    sending.delete(el);
  }
  if ((pointer || scroll) && !sending.has(el)) {
    const off = new AbortController();
    sending.set(el, { off, pointer });
    cross(el, off.signal, pointer);
    // Already on, and nothing flips it to say so: send the waves where the
    // switch would have, so the first time it goes off has a band to lift.
    if (switchedOn(el)) send(el, entered(waves(el)));
  }
  if (!pointer && !scroll) {
    sending.get(el)?.off.abort();
    sending.delete(el);
    // The waves were the script's to send. Left where it last sent them, they
    // would hold the text there, whatever the page's switch says after.
    for (const name of ["--atw-in", "--atw-out", "--atw-out-wait", "--atw-way"])
      el.style.removeProperty(name);
    // A fixed end again: drop what the script last wrote, or the stylesheet
    // would still be read through it. The waiting turn first, or it would put
    // an end back after the rest had gone.
    turning.delete(el);
    el.style.removeProperty("--atw-flip-in");
    el.style.removeProperty("--atw-flip-out");
  }
}

/** Elements calibrated again when the page changes width. */
const resized = new Set<HTMLElement>();
let watchingResize = false;

/** Let go of an element that has left the document, listeners and all. */
function forget(el: HTMLElement): void {
  resized.delete(el);
  scrollers.delete(el);
  sending.get(el)?.off.abort();
  sending.delete(el);
}

/**
 * Watch the page width, once, for all of them. An element no longer in the
 * document is dropped, not calibrated.
 */
function watchResize(): void {
  if (watchingResize) return;
  watchingResize = true;
  let width = innerWidth;
  let pending = 0;
  // A line is laid out once per stop, and character mode reads every character
  // out of each of those, so a dragged window edge must not recalibrate on
  // every event it fires.
  addEventListener("resize", () => {
    if (innerWidth === width) return;
    width = innerWidth;
    clearTimeout(pending);
    pending = setTimeout(() => {
      for (const el of resized) {
        if (el.isConnected) calibrate(el);
        else forget(el);
      }
    }, 150);
  });
}

/**
 * Split one element into its lines, then its units, and write their values.
 * Done again after each resize, for as long as the element is in the document.
 */
export function calibrate(el: HTMLElement): Report | null {
  const r = range(el);
  if (!r) return null;
  for (const old of resized) if (!old.isConnected) forget(old);
  resized.add(el);
  watchResize();
  watch(el);
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
  // The far end of a line-by-line wave. A line split into characters sets its
  // own, which is the one its characters then see.
  el.style.setProperty("--atw-delay-total", String(spans.length - 1));

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
  return els;
}

/** Wait for the fonts, then calibrate the page. */
export function init(root: ParentNode = document): Promise<HTMLElement[]> {
  return document.fonts.ready.then(() => calibrateAll(root));
}
