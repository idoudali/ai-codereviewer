import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import { Config } from "./config";

export interface AIReview {
  lineNumber: string;
  reviewComment: string;
}

/**
 * The model endpoint cannot serve the review right now: it answered 503
 * (training lock, model loading) or the request timed out. The review is
 * skipped instead of failing the step.
 */
export class EndpointUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Model endpoint unavailable: ${reason}`);
    this.name = "EndpointUnavailableError";
  }
}

/** Builds the OpenAI client; a base URL points it at an OpenAI-compatible endpoint. */
export function createClient(config: Config): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
}

/** Maps 503 and timeouts to EndpointUnavailableError; other errors give undefined. */
export function asUnavailable(
  error: unknown
): EndpointUnavailableError | undefined {
  if (error instanceof APIConnectionTimeoutError) {
    return new EndpointUnavailableError("request timed out");
  }
  if (error instanceof APIError && error.status === 503) {
    const retryAfter = error.headers?.["retry-after"];
    return new EndpointUnavailableError(
      retryAfter ? `503, Retry-After ${retryAfter}` : "503"
    );
  }
  return undefined;
}

/** Reads the reviews array from a reply, allowing a ```json fence around it. */
export function parseReviews(content: string): AIReview[] {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const json = (fenced ? fenced[1] : content).trim() || "{}";
  return JSON.parse(json).reviews;
}

/**
 * Asks the model for inline reviews. Throws EndpointUnavailableError when
 * the endpoint is busy or slow; any other error is logged and gives null,
 * so one bad chunk does not stop the review.
 */
export async function getAIResponse(
  openai: OpenAI,
  model: string,
  prompt: string
): Promise<AIReview[] | null> {
  const queryConfig = {
    model,
    temperature: 0.2,
    max_tokens: 700,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  };

  try {
    const response = await openai.chat.completions.create({
      ...queryConfig,
      // return JSON if the model supports it:
      ...(model === "gpt-4-1106-preview"
        ? { response_format: { type: "json_object" } }
        : {}),
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    });

    return parseReviews(response.choices[0].message?.content ?? "");
  } catch (error) {
    const unavailable = asUnavailable(error);
    if (unavailable) throw unavailable;
    console.error("Error:", error);
    return null;
  }
}

/** Strips a leading <think>...</think> block that reasoning models may emit. */
export function stripThinking(content: string): string {
  return content.replace(/^\s*<think>[\s\S]*?<\/think>/, "").trim();
}

/**
 * Asks the model for a whole-PR summary in Markdown. Throws
 * EndpointUnavailableError when the endpoint is busy or slow; any other
 * error is logged and gives null, and an empty reply gives null too.
 */
export async function getSummary(
  openai: OpenAI,
  model: string,
  prompt: string
): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = stripThinking(response.choices[0].message?.content ?? "");
    return text || null;
  } catch (error) {
    const unavailable = asUnavailable(error);
    if (unavailable) throw unavailable;
    console.error("Error:", error);
    return null;
  }
}
