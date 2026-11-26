import OpenAI from "openai";

export interface AIReview {
  lineNumber: string;
  reviewComment: string;
}

/** Asks the model for inline reviews; any error is logged and gives null. */
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

    const res = response.choices[0].message?.content?.trim() || "{}";
    return JSON.parse(res).reviews;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}
