/** Model used when a base URL is set and no model is given: the lab alias. */
export const LAB_DEFAULT_MODEL = "lab-coder";
/** Model used against api.openai.com when no model is given. */
export const OPENAI_DEFAULT_MODEL = "gpt-4";
/** Sent as the API key when a base URL is set and no key is given. */
export const PLACEHOLDER_API_KEY = "unused";

export interface Config {
  githubToken: string;
  apiKey: string;
  /** OpenAI-compatible base URL; undefined means api.openai.com. */
  baseURL?: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
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
  return {
    githubToken: getInput("GITHUB_TOKEN"),
    apiKey: apiKey || PLACEHOLDER_API_KEY,
    baseURL,
    model:
      getInput("OPENAI_API_MODEL").trim() ||
      (baseURL ? LAB_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL),
    timeoutMs: readCount(getInput, "timeout_seconds", 300, 1) * 1000,
    maxRetries: readCount(getInput, "max_retries", 2, 0),
    exclude: getInput("exclude")
      .split(",")
      .map((s) => s.trim()),
  };
}
