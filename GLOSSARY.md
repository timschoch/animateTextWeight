# animateTextWeight

A CSS/JS library that tweens text between two variable-font weights while keeping every line's rendered width fixed, by writing per-line letter-spacing.

## Language

**Animated element**:
An element carrying a `to` state in CSS (`--animate-weight-to`), the unit this library finds and calibrates.
_Avoid_: target, node.

**From**:
The state an animated element rests in and breaks its lines at, set as a font-weight in CSS (`--animate-weight-from`). Optional; defaults to the element's own `font-weight`.
_Avoid_: rest state, default state, start state.

**To**:
The state an animated element tweens toward once its switch is on, set as a font-weight in CSS (`--animate-weight-to`).
_Avoid_: end state, animated state.

**Weight**:
The font-weight number that defines a state, from `1` to `1000` on a variable font's weight axis.

**Line**:
One rendered (wrapped) line of an animated element's text, frozen into its own `<span>` so it can be measured and given letter-spacing independent of its siblings.
_Avoid_: segment, row.

**Stop**:
One of the ten sampled points between the `from` and `to` state, each holding its own letter-spacing value written as `--atw-ls-<n>`.
_Avoid_: step, keyframe.

**Target width**:
A line's width at the `from` state. Every stop's letter-spacing is chosen to match it.

**Calibration**:
Splitting an animated element into lines and computing each line's target width and per-stop letter-spacing. Runs on load and again on resize.
_Avoid_: measurement, setup.

**Switch**:
The inherited `--animate-weight` CSS property. Set to `true` on an animated element or any ancestor to turn its tween on.

**Progress**:
The `--animate-weight-progress` CSS property, tweened from 0 to 1 by the browser's own transition. Drives both font-weight and letter-spacing.

**Source**:
An animated element's original, unsplit child nodes, kept aside so it can be split into lines again from scratch (e.g. after a resize, or after its content changed from outside).
