/**
 * Where a pointer element's two waves stand, and where a crossing sends them.
 *
 * The leading wave brings the weight up and the trailing one takes it away, so
 * the text is at full weight between the two and a band of weight crosses it.
 * Which way round the pair is travelling is the whole of the state: a visit
 * runs them both to one end, the next visit runs them home again, and nothing
 * is ever put back.
 *
 * Kept apart from the element it is written on, and out of the package's
 * exports, because what it has to get right is arithmetic and not animation.
 * A crossing that lands mid-band cannot be ordered against the frame the waves
 * are on, so the rest it comes to must be right whatever they were doing: an
 * entry always leaves the pair a whole crossing apart, which reads as full
 * weight, and a leaving always brings them together, which reads as none. The
 * waves decide how the text gets there and never whether.
 */

/** An end of the text, the way the stylesheet counts: 0 the start, 1 the far one. */
export type End = "0" | "1";

/** Which way round the pair is running: up from the start, or back down. */
export type Way = "1" | "-1";

/** Where each wave is headed, and which way round the two of them are going. */
export interface Waves {
  in: End;
  out: End;
  way: Way;
}

/** The other one of the two. */
export const other = (end: End): End => (end === "1" ? "0" : "1");

/**
 * The end both waves are headed for, which is the one they are not resting at.
 * Every visit runs them from the one to the other.
 */
export const target = (way: Way): End => (way === "-1" ? "0" : "1");

/**
 * A pointer arriving: leading wave to the far end, trailing wave home.
 *
 * Both, every time, although one of the two is always already there. On a
 * fresh visit the trailing wave is home and only the leading one moves, which
 * opens the band; mid-band the leading one has arrived and only the trailing
 * one moves, which sends the weight back in behind the pointer. Saying only
 * the half that is needed means guessing which half that is, and a guess that
 * misses writes a value already in place, which does nothing at all.
 */
export const entered = (w: Waves): Waves => ({
  ...w,
  in: target(w.way),
  out: other(target(w.way)),
});

/** A pointer leaving: the trailing wave after the leading one, to the same end. */
export const left = (w: Waves): Waves => ({ ...w, out: w.in });

/**
 * The pair turned round, ready for the next visit.
 *
 * Only where the two were sent to the same end, which is what a band that has
 * come off leaves behind and the only state this may read. A pointer sitting
 * on the text holds them at opposite ends, and turning the pair round under
 * that would let go of all of it at once.
 */
export const settled = (w: Waves): Waves =>
  w.in === w.out ? { ...w, way: w.in === "1" ? "-1" : "1" } : w;

/** What the text weighs once both waves have arrived: 1 all of it, 0 none. */
export const weight = (w: Waves): number =>
  (Number(w.in) - Number(w.out)) * Number(w.way);
