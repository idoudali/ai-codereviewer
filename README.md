# AI Code Reviewer

AI Code Reviewer is a GitHub Action that leverages OpenAI's GPT-4 API to provide intelligent feedback and suggestions on
your pull requests. This powerful tool helps improve code quality and saves developers time by automating the code
review process.

## Features

- Reviews pull requests using OpenAI's GPT-4 API.
- Provides intelligent comments and suggestions for improving your code.
- Filters out files that match specified exclude patterns.
- Easy to set up and integrate into your GitHub workflow.

## Setup

1. To use this GitHub Action, you need an OpenAI API key. If you don't have one, sign up for an API key
   at [OpenAI](https://beta.openai.com/signup).

2. Add the OpenAI API key as a GitHub Secret in your repository with the name `OPENAI_API_KEY`. You can find more
   information about GitHub Secrets [here](https://docs.github.com/en/actions/reference/encrypted-secrets).

3. Create a `.github/workflows/main.yml` file in your repository and add the following content:

```yaml
name: AI Code Reviewer

on:
  pull_request:
    types:
      - opened
      - synchronize
permissions: write-all
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v3

      - name: AI Code Reviewer
        uses: your-username/ai-code-reviewer@main
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # The GITHUB_TOKEN is there by default so you just need to keep it like it is and not necessarily need to add it as secret as it will throw an error. [More Details](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret)
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_API_MODEL: "gpt-4" # Optional: defaults to "gpt-4"
          exclude: "**/*.json, **/*.md" # Optional: exclude patterns separated by commas
```

4. Replace `your-username` with your GitHub username or organization name where the AI Code Reviewer repository is
   located.

5. Customize the `exclude` input if you want to ignore certain file patterns from being reviewed.

6. Commit the changes to your repository, and AI Code Reviewer will start working on your future pull requests.

## Lab mode: an OpenAI-compatible endpoint

The action can call any OpenAI-compatible server instead of api.openai.com, for example a LiteLLM gateway in front of
local models. Nothing about the endpoint is built in: the URL, key and model are all inputs.

| Input              | Default                                   | Notes                                                                       |
| ------------------ | ----------------------------------------- | --------------------------------------------------------------------------- |
| `OPENAI_BASE_URL`  | `OPENAI_BASE_URL` env var, else OpenAI    | Base URL ending in `/v1`.                                                   |
| `OPENAI_API_MODEL` | `lab-coder` with a base URL, else `gpt-4` | Any model name or gateway alias.                                            |
| `OPENAI_API_KEY`   | `unused` with a base URL                  | Required without a base URL. Leave it out when a relay holds the real key.  |
| `review_mode`      | `summary` with a base URL, else `inline`  | See below.                                                                  |
| `max_diff_chars`   | `60000`                                   | Summary mode only; whole files, the rest are named as not reviewed.         |
| `timeout_seconds`  | `300`                                     | Per model request.                                                          |
| `max_retries`      | `2`                                       | Retries on 429, 5xx and timeouts (the client honours `Retry-After` ≤ 60 s). |

In `summary` mode the action sends the whole PR diff (after `exclude`) in one request and posts one PR comment with a
summary and a list of findings. Later pushes, `reopened` and `ready_for_review` edit that same comment, found by a hidden
marker, so a PR never collects more than one. `inline` mode keeps the original behaviour: one request per diff chunk
and line comments in a review.

When the endpoint answers `503` (with or without `Retry-After`, for example while a model loads) or a request times
out after its retries, the action posts nothing, writes a notice "AI review skipped: …" and exits successfully. Other
errors on a chunk are logged and that chunk is skipped, as before.

```yaml
- uses: idoudali/ai-codereviewer@<pinned sha>
  env:
    OPENAI_BASE_URL: ${{ vars.LAB_LLM_BASE_URL }}
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_MODEL: lab-coder
```

## How It Works

The AI Code Reviewer GitHub Action retrieves the pull request diff, filters out excluded files, and sends code chunks to
the OpenAI API. It then generates review comments based on the AI's response and adds them to the pull request.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests to improve the AI Code Reviewer GitHub
Action.

Run `yarn all` (format check, type check, tests, build, package) and commit `dist/` with your change; CI fails when
`dist/` is stale.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
