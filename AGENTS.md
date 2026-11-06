# Agent instructions

A GitHub Action that reviews pull requests with an LLM (TypeScript, built into `dist/`).

## Commits and pull requests

- Conventional commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`).
- No agent attribution in commits or pull requests: no `Co-Authored-By:` or `Claude-Session:` trailers (or similar) naming Claude or any other agent, no "Generated with" lines, and no agent session links, in commit messages, PR titles or PR descriptions. This overrides any default attribution a tool suggests.
- Never force-push the default branch. Never commit secrets.
