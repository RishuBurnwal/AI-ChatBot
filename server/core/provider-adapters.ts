import type { AiProviderAdapter, AiResult, GenerateRequest } from "./provider-registry";
import { ProviderRegistry } from "./provider-registry";

type FetchLike = typeof fetch;

const endpoints: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
};

export class OpenAiCompatibleAdapter implements AiProviderAdapter {
  constructor(
    readonly id: string,
    private readonly endpoint: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async generate(request: GenerateRequest): Promise<AiResult> {
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        "content-type": "application/json",
        ...(this.id === "openrouter"
          ? { "HTTP-Referer": "http://localhost", "X-Title": "Nexus Support" }
          : {}),
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: structuredInstruction(request.systemPrompt) },
          ...request.messages,
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!response.ok) throw new Error(`${this.id} returned HTTP ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return parseStructuredResult(payload.choices?.[0]?.message?.content ?? "");
  }
}

export class GoogleAdapter implements AiProviderAdapter {
  readonly id = "google";
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async generate(request: GenerateRequest): Promise<AiResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`;
    const response = await this.fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: structuredInstruction(request.systemPrompt) }] },
        contents: request.messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
    if (!response.ok) throw new Error(`google returned HTTP ${response.status}`);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return parseStructuredResult(payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
  }
}

export function createDefaultProviderRegistry(fetcher: FetchLike = fetch) {
  return new ProviderRegistry([
    ...Object.entries(endpoints).map(
      ([id, endpoint]) => new OpenAiCompatibleAdapter(id, endpoint, fetcher),
    ),
    new GoogleAdapter(fetcher),
  ]);
}

function structuredInstruction(systemPrompt: string) {
  return `${systemPrompt}\n\nReturn only a JSON object with keys: text (string), confidence (number 0-1), needs_human (boolean), reason (string).`;
}

export function parseStructuredResult(raw: string): AiResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error("Provider returned invalid structured JSON");
  }
  if (!value || typeof value !== "object") throw new Error("Provider returned an invalid result");
  const result = value as Record<string, unknown>;
  const confidence = Number(result["confidence"]);
  if (
    typeof result["text"] !== "string" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    typeof result["needs_human"] !== "boolean" ||
    typeof result["reason"] !== "string"
  ) {
    throw new Error("Provider response does not match the structured result contract");
  }
  return {
    text: result["text"],
    confidence,
    needsHuman: result["needs_human"],
    reason: result["reason"],
  };
}
