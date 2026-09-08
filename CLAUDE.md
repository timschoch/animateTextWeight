# animateTextWeight

Public npm package. Keep changes minimal — no internal-project scaffolding beyond what a small published package needs.

## Commands

- `npm run build` — compile `src` to `dist` (tsc)
- `npm run demo` — build, then serve `demo/` at `http://localhost:3000/demo/`
- `npm run prepare` — husky setup + build (runs on install/publish)

## Rules

- Conventional commits and branch-protection are enforced by git hooks (`.husky/commit-msg`, `.husky/pre-push`) — see `.claude/skills/setup-repo` scripts if you need to touch them.
- Pre-commit runs Prettier via lint-staged (`.lintstagedrc`).
- `dist/` is gitignored — it is built by `prepare`, not committed.

## Lessons

Check `lessons.md` at repo root before repeating past mistakes.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
