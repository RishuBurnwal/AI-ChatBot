import { mkdirSync, readFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import type { StoredPermission } from "./domain";
import type {
  HandoffRecord,
  FormFieldRecord,
  KnowledgeChunk,
  MessageRecord,
  SessionRecord,
  QuestionRecord,
  UserRecord,
} from "./repository";

interface SQLiteRepositoryOptions {
  databasePath: string;
  workbookPath: string;
}

interface SqlRow extends Record<string, unknown> {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  age?: unknown;
  address?: unknown;
  created_at?: unknown;
  user_id?: unknown;
  started_at?: unknown;
  mode?: unknown;
  status?: unknown;
  summary?: unknown;
  provider_used?: unknown;
  model_used?: unknown;
  agent_id?: unknown;
  session_id?: unknown;
  sender?: unknown;
  text?: unknown;
  confidence?: unknown;
  tokens?: unknown;
  document_id?: unknown;
  label?: unknown;
  field_key?: unknown;
  type?: unknown;
  required?: unknown;
  enabled?: unknown;
  parent_id?: unknown;
  key?: unknown;
  value?: unknown;
}

export class SQLiteRepository {
  private readonly database: Database.Database;
  private excelSync: Promise<void> = Promise.resolve();

  constructor(private readonly options: SQLiteRepositoryOptions) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    mkdirSync(dirname(options.workbookPath), { recursive: true });
    this.database = new Database(options.databasePath);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("journal_mode = WAL");
    this.applyMigrations();
    this.excelSync = this.writeExcelMirror();
  }

  close() {
    this.database.close();
  }

  async waitForExcelSync() {
    await this.excelSync;
  }

  async createUser(input: Omit<UserRecord, "id" | "createdAt">): Promise<UserRecord> {
    const now = new Date().toISOString();
    const record: UserRecord = { ...input, id: crypto.randomUUID(), createdAt: now };
    this.database
      .prepare(
        `INSERT INTO users (id, name, email, phone, age, address, created_at, updated_at)
         VALUES (@id, @name, @email, @phone, @age, @address, @createdAt, @updatedAt)`,
      )
      .run({
        id: record.id,
        name: record.name,
        email: record.email,
        phone: record.phone ?? null,
        age: record.age ?? null,
        address: record.address ?? null,
        createdAt: record.createdAt,
        updatedAt: now,
      });
    await this.syncExcel();
    return record;
  }

  async listUsers(): Promise<UserRecord[]> {
    return this.database.prepare("SELECT * FROM users ORDER BY created_at DESC").all().map(mapUser);
  }

  async deleteUser(id: string) {
    const result = this.database.prepare("DELETE FROM users WHERE id = ?").run(id);
    if (result.changes > 0) await this.syncExcel();
    return result.changes > 0;
  }

  async deleteSession(id: string) {
    const result = this.database.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    if (result.changes > 0) await this.syncExcel();
    return result.changes > 0;
  }

  async createSession(userId: string): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      userId,
      startedAt: now,
      mode: "ai",
      status: "active",
      summary: "",
    };
    this.database
      .prepare(
        `INSERT INTO sessions (id, user_id, started_at, mode, status, summary, updated_at)
         VALUES (@id, @userId, @startedAt, @mode, @status, @summary, @updatedAt)`,
      )
      .run({ ...record, updatedAt: now });
    await this.syncExcel();
    return record;
  }

  async getSession(id: string) {
    const row = this.database.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      SqlRow | undefined;
    return row ? mapSession(row) : undefined;
  }

  async updateSession(id: string, changes: Partial<SessionRecord>) {
    const current = await this.getSession(id);
    if (!current) throw new Error("Session not found");
    const next = { ...current, ...changes, id: current.id, userId: current.userId };
    this.database
      .prepare(
        `UPDATE sessions SET mode=@mode, status=@status, provider_used=@providerUsed,
         model_used=@modelUsed, agent_id=@agentId, summary=@summary, updated_at=@updatedAt WHERE id=@id`,
      )
      .run({
        ...next,
        providerUsed: next.providerUsed ?? null,
        modelUsed: next.modelUsed ?? null,
        agentId: next.agentId ?? null,
        updatedAt: new Date().toISOString(),
      });
    await this.syncExcel();
    return next;
  }

  async listSessions(): Promise<SessionRecord[]> {
    return this.database
      .prepare("SELECT * FROM sessions ORDER BY started_at DESC")
      .all()
      .map(mapSession);
  }

  async addMessage(input: Omit<MessageRecord, "id" | "at">): Promise<MessageRecord> {
    if (!(await this.getSession(input.sessionId))) throw new Error("Session not found");
    const record: MessageRecord = {
      ...input,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    };
    this.database
      .prepare(
        `INSERT INTO messages (id, session_id, sender, text, confidence, created_at)
         VALUES (@id, @sessionId, @sender, @text, @confidence, @at)`,
      )
      .run({ ...record, confidence: record.confidence ?? null });
    await this.syncExcel();
    return record;
  }

  async listMessages(sessionId: string): Promise<MessageRecord[]> {
    return this.database
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at")
      .all(sessionId)
      .map(mapMessage);
  }

  async createHandoff(
    input: Omit<HandoffRecord, "id" | "createdAt" | "status">,
  ): Promise<HandoffRecord> {
    const now = new Date().toISOString();
    const record: HandoffRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      status: "pending",
    };
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO handoff_requests
           (id, session_id, reason, confidence, status, resolved_by, created_at, updated_at)
           VALUES (@id, @sessionId, @reason, @confidence, @status, NULL, @createdAt, @updatedAt)`,
        )
        .run({ ...record, updatedAt: now });
      this.database
        .prepare("UPDATE sessions SET status = 'handoff', updated_at = ? WHERE id = ?")
        .run(now, input.sessionId);
    });
    transaction();
    await this.syncExcel();
    return record;
  }

  async savePermissions(sessionId: string, input: Record<string, StoredPermission>) {
    if (!(await this.getSession(sessionId))) throw new Error("Session not found");
    const current = await this.getPermissions(sessionId);
    const next = { ...current, ...input };
    this.database
      .prepare(
        `INSERT INTO permission_consents
         (session_id, location, camera, microphone, screen, updated_at)
         VALUES (@sessionId, @location, @camera, @microphone, @screen, @updatedAt)
         ON CONFLICT(session_id) DO UPDATE SET location=excluded.location, camera=excluded.camera,
         microphone=excluded.microphone, screen=excluded.screen, updated_at=excluded.updated_at`,
      )
      .run({
        sessionId,
        location: next["location"] ?? null,
        camera: next["camera"] ?? null,
        microphone: next["microphone"] ?? null,
        screen: next["screen"] ?? null,
        updatedAt: new Date().toISOString(),
      });
    await this.syncExcel();
  }

  async getPermissions(sessionId: string): Promise<Record<string, StoredPermission>> {
    const row = this.database
      .prepare(
        "SELECT location, camera, microphone, screen FROM permission_consents WHERE session_id = ?",
      )
      .get(sessionId) as SqlRow | undefined;
    if (!row) return {};
    return Object.fromEntries(
      Object.entries(row).filter((entry): entry is [string, StoredPermission] => entry[1] !== null),
    );
  }

  async addKnowledgeDocument(name: string, text: string) {
    const documentId = crypto.randomUUID();
    const now = new Date().toISOString();
    const extension = extname(name).slice(1).toLowerCase() || "txt";
    const normalized = text.replace(/\s+/g, " ").trim();
    const chunks: KnowledgeChunk[] = [];
    for (let start = 0; start < normalized.length; start += 800) {
      const chunkText = normalized.slice(start, start + 1000);
      chunks.push({
        id: crypto.randomUUID(),
        documentId,
        text: chunkText,
        tokens: tokenize(chunkText),
      });
    }
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO kb_documents (id, filename, kind, status, size_kb, uploaded_at)
           VALUES (?, ?, ?, 'ready', ?, ?)`,
        )
        .run(documentId, name, extension, Buffer.byteLength(text, "utf8") / 1024, now);
      const insert = this.database.prepare(
        "INSERT INTO kb_chunks (id, document_id, text, tokens) VALUES (?, ?, ?, ?)",
      );
      for (const chunk of chunks) {
        insert.run(chunk.id, chunk.documentId, chunk.text, JSON.stringify([...chunk.tokens]));
      }
    });
    transaction();
    await this.syncExcel();
    return { id: documentId, name, chunks: chunks.length };
  }

  async searchKnowledge(query: string, limit = 4) {
    const queryTokens = tokenize(query);
    return (this.database.prepare("SELECT * FROM kb_chunks").all() as SqlRow[])
      .map((row) => {
        const tokens = new Set(JSON.parse(String(row.tokens)) as string[]);
        const score =
          [...queryTokens].filter((token) => tokens.has(token)).length /
          Math.max(1, queryTokens.size);
        return {
          id: String(row.id),
          documentId: String(row.document_id),
          text: String(row.text),
          score,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async listFormFields(): Promise<FormFieldRecord[]> {
    return (
      this.database.prepare("SELECT * FROM form_fields ORDER BY position").all() as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      label: String(row.label),
      key: String(row.field_key),
      type: row.type as FormFieldRecord["type"],
      required: Boolean(row.required),
      enabled: Boolean(row.enabled),
    }));
  }

  async replaceFormFields(fields: FormFieldRecord[]) {
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM form_fields").run();
      const insert = this.database.prepare(
        `INSERT INTO form_fields
         (id, label, field_key, type, required, enabled, position, updated_at)
         VALUES (@id, @label, @key, @type, @required, @enabled, @position, @updatedAt)`,
      );
      fields.forEach((field, position) =>
        insert.run({
          ...field,
          required: Number(field.required),
          enabled: Number(field.enabled),
          position,
          updatedAt: now,
        }),
      );
    })();
    await this.syncExcel();
  }

  async listQuestions(): Promise<QuestionRecord[]> {
    return (
      this.database.prepare("SELECT * FROM questions ORDER BY position").all() as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      text: String(row.text),
      parentId: row.parent_id === null ? null : String(row.parent_id),
    }));
  }

  async replaceQuestions(questions: QuestionRecord[]) {
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM questions").run();
      const insert = this.database.prepare(
        "INSERT INTO questions (id, text, parent_id, position, updated_at) VALUES (?, ?, ?, ?, ?)",
      );
      const pending = [...questions];
      const inserted = new Set<string>();
      while (pending.length) {
        const index = pending.findIndex(
          (question) => question.parentId === null || inserted.has(question.parentId),
        );
        if (index < 0) throw new Error("Question graph contains an invalid parent cycle");
        const [question] = pending.splice(index, 1);
        if (!question) continue;
        insert.run(question.id, question.text, question.parentId, questions.indexOf(question), now);
        inserted.add(question.id);
      }
    })();
    await this.syncExcel();
  }

  async getSettings(): Promise<Record<string, unknown>> {
    return Object.fromEntries(
      (this.database.prepare("SELECT key, value FROM settings").all() as SqlRow[]).map((row) => [
        String(row.key),
        JSON.parse(String(row.value)) as unknown,
      ]),
    );
  }

  async saveSetting(key: string, value: unknown) {
    this.database
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
    await this.syncExcel();
  }

  async listKnowledgeDocuments(): Promise<Array<Record<string, unknown>>> {
    return this.database
      .prepare("SELECT * FROM kb_documents ORDER BY uploaded_at DESC")
      .all() as SqlRow[];
  }

  async deleteKnowledgeDocument(id: string) {
    const result = this.database.prepare("DELETE FROM kb_documents WHERE id = ?").run(id);
    if (result.changes > 0) await this.syncExcel();
    return result.changes > 0;
  }

  getWorkbookPath() {
    return this.options.workbookPath;
  }

  private applyMigrations() {
    this.database.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    for (const version of ["001_initial", "002_default_configuration"]) {
      const applied = this.database
        .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
        .get(version);
      if (applied) continue;
      const migrationPath = fileURLToPath(new URL(`../db/sqlite/${version}.sql`, import.meta.url));
      const sql = readFileSync(migrationPath, "utf8");
      this.database.transaction(() => {
        this.database.exec(sql);
        this.database
          .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(version, new Date().toISOString());
      })();
    }
  }

  private async syncExcel() {
    this.excelSync = this.excelSync.then(() => this.writeExcelMirror());
    await this.excelSync;
  }

  private async writeExcelMirror() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Nexus Support";
    workbook.created = new Date();
    const sheets: Array<{ name: string; query: string }> = [
      { name: "Users", query: "SELECT * FROM users ORDER BY created_at DESC" },
      { name: "Sessions", query: "SELECT * FROM sessions ORDER BY started_at DESC" },
      { name: "Messages", query: "SELECT * FROM messages ORDER BY created_at DESC" },
      { name: "Permissions", query: "SELECT * FROM permission_consents ORDER BY updated_at DESC" },
      { name: "Handoffs", query: "SELECT * FROM handoff_requests ORDER BY created_at DESC" },
      { name: "Form Fields", query: "SELECT * FROM form_fields ORDER BY position" },
      { name: "Questions", query: "SELECT * FROM questions ORDER BY position" },
      { name: "Settings", query: "SELECT * FROM settings ORDER BY key" },
      { name: "Knowledge", query: "SELECT * FROM kb_documents ORDER BY uploaded_at DESC" },
    ];
    for (const definition of sheets) {
      const rows = this.database.prepare(definition.query).all() as SqlRow[];
      const worksheet = workbook.addWorksheet(definition.name, {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      const columns = rows[0]
        ? Object.keys(rows[0])
        : this.database
            .prepare(`PRAGMA table_info(${tableNameForSheet(definition.name)})`)
            .all()
            .map((row) => String((row as SqlRow).name));
      worksheet.columns = columns.map((key) => ({
        header: humanize(key),
        key,
        width: Math.min(45, Math.max(14, humanize(key).length + 4)),
      }));
      for (const row of rows) worksheet.addRow(row);
      const header = worksheet.getRow(1);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      header.height = 24;
      if (columns.length) {
        worksheet.autoFilter = { from: "A1", to: `${columnLetter(columns.length)}1` };
      }
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
      });
    }
    await workbook.xlsx.writeFile(this.options.workbookPath);
  }
}

function mapUser(value: unknown): UserRecord {
  const row = value as SqlRow;
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    ...(row.phone === null ? {} : { phone: String(row.phone) }),
    ...(row.age === null ? {} : { age: String(row.age) }),
    ...(row.address === null ? {} : { address: String(row.address) }),
    createdAt: String(row.created_at),
  };
}

function mapSession(value: unknown): SessionRecord {
  const row = value as SqlRow;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    startedAt: String(row.started_at),
    mode: row.mode as SessionRecord["mode"],
    status: row.status as SessionRecord["status"],
    summary: String(row.summary),
    ...(row.provider_used === null ? {} : { providerUsed: String(row.provider_used) }),
    ...(row.model_used === null ? {} : { modelUsed: String(row.model_used) }),
    ...(row.agent_id === null ? {} : { agentId: String(row.agent_id) }),
  };
}

function mapMessage(value: unknown): MessageRecord {
  const row = value as SqlRow;
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    sender: row.sender as MessageRecord["sender"],
    text: String(row.text),
    at: String(row.created_at),
    ...(row.confidence === null ? {} : { confidence: Number(row.confidence) }),
  };
}

function tokenize(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tableNameForSheet(sheet: string) {
  return {
    Users: "users",
    Sessions: "sessions",
    Messages: "messages",
    Permissions: "permission_consents",
    Handoffs: "handoff_requests",
    "Form Fields": "form_fields",
    Questions: "questions",
    Settings: "settings",
    Knowledge: "kb_documents",
  }[sheet]!;
}

function columnLetter(count: number) {
  let result = "";
  let value = count;
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
