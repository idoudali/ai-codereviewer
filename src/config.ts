/** Model used when a base URL is set and no model is given: the lab alias. */
export const LAB_DEFAULT_MODEL = "lab-coder";
/** Model used against api.openai.com when no model is given. */
export const OPENAI_DEFAULT_MODEL = "gpt-4";
/** Sent as the API key when a base URL is set and no key is given. */
export const PLACEHOLDER_API_KEY = "unused";

/** inline: review comments on lines; summary: one PR comment, kept up to date. */
export type ReviewMode = "inline" | "summary";

export interface Config {
  githubToken: string;
  apiKey: string;
  /** OpenAI-compatible base URL; undefined means api.openai.com. */
  baseURL?: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  reviewMode: ReviewMode;
  /** Summary mode sends at most this much diff text and says when it cut. */
  maxDiffChars: number;
  exclude: string[];
}

/** Reads an action input; matches the signature of core.getInput. */
export type InputReader = (name: string) => string;

function readCount(
  getInput: InputReader,
  name: string,
  fallback: number,
  min: number
) {
  const raw = getInput(name).trim();
  if (raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(
      `Input ${name} must be a whole number of at least ${min}, got "${raw}"`
    );
  }
  return value;
}

/**
 * Collects the action inputs into one typed object.
 *
 * The base URL comes from the OPENAI_BASE_URL input, else the environment
 * variable of the same name. With a base URL set the model defaults to
 * lab-coder and the key may be left out (a relay in front of the endpoint
 * holds the real one); without one the action keeps its OpenAI defaults.
 * The review mode follows the same rule: summary with a base URL, inline
 * without, unless review_mode says otherwise.
 */
export function readConfig(
  getInput: InputReader,
  env: NodeJS.ProcessEnv = process.env
): Config {
  const baseURL =
    getInput("OPENAI_BASE_URL").trim() ||
    env.OPENAI_BASE_URL?.trim() ||
    undefined;
  const apiKey = getInput("OPENAI_API_KEY").trim();
  if (!apiKey && !baseURL) {
    throw new Error("OPENAI_API_KEY is required when no base URL is set");
  }
  const mode =
    getInput("review_mode").trim() || (baseURL ? "summary" : "inline");
  if (mode !== "inline" && mode !== "summary") {
    throw new Error(
      `Input review_mode must be inline or summary, got "${mode}"`
    );
  }
  return {
    githubToken: getInput("GITHUB_TOKEN"),
    apiKey: apiKey || PLACEHOLDER_API_KEY,
    baseURL,
    model:
      getInput("OPENAI_API_MODEL").trim() ||
      (baseURL ? LAB_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL),
    timeoutMs: readCount(getInput, "timeout_seconds", 300, 1) * 1000,
    maxRetries: readCount(getInput, "max_retries", 2, 0),
    reviewMode: mode,
    maxDiffChars: readCount(getInput, "max_diff_chars", 60000, 1000),
    exclude: getInput("exclude")
      .split(",")
      .map((s) => s.trim()),
  };
}
