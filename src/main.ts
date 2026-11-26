import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/rest";
import { readConfig } from "./config";
import { PullRequestEvent, run } from "./review";

async function main() {
  const config = readConfig(core.getInput);
  const event: PullRequestEvent = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
  );
  const octokit = new Octokit({ auth: config.githubToken });
  const openai = new OpenAI({ apiKey: config.apiKey });
  await run(config, event, octokit, openai);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
