import { describe, expect, it, vi } from "vitest";
import {
  GoogleAdapter,
  OpenAiCompatibleAdapter,
  createDefaultProviderRegistry,
  parseStructuredResult,
} from "./provider-adapters";

const structured = JSON.stringify({
  text: "A useful answer",
  confidence: 0.88,
  needs_human: false,
  reason: "knowledge matched",
});

describe("provider adapters", () => {
  it("parses fenced structured JSON and rejects malformed contracts", () => {
    expect(parseStructuredResult("```json\n" + structured + "\n```").text).toBe("A useful answer");
    expect(() => parseStructuredResult("not json")).toThrow(/invalid structured JSON/i);
    expect(() => parseStructuredResult('{"text":"missing fields"}')).toThrow(/contract/i);
  });

  it("calls OpenAI-compatible APIs with server-side authorization", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: structured } }] }),
    );
    const adapter = new OpenAiCompatibleAdapter(
      "groq",
      "https://example.test/chat",
      fetcher as typeof fetch,
    );
    const result = await adapter.generate({
      provider: "groq",
      model: "test-model",
      apiKey: "server-secret",
      systemPrompt: "Support only",
      messages: [{ role: "user", content: "Question" }],
    });
    expect(result.confidence).toBe(0.88);
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer server-secret",
    });
  });

  it("parses Gemini JSON responses", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: structured }] } }] }),
    );
    const adapter = new GoogleAdapter(fetcher as typeof fetch);
    const result = await adapter.generate({
      provider: "google",
      model: "gemini-test",
      apiKey: "server-secret",
      systemPrompt: "Support only",
      messages: [{ role: "user", content: "Question" }],
    });
    expect(result.text).toBe("A useful answer");
  });

  it("registers all six configured providers", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: structured } }] }),
    );
    const registry = createDefaultProviderRegistry(fetcher as typeof fetch);
    const result = await registry.generate({
      provider: "openrouter",
      model: "model",
      apiKey: "secret",
      systemPrompt: "Support only",
      messages: [],
    });
    expect(result.providerUsed).toBe("openrouter");
  });
});
