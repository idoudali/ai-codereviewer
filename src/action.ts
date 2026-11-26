import { readFileSync } from "fs";
import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import { readConfig } from "./config";
import { createClient } from "./llm";
import { PullRequestEvent, RunOutcome, run } from "./review";

/**
 * Runs the action from its inputs and the Actions environment. The GitHub
 * API URL comes from GITHUB_API_URL, which Actions sets (and a dry run
 * points at a mock server).
 */
export async function runAction(
  env: NodeJS.ProcessEnv = process.env
): Promise<RunOutcome> {
  const config = readConfig(core.getInput, env);
  const event: PullRequestEvent = JSON.parse(
    readFileSync(env.GITHUB_EVENT_PATH ?? "", "utf8")
  );
  const octokit = new Octokit({
    auth: config.githubToken,
    baseUrl: env.GITHUB_API_URL || "https://api.github.com",
  });
  core.info(
    `Reviewing in ${config.reviewMode} mode with model ${config.model} at ${
      config.baseURL ?? "api.openai.com"
    }`
  );
  const outcome = await run(config, event, octokit, createClient(config));
  if (outcome.status === "skipped") {
    core.notice(`AI review skipped: ${outcome.reason}`);
  } else if (outcome.status === "summarized") {
    core.info(`AI review summary comment ${outcome.comment}`);
  } else {
    core.info(`AI review posted ${outcome.comments} inline comment(s)`);
  }
  return outcome;
}
