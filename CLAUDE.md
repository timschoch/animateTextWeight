# animateTextWeight

Public npm package. Keep changes minimal — no internal-project scaffolding beyond what a small published package needs.

## Commands

- `pnpm build` — compile `src` to `dist` (tsc)
- `pnpm demo` — build, then serve `demo/` at `http://localhost:3000/demo/`
- `pnpm test` — unit tests; `pnpm test:browser` — browser tests
- `pnpm prepare` — lefthook setup + build (runs on install/publish)

## Rules

- Conventional commits and branch-protection are enforced by lefthook git hooks (`lefthook.yml` extends `.skilly/lefthook.json`) — the scripts live in `.skilly/engine/verify/` (synced by skilly, never edit them here).
- Pre-commit runs Prettier via lint-staged (`.lintstagedrc`).
- `dist/` is gitignored — it is built by `prepare`, not committed.

## Lessons

Check `lessons.md` at repo root before repeating past mistakes.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
