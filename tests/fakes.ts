import { Octokit } from "@octokit/rest";
import OpenAI from "openai";
import { PullRequestEvent } from "../src/review";

export const DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = eval("2");
 export { a };
diff --git a/docs/notes.md b/docs/notes.md
index 3333333..4444444 100644
--- a/docs/notes.md
+++ b/docs/notes.md
@@ -1 +1,2 @@
 # Notes
+More notes.
`;

export function openedEvent(): PullRequestEvent {
  return {
    action: "opened",
    number: 7,
    repository: { name: "repo", owner: { login: "owner" } },
  };
}

/** A stand-in Octokit that records the review and comments it is asked to post. */
export function fakeOctokit(diff: string = DIFF) {
  const calls = {
    reviews: [] as unknown[],
    comments: [] as unknown[],
    updates: [] as unknown[],
    /** Comments already on the PR, as listComments returns them. */
    existing: [] as Array<{ id: number; body: string }>,
  };
  const octokit = {
    pulls: {
      get: async (params: { mediaType?: { format: string } }) =>
        params.mediaType?.format === "diff"
          ? { data: diff }
          : {
              data: {
                title: "Add b",
                body: "Adds b.",
                head: { sha: "abcdef0123456789" },
              },
            },
      createReview: async (params: unknown) => {
        calls.reviews.push(params);
      },
    },
    repos: {
      compareCommits: async () => ({ data: diff }),
    },
    issues: {
      listComments: async () => ({ data: calls.existing }),
      createComment: async (params: unknown) => {
        calls.comments.push(params);
      },
      updateComment: async (params: unknown) => {
        calls.updates.push(params);
      },
    },
  };
  return { octokit: octokit as unknown as Octokit, calls };
}

/** A stand-in OpenAI client whose chat completion returns `content` or throws `error`. */
export function fakeOpenAI(content: string, error?: unknown) {
  const prompts: unknown[] = [];
  const openai = {
    chat: {
      completions: {
        create: async (params: unknown) => {
          prompts.push(params);
          if (error) throw error;
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
  return { openai: openai as unknown as OpenAI, prompts };
}
