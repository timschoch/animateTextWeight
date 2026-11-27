# animateTextWeight

Public npm package. Keep changes minimal — no internal-project scaffolding beyond what a small published package needs.

## Commands

- `pnpm build` — compile `src` to `dist` (tsc)
- `pnpm demo` — build, then serve `demo/` at `http://localhost:3000/demo/`
- `pnpm test` — unit tests; `pnpm test:browser` — browser tests
- `pnpm prepare` — build (runs on install/publish)

## Rules

- Use conventional commits.
- The repo is Prettier-clean. Run `pnpm exec prettier --write <files>` on changed files before commit; no hook does it.
- Files that a tool writes stay in `.prettierignore` (`pnpm-lock.yaml`, `CHANGELOG.md`, `.github/workflows/ci.yml`), or Prettier and the tool flip each other's format.
- Use pnpm. `release.yml` keeps `npm publish` for npm trusted publishing (OIDC).
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
