import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteRepository } from "./sqlite-repository";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "nexus-sqlite-"));
  cleanup.push(directory);
  const databasePath = join(directory, "nexus-support.sqlite");
  const workbookPath = join(directory, "nexus-support.xlsx");
  const repository = new SQLiteRepository({ databasePath, workbookPath });
  return { repository, databasePath, workbookPath };
}

describe("SQLiteRepository", () => {
  it("starts empty instead of inserting fake users or sessions", async () => {
    const { repository } = await fixture();
    expect(await repository.listUsers()).toEqual([]);
    expect(await repository.listSessions()).toEqual([]);
    repository.close();
  });

  it("persists users, sessions, messages, and permissions after restart", async () => {
    const { repository, databasePath, workbookPath } = await fixture();
    const user = await repository.createUser({ name: "Real User", email: "real@example.com" });
    const session = await repository.createSession(user.id);
    await repository.addMessage({
      sessionId: session.id,
      sender: "user",
      text: "Persistent message",
    });
    await repository.savePermissions(session.id, { camera: "No permission granted" });
    repository.close();

    const reopened = new SQLiteRepository({ databasePath, workbookPath });
    expect((await reopened.listUsers())[0]?.name).toBe("Real User");
    expect((await reopened.listMessages(session.id))[0]?.text).toBe("Persistent message");
    expect((await reopened.getPermissions(session.id)).camera).toBe("No permission granted");
    reopened.close();
  });

  it("deletes a user and cascades their sessions and messages", async () => {
    const { repository } = await fixture();
    const user = await repository.createUser({ name: "Delete Me", email: "delete@example.com" });
    const session = await repository.createSession(user.id);
    await repository.addMessage({ sessionId: session.id, sender: "user", text: "Remove me" });

    expect(await repository.deleteUser(user.id)).toBe(true);
    expect(await repository.listUsers()).toEqual([]);
    expect(await repository.getSession(session.id)).toBeUndefined();
    expect(await repository.listMessages(session.id)).toEqual([]);
    repository.close();
  });

  it("refreshes the Excel mirror after create and delete operations", async () => {
    const { repository, workbookPath } = await fixture();
    const user = await repository.createUser({ name: "Excel User", email: "excel@example.com" });
    await repository.waitForExcelSync();

    const createdWorkbook = new ExcelJS.Workbook();
    await createdWorkbook.xlsx.readFile(workbookPath);
    expect(createdWorkbook.getWorksheet("Users")?.getCell("B2").value).toBe("Excel User");

    await repository.deleteUser(user.id);
    await repository.waitForExcelSync();
    const deletedWorkbook = new ExcelJS.Workbook();
    await deletedWorkbook.xlsx.readFile(workbookPath);
    expect(deletedWorkbook.getWorksheet("Users")?.rowCount).toBe(1);
    repository.close();
  });

  it("persists editable forms, question trees, settings, and knowledge documents", async () => {
    const { repository, workbookPath } = await fixture();
    await repository.replaceFormFields([
      {
        id: "email",
        label: "Email",
        key: "email",
        type: "email",
        required: true,
        enabled: true,
      },
    ]);
    expect(await repository.listFormFields()).toEqual([
      expect.objectContaining({ id: "email", type: "email", required: true }),
    ]);

    await repository.replaceQuestions([
      { id: "root", text: "How can we help?", parentId: null },
      { id: "child", text: "Tell us more", parentId: "root" },
    ]);
    expect(await repository.listQuestions()).toHaveLength(2);
    await expect(
      repository.replaceQuestions([
        { id: "a", text: "A", parentId: "b" },
        { id: "b", text: "B", parentId: "a" },
      ]),
    ).rejects.toThrow(/cycle/i);

    await repository.saveSetting("persona", "Persistent persona");
    expect((await repository.getSettings())["persona"]).toBe("Persistent persona");

    const document = await repository.addKnowledgeDocument(
      "returns.txt",
      "Returns are accepted for thirty days after delivery.",
    );
    expect(await repository.listKnowledgeDocuments()).toHaveLength(1);
    expect(await repository.searchKnowledge("returns thirty days")).toHaveLength(1);
    expect(await repository.deleteKnowledgeDocument(document.id)).toBe(true);
    expect(await repository.deleteKnowledgeDocument("missing")).toBe(false);
    expect(repository.getWorkbookPath()).toBe(workbookPath);
    repository.close();
  });

  it("updates, lists, hands off, and deletes persistent sessions", async () => {
    const { repository } = await fixture();
    const user = await repository.createUser({
      name: "Session User",
      email: "session@example.com",
    });
    const session = await repository.createSession(user.id);
    const updated = await repository.updateSession(session.id, {
      mode: "human",
      agentId: "agent-1",
      summary: "Transferred",
    });
    expect(updated.mode).toBe("human");
    expect(await repository.listSessions()).toHaveLength(1);
    const handoff = await repository.createHandoff({
      sessionId: session.id,
      reason: "AI verified escalation",
      confidence: 0.9,
    });
    expect(handoff.status).toBe("pending");
    expect((await repository.getSession(session.id))?.status).toBe("handoff");
    expect(await repository.deleteSession(session.id)).toBe(true);
    expect(await repository.deleteSession("missing")).toBe(false);
    repository.close();
  });
});
