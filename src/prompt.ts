import { Chunk, File } from "parse-diff";

export interface PRDetails {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  description: string;
  /** Head commit of the PR when it was read; shown in the summary comment. */
  headSha?: string;
}

/** Builds the per-chunk prompt that asks for inline review comments. */
export function createPrompt(
  file: File,
  chunk: Chunk,
  prDetails: PRDetails
): string {
  return `Your task is to review pull requests. Instructions:
- Provide the response in following JSON format:  {"reviews": [{"lineNumber":  <line_number>, "reviewComment": "<review comment>"}]}
- Do not give positive comments or compliments.
- Provide comments and suggestions ONLY if there is something to improve, otherwise "reviews" should be an empty array.
- Write the comment in GitHub Markdown format.
- Use the given description only for the overall context and only comment the code.
- IMPORTANT: NEVER suggest adding comments to the code.

Review the following code diff in the file "${
    file.to
  }" and take the pull request title and description into account when writing the response.

Pull request title: ${prDetails.title}
Pull request description:

---
${prDetails.description}
---

Git diff to review:

\`\`\`diff
${chunk.content}
${chunk.changes
  // @ts-expect-error - ln and ln2 exists where needed
  .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
  .join("\n")}
\`\`\`
`;
}

/** Rebuilds unified diff text for a parsed file, for the summary prompt. */
export function fileDiffText(file: File): string {
  const header = `--- ${file.from ?? "/dev/null"}\n+++ ${
    file.to ?? "/dev/null"
  }`;
  const chunks = file.chunks.map((chunk) =>
    [chunk.content, ...chunk.changes.map((c) => c.content)].join("\n")
  );
  return [header, ...chunks].join("\n");
}

/**
 * Joins the file diffs up to maxChars, keeping whole files. Returns the
 * text and the paths left out so the comment can say what was not read.
 */
export function boundedDiff(
  files: File[],
  maxChars: number
): { text: string; omitted: string[] } {
  const parts: string[] = [];
  const omitted: string[] = [];
  let used = 0;
  for (const file of files) {
    const text = fileDiffText(file);
    if (used + text.length > maxChars) {
      omitted.push(file.to ?? file.from ?? "?");
      continue;
    }
    parts.push(text);
    used += text.length;
  }
  return { text: parts.join("\n"), omitted };
}

/** Builds the one prompt that asks for a whole-PR summary review. */
export function createSummaryPrompt(diffText: string, prDetails: PRDetails) {
  return `You are reviewing a pull request. Reply in GitHub Markdown with exactly two sections:

**Summary**: one short paragraph on what the change does.

**Findings**: a list of concrete problems (bugs, security issues, broken edge cases, missing tests), most severe first. Start each item with the file path and line, for example \`src/app.ts:12\`. If there are none, write "No problems found."

Rules:
- Do not praise the change or restate the diff line by line.
- Comment only on the code; use the description for context.
- Never suggest adding code comments.

Pull request title: ${prDetails.title}
Pull request description:

---
${prDetails.description}
---

Diff:

\`\`\`diff
${diffText}
\`\`\`
`;
}
