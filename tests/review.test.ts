import { describe, expect, it, vi } from "vitest";
import parseDiff from "parse-diff";
import { readConfig } from "../src/config";
import { getAIResponse } from "../src/llm";
import { createPrompt } from "../src/prompt";
import { filterFiles, run } from "../src/review";
import { DIFF, fakeOctokit, fakeOpenAI, openedEvent } from "./fakes";

const inputs: Record<string, string> = {
  GITHUB_TOKEN: "gh-token",
  OPENAI_API_KEY: "sk-test",
  OPENAI_API_MODEL: "gpt-4",
  exclude: "**/*.md, dist/**",
};
const config = readConfig((name) => inputs[name] ?? "");

describe("readConfig", () => {
  /** Exclude globs are split on commas and trimmed. */
  it("splits and trims the exclude list", () => {
    expect(config.exclude).toEqual(["**/*.md", "dist/**"]);
  });
});

describe("filterFiles", () => {
  /** Files that match an exclude glob are dropped, others kept. */
  it("drops excluded files", () => {
    const files = filterFiles(parseDiff(DIFF), config.exclude);
    expect(files.map((f) => f.to)).toEqual(["src/app.ts"]);
  });
});

describe("createPrompt", () => {
  /** The prompt names the file and numbers each changed line. */
  it("includes the path and line numbers", () => {
    const [file] = parseDiff(DIFF);
    const prompt = createPrompt(file, file.chunks[0], {
      owner: "o",
      repo: "r",
      pull_number: 1,
      title: "Add b",
      description: "Adds b.",
    });
    expect(prompt).toContain('"src/app.ts"');
    expect(prompt).toContain('2 +const b = eval("2");');
    expect(prompt).toContain("Pull request title: Add b");
  });
});

describe("getAIResponse", () => {
  /** A JSON answer is parsed into its reviews array. */
  it("parses the reviews", async () => {
    const { openai } = fakeOpenAI(
      '{"reviews":[{"lineNumber":"2","reviewComment":"Avoid eval."}]}'
    );
    const reviews = await getAIResponse(openai, "gpt-4", "prompt");
    expect(reviews).toEqual([
      { lineNumber: "2", reviewComment: "Avoid eval." },
    ]);
  });

  /** A client error is swallowed and reported as no reviews. */
  it("returns null on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { openai } = fakeOpenAI("", new Error("boom"));
    expect(await getAIResponse(openai, "gpt-4", "prompt")).toBeNull();
  });
});

describe("run", () => {
  /** An opened PR gets one review with an inline comment per finding. */
  it("posts inline comments for an opened PR", async () => {
    const { octokit, calls } = fakeOctokit();
    const { openai, prompts } = fakeOpenAI(
      '{"reviews":[{"lineNumber":"2","reviewComment":"Avoid eval."}]}'
    );
    await run(config, openedEvent(), octokit, openai);
    expect(prompts).toHaveLength(1);
    expect(calls.reviews).toEqual([
      {
        owner: "owner",
        repo: "repo",
        pull_number: 7,
        event: "COMMENT",
        comments: [{ body: "Avoid eval.", path: "src/app.ts", line: 2 }],
      },
    ]);
  });

  /** Event actions other than opened and synchronize post nothing. */
  it("ignores other event actions", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { octokit, calls } = fakeOctokit();
    const { openai, prompts } = fakeOpenAI("{}");
    await run(config, { ...openedEvent(), action: "labeled" }, octokit, openai);
    expect(prompts).toHaveLength(0);
    expect(calls.reviews).toHaveLength(0);
  });
});
