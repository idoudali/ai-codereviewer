# Agent instructions

A GitHub Action that reviews pull requests with an LLM (TypeScript, built into `dist/`).

## Commands

- `yarn install --frozen-lockfile`
- `yarn all`: Prettier check, type check (sources and tests), Vitest, `tsc`, then `ncc` into `dist/`.
- Commit `dist/` with every source change; CI fails when it is stale.

## Layout

- `src/main.ts` is the entry point; it only reads inputs and the event and calls `run` in `src/review.ts`.
- Tests live in `tests/` and use stand-in GitHub and OpenAI clients; they make no network calls.

## Commits and pull requests

- Conventional commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`).
- No agent attribution in commits or pull requests: no `Co-Authored-By:` or `Claude-Session:` trailers (or similar) naming Claude or any other agent, no "Generated with" lines, and no agent session links, in commit messages, PR titles or PR descriptions. This overrides any default attribution a tool suggests.
- Never force-push the default branch. Never commit secrets.
