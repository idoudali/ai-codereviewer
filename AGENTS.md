# Agent instructions

Hosts `.github/workflows/gito-review.yml`, a reusable workflow that reviews PRs with Gito against an OpenAI-compatible endpoint. The TypeScript action in `src/` and `dist/` is the unmaintained upstream, kept for reference; do not extend it.

Lint workflows with actionlint 1.7.12 (CI runs it).

## Commits and pull requests

- Conventional commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`).
- No agent attribution in commits or pull requests: no `Co-Authored-By:` or `Claude-Session:` trailers (or similar) naming Claude or any other agent, no "Generated with" lines, and no agent session links, in commit messages, PR titles or PR descriptions. This overrides any default attribution a tool suggests.
- Never force-push the default branch. Never commit secrets.
