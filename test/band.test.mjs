/*
 * The band of weight a pair of waves draws across a line, worked out the way
 * src/animateTextWeight.css works it out. That file is the source of truth:
 * change the formulas there and this model has to change in step, or it goes
 * on proving something the stylesheet no longer does. What it replays:
 *
 *   --atw-wait-in: calc(
 *     (
 *         var(--atw-delay-count) + var(--atw-flip-in) *
 *           (var(--atw-delay-total) - 2 * var(--atw-delay-count))
 *       ) * var(--animate-weight-delay)
 *   );
 *   --atw-rise: clamp(
 *     0,
 *     (var(--atw-wave-in) * var(--atw-span) - var(--atw-wait-in)) /
 *       max(1ms, var(--animate-weight-duration)),
 *     1
 *   );
 *   --atw-fall: clamp(
 *     0,
 *     (var(--atw-wave-out) * var(--atw-span) - var(--atw-wait-out)) /
 *       max(1ms, var(--animate-weight-duration)),
 *     1
 *   );
 *   --animate-weight-progress: clamp(
 *     0,
 *     calc((var(--atw-rise) - var(--atw-fall)) * var(--atw-way)),
 *     1
 *   );
 *
 * --atw-wait-out is --atw-wait-in with --atw-flip-out. --atw-span is the last
 * unit's wait plus one duration, so a wave running at linear easing covers
 * 0..1 in exactly that long.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// The stylesheet's defaults, and the delay the README asks for.
const UNITS = 8;
const DELAY = 40;
const DURATION = 300;
const LAST = UNITS - 1;
const SPAN = LAST * DELAY + DURATION;

const clamp = (value) => Math.min(1, Math.max(0, value));

/** One unit's share of a wave: how far it has come, less what the unit waits. */
const share = (wave, flip, count) =>
  clamp((wave * SPAN - (count + flip * (LAST - 2 * count)) * DELAY) / DURATION);

/** A wave at a time: a linear ramp from `from` to `to`, starting at `start`. */
const ramp = (from, to, start) => (time) =>
  from + (to - from) * clamp((time - start) / SPAN);

/**
 * Every unit's progress at every millisecond of a crossing: the leading wave
 * starts at 0, the trailing one `lag` ms later, both from `from` to `to`.
 */
function grid({ from = 0, to = 1, lag, flipIn = 0, flipOut = 0, way = 1 }) {
  const waveIn = ramp(from, to, 0);
  const waveOut = ramp(from, to, lag);
  const rows = [];
  for (let time = 0; time <= SPAN + lag; time++) {
    const row = [];
    for (let index = 0; index < UNITS; index++) {
      const rise = share(waveIn(time), flipIn, index);
      const fall = share(waveOut(time), flipOut, index);
      row.push(clamp((rise - fall) * way));
    }
    rows.push(row);
  }
  return rows;
}

const peak = (rows) => Math.max(...rows.flat());

test("progress stays between 0 and 1", () => {
  for (const way of [1, -1]) {
    for (const [from, to] of [
      [0, 1],
      [1, 0],
    ]) {
      for (const flipIn of [0, 1]) {
        for (const flipOut of [0, 1]) {
          for (const lag of [0, DELAY, DURATION, 400]) {
            const rows = grid({ from, to, lag, flipIn, flipOut, way });
            for (const progress of rows.flat()) assert.ok(progress >= 0 && progress <= 1);
          }
        }
      }
    }
  }
});

test("the flip says which end reaches full weight first", () => {
  // Cut off before the trailing wave starts: the leading one alone, so every
  // unit ends at 1.
  const full = (flipIn) => {
    const rows = grid({ lag: SPAN, flipIn }).slice(0, SPAN + 1);
    const at = (index) => rows.findIndex((row) => row[index] === 1);
    return { first: at(0), last: at(LAST) };
  };
  const plain = full(0);
  assert.ok(plain.first < plain.last, JSON.stringify(plain));
  const flipped = full(1);
  assert.ok(flipped.last < flipped.first, JSON.stringify(flipped));
});

test("regression: a pair running home with flips inverted draws the same band", () => {
  // Running down, a wave lets go of the longest wait first, so the band only
  // crosses the same way when both flips invert with it.
  for (const lag of [DELAY, DURATION, 400]) {
    const up = grid({ lag });
    const home = grid({ from: 1, to: 0, lag, flipIn: 1, flipOut: 1, way: -1 });
    assert.equal(home.length, up.length);
    up.forEach((row, time) =>
      row.forEach((progress, index) =>
        assert.ok(Math.abs(progress - home[time][index]) < 1e-9, `lag ${lag} time ${time} index ${index}`)
      )
    );
  }
});

test("a band is as heavy as its lag is long, up to a duration", () => {
  // The two waves run at the same speed, so a unit is lit for exactly the lag
  // and reaches lag / duration of full weight.
  for (const lag of [DELAY, DURATION / 2, DURATION, 400]) {
    assert.ok(Math.abs(peak(grid({ lag })) - Math.min(1, lag / DURATION)) < 1e-9);
  }
  // One unit's delay is enough to see; over half a duration is over half.
  assert.ok(peak(grid({ lag: DELAY })) > 0);
  assert.ok(peak(grid({ lag: DURATION / 2 + 1 })) > 0.5);
});

test("two waves that run together draw nothing", () => {
  for (const flip of [0, 1]) {
    const rows = grid({ lag: 0, flipIn: flip, flipOut: flip });
    assert.equal(peak(rows), 0);
  }
});
