import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "./app";
import { InMemoryRepository } from "./core/repository";
import type { ProviderRegistry } from "./core/provider-registry";

const ai = {
  generate: async () => ({
    text: "Shipping takes three business days.",
    confidence: 0.9,
    needsHuman: false,
    reason: "answered",
    providerUsed: "test",
    modelUsed: "test",
  }),
} as ProviderRegistry;

function fixture() {
  const repository = new InMemoryRepository();
  const app = createApp({ repository, providers: ai });
  return { app, repository };
}

describe("support API", () => {
  it("creates a session and persists a complete AI turn", async () => {
    const { app, repository } = fixture();
    await repository.addKnowledgeDocument("shipping.txt", "Shipping takes three business days.");
    const created = await request(app)
      .post("/api/sessions")
      .send({ name: "Aditi", email: "aditi@example.com" })
      .expect(201);
    const result = await request(app)
      .post(`/api/sessions/${created.body.session.id}/messages`)
      .send({ text: "How long does shipping take?" })
      .expect(201);
    expect(result.body.reply.text).toMatch(/three business days/i);
    expect(await repository.listMessages(created.body.session.id)).toHaveLength(2);
  });

  it("stores denied permissions with the exact required value", async () => {
    const { app } = fixture();
    const created = await request(app)
      .post("/api/sessions")
      .send({ name: "Aditi", email: "aditi@example.com" })
      .expect(201);
    const response = await request(app)
      .put(`/api/sessions/${created.body.session.id}/permissions`)
      .send({ camera: "denied", microphone: "granted" })
      .expect(200);
    expect(response.body.permissions.camera).toBe("No permission granted");
  });

  it("rejects cyclic question graphs", async () => {
    const { app } = fixture();
    const response = await request(app)
      .put("/api/questions")
      .send([
        { id: "a", text: "A", nextQuestionIds: ["b"] },
        { id: "b", text: "B", nextQuestionIds: ["a"] },
      ])
      .expect(422);
    expect(response.body.error).toMatch(/cycle/i);
  });

  it("switches AI off during takeover and restores it on release", async () => {
    const { app, repository } = fixture();
    await repository.addKnowledgeDocument("shipping.txt", "Shipping takes three business days.");
    const created = await request(app)
      .post("/api/sessions")
      .send({ name: "Aditi", email: "aditi@example.com" });
    const id = created.body.session.id;
    await request(app)
      .post(`/api/sessions/${id}/takeover`)
      .send({ agentId: "agent-1" })
      .expect(200);
    const silent = await request(app)
      .post(`/api/sessions/${id}/messages`)
      .send({ text: "How long does shipping take?" })
      .expect(201);
    expect(silent.body.reply).toBeNull();
    await request(app).post(`/api/sessions/${id}/release`).expect(200);
    expect((await repository.getSession(id))?.mode).toBe("ai");
  });

  it("returns live CRM state and deletes customer data through the API", async () => {
    const { app, repository } = fixture();
    const created = await request(app)
      .post("/api/sessions")
      .send({ name: "Aditi", email: "aditi@example.com" })
      .expect(201);

    const before = await request(app).get("/api/state").expect(200);
    expect(before.body.users).toHaveLength(1);
    expect(before.body.sessions).toHaveLength(1);

    await request(app).delete(`/api/users/${created.body.session.userId}`).expect(204);
    expect(await repository.listUsers()).toEqual([]);
    expect(await repository.listSessions()).toEqual([]);

    const after = await request(app).get("/api/state").expect(200);
    expect(after.body.users).toEqual([]);
    expect(after.body.sessions).toEqual([]);
  });

  it("does not expose a direct handoff endpoint that bypasses AI verification", async () => {
    const { app } = fixture();
    const created = await request(app)
      .post("/api/sessions")
      .send({ name: "Aditi", email: "aditi@example.com" })
      .expect(201);
    await request(app)
      .post(`/api/sessions/${created.body.session.id}/handoff`)
      .send({ reason: "bypass" })
      .expect(404);
  });

  it("returns service unavailable without storing a fake AI reply when providers fail", async () => {
    const repository = new InMemoryRepository();
    const app = createApp({
      repository,
      providers: { generate: async () => Promise.reject(new Error("provider offline")) },
    });
    const created = await request(app)
      .post("/api/sessions")
      .send({ name: "Aditi", email: "aditi@example.com" })
      .expect(201);

    await request(app)
      .post(`/api/sessions/${created.body.session.id}/messages`)
      .send({ text: "Hello" })
      .expect(503);

    const messages = await repository.listMessages(created.body.session.id);
    expect(messages.map((message) => message.sender)).toEqual(["user"]);
  });

  it("exports date-filtered form submissions as a formatted Excel table", async () => {
    const { app } = fixture();
    await request(app)
      .post("/api/sessions")
      .send({
        name: "Aditi Sharma",
        email: "aditi@example.com",
        phone: "9999999999",
        age: "30",
        address: "Delhi",
      })
      .expect(201);

    const response = await request(app)
      .get("/api/form-submissions.xlsx?from=2000-01-01&to=2100-01-01")
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as Buffer);
    const sheet = workbook.getWorksheet("Form Submissions");
    expect(sheet?.views[0]).toMatchObject({ state: "frozen", ySplit: 2 });
    expect(sheet?.autoFilter).toBeDefined();
    expect(sheet?.getCell("A1").value).toBe("Form Submissions");
    expect(sheet?.getCell("C3").value).toBe("Aditi Sharma");
    expect(sheet?.getCell("D3").value).toBe("aditi@example.com");
  });
});
