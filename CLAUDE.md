# animateTextWeight

Public npm package. Keep changes minimal — no internal-project scaffolding beyond what a small published package needs.

## Commands

- `pnpm build` — compile `src` to `dist` (tsc)
- `pnpm demo` — build, then serve `demo/` at `http://localhost:3000/demo/`
- `pnpm test` — unit tests; `pnpm test:browser` — browser tests
- `pnpm prepare` — lefthook setup + build (runs on install/publish)

## Rules

- Conventional commits and branch-protection are enforced by lefthook git hooks (`lefthook.yml` extends `.skilly/lefthook.json`) — the scripts live in `.skilly/engine/verify/` (synced by skilly, never edit them here).
- Prettier runs on each staged file (pre-commit) and each agent edit (Claude Code PostToolUse), via `.skilly/engine/verify/lint-edited-file.mjs`. The repo is Prettier-clean: commit normally.
- Files that a tool writes stay in `.prettierignore` (`pnpm-lock.yaml`, `CHANGELOG.md`, `.github/workflows/ci.yml`), or Prettier and the tool flip each other's format.
- Use pnpm. `release.yml` keeps `npm publish` for npm trusted publishing (OIDC).
- CI is the skilly-managed `.github/workflows/ci.yml`; it runs the verify `ci` stage. Add repo checks to `.skilly/verify.json`, never to `ci.yml`.
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
