import { Octokit } from "@octokit/rest";
import OpenAI from "openai";
import parseDiff, { Chunk, File } from "parse-diff";
import minimatch from "minimatch";
import { Config } from "./config";
import {
  AIReview,
  EndpointUnavailableError,
  getAIResponse,
  getSummary,
} from "./llm";
import {
  boundedDiff,
  createPrompt,
  createSummaryPrompt,
  PRDetails,
} from "./prompt";
import {
  formatSummaryComment,
  SUMMARY_ACTIONS,
  upsertSummaryComment,
} from "./summary";

export interface ReviewComment {
  body: string;
  path: string;
  line: number;
}

/** The parts of the pull_request event payload this action reads. */
export interface PullRequestEvent {
  action?: string;
  number: number;
  before?: string;
  after?: string;
  repository: { name: string; owner: { login: string } };
}

/** What a run did, so the entry point can report it. */
export type RunOutcome =
  | { status: "reviewed"; comments: number }
  | { status: "summarized"; comment: "created" | "updated" }
  | { status: "skipped"; reason: string };

export type AskModel = (prompt: string) => Promise<AIReview[] | null>;

export async function getPRDetails(
  octokit: Octokit,
  event: PullRequestEvent
): Promise<PRDetails> {
  const { repository, number } = event;
  const prResponse = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
  });
  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
    title: prResponse.data.title ?? "",
    description: prResponse.data.body ?? "",
    headSha: prResponse.data.head?.sha,
  };
}

/** Returns the whole PR diff against its base. */
export async function getFullDiff(
  octokit: Octokit,
  prDetails: PRDetails
): Promise<string> {
  const response = await octokit.pulls.get({
    owner: prDetails.owner,
    repo: prDetails.repo,
    pull_number: prDetails.pull_number,
    mediaType: { format: "diff" },
  });
  return String(response.data);
}

/**
 * Returns the diff to review: the whole PR when it is opened, only the new
 * commits on synchronize, and undefined for any other event action.
 */
export async function getEventDiff(
  octokit: Octokit,
  event: PullRequestEvent,
  prDetails: PRDetails
): Promise<string | null | undefined> {
  if (event.action === "opened") {
    return getFullDiff(octokit, prDetails);
  }
  if (event.action === "synchronize") {
    const response = await octokit.repos.compareCommits({
      headers: {
        accept: "application/vnd.github.v3.diff",
      },
      owner: prDetails.owner,
      repo: prDetails.repo,
      base: event.before ?? "",
      head: event.after ?? "",
    });
    return String(response.data);
  }
  return undefined;
}

/** Drops files whose new path matches any exclude glob. */
export function filterFiles(files: File[], excludePatterns: string[]): File[] {
  return files.filter(
    (file) =>
      !excludePatterns.some((pattern) => minimatch(file.to ?? "", pattern))
  );
}

export function createComment(
  file: File,
  _chunk: Chunk,
  aiResponses: AIReview[]
): ReviewComment[] {
  return aiResponses.flatMap((aiResponse) => {
    if (!file.to) {
      return [];
    }
    return {
      body: aiResponse.reviewComment,
      path: file.to,
      line: Number(aiResponse.lineNumber),
    };
  });
}

/** Asks the model about each chunk of each non-deleted file. */
export async function analyzeCode(
  parsedDiff: File[],
  prDetails: PRDetails,
  ask: AskModel
): Promise<ReviewComment[]> {
  const comments: ReviewComment[] = [];

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue; // Ignore deleted files
    for (const chunk of file.chunks) {
      const aiResponse = await ask(createPrompt(file, chunk, prDetails));
      if (aiResponse) {
        comments.push(...createComment(file, chunk, aiResponse));
      }
    }
  }
  return comments;
}

/** Summary mode: one prompt for the whole PR, one comment kept current. */
async function runSummary(
  config: Config,
  event: PullRequestEvent,
  prDetails: PRDetails,
  octokit: Octokit,
  openai: OpenAI
): Promise<RunOutcome> {
  if (!SUMMARY_ACTIONS.includes(event.action ?? "")) {
    return {
      status: "skipped",
      reason: `unsupported event action "${event.action}"`,
    };
  }
  const files = filterFiles(
    parseDiff(await getFullDiff(octokit, prDetails)),
    config.exclude
  ).filter((file) => file.to !== "/dev/null");
  if (files.length === 0) {
    return { status: "skipped", reason: "no diff found" };
  }
  const { text, omitted } = boundedDiff(files, config.maxDiffChars);
  if (!text) {
    return { status: "skipped", reason: "every file is over max_diff_chars" };
  }
  const summary = await getSummary(
    openai,
    config.model,
    createSummaryPrompt(text, prDetails)
  );
  if (!summary) {
    return { status: "skipped", reason: "the model gave no usable reply" };
  }
  const body = formatSummaryComment(summary, config.model, prDetails, omitted);
  const comment = await upsertSummaryComment(octokit, prDetails, body);
  return { status: "summarized", comment };
}

/** Inline mode: one prompt per chunk, findings as line comments. */
async function runInline(
  config: Config,
  event: PullRequestEvent,
  prDetails: PRDetails,
  octokit: Octokit,
  openai: OpenAI
): Promise<RunOutcome> {
  const diff = await getEventDiff(octokit, event, prDetails);
  if (diff === undefined) {
    return {
      status: "skipped",
      reason: `unsupported event action "${event.action}"`,
    };
  }
  if (!diff) {
    return { status: "skipped", reason: "no diff found" };
  }

  const files = filterFiles(parseDiff(diff), config.exclude);
  const comments = await analyzeCode(files, prDetails, (prompt) =>
    getAIResponse(openai, config.model, prompt)
  );
  if (comments.length > 0) {
    await octokit.pulls.createReview({
      owner: prDetails.owner,
      repo: prDetails.repo,
      pull_number: prDetails.pull_number,
      comments,
      event: "COMMENT",
    });
  }
  return { status: "reviewed", comments: comments.length };
}

/**
 * Reviews one pull_request event end to end in the configured mode. An
 * unavailable model endpoint skips the review and posts nothing.
 */
export async function run(
  config: Config,
  event: PullRequestEvent,
  octokit: Octokit,
  openai: OpenAI
): Promise<RunOutcome> {
  const prDetails = await getPRDetails(octokit, event);
  const review = config.reviewMode === "summary" ? runSummary : runInline;
  try {
    return await review(config, event, prDetails, octokit, openai);
  } catch (error) {
    if (error instanceof EndpointUnavailableError) {
      return { status: "skipped", reason: error.message };
    }
    throw error;
  }
}
