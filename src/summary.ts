import { Octokit } from "@octokit/rest";
import { PRDetails } from "./prompt";

/** Hidden marker that identifies this action's summary comment on a PR. */
export const SUMMARY_MARKER = "<!-- ai-codereviewer:summary -->";

/** Event actions that get a summary: each one reviews the whole PR again. */
export const SUMMARY_ACTIONS = [
  "opened",
  "reopened",
  "synchronize",
  "ready_for_review",
];

/** Wraps the model's text with the marker, a heading and a footer. */
export function formatSummaryComment(
  text: string,
  model: string,
  prDetails: PRDetails,
  omitted: string[]
): string {
  const lines = [SUMMARY_MARKER, "### AI review", "", text, ""];
  if (omitted.length > 0) {
    lines.push(
      `> Not reviewed (diff too large): ${omitted
        .map((p) => `\`${p}\``)
        .join(", ")}`,
      ""
    );
  }
  const commit = prDetails.headSha
    ? ` · commit ${prDetails.headSha.slice(0, 7)}`
    : "";
  lines.push(`<sub>Model \`${model}\`${commit} · advisory only</sub>`);
  return lines.join("\n");
}

/**
 * Posts the summary as one PR comment, or edits the earlier one that
 * carries the marker, so a PR never collects more than one.
 */
export async function upsertSummaryComment(
  octokit: Octokit,
  prDetails: PRDetails,
  body: string
): Promise<"created" | "updated"> {
  const target = {
    owner: prDetails.owner,
    repo: prDetails.repo,
  };
  for (let page = 1; ; page++) {
    const { data } = await octokit.issues.listComments({
      ...target,
      issue_number: prDetails.pull_number,
      per_page: 100,
      page,
    });
    const existing = data.find((c) => c.body?.includes(SUMMARY_MARKER));
    if (existing) {
      await octokit.issues.updateComment({
        ...target,
        comment_id: existing.id,
        body,
      });
      return "updated";
    }
    if (data.length < 100) break;
  }
  await octokit.issues.createComment({
    ...target,
    issue_number: prDetails.pull_number,
    body,
  });
  return "created";
}
