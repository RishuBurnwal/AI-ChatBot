// Shared domain types for the Nexus Support UI and API contracts.

export type Sender = "user" | "ai" | "agent" | "system";

export interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  /** ISO timestamp */
  at: string;
}

export type PermissionKey = "location" | "camera" | "microphone" | "screen";
export type PermissionState = "unknown" | "granted" | "denied";

export interface IntakeDetails {
  name: string;
  phone: string;
  email: string;
  age: string;
  address?: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  startedAt: string;
  channel: "widget" | "email" | "voice";
  status: "active" | "closed" | "handoff";
  handoffRequested: boolean;
  takenOver: boolean;
  messages: ChatMessage[];
  permissions: Record<PermissionKey, PermissionState>;
}

export interface CrmUser {
  id: string;
  intake: IntakeDetails;
  createdAt: string;
  lastSeen: string;
}

export interface FormField {
  id: string;
  label: string;
  key: string;
  type: "text" | "email" | "tel" | "number" | "textarea";
  required: boolean;
  enabled: boolean;
}

/** Node in the predefined-question branching tree. */
export interface QuestionNode {
  id: string;
  text: string;
  parentId: string | null;
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  sizeKb: number;
  kind: "pdf" | "docx" | "md" | "txt";
  status: "processing" | "ready" | "failed";
  uploadedAt: string;
}

export interface ProviderConfig {
  id: string;
  label: string;
  models: string[];
  apiKey: string;
}
