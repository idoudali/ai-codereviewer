import { describe, expect, it, vi } from "vitest";
import parseDiff from "parse-diff";
import { readConfig } from "../src/config";
import { stripThinking } from "../src/llm";
import { boundedDiff, fileDiffText } from "../src/prompt";
import { run } from "../src/review";
import { SUMMARY_MARKER } from "../src/summary";
import { DIFF, fakeOctokit, fakeOpenAI, openedEvent } from "./fakes";

function config(extra: Record<string, string> = {}) {
  const values: Record<string, string> = {
    OPENAI_API_KEY: "sk-test",
    review_mode: "summary",
    ...extra,
  };
  return readConfig((name) => values[name] ?? "", {});
}

describe("review_mode", () => {
  /** Summary is the default with a base URL, inline without one. */
  it("follows the base URL unless set", () => {
    const read = (values: Record<string, string>) =>
      readConfig((name) => values[name] ?? "", {}).reviewMode;
    expect(read({ OPENAI_BASE_URL: "http://relay/v1" })).toBe("summary");
    expect(read({ OPENAI_API_KEY: "k" })).toBe("inline");
    expect(
      read({ OPENAI_BASE_URL: "http://relay/v1", review_mode: "inline" })
    ).toBe("inline");
    expect(() => read({ OPENAI_API_KEY: "k", review_mode: "both" })).toThrow(
      /review_mode/
    );
  });
});

describe("boundedDiff", () => {
  /** Whole files are kept up to the limit; the rest are listed as omitted. */
  it("keeps whole files under the limit", () => {
    const files = parseDiff(DIFF);
    const first = fileDiffText(files[0]);
    expect(first).toContain('+const b = eval("2");');
    const { text, omitted } = boundedDiff(files, first.length);
    expect(text).toBe(first);
    expect(omitted).toEqual(["docs/notes.md"]);
  });
});

describe("stripThinking", () => {
  /** A leading reasoning block is removed from the reply. */
  it("drops a think block", () => {
    expect(stripThinking("<think>hmm</think>\n**Summary**: x")).toBe(
      "**Summary**: x"
    );
  });
});

describe("run in summary mode", () => {
  /** One model call for the whole PR and one PR comment, no inline review. */
  it("posts one summary comment", async () => {
    const { octokit, calls } = fakeOctokit();
    const { openai, prompts } = fakeOpenAI("**Summary**: adds b.");
    const outcome = await run(
      config({ exclude: "**/*.md" }),
      openedEvent(),
      octokit,
      openai
    );
    expect(outcome).toEqual({ status: "summarized", comment: "created" });
    expect(prompts).toHaveLength(1);
    expect(calls.reviews).toHaveLength(0);
    expect(calls.comments).toHaveLength(1);
    const { body, issue_number } = calls.comments[0] as {
      body: string;
      issue_number: number;
    };
    expect(issue_number).toBe(7);
    expect(body.startsWith(SUMMARY_MARKER)).toBe(true);
    expect(body).toContain("**Summary**: adds b.");
    expect(body).toContain("Model `gpt-4` · commit abcdef0");
    const prompt = JSON.stringify(prompts[0]);
    expect(prompt).toContain("src/app.ts");
    expect(prompt).not.toContain("docs/notes.md");
  });

  /** A later push edits the existing summary comment instead of adding one. */
  it("updates its earlier comment", async () => {
    const { octokit, calls } = fakeOctokit();
    calls.existing.push(
      { id: 1, body: "a human comment" },
      { id: 2, body: `${SUMMARY_MARKER}\nold` }
    );
    const { openai } = fakeOpenAI("**Summary**: new.");
    const outcome = await run(
      config(),
      { ...openedEvent(), action: "synchronize" },
      octokit,
      openai
    );
    expect(outcome).toEqual({ status: "summarized", comment: "updated" });
    expect(calls.comments).toHaveLength(0);
    expect(calls.updates).toEqual([expect.objectContaining({ comment_id: 2 })]);
  });

  /** Files past max_diff_chars are named in the comment as not reviewed. */
  it("names omitted files", async () => {
    const big = Array.from({ length: 60 }, (_, i) => `+line ${i} of notes`);
    const diff = `${
      DIFF.split("diff --git a/docs")[0]
    }diff --git a/docs/big.md b/docs/big.md
--- a/docs/big.md
+++ b/docs/big.md
@@ -0,0 +1,60 @@
${big.join("\n")}
`;
    const { octokit, calls } = fakeOctokit(diff);
    const { openai, prompts } = fakeOpenAI("ok");
    await run(
      config({ max_diff_chars: "1000" }),
      openedEvent(),
      octokit,
      openai
    );
    const { body } = calls.comments[0] as { body: string };
    expect(body).toContain("Not reviewed (diff too large): `docs/big.md`");
    expect(JSON.stringify(prompts[0])).toContain("src/app.ts");
  });

  /** A model error or empty reply posts nothing and reports a skip. */
  it("skips when the model gives nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { octokit, calls } = fakeOctokit();
    const { openai } = fakeOpenAI("", new Error("boom"));
    const outcome = await run(config(), openedEvent(), octokit, openai);
    expect(outcome.status).toBe("skipped");
    expect(calls.comments).toHaveLength(0);
  });

  /** Event actions outside opened, reopened, synchronize and ready_for_review are ignored. */
  it("ignores other actions", async () => {
    const { octokit } = fakeOctokit();
    const { openai, prompts } = fakeOpenAI("x");
    const outcome = await run(
      config(),
      { ...openedEvent(), action: "labeled" },
      octokit,
      openai
    );
    expect(outcome.status).toBe("skipped");
    expect(prompts).toHaveLength(0);
  });
});
