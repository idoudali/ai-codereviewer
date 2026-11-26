import { createServer, IncomingMessage, ServerResponse } from "http";
import { AddressInfo } from "net";

export interface RecordedRequest {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
  body: string;
}

/**
 * Starts a local HTTP server on a free port with the given handler and
 * records every request it gets. Stands in for an OpenAI-compatible
 * endpoint (and, in the dry run, the GitHub API).
 */
export async function startServer(
  handler: (req: RecordedRequest, res: ServerResponse) => void
) {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const recorded = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      };
      requests.push(recorded);
      handler(recorded, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** A chat completion response whose message content is `content`. */
export function completion(content: string) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "lab-coder",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content },
      },
    ],
  };
}
