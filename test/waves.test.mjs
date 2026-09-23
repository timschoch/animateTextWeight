/*
 * The rest-state machine in src/waves.ts, over every state it can be in.
 *
 * Three switches of two values each make eight states, so every property is
 * checked on all of them rather than on a sample. Runs against the build.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entered,
  left,
  settled,
  target,
  weight as signed,
} from "../dist/waves.js";

// A pair running down that comes to rest works out as -0, which is no weight
// all the same; strict equality alone would tell the two apart.
const weight = (w) => signed(w) || 0;

const ENDS = ["0", "1"];
const WAYS = ["1", "-1"];
const ALL = ENDS.flatMap((i) =>
  ENDS.flatMap((o) => WAYS.map((way) => ({ in: i, out: o, way })))
);
const name = (w) => `in ${w.in} out ${w.out} way ${w.way}`;

test("there are eight states", () => assert.equal(ALL.length, 8));

test("an entry always rests at full weight", () => {
  for (const w of ALL) assert.equal(weight(entered(w)), 1, name(w));
});

test("a leaving after an entry always rests at no weight", () => {
  for (const w of ALL) assert.equal(weight(left(entered(w))), 0, name(w));
});

test("settling twice says the same as settling once", () => {
  for (const w of ALL) {
    assert.deepEqual(settled(settled(w)), settled(w), name(w));
  }
});

test("settling leaves waves at opposite ends alone", () => {
  for (const w of ALL.filter((w) => w.in !== w.out)) {
    assert.deepEqual(settled(w), w, name(w));
  }
});

test("after a visit the next entry moves the leading wave", () => {
  for (const w of ALL) {
    const rest = settled(left(entered(w)));
    assert.equal(rest.in, rest.out, name(w));
    assert.notEqual(target(rest.way), rest.in, name(w));
  }
});

test("any sequence of crossings rests at 0 or 1, as the last one says", () => {
  // A fixed LCG, so a failure replays exactly.
  let seed = 1;
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  const steps = [
    ["entered", entered],
    ["left", left],
    ["settled", settled],
  ];
  for (const start of ALL) {
    for (let run = 0; run < 500; run++) {
      let w = start;
      let crossed = false;
      const trace = [];
      for (let step = 0; step < 20; step++) {
        // The high bits: an LCG's low ones repeat after a few steps.
        const [label, fn] = steps[(next() >>> 16) % 3];
        trace.push(label);
        crossed ||= label !== "settled";
        const before = w;
        w = fn(w);
        const at = `${name(start)}: ${trace.join(" ")}`;
        // Two starting states weigh -1, the pair a whole crossing apart the
        // wrong way round. Nothing leads there, and settling alone keeps them,
        // so the claim holds from the first crossing on.
        if (crossed) assert.ok(weight(w) === 0 || weight(w) === 1, at);
        if (label === "entered") assert.equal(weight(w), 1, at);
        if (label === "left") assert.equal(weight(w), 0, at);
        if (label === "settled" && before.in !== before.out) {
          assert.deepEqual(w, before, at);
        }
      }
    }
  }
});

test("regression: an entry onto waves resting at 1 running down is not a no-op", () => {
  // The frozen element: both waves at the far end with the pair turned round.
  // An entry that wrote a value already in place left it at no weight.
  const w = { in: "1", out: "1", way: "-1" };
  assert.equal(weight(w), 0);
  const e = entered(w);
  assert.equal(weight(e), 1);
  assert.notDeepEqual(e, w);
});
