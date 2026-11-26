import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAction } from "../src/action";
import { SUMMARY_MARKER } from "../src/summary";
import { DIFF } from "./fakes";
import { completion, RecordedRequest, sendJson, startServer } from "./server";

type Server = Awaited<ReturnType<typeof startServer>>;
let server: Server | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * One local server plays both the GitHub API and an OpenAI-compatible
 * endpoint under /v1. `chat` answers the chat completion calls.
 */
async function startLab(chat: Parameters<typeof startServer>[0]) {
  return startServer((req, res) => {
    if (req.url?.startsWith("/v1/")) return chat(req, res);
    if (req.method === "GET" && req.url === "/repos/owner/repo/pulls/7") {
      if (req.headers.accept?.includes("diff")) {
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end(DIFF);
      }
      return sendJson(res, 200, {
        title: "Add b",
        body: "Adds b.",
        head: { sha: "abcdef0123456789" },
      });
    }
    if (req.url?.startsWith("/repos/owner/repo/issues/7/comments")) {
      return req.method === "GET"
        ? sendJson(res, 200, [])
        : sendJson(res, 201, { id: 1 });
    }
    sendJson(res, 404, { message: `no route for ${req.method} ${req.url}` });
  });
}

/** Sets the Actions environment the way a consumer workflow in lab mode would. */
function stubActionEnv(url: string) {
  const dir = mkdtempSync(join(tmpdir(), "acr-"));
  const eventPath = join(dir, "event.json");
  writeFileSync(
    eventPath,
    JSON.stringify({
      action: "opened",
      number: 7,
      repository: { name: "repo", owner: { login: "owner" } },
    })
  );
  vi.stubEnv("GITHUB_EVENT_PATH", eventPath);
  vi.stubEnv("GITHUB_API_URL", url);
  vi.stubEnv("OPENAI_BASE_URL", `${url}/v1`);
  vi.stubEnv("INPUT_GITHUB_TOKEN", "gh-test");
  vi.stubEnv("INPUT_OPENAI_API_KEY", "");
  vi.stubEnv("INPUT_OPENAI_BASE_URL", "");
  vi.stubEnv("INPUT_OPENAI_API_MODEL", "");
  vi.stubEnv("INPUT_REVIEW_MODE", "");
  vi.stubEnv("INPUT_MAX_RETRIES", "0");
  vi.stubEnv("INPUT_EXCLUDE", "**/*.md");
}

function writes(requests: RecordedRequest[]) {
  return requests.filter(
    (r) => r.method !== "GET" && !r.url?.startsWith("/v1/")
  );
}

describe("dry run against a mocked OpenAI-compatible server", () => {
  /** Lab defaults (env base URL only) post exactly one summary comment and no inline review. */
  it("posts one summary comment", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    server = await startLab((_req, res) =>
      sendJson(
        res,
        200,
        completion("**Summary**: adds b.\n\n**Findings**: none")
      )
    );
    stubActionEnv(server.url);

    const outcome = await runAction(process.env);

    expect(outcome).toEqual({ status: "summarized", comment: "created" });
    const posted = writes(server.requests);
    expect(posted).toHaveLength(1);
    expect(posted[0].method).toBe("POST");
    expect(posted[0].url).toBe("/repos/owner/repo/issues/7/comments");
    expect(JSON.parse(posted[0].body).body).toContain(SUMMARY_MARKER);
    const chats = server.requests.filter((r) => r.url?.startsWith("/v1/"));
    expect(chats).toHaveLength(1);
    expect(JSON.parse(chats[0].body).model).toBe("lab-coder");
  });

  /** A 503 from the endpoint ends the run with a notice and no writes to GitHub. */
  it("posts nothing on 503", async () => {
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    server = await startLab((_req, res) => {
      res.writeHead(503, { "retry-after": "30" });
      res.end();
    });
    stubActionEnv(server.url);

    const outcome = await runAction(process.env);

    expect(outcome.status).toBe("skipped");
    expect(writes(server.requests)).toHaveLength(0);
    expect(out.mock.calls.join("")).toContain(
      "::notice::AI review skipped: Model endpoint unavailable: 503, Retry-After 30"
    );
  });
});
