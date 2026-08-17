import { describe, expect, it, vi } from "vitest";
import { ProviderRegistry, type AiProviderAdapter } from "./provider-registry";

const adapter = (id: string, result: string | Error): AiProviderAdapter => ({
  id,
  generate: vi.fn(async () => {
    if (result instanceof Error) throw result;
    return { text: result, confidence: 0.91, needsHuman: false, reason: "resolved" };
  }),
});

describe("ProviderRegistry", () => {
  it("uses the configured provider", async () => {
    const registry = new ProviderRegistry([adapter("groq", "Groq answer")]);
    const response = await registry.generate({
      provider: "groq",
      model: "test-model",
      apiKey: "secret",
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "support only",
    });
    expect(response.text).toBe("Groq answer");
  });

  it("falls back in order after a provider API failure", async () => {
    const registry = new ProviderRegistry([
      adapter("google", new Error("quota")),
      adapter("openrouter", "Fallback answer"),
    ]);
    const response = await registry.generate(
      {
        provider: "google",
        model: "test-model",
        apiKey: "secret",
        messages: [{ role: "user", content: "hello" }],
        systemPrompt: "support only",
      },
      [{ provider: "openrouter", model: "fallback", apiKey: "other-secret" }],
    );
    expect(response.providerUsed).toBe("openrouter");
    expect(response.text).toBe("Fallback answer");
  });

  it("rejects unknown providers without exposing API keys", async () => {
    const registry = new ProviderRegistry([]);
    await expect(
      registry.generate({
        provider: "missing",
        model: "x",
        apiKey: "never-leak-me",
        messages: [],
        systemPrompt: "x",
      }),
    ).rejects.not.toThrow(/never-leak-me/);
  });
});
