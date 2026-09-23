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
const N = 8;
const D = 40;
const DUR = 300;
const T = N - 1;
const S = T * D + DUR;

const clamp = (v) => Math.min(1, Math.max(0, v));

/** One unit's share of a wave: how far it has come, less what the unit waits. */
const share = (wave, flip, count) =>
  clamp((wave * S - (count + flip * (T - 2 * count)) * D) / DUR);

/** A wave at time t: a linear ramp from `from` to `to`, starting at `start`. */
const ramp = (from, to, start) => (t) =>
  from + (to - from) * clamp((t - start) / S);

/**
 * Every unit's progress at every millisecond of a crossing: the leading wave
 * starts at 0, the trailing one `lag` ms later, both from `from` to `to`.
 */
function grid({ from = 0, to = 1, lag, flipIn = 0, flipOut = 0, way = 1 }) {
  const waveIn = ramp(from, to, 0);
  const waveOut = ramp(from, to, lag);
  const rows = [];
  for (let t = 0; t <= S + lag; t++) {
    const row = [];
    for (let i = 0; i < N; i++) {
      const rise = share(waveIn(t), flipIn, i);
      const fall = share(waveOut(t), flipOut, i);
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
          for (const lag of [0, D, DUR, 400]) {
            const rows = grid({ from, to, lag, flipIn, flipOut, way });
            for (const v of rows.flat()) assert.ok(v >= 0 && v <= 1);
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
    const rows = grid({ lag: S, flipIn }).slice(0, S + 1);
    const at = (i) => rows.findIndex((row) => row[i] === 1);
    return { first: at(0), last: at(N - 1) };
  };
  const plain = full(0);
  assert.ok(plain.first < plain.last, JSON.stringify(plain));
  const flipped = full(1);
  assert.ok(flipped.last < flipped.first, JSON.stringify(flipped));
});

test("regression: a pair running home with flips inverted draws the same band", () => {
  // Running down, a wave lets go of the longest wait first, so the band only
  // crosses the same way when both flips invert with it.
  for (const lag of [D, DUR, 400]) {
    const up = grid({ lag });
    const home = grid({ from: 1, to: 0, lag, flipIn: 1, flipOut: 1, way: -1 });
    assert.equal(home.length, up.length);
    up.forEach((row, t) =>
      row.forEach((v, i) =>
        assert.ok(Math.abs(v - home[t][i]) < 1e-9, `lag ${lag} t ${t} i ${i}`)
      )
    );
  }
});

test("a band is as heavy as its lag is long, up to a duration", () => {
  // The two waves run at the same speed, so a unit is lit for exactly the lag
  // and reaches lag / duration of full weight.
  for (const lag of [D, DUR / 2, DUR, 400]) {
    assert.ok(Math.abs(peak(grid({ lag })) - Math.min(1, lag / DUR)) < 1e-9);
  }
  // One unit's delay is enough to see; over half a duration is over half.
  assert.ok(peak(grid({ lag: D })) > 0);
  assert.ok(peak(grid({ lag: DUR / 2 + 1 })) > 0.5);
});

test("two waves that run together draw nothing", () => {
  for (const flip of [0, 1]) {
    const rows = grid({ lag: 0, flipIn: flip, flipOut: flip });
    assert.equal(peak(rows), 0);
  }
});
