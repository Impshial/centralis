export const TEXT_MODEL = "gpt-5.5";
export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_SIZE = "2048x2048";
export const IMAGE_QUALITY = "medium";

type ResponseInputMessage = {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
};

type ResponsesClient = {
  responses: {
    create: (body: Record<string, unknown>) => Promise<unknown>;
  };
};

export function getResponseOutputText(response: unknown) {
  const directText = (response as { output_text?: unknown })?.output_text;
  if (typeof directText === "string" && directText.trim()) {
    return directText;
  }

  const output = (response as { output?: unknown })?.output;
  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      const content = (item as { content?: unknown })?.content;
      return Array.isArray(content) ? content : [];
    })
    .map((contentItem) => {
      const text = (contentItem as { text?: unknown })?.text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function generateJsonText(
  client: ResponsesClient,
  options: {
    system: string;
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  },
) {
  const input: ResponseInputMessage[] = [
    { role: "system", content: options.system },
    { role: "user", content: options.prompt },
  ];

  const response = await client.responses.create({
    model: TEXT_MODEL,
    input,
    text: {
      format: { type: "json_object" },
    },
    ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
    ...(typeof options.maxOutputTokens === "number" ? { max_output_tokens: options.maxOutputTokens } : {}),
  });

  return getResponseOutputText(response);
}

export function getImageBase64(result: unknown) {
  const data = (result as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    return "";
  }

  const b64 = (data[0] as { b64_json?: unknown } | undefined)?.b64_json;
  return typeof b64 === "string" ? b64 : "";
}
