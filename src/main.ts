import { readFileSync } from "fs";
import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import { readConfig } from "./config";
import { createClient } from "./llm";
import { PullRequestEvent, run } from "./review";

async function main() {
  const config = readConfig(core.getInput);
  const event: PullRequestEvent = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
  );
  const octokit = new Octokit({ auth: config.githubToken });
  core.info(
    `Reviewing with model ${config.model} at ${
      config.baseURL ?? "api.openai.com"
    }`
  );
  const outcome = await run(config, event, octokit, createClient(config));
  if (outcome.status === "skipped") {
    core.notice(`AI review skipped: ${outcome.reason}`);
  } else {
    core.info(`AI review posted ${outcome.comments} comment(s)`);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
