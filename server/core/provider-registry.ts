export type ProviderId =
  "openai" | "openrouter" | "google" | "nvidia" | "groq" | "perplexity" | string;

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  provider: ProviderId;
  model: string;
  apiKey: string;
  messages: AiMessage[];
  systemPrompt: string;
}

export interface AiResult {
  text: string;
  confidence: number;
  needsHuman: boolean;
  reason: string;
}

export interface ProviderResult extends AiResult {
  providerUsed: string;
  modelUsed: string;
}

export interface AiProviderAdapter {
  readonly id: string;
  generate(request: GenerateRequest): Promise<AiResult>;
}

export type ProviderSelection = Pick<GenerateRequest, "provider" | "model" | "apiKey">;

export class ProviderRegistry {
  private readonly adapters: Map<string, AiProviderAdapter>;

  constructor(adapters: AiProviderAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  }

  async generate(
    request: GenerateRequest,
    fallbacks: ProviderSelection[] = [],
  ): Promise<ProviderResult> {
    const attempts = [request, ...fallbacks.map((fallback) => ({ ...request, ...fallback }))];
    const failures: string[] = [];
    for (const attempt of attempts) {
      const adapter = this.adapters.get(attempt.provider);
      if (!adapter) {
        failures.push(`${attempt.provider}: provider is not registered`);
        continue;
      }
      try {
        const result = await adapter.generate(attempt);
        return { ...result, providerUsed: attempt.provider, modelUsed: attempt.model };
      } catch (error) {
        failures.push(
          `${attempt.provider}: ${error instanceof Error ? error.message : "request failed"}`,
        );
      }
    }
    throw new Error(`AI generation failed (${failures.join("; ")})`);
  }
}
