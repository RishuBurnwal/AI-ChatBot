import { describe, expect, it, vi } from "vitest";
import { InMemoryRepository } from "./repository";
import { SupportService } from "./support-service";
import type { ProviderRegistry } from "./provider-registry";

const ai = {
  generate: async ({ messages }: { messages: Array<{ content: string }> }) => ({
    text: `Answer for ${messages.at(-1)?.content}`,
    confidence: 0.92,
    needsHuman: false,
    reason: "matched knowledge",
    providerUsed: "test",
    modelUsed: "test-model",
  }),
} as ProviderRegistry;

describe("SupportService", () => {
  it("asks AI to verify a greeting and never hands it off when knowledge is empty", async () => {
    const generate = vi.fn(ai.generate);
    const service = new SupportService(new InMemoryRepository(), { generate });
    const session = await service.createSession({ name: "A", email: "a@example.com" });
    const result = await service.sendUserMessage(session.id, "hii");
    expect(generate).toHaveBeenCalledOnce();
    expect(result.reply.text).toMatch(/answer for hii/i);
    expect(result.handoff).toBeUndefined();
  });

  it("does not hand off on low confidence unless AI explicitly verifies escalation", async () => {
    const lowConfidenceAi = {
      generate: async () => ({
        text: "I am unsure",
        confidence: 0.2,
        needsHuman: false,
        reason: "uncertain",
        providerUsed: "test",
        modelUsed: "test",
      }),
    } as ProviderRegistry;
    const repo = new InMemoryRepository();
    await repo.addKnowledgeDocument("shipping.txt", "Shipping takes three business days.");
    const service = new SupportService(repo, lowConfidenceAi, { handoffThreshold: 0.65 });
    const session = await service.createSession({ name: "A", email: "a@example.com" });
    const result = await service.sendUserMessage(session.id, "How long does shipping take?");
    expect(result.handoff).toBeUndefined();
    expect((await repo.getSession(session.id))?.mode).toBe("ai");
  });

  it("hands off an explicit request only after AI verifies it", async () => {
    const verifiedAi = {
      generate: vi.fn(async () => ({
        text: "I will connect you to an agent.",
        confidence: 0.99,
        needsHuman: true,
        reason: "Customer explicitly requested a human agent",
        providerUsed: "test",
        modelUsed: "test",
      })),
    };
    const repo = new InMemoryRepository();
    const service = new SupportService(repo, verifiedAi);
    const session = await service.createSession({ name: "A", email: "a@example.com" });
    const result = await service.sendUserMessage(session.id, "Please connect me to a human agent");
    expect(verifiedAi.generate).toHaveBeenCalledOnce();
    expect(result.handoff?.status).toBe("pending");
  });

  it("never hands off when AI verification is unavailable", async () => {
    const repo = new InMemoryRepository();
    const unavailableAi = { generate: vi.fn(async () => Promise.reject(new Error("offline"))) };
    const service = new SupportService(repo, unavailableAi);
    const session = await service.createSession({ name: "A", email: "a@example.com" });
    await expect(
      service.sendUserMessage(session.id, "Please connect me to an agent"),
    ).rejects.toThrow(/temporarily unavailable/i);
    expect(await repo.listMessages(session.id)).toHaveLength(1);
    expect((await repo.getSession(session.id))?.status).toBe("active");
  });

  it("sends live admin settings, company context, and the current customer profile to AI", async () => {
    const repo = new InMemoryRepository();
    await repo.saveSetting("persona", "You are Mira from Mythica support.");
    await repo.saveSetting("rules", ["Answer only with verified company information."]);
    await repo.saveSetting("general", {
      brandName: "Mythica Cloud Services",
      officeHours: "Monday to Friday, 9 AM to 6 PM",
    });
    const generate = vi.fn(ai.generate);
    const service = new SupportService(repo, { generate });
    const session = await service.createSession({
      name: "Riya Sharma",
      email: "riya@example.com",
      phone: "9876543210",
      age: "29",
      address: "New Delhi",
    });

    await service.sendUserMessage(session.id, "Which service is right for me?");

    const request = generate.mock.calls[0]?.[0];
    expect(request?.systemPrompt).toContain("You are Mira from Mythica support.");
    expect(request?.systemPrompt).toContain("Mythica Cloud Services");
    expect(request?.systemPrompt).toContain("Riya Sharma");
    expect(request?.systemPrompt).toContain("riya@example.com");
    expect(request?.systemPrompt).toContain("9876543210");
    expect(request?.systemPrompt).toContain("New Delhi");
    expect(request?.systemPrompt).toContain("Answer only with verified company information.");
  });

  it("keeps 12 simultaneous conversations isolated", async () => {
    const repo = new InMemoryRepository();
    await repo.addKnowledgeDocument("support.txt", "Order support is available every day.");
    const service = new SupportService(repo, ai);
    const sessions = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        service.createSession({ name: `User ${i}`, email: `u${i}@example.com` }),
      ),
    );
    await Promise.all(
      sessions.map((session, i) => service.sendUserMessage(session.id, `private-token-${i}`)),
    );
    for (let i = 0; i < sessions.length; i += 1) {
      const messages = await repo.listMessages(sessions[i].id);
      expect(messages.map((message) => message.text).join(" ")).toContain(`private-token-${i}`);
      expect(messages.map((message) => message.text).join(" ")).not.toContain(
        `private-token-${(i + 1) % sessions.length}`,
      );
    }
  });
});
