import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../src/config";
import { createClient, getAIResponse, parseReviews } from "../src/llm";
import { run } from "../src/review";
import { fakeOctokit, openedEvent } from "./fakes";
import { completion, sendJson, startServer } from "./server";

type Server = Awaited<ReturnType<typeof startServer>>;
let server: Server | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  vi.restoreAllMocks();
});

function inputs(values: Record<string, string>) {
  return (name: string) => values[name] ?? "";
}

describe("readConfig in lab mode", () => {
  /** The OPENAI_BASE_URL input sets the base URL, model lab-coder and a placeholder key. */
  it("defaults the model and key when a base URL input is set", () => {
    const config = readConfig(
      inputs({ OPENAI_BASE_URL: "http://relay:8080/v1" }),
      {}
    );
    expect(config.baseURL).toBe("http://relay:8080/v1");
    expect(config.model).toBe("lab-coder");
    expect(config.apiKey).toBe("unused");
  });

  /** The OPENAI_BASE_URL environment variable works when the input is empty. */
  it("reads the base URL from the environment", () => {
    const config = readConfig(inputs({}), {
      OPENAI_BASE_URL: "http://relay:8080/v1",
    });
    expect(config.baseURL).toBe("http://relay:8080/v1");
  });

  /** The input wins over the environment, and an explicit model and key are kept. */
  it("prefers explicit inputs", () => {
    const config = readConfig(
      inputs({
        OPENAI_BASE_URL: "http://input/v1",
        OPENAI_API_MODEL: "lab-fast",
        OPENAI_API_KEY: "sk-lab",
      }),
      { OPENAI_BASE_URL: "http://env/v1" }
    );
    expect(config).toMatchObject({
      baseURL: "http://input/v1",
      model: "lab-fast",
      apiKey: "sk-lab",
    });
  });

  /** With no base URL the OpenAI defaults stay, and a key is required. */
  it("keeps OpenAI defaults without a base URL", () => {
    const config = readConfig(inputs({ OPENAI_API_KEY: "sk-test" }), {});
    expect(config.baseURL).toBeUndefined();
    expect(config.model).toBe("gpt-4");
    expect(config.timeoutMs).toBe(300_000);
    expect(config.maxRetries).toBe(2);
    expect(() => readConfig(inputs({}), {})).toThrow(/OPENAI_API_KEY/);
  });

  /** Timeout and retry inputs must be whole numbers in range. */
  it("rejects a bad timeout", () => {
    expect(() =>
      readConfig(inputs({ OPENAI_API_KEY: "k", timeout_seconds: "0" }), {})
    ).toThrow(/timeout_seconds/);
    expect(() =>
      readConfig(inputs({ OPENAI_API_KEY: "k", max_retries: "x" }), {})
    ).toThrow(/max_retries/);
  });
});

describe("parseReviews", () => {
  /** Local models often wrap JSON in a fence; the reviews are still read. */
  it("accepts a fenced JSON reply", () => {
    const reply =
      'Here you go:\n```json\n{"reviews":[{"lineNumber":"2","reviewComment":"x"}]}\n```';
    expect(parseReviews(reply)).toEqual([
      { lineNumber: "2", reviewComment: "x" },
    ]);
  });
});

function labConfig(url: string, extra: Record<string, string> = {}) {
  return readConfig(
    inputs({ OPENAI_BASE_URL: `${url}/v1`, max_retries: "0", ...extra }),
    {}
  );
}

describe("against a mocked OpenAI-compatible endpoint", () => {
  /** Requests go to the base URL with the lab-coder alias and the placeholder key. */
  it("calls the base URL with the lab alias", async () => {
    server = await startServer((_req, res) =>
      sendJson(res, 200, completion('{"reviews":[]}'))
    );
    const config = labConfig(server.url);
    const reviews = await getAIResponse(
      createClient(config),
      config.model,
      "prompt"
    );
    expect(reviews).toEqual([]);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].url).toBe("/v1/chat/completions");
    expect(server.requests[0].headers.authorization).toBe("Bearer unused");
    expect(JSON.parse(server.requests[0].body).model).toBe("lab-coder");
  });

  /** A 503 with Retry-After skips the review: nothing is posted and nothing throws. */
  it("skips on 503 with Retry-After", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(503, {
        "content-type": "application/json",
        "retry-after": "120",
      });
      res.end(JSON.stringify({ error: { message: "training lock" } }));
    });
    const config = labConfig(server.url);
    const { octokit, calls } = fakeOctokit();
    const outcome = await run(
      config,
      openedEvent(),
      octokit,
      createClient(config)
    );
    expect(outcome).toEqual({
      status: "skipped",
      reason: "Model endpoint unavailable: 503, Retry-After 120",
    });
    expect(calls.reviews).toHaveLength(0);
    // The first unavailable chunk stops the run; later chunks are not tried.
    expect(server.requests).toHaveLength(1);
  });

  /** A 503 without Retry-After is skipped the same way. */
  it("skips on a bare 503", async () => {
    server = await startServer((_req, res) => sendJson(res, 503, {}));
    const config = labConfig(server.url);
    const { octokit } = fakeOctokit();
    const outcome = await run(
      config,
      openedEvent(),
      octokit,
      createClient(config)
    );
    expect(outcome).toEqual({
      status: "skipped",
      reason: "Model endpoint unavailable: 503",
    });
  });

  /** A request that outlives timeout_seconds skips the review. */
  it("skips on timeout", async () => {
    server = await startServer(() => undefined); // never answers
    const config = labConfig(server.url);
    config.timeoutMs = 200;
    const { octokit, calls } = fakeOctokit();
    const outcome = await run(
      config,
      openedEvent(),
      octokit,
      createClient(config)
    );
    expect(outcome).toEqual({
      status: "skipped",
      reason: "Model endpoint unavailable: request timed out",
    });
    expect(calls.reviews).toHaveLength(0);
  });

  /** Other server errors keep the old behaviour: the chunk is logged and dropped. */
  it("does not skip on a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    server = await startServer((_req, res) => sendJson(res, 500, {}));
    const config = labConfig(server.url, { review_mode: "inline" });
    const { octokit } = fakeOctokit();
    const outcome = await run(
      config,
      openedEvent(),
      octokit,
      createClient(config)
    );
    expect(outcome).toEqual({ status: "reviewed", comments: 0 });
  });
});
