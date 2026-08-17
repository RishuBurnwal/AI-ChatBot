import type {
  ChatMessage,
  FormField,
  IntakeDetails,
  PermissionKey,
  PermissionState,
  QuestionNode,
} from "./crm-types";
import type { CrmState } from "./crm-store";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: { ...(isFormData ? {} : { "content-type": "application/json" }), ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export async function createSession(intake: IntakeDetails) {
  return api<{ session: { id: string; userId: string; startedAt: string } }>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(intake),
  });
}

export async function sendMessage(sessionId: string, text: string) {
  return api<{ userMessage: ChatMessage; reply: ChatMessage | null; handoff?: unknown }>(
    `/api/sessions/${sessionId}/messages`,
    { method: "POST", body: JSON.stringify({ text }) },
  );
}

export async function savePermission(
  sessionId: string,
  key: PermissionKey,
  state: PermissionState,
) {
  if (state === "unknown") return;
  await api(`/api/sessions/${sessionId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ [key]: state }),
  });
}

export async function loadCrmState() {
  return api<
    Pick<CrmState, "users" | "sessions" | "formFields" | "questionTree" | "docs"> & {
      settings: Partial<
        Pick<
          CrmState,
          | "providers"
          | "activeProviderId"
          | "activeModel"
          | "persona"
          | "rules"
          | "quickReplies"
          | "requestedPermissions"
          | "general"
        >
      >;
    }
  >("/api/state");
}

export const saveFormFields = (fields: FormField[]) =>
  api("/api/form-fields", { method: "PUT", body: JSON.stringify(fields) });

export const saveQuestionTree = (questions: QuestionNode[]) =>
  api("/api/questions", { method: "PUT", body: JSON.stringify(questions) });

export const saveSetting = (key: string, value: unknown) =>
  api(`/api/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });

export const deleteUser = (id: string) =>
  api<void>(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });

export const deleteSession = (id: string) =>
  api<void>(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function uploadKnowledge(file: File) {
  const body = new FormData();
  body.append("file", file);
  return api<{ document: { id: string; name: string } }>("/api/knowledge", {
    method: "POST",
    body,
  });
}

export const deleteKnowledge = (id: string) =>
  api<void>(`/api/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" });

export const setTakeoverMode = (sessionId: string, takenOver: boolean) =>
  api(`/api/sessions/${encodeURIComponent(sessionId)}/${takenOver ? "takeover" : "release"}`, {
    method: "POST",
    body: JSON.stringify(takenOver ? { agentId: "admin" } : {}),
  });

export const sendAgentMessage = (sessionId: string, text: string) =>
  api<{ message: ChatMessage }>(`/api/sessions/${encodeURIComponent(sessionId)}/agent-messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
