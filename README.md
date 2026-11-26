# AI Code Reviewer

This fork now hosts a **reusable GitHub workflow that reviews pull requests with
[Gito](https://github.com/Nayjest/Gito)** against an OpenAI-compatible endpoint, such as the home-lab LiteLLM gateway.
The original TypeScript action below is unmaintained upstream (last commit December 2023) and is kept only for
reference.

## Gito review workflow

[`.github/workflows/gito-review.yml`](.github/workflows/gito-review.yml) runs `gito review` on the PR and posts one
summary comment (Gito collapses its earlier comments). Nothing about the endpoint is built in:

| Input                  | Default     | Notes                                                          |
| ---------------------- | ----------- | -------------------------------------------------------------- |
| `llm_api_base`         | (required)  | OpenAI-compatible base URL ending in `/v1`, e.g. the CI relay. |
| `model`                | `lab-coder` | Model name or gateway alias.                                   |
| `runs_on`              | `home-lab`  | Runner label: the repo's lab scale set.                        |
| `gito_version`         | `4.5.0`     | Exact `gito.bot` version.                                      |
| `max_concurrent_tasks` | `2`         | Parallel model requests; the relay allows two.                 |
| `timeout_minutes`      | `20`        | Job timeout.                                                   |
| secret `llm_api_key`   | `unused`    | Leave out when the relay holds the key.                        |

The review is advisory. The job has `continue-on-error`, skips draft PRs, and when the endpoint answers `503`, times
out or refuses the connection, it writes a notice "Gito review skipped" and posts nothing. The tokenizer file Gito
downloads on its first run is cached with `actions/cache`.

A private repo calls it with [`examples/gito-review-caller.yml`](examples/gito-review-caller.yml). Pin `@<commit>`, set a
`LAB_LLM_BASE_URL` variable, and adjust the review itself with a `.gito/config.toml` in that repo (see Gito's
[default config](https://github.com/Nayjest/Gito/blob/main/gito/config.toml)). For a long diff on a local model, lower
`max_code_tokens` there.

## Original action (unmaintained)

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

## How It Works

The AI Code Reviewer GitHub Action retrieves the pull request diff, filters out excluded files, and sends code chunks to
the OpenAI API. It then generates review comments based on the AI's response and adds them to the pull request.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests to improve the AI Code Reviewer GitHub
Action.

Let the maintainer generate the final package (`yarn build` & `yarn package`).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
