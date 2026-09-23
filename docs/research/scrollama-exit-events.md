# scrollama 3.2.0: dropped exit events on fast scroll

No existing `docs/research/` convention in this repo — filed under `docs/research/` per the task's fallback path.

## 1. Is this a known scrollama issue?

Confirmed in source, not filed as this exact bug report.

**The `entries[0]` claim, quoted from source.** `src/entry.js`, function `intersectStep`:

```js
function intersectStep([entry]) {
	onScroll(containerElement);

	const { isIntersecting, target } = entry;
	if (isIntersecting) notifyStepEnter(target);
	else notifyStepExit(target);
}
```

Destructuring the callback parameter as `[entry]` takes only `entries[0]`; any further entries in the same invocation are discarded. Source at the current `main` HEAD (commit `afab8ab2`, package.json `"version": "3.2.0"`, matches published npm `3.2.0`):
https://github.com/russellsamora/scrollama/blob/afab8ab2509a7e0112bee4bd7c131eafc50ffc3a/src/entry.js#L142-L146

Registered the same way for both observers — step (`updateStepObserver`) and progress (`intersectProgress`, also `[entry]`) — so both paths share the flaw:
https://github.com/russellsamora/scrollama/blob/afab8ab2509a7e0112bee4bd7c131eafc50ffc3a/src/entry.js#L188-L191

**Issue tracker.** No issue matches "entries[0]" or "batch" text directly (searched `repo:russellsamora/scrollama entries[0]` and `batch`, zero hits), but the general failure class — an IntersectionObserver-based step never triggering when a scroll motion is fast/large enough to be coalesced into fewer callbacks — is filed and maintainer-acknowledged:

- [#26 "possible to not trigger a step"](https://github.com/russellsamora/scrollama/issues/26) (closed, no code fix). Maintainer reply: "This is due to how IntersectionObserver works … if the scroll is so fast and the element small enough it can not register an enter/exit … Totally possible to jump completely past an element, even if you use the full viewport for detection." Proposed a second full-viewport observer as a real fix — never implemented.
- [#78 "Skip animation on step jump"](https://github.com/russellsamora/scrollama/issues/78) (closed) — anchor-jump case (our Home/End scenario). Maintainer's only guidance: manually `disable()` before the jump, compute the destination, jump, `enable()` again — i.e., work around the library, not a library fix.
- [#136 "Step sometimes not triggered — use with container as parent"](https://github.com/russellsamora/scrollama/issues/136) (**open**) and [#141 "does not trigger onStepEnter when the element is fully visible on initial load"](https://github.com/russellsamora/scrollama/issues/141) (**open**) — same symptom family, unresolved.

No issue or PR proposes iterating all `entries` instead of `entries[0]`; the maintainer's own diagnosis in #26 stays at the IntersectionObserver-threshold level and never reaches the destructuring bug.

**Release/maintenance status.**
- npm `dist-tags.latest` is still `3.2.0`, published 2022-06-17: https://registry.npmjs.org/scrollama (`time["3.2.0"] = "2022-06-17T16:59:23.254Z"`)
- Commit history after that release is almost inactive: one substantive commit in over 3 years, 2022-10-13 ("no jekyll" / demo housekeeping), then nothing until 2025-11-13, when two commits merged that only *remove* an unused `intersection-observer` polyfill devDependency — no logic change, and not published to npm (latest npm version is still `3.2.0`).
- [PR #151 "Refactor & improve performance"](https://github.com/russellsamora/scrollama/pull/151) (opened, then closed unmerged, 2025-12-30) — the one PR with "refactor" in scope was closed without landing, no comments.
- Repo not archived (`archived: false`), 11 open issues as of check, single maintainer (russellsamora). Practically unmaintained for behavioral fixes since mid-2022.

**Conclusion for §1:** the `entries[0]` root cause is real and verifiable in source; it is not a filed, named GitHub issue, but it is the mechanical explanation for a class of "step not triggered" bugs the maintainer has acknowledged and left unfixed for 4+ years on a library that has had no functional release since 3.2.0.

## 2. Alternatives / native patterns

Requirement recap: static HTML, no build step, exactly one active section at a time, toggle `--animate-weight: true` on the active section's heading **and** its nav link, must survive fast jumps (Home/End, anchor clicks) without getting stuck.

### a) Native scroll listener + rAF, `getBoundingClientRect` vs `innerHeight / 2`

Pattern: on `scroll` (passive), schedule one `requestAnimationFrame`; inside it, `getBoundingClientRect()` every section, pick the one whose rect straddles (or is closest to) `innerHeight / 2`, diff against last-active, toggle the custom property on exactly that section + matching nav link.

Why it can't get stuck the way scrollama does: it is **state-based, not event-based**. Every rAF tick recomputes "which section owns the midline right now" from current geometry — it doesn't matter how many scroll events were coalesced or skipped in between (Home/End, smooth-scroll jumps, `scrollIntoView`). There is no queued-entry batching to lose data from; each poll is a fresh, complete answer. `getBoundingClientRect` forces layout but only once per rAF (≤ once per frame) if reads are properly rAF-throttled, which is the standard mitigation for its cost.

### b) Native IntersectionObserver, iterating ALL entries

Fixes scrollama's specific bug by not discarding `entries[1..]`. Requires per-entry state per target and taking the *last* (by `entry.time`) or resolving in whatever order they arrive.

**Can one callback contain multiple entries for the same target, and what's the ordering guarantee?** Per the W3C spec, yes, and ordering is expected-but-not-guaranteed-in-array-order:

- Queuing: entries are appended to the observer's internal `[[QueuedEntries]]`, then "Let queue be a copy of observer's internal [[QueuedEntries]] slot … Invoke callback with queue as the first argument." (§3.2.5–3.2.6, notify-intersection-observers steps) — https://www.w3.org/TR/intersection-observer/#notify-intersection-observers-algo — confirms multiple queued entries are delivered together in one callback call.
- MDN's summary of the same behavior: "multiple entries can be received at a time, either from multiple targets or from a single target crossing multiple thresholds in a short amount of time" and "entries are dispatched using a queue, so they should be ordered by the time they were generated, but you should preferably use `IntersectionObserverEntry.time` to correctly order them" — https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API — i.e., array order is a should, not a spec guarantee; correct code sorts/filters by `entry.time` per target, not by array position.

Still viable and closer to scrollama's model, but it's more code than (a): still needs rootMargin math to define "midline crossing," still needs per-target entry-ordering logic to be spec-correct, and still fires on a queued/coalesced schedule rather than a guaranteed-fresh-state poll — a same-class bug (just not *this* bug) remains structurally possible if a future browser coalesces even more aggressively. (a) has no equivalent class of bug because it never trusts a delta/event stream.

### c) CSS-only

- **`scroll-state()` container queries** (`stuck`, `snapped`, `scrollable`): answer "is this container stuck/snapped/at an overflow edge," not "which sibling section is nearest the viewport midline." Not applicable to this use case. Chrome 133+, https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Conditional_rules/Container_scroll-state_queries, https://caniuse.com/mdn-css_at-rules_container_scroll-state_queries.
- **`scroll-target-group` + `:target-current`** ("CSS scrollspy"): closest CSS-only match — auto-registers `<a href="#id">` nav links in a `scroll-target-group` container as scroll markers, and `:target-current` matches the link whose target is currently the active scroll-snap/scroll-target position. Documented with working example: https://www.sarasoueidan.com/blog/css-scrollspy/ ; MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/::scroll-marker-group, https://developer.mozilla.org/en-US/docs/Web/CSS/:target-current. Two disqualifiers for this task: (1) **Chrome 140+ only** — no Firefox/Safari, so no cross-browser fallback exists yet; (2) `:target-current` matches the **link**, not the section — there is no CSS mechanism to also flip a custom property on the section's own heading from this. Both requirements (works everywhere, marks the section too) fail.
- **`view-timeline` / scroll-driven animations, `:target`**: `view-timeline` animates continuously with scroll progress per-element, not a discrete "exactly one active" switch across siblings; `:target` only reacts to URL-fragment navigation (a clicked anchor / back-forward), not scroll position — a user scrolling past a section without clicking its anchor won't update it.

No CSS-only path meets "exactly one active section, cross-browser, static HTML" today.

### d) Other small libraries

- **gumshoe** (cferdinandi/gumshoe): scroll-spy via scroll-event + geometry polling (not IntersectionObserver-based), so it does **not** share scrollama's `entries[0]` flaw structurally — same family as pattern (a). But: last substantive push 2022-12-22 (https://api.github.com/repos/cferdinandi/gumshoe → `pushed_at: 2022-12-22`), 24 open issues, effectively unmaintained; heavier/more configurable (nested nav, offsets, history API integration) than this task needs; still a dependency to vendor for a "no build step, least code" package.
- **scrollama forks**: no actively maintained fork surfaced with the `entries[0]` fix; PR #151 (the one recent refactor attempt upstream) never merged.

Given (a) is ~20–30 lines of vanilla JS with zero dependencies and structurally can't reproduce this bug class, pulling in any library (unmaintained or not) is strictly more code and more risk for the same or worse correctness.

## 3. Recommendation

**Use native scroll + `requestAnimationFrame` + `getBoundingClientRect` midline check (2a).** Deciding reason: it is state-based rather than event-based, so it recomputes "which section owns the midline" fresh on every animation frame regardless of how many scroll/intersection events the browser coalesced or skipped — the exact failure mode that breaks scrollama (and would remain a latent risk with any IntersectionObserver-based approach, including a hand-fixed one) cannot occur, because there is no delta stream to lose entries from. It also has no dependency to vet, license, or update, fitting "static HTML, no build step, least code."
