export interface Config {
  githubToken: string;
  apiKey: string;
  model: string;
  exclude: string[];
}

/** Reads an action input; matches the signature of core.getInput. */
export type InputReader = (name: string) => string;

/** Collects the action inputs into one typed object. */
export function readConfig(getInput: InputReader): Config {
  return {
    githubToken: getInput("GITHUB_TOKEN"),
    apiKey: getInput("OPENAI_API_KEY"),
    model: getInput("OPENAI_API_MODEL"),
    exclude: getInput("exclude")
      .split(",")
      .map((s) => s.trim()),
  };
}
