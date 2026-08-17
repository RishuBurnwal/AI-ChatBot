import type { StoredPermission } from "./domain";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  age?: string;
  address?: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  startedAt: string;
  mode: "ai" | "human";
  status: "active" | "closed" | "handoff";
  providerUsed?: string;
  modelUsed?: string;
  agentId?: string | undefined;
  summary: string;
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  sender: "user" | "ai" | "agent" | "system";
  text: string;
  at: string;
  confidence?: number;
}

export interface HandoffRecord {
  id: string;
  sessionId: string;
  reason: string;
  confidence: number;
  status: "pending" | "accepted" | "resolved";
  createdAt: string;
  resolvedBy?: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  text: string;
  tokens: Set<string>;
}

export interface FormFieldRecord {
  id: string;
  label: string;
  key: string;
  type: "text" | "email" | "tel" | "number" | "textarea";
  required: boolean;
  enabled: boolean;
}

export interface QuestionRecord {
  id: string;
  text: string;
  parentId: string | null;
}

export interface SupportRepository {
  createUser(input: Omit<UserRecord, "id" | "createdAt">): Promise<UserRecord>;
  listUsers(): Promise<UserRecord[]>;
  deleteUser(id: string): Promise<boolean>;
  createSession(userId: string): Promise<SessionRecord>;
  getSession(id: string): Promise<SessionRecord | undefined>;
  updateSession(id: string, changes: Partial<SessionRecord>): Promise<SessionRecord>;
  listSessions(): Promise<SessionRecord[]>;
  deleteSession(id: string): Promise<boolean>;
  addMessage(input: Omit<MessageRecord, "id" | "at">): Promise<MessageRecord>;
  listMessages(sessionId: string): Promise<MessageRecord[]>;
  createHandoff(input: Omit<HandoffRecord, "id" | "createdAt" | "status">): Promise<HandoffRecord>;
  addKnowledgeDocument(
    name: string,
    text: string,
  ): Promise<{ id: string; name: string; chunks: number }>;
  searchKnowledge(
    query: string,
    limit?: number,
  ): Promise<Array<{ id: string; documentId: string; text: string; score: number }>>;
  savePermissions(sessionId: string, input: Record<string, StoredPermission>): Promise<void>;
  getPermissions(sessionId: string): Promise<Record<string, StoredPermission>>;
  listFormFields(): Promise<FormFieldRecord[]>;
  replaceFormFields(fields: FormFieldRecord[]): Promise<void>;
  listQuestions(): Promise<QuestionRecord[]>;
  replaceQuestions(questions: QuestionRecord[]): Promise<void>;
  getSettings(): Promise<Record<string, unknown>>;
  saveSetting(key: string, value: unknown): Promise<void>;
  listKnowledgeDocuments(): Promise<Array<Record<string, unknown>>>;
  deleteKnowledgeDocument(id: string): Promise<boolean>;
  waitForExcelSync(): Promise<void>;
  getWorkbookPath(): string | undefined;
}

export class InMemoryRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly messages = new Map<string, MessageRecord[]>();
  private readonly handoffs = new Map<string, HandoffRecord>();
  private readonly chunks: KnowledgeChunk[] = [];
  private readonly permissions = new Map<string, Record<string, StoredPermission>>();
  private formFields: FormFieldRecord[] = [];
  private questions: QuestionRecord[] = [];
  private readonly settings = new Map<string, unknown>();

  async createUser(input: Omit<UserRecord, "id" | "createdAt">): Promise<UserRecord> {
    const record = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.users.set(record.id, record);
    return structuredClone(record);
  }

  async listUsers() {
    return [...this.users.values()].map((user) => structuredClone(user));
  }

  async deleteUser(id: string) {
    const sessionIds = [...this.sessions.values()]
      .filter((session) => session.userId === id)
      .map((session) => session.id);
    for (const sessionId of sessionIds) await this.deleteSession(sessionId);
    return this.users.delete(id);
  }

  async createSession(userId: string): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      userId,
      startedAt: new Date().toISOString(),
      mode: "ai",
      status: "active",
      summary: "",
    };
    this.sessions.set(record.id, record);
    this.messages.set(record.id, []);
    return structuredClone(record);
  }

  async getSession(id: string) {
    const value = this.sessions.get(id);
    return value ? structuredClone(value) : undefined;
  }

  async updateSession(id: string, changes: Partial<SessionRecord>) {
    const current = this.sessions.get(id);
    if (!current) throw new Error("Session not found");
    const next = { ...current, ...changes, id: current.id, userId: current.userId };
    this.sessions.set(id, next);
    return structuredClone(next);
  }

  async addMessage(input: Omit<MessageRecord, "id" | "at">) {
    if (!this.sessions.has(input.sessionId)) throw new Error("Session not found");
    const record: MessageRecord = {
      ...input,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    };
    this.messages.get(input.sessionId)!.push(record);
    return structuredClone(record);
  }

  async listMessages(sessionId: string) {
    return structuredClone(this.messages.get(sessionId) ?? []);
  }

  async deleteSession(id: string) {
    this.messages.delete(id);
    this.permissions.delete(id);
    return this.sessions.delete(id);
  }

  async createHandoff(input: Omit<HandoffRecord, "id" | "createdAt" | "status">) {
    const record: HandoffRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    this.handoffs.set(record.id, record);
    await this.updateSession(input.sessionId, { status: "handoff" });
    return structuredClone(record);
  }

  async addKnowledgeDocument(name: string, text: string) {
    const documentId = crypto.randomUUID();
    const normalized = text.replace(/\s+/g, " ").trim();
    for (let start = 0; start < normalized.length; start += 800) {
      const chunkText = normalized.slice(start, start + 1000);
      this.chunks.push({
        id: crypto.randomUUID(),
        documentId,
        text: chunkText,
        tokens: tokenize(chunkText),
      });
    }
    return {
      id: documentId,
      name,
      chunks: this.chunks.filter((c) => c.documentId === documentId).length,
    };
  }

  async searchKnowledge(query: string, limit = 4) {
    const queryTokens = tokenize(query);
    return this.chunks
      .map((chunk) => ({
        chunk,
        score:
          [...queryTokens].filter((token) => chunk.tokens.has(token)).length /
          Math.max(1, queryTokens.size),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({
        ...structuredClone({ ...entry.chunk, tokens: undefined }),
        score: entry.score,
      }));
  }

  async savePermissions(sessionId: string, input: Record<string, StoredPermission>) {
    if (!this.sessions.has(sessionId)) throw new Error("Session not found");
    this.permissions.set(sessionId, structuredClone(input));
  }

  async getPermissions(sessionId: string) {
    return structuredClone(this.permissions.get(sessionId) ?? {});
  }

  async listSessions() {
    return [...this.sessions.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((session) => structuredClone(session));
  }

  async listFormFields() {
    return structuredClone(this.formFields);
  }

  async replaceFormFields(fields: FormFieldRecord[]) {
    this.formFields = structuredClone(fields);
  }

  async listQuestions() {
    return structuredClone(this.questions);
  }

  async replaceQuestions(questions: QuestionRecord[]) {
    this.questions = structuredClone(questions);
  }

  async getSettings() {
    return Object.fromEntries(this.settings);
  }

  async saveSetting(key: string, value: unknown) {
    this.settings.set(key, structuredClone(value));
  }

  async listKnowledgeDocuments(): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async deleteKnowledgeDocument(_id: string) {
    return false;
  }

  async waitForExcelSync() {}

  getWorkbookPath() {
    return undefined;
  }
}

function tokenize(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}
