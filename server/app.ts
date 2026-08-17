import cors from "cors";
import ExcelJS from "exceljs";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { extractDocumentText } from "./core/document-service";
import {
  normalizePermissionResult,
  validateQuestionGraph,
  type StoredPermission,
} from "./core/domain";
import type { ProviderRegistry } from "./core/provider-registry";
import type { FormFieldRecord, QuestionRecord, SupportRepository } from "./core/repository";
import { SupportService } from "./core/support-service";

const intakeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  age: z.string().max(20).optional(),
  address: z.string().max(1000).optional(),
});
const messageSchema = z.object({ text: z.string().trim().min(1).max(20_000) });
const permissionSchema = z.record(z.enum(["granted", "denied"]));
const submissionFilterSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export interface AppDependencies {
  repository: SupportRepository;
  providers: Pick<ProviderRegistry, "generate">;
  onHandoff?: (handoff: unknown) => void;
  onChatUpdated?: (sessionId: string) => void;
  onTyping?: (sessionId: string, actor: "ai", typing: boolean) => void;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });
  const support = new SupportService(dependencies.repository, dependencies.providers, {
    ...providerOptionsFromEnv(),
    onMessage: (message) => dependencies.onChatUpdated?.(message.sessionId),
  });

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_request, response) => response.json({ ok: true }));

  app.post("/api/sessions", async (request, response, next) => {
    try {
      const input = intakeSchema.parse(request.body);
      const session = await support.createSession({
        name: input.name,
        email: input.email,
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.age === undefined ? {} : { age: input.age }),
        ...(input.address === undefined ? {} : { address: input.address }),
      });
      dependencies.onChatUpdated?.(session.id);
      response.status(201).json({ session });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/sessions/:id/messages", async (request, response, next) => {
    try {
      const { text } = messageSchema.parse(request.body);
      const session = await dependencies.repository.getSession(request.params.id);
      const aiWillReply = session?.mode === "ai";
      if (aiWillReply) dependencies.onTyping?.(request.params.id, "ai", true);
      try {
        const result = await support.sendUserMessage(request.params.id, text);
        if (result.handoff) dependencies.onHandoff?.(result.handoff);
        response.status(201).json(result);
      } finally {
        if (aiWillReply) dependencies.onTyping?.(request.params.id, "ai", false);
      }
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/sessions/:id/agent-messages", async (request, response, next) => {
    try {
      const { text } = messageSchema.parse(request.body);
      const message = await dependencies.repository.addMessage({
        sessionId: request.params.id,
        sender: "agent",
        text,
      });
      dependencies.onChatUpdated?.(request.params.id);
      response.status(201).json({ message });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/sessions/:id/permissions", async (request, response, next) => {
    try {
      const input = permissionSchema.parse(request.body);
      const permissions = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [key, normalizePermissionResult(value)]),
      );
      await dependencies.repository.savePermissions(request.params.id, permissions);
      dependencies.onChatUpdated?.(request.params.id);
      response.json({ permissions });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/takeover", async (request, response, next) => {
    try {
      const agentId = z.string().min(1).parse(request.body?.agentId);
      const session = await dependencies.repository.updateSession(request.params.id, {
        mode: "human",
        status: "active",
        agentId,
      });
      await dependencies.repository.addMessage({
        sessionId: request.params.id,
        sender: "system",
        text: "Chat transferred to Support Admin.",
      });
      dependencies.onChatUpdated?.(request.params.id);
      response.json({ session });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/release", async (request, response, next) => {
    try {
      const session = await dependencies.repository.updateSession(request.params.id, {
        mode: "ai",
        agentId: undefined,
      });
      await dependencies.repository.addMessage({
        sessionId: request.params.id,
        sender: "system",
        text: "Support Admin returned this chat to the AI assistant.",
      });
      dependencies.onChatUpdated?.(request.params.id);
      response.json({ session });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions", async (_request, response) => {
    response.json({ sessions: await dependencies.repository.listSessions() });
  });

  app.delete("/api/sessions/:id", async (request, response) => {
    const deleted = await dependencies.repository.deleteSession(request.params.id);
    response.status(deleted ? 204 : 404).end();
  });

  app.delete("/api/users/:id", async (request, response) => {
    const deleted = await dependencies.repository.deleteUser(request.params.id);
    response.status(deleted ? 204 : 404).end();
  });

  app.get("/api/questions", async (_request, response) =>
    response.json({ questions: await dependencies.repository.listQuestions() }),
  );
  app.put("/api/questions", async (request, response, next) => {
    try {
      const rawQuestions = z
        .array(
          z.union([
            z.object({
              id: z.string().min(1),
              text: z.string().trim().min(1),
              parentId: z.string().nullable(),
            }),
            z.object({
              id: z.string().min(1),
              text: z.string().trim().min(1),
              nextQuestionIds: z.array(z.string()),
            }),
          ]),
        )
        .parse(request.body);
      const questions: QuestionRecord[] = rawQuestions.map((question) => ({
        id: question.id,
        text: question.text,
        parentId:
          "parentId" in question
            ? question.parentId
            : (rawQuestions.find(
                (candidate) =>
                  "nextQuestionIds" in candidate && candidate.nextQuestionIds.includes(question.id),
              )?.id ?? null),
      }));
      const validation = validateQuestionGraph(
        questions.map((question) => ({
          id: question.id,
          text: question.text,
          nextQuestionIds: questions
            .filter((candidate) => candidate.parentId === question.id)
            .map((candidate) => candidate.id),
        })),
      );
      if (!validation.valid)
        return response.status(422).json({ error: validation.errors.join("; ") });
      await dependencies.repository.replaceQuestions(questions);
      return response.json({ questions });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/form-fields", async (_request, response) =>
    response.json({ formFields: await dependencies.repository.listFormFields() }),
  );
  app.put("/api/form-fields", async (request, response, next) => {
    try {
      const fields = z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            key: z.string(),
            type: z.enum(["text", "email", "tel", "number", "textarea"]),
            required: z.boolean(),
            enabled: z.boolean(),
          }),
        )
        .parse(request.body) as FormFieldRecord[];
      await dependencies.repository.replaceFormFields(fields);
      response.json({ formFields: fields });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/settings", async (_request, response) =>
    response.json({ settings: await dependencies.repository.getSettings() }),
  );
  app.put("/api/settings/:key", async (request, response, next) => {
    try {
      await dependencies.repository.saveSetting(request.params.key, request.body.value);
      response.json({ value: request.body.value });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state", async (_request, response) => {
    const users = await dependencies.repository.listUsers();
    const sessionRecords = await dependencies.repository.listSessions();
    const sessions = await Promise.all(
      sessionRecords.map(async (session) => {
        const permissions = await dependencies.repository.getPermissions(session.id);
        return {
          id: session.id,
          userId: session.userId,
          startedAt: session.startedAt,
          channel: "widget",
          status: session.status,
          handoffRequested: session.status === "handoff",
          takenOver: session.mode === "human",
          messages: (await dependencies.repository.listMessages(session.id)).map((message) => ({
            id: message.id,
            sender: message.sender,
            text: message.text,
            at: message.at,
          })),
          permissions: {
            location: permissionForUi(permissions["location"]),
            camera: permissionForUi(permissions["camera"]),
            microphone: permissionForUi(permissions["microphone"]),
            screen: permissionForUi(permissions["screen"]),
          },
        };
      }),
    );
    const settings = await dependencies.repository.getSettings();
    response.json({
      users: users.map((user) => ({
        id: user.id,
        intake: {
          name: user.name,
          email: user.email,
          phone: user.phone ?? "",
          age: user.age ?? "",
          ...(user.address ? { address: user.address } : {}),
        },
        createdAt: user.createdAt,
        lastSeen:
          sessionRecords.find((session) => session.userId === user.id)?.startedAt ?? user.createdAt,
      })),
      sessions,
      formFields: await dependencies.repository.listFormFields(),
      questionTree: await dependencies.repository.listQuestions(),
      docs: (await dependencies.repository.listKnowledgeDocuments()).map((document) => ({
        id: String(document["id"]),
        name: String(document["filename"]),
        sizeKb: Number(document["size_kb"]),
        kind: String(document["kind"]),
        status: String(document["status"]),
        uploadedAt: String(document["uploaded_at"]),
      })),
      settings,
    });
  });

  app.delete("/api/knowledge/:id", async (request, response) => {
    const deleted = await dependencies.repository.deleteKnowledgeDocument(request.params.id);
    response.status(deleted ? 204 : 404).end();
  });

  app.get("/api/export.xlsx", async (_request, response, next) => {
    try {
      await dependencies.repository.waitForExcelSync();
      const workbookPath = dependencies.repository.getWorkbookPath();
      if (!workbookPath) return response.status(404).json({ error: "Excel export is unavailable" });
      return response.download(workbookPath, "nexus-support.xlsx");
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/form-submissions.xlsx", async (request, response, next) => {
    try {
      const filter = submissionFilterSchema.parse(request.query);
      const users = (await dependencies.repository.listUsers()).filter((user) => {
        const date = localDateKey(user.createdAt);
        return (!filter.from || date >= filter.from) && (!filter.to || date <= filter.to);
      });
      const allSessions = await dependencies.repository.listSessions();
      const rows = await Promise.all(
        users.map(async (user) => {
          const sessions = allSessions
            .filter((session) => session.userId === user.id)
            .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
          const latest = sessions[0];
          const permissions = latest ? await dependencies.repository.getPermissions(latest.id) : {};
          return {
            submittedAt: new Date(user.createdAt),
            userId: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone ?? "",
            age: user.age ?? "",
            address: user.address ?? "",
            sessions: sessions.length,
            latestSession: latest?.id ?? "",
            status: latest?.status ?? "",
            location: permissionForExport(permissions["location"]),
            camera: permissionForExport(permissions["camera"]),
            microphone: permissionForExport(permissions["microphone"]),
            screen: permissionForExport(permissions["screen"]),
            lastSeen: new Date(latest?.startedAt ?? user.createdAt),
          };
        }),
      );
      const workbook = createFormSubmissionsWorkbook(rows);
      const buffer = await workbook.xlsx.writeBuffer();
      const suffix =
        filter.from || filter.to ? `-${filter.from ?? "start"}-to-${filter.to ?? "today"}` : "";
      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="form-submissions${suffix}.xlsx"`,
      );
      response.send(Buffer.from(buffer));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/knowledge", upload.single("file"), async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ error: "A file is required" });
      const text = await extractDocumentText(request.file.originalname, request.file.buffer);
      if (!text)
        return response.status(422).json({ error: "The document contains no extractable text" });
      const document = await dependencies.repository.addKnowledgeDocument(
        request.file.originalname,
        text,
      );
      return response.status(201).json({ document });
    } catch (error) {
      return next(error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "Validation failed", details: error.flatten() });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      message === "Session not found"
        ? 404
        : message.startsWith("AI service is temporarily unavailable")
          ? 503
          : 500;
    response.status(status).json({ error: message });
  };
  app.use(errorHandler);
  return app;
}

function providerOptionsFromEnv() {
  const preferred = process.env["AI_PROVIDER"] ?? "groq";
  const keyByProvider: Record<string, string | undefined> = {
    openai: process.env["OPENAI_API_KEY"],
    openrouter: process.env["OPENROUTER_API_KEY"],
    google: process.env["GEMINI_API_KEY"],
    nvidia: process.env["NVIDIA_API_KEY"],
    groq: process.env["GROQ_API_KEY"],
    perplexity: process.env["PERPLEXITY_API_KEY"],
  };
  const modelByProvider: Record<string, string> = {
    openai: "gpt-4.1-mini",
    openrouter: "openai/gpt-4.1-mini",
    google: "gemini-2.5-flash",
    nvidia: "meta/llama-3.3-70b-instruct",
    groq: "openai/gpt-oss-20b",
    perplexity: "sonar-pro",
  };
  const available = Object.entries(keyByProvider)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([provider, apiKey]) => ({
      provider,
      apiKey,
      model: modelByProvider[provider] ?? provider,
    }));
  const primary = available.find((item) => item.provider === preferred) ?? available[0];
  return primary
    ? {
        provider: primary,
        fallbacks: available.filter((item) => item.provider !== primary.provider),
      }
    : undefined;
}

function permissionForUi(value: StoredPermission | undefined) {
  if (value === "granted") return "granted";
  if (value === "No permission granted") return "denied";
  return "unknown";
}

function permissionForExport(value: StoredPermission | undefined) {
  if (value === "granted") return "Granted";
  if (value === "No permission granted") return "Denied";
  return "Not requested";
}

function localDateKey(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

interface FormSubmissionExportRow {
  submittedAt: Date;
  userId: string;
  name: string;
  email: string;
  phone: string;
  age: string;
  address: string;
  sessions: number;
  latestSession: string;
  status: string;
  location: string;
  camera: string;
  microphone: string;
  screen: string;
  lastSeen: Date;
}

function createFormSubmissionsWorkbook(rows: FormSubmissionExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexus Support";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Form Submissions", {
    views: [{ state: "frozen", ySplit: 2 }],
    properties: { defaultRowHeight: 20 },
  });
  const headers = [
    "Submitted At",
    "User ID",
    "Name",
    "Email",
    "Phone",
    "Age",
    "Address",
    "Sessions",
    "Latest Session",
    "Status",
    "Location Permission",
    "Camera Permission",
    "Microphone Permission",
    "Screen Permission",
    "Last Seen",
  ];
  const widths = [22, 38, 24, 30, 18, 10, 36, 12, 38, 14, 21, 20, 24, 20, 22];
  sheet.mergeCells(1, 1, 1, headers.length);
  const title = sheet.getCell("A1");
  title.value = "Form Submissions";
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;

  const header = sheet.addRow(headers);
  header.height = 26;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  headers.forEach((_value, index) => {
    sheet.getColumn(index + 1).width = widths[index] ?? 14;
  });

  for (const [index, row] of rows.entries()) {
    const excelRow = sheet.addRow([
      row.submittedAt,
      row.userId,
      row.name,
      row.email,
      row.phone,
      row.age,
      row.address,
      row.sessions,
      row.latestSession,
      row.status,
      row.location,
      row.camera,
      row.microphone,
      row.screen,
      row.lastSeen,
    ]);
    excelRow.alignment = { vertical: "top", wrapText: true };
    if (index % 2 === 1) {
      excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDFA" } };
    }
  }
  sheet.getColumn(1).numFmt = "yyyy-mm-dd hh:mm";
  sheet.getColumn(15).numFmt = "yyyy-mm-dd hh:mm";
  sheet.autoFilter = { from: "A2", to: `O${Math.max(2, rows.length + 2)}` };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
    });
  });
  return workbook;
}
