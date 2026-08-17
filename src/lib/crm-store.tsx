import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import * as backend from "./api";
import {
  emitTyping,
  getRealtimeSocket,
  type CallInvite,
  type TypingActor,
  type TypingUpdate,
} from "./realtime";
import type {
  ChatMessage,
  ChatSession,
  CrmUser,
  FormField,
  KnowledgeDoc,
  PermissionKey,
  PermissionState,
  ProviderConfig,
  QuestionNode,
} from "./crm-types";

export const currentAgent = { id: "admin", name: "Support Admin", role: "Admin" as const };

const providerCatalog: ProviderConfig[] = [
  { id: "openai", label: "OpenAI", models: ["gpt-4.1-mini", "gpt-4.1"], apiKey: "" },
  {
    id: "openrouter",
    label: "OpenRouter",
    models: ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4"],
    apiKey: "",
  },
  { id: "google", label: "Google Gemini", models: ["gemini-2.5-flash"], apiKey: "" },
  { id: "nvidia", label: "NVIDIA NIM", models: ["meta/llama-3.3-70b-instruct"], apiKey: "" },
  { id: "groq", label: "Groq", models: ["openai/gpt-oss-20b"], apiKey: "" },
  { id: "perplexity", label: "Perplexity", models: ["sonar-pro"], apiKey: "" },
];

export interface CrmState {
  users: CrmUser[];
  sessions: ChatSession[];
  formFields: FormField[];
  questionTree: QuestionNode[];
  docs: KnowledgeDoc[];
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModel: string;
  persona: string;
  rules: string[];
  quickReplies: string[];
  requestedPermissions: Record<PermissionKey, boolean>;
  general: { brandName: string; widgetGreeting: string; officeHours: string; autoHandoff: boolean };
}

interface CrmContextValue extends CrmState {
  loading: boolean;
  typingBySession: Record<string, TypingActor[]>;
  incomingCall: CallInvite | null;
  clearIncomingCall: () => void;
  sendTyping: (sessionId: string, actor: TypingActor, typing: boolean) => void;
  setFormFields: (fields: FormField[]) => void;
  setQuestionTree: (nodes: QuestionNode[]) => void;
  setProviders: (providers: ProviderConfig[]) => void;
  setActiveProviderId: (id: string) => void;
  setActiveModel: (model: string) => void;
  setPersona: (persona: string) => void;
  setRules: (rules: string[]) => void;
  setQuickReplies: (replies: string[]) => void;
  setRequestedPermissions: (permissions: Record<PermissionKey, boolean>) => void;
  setGeneral: (general: CrmState["general"]) => void;
  appendMessage: (sessionId: string, message: ChatMessage) => void;
  setTakeover: (sessionId: string, takenOver: boolean) => void;
  clearHandoff: (sessionId: string) => void;
  setSessionPermission: (sessionId: string, key: PermissionKey, state: PermissionState) => void;
  upsertSession: (session: ChatSession) => void;
  upsertUser: (user: CrmUser) => void;
  deleteUser: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  uploadDocuments: (files: File[]) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingBySession, setTypingBySession] = useState<Record<string, TypingActor[]>>({});
  const [incomingCall, setIncomingCall] = useState<CallInvite | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [formFields, setFormFieldsState] = useState<FormField[]>([]);
  const [questionTree, setQuestionTreeState] = useState<QuestionNode[]>([]);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [providers, setProvidersState] = useState<ProviderConfig[]>(providerCatalog);
  const [activeProviderId, setActiveProviderIdState] = useState("groq");
  const [activeModel, setActiveModelState] = useState("openai/gpt-oss-20b");
  const [persona, setPersonaState] = useState(
    "You are a helpful, concise customer support assistant.",
  );
  const [rules, setRulesState] = useState<string[]>([]);
  const [quickReplies, setQuickRepliesState] = useState<string[]>([]);
  const [requestedPermissions, setRequestedPermissionsState] = useState<
    Record<PermissionKey, boolean>
  >({ location: true, camera: true, microphone: true, screen: true });
  const [general, setGeneralState] = useState({
    brandName: "Nexus Support",
    widgetGreeting: "Hi! How can I help today?",
    officeHours: "",
    autoHandoff: true,
  });

  const reportError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Could not save the change");

  const refresh = async () => {
    const state = await backend.loadCrmState();
    setUsers(state.users);
    setSessions(state.sessions);
    setFormFieldsState(state.formFields);
    setQuestionTreeState(state.questionTree);
    setDocs(state.docs);
    const settings = state.settings;
    if (settings.providers) setProvidersState(settings.providers);
    if (settings.activeProviderId) setActiveProviderIdState(settings.activeProviderId);
    if (settings.activeModel) setActiveModelState(settings.activeModel);
    if (settings.persona !== undefined) setPersonaState(settings.persona);
    if (settings.rules) setRulesState(settings.rules);
    if (settings.quickReplies) setQuickRepliesState(settings.quickReplies);
    if (settings.requestedPermissions) setRequestedPermissionsState(settings.requestedPermissions);
    if (settings.general) setGeneralState(settings.general);
  };

  useEffect(() => {
    void refresh()
      .catch(reportError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    const socket = getRealtimeSocket();
    socket.emit("agent:available");
    const reload = () => void refresh().catch(reportError);
    const updateTyping = ({ sessionId, actor, typing }: TypingUpdate) =>
      setTypingBySession((previous) => {
        const actors = new Set(previous[sessionId] ?? []);
        if (typing) actors.add(actor);
        else actors.delete(actor);
        return { ...previous, [sessionId]: [...actors] };
      });
    socket.on("chat:updated", reload);
    socket.on("handoff:created", reload);
    socket.on("typing:update", updateTyping);
    socket.on("call:invite", setIncomingCall);
    return () => {
      socket.off("chat:updated", reload);
      socket.off("handoff:created", reload);
      socket.off("typing:update", updateTyping);
      socket.off("call:invite", setIncomingCall);
    };
  }, []);

  const persistSetting = (key: string, value: unknown) => {
    void backend.saveSetting(key, value).catch(reportError);
  };

  const value: CrmContextValue = {
    users,
    loading,
    typingBySession,
    incomingCall,
    clearIncomingCall: () => setIncomingCall(null),
    sendTyping: emitTyping,
    sessions,
    formFields,
    questionTree,
    docs,
    providers,
    activeProviderId,
    activeModel,
    persona,
    rules,
    quickReplies,
    requestedPermissions,
    general,
    setFormFields: (fields) => {
      setFormFieldsState(fields);
      void backend.saveFormFields(fields).catch(reportError);
    },
    setQuestionTree: (nodes) => {
      setQuestionTreeState(nodes);
      void backend.saveQuestionTree(nodes).catch(reportError);
    },
    setProviders: (nextProviders) => {
      setProvidersState(nextProviders);
      persistSetting(
        "providers",
        nextProviders.map((provider) => ({ ...provider, apiKey: "" })),
      );
    },
    setActiveProviderId: (id) => {
      setActiveProviderIdState(id);
      persistSetting("activeProviderId", id);
    },
    setActiveModel: (model) => {
      setActiveModelState(model);
      persistSetting("activeModel", model);
    },
    setPersona: (nextPersona) => {
      setPersonaState(nextPersona);
      persistSetting("persona", nextPersona);
    },
    setRules: (nextRules) => {
      setRulesState(nextRules);
      persistSetting("rules", nextRules);
    },
    setQuickReplies: (replies) => {
      setQuickRepliesState(replies);
      persistSetting("quickReplies", replies);
    },
    setRequestedPermissions: (permissions) => {
      setRequestedPermissionsState(permissions);
      persistSetting("requestedPermissions", permissions);
    },
    setGeneral: (nextGeneral) => {
      setGeneralState(nextGeneral);
      persistSetting("general", nextGeneral);
    },
    appendMessage: (sessionId, message) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId
            ? { ...session, messages: [...session.messages, message] }
            : session,
        ),
      );
      void backend.sendAgentMessage(sessionId, message.text).catch(reportError);
    },
    setTakeover: (sessionId, takenOver) => {
      setSessions((previous) =>
        previous.map((session) => (session.id === sessionId ? { ...session, takenOver } : session)),
      );
      void backend.setTakeoverMode(sessionId, takenOver).catch(reportError);
    },
    clearHandoff: (sessionId) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId
            ? { ...session, handoffRequested: false, status: "active" }
            : session,
        ),
      );
      void backend.setTakeoverMode(sessionId, false).catch(reportError);
    },
    setSessionPermission: (sessionId, key, state) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId
            ? { ...session, permissions: { ...session.permissions, [key]: state } }
            : session,
        ),
      );
      void backend.savePermission(sessionId, key, state).catch(reportError);
    },
    upsertSession: (session) =>
      setSessions((previous) =>
        previous.some((item) => item.id === session.id)
          ? previous.map((item) => (item.id === session.id ? session : item))
          : [session, ...previous],
      ),
    upsertUser: (user) =>
      setUsers((previous) =>
        previous.some((item) => item.id === user.id)
          ? previous.map((item) => (item.id === user.id ? user : item))
          : [user, ...previous],
      ),
    deleteUser: async (id) => {
      await backend.deleteUser(id);
      setUsers((previous) => previous.filter((user) => user.id !== id));
      setSessions((previous) => previous.filter((session) => session.userId !== id));
    },
    deleteSession: async (id) => {
      await backend.deleteSession(id);
      setSessions((previous) => previous.filter((session) => session.id !== id));
    },
    uploadDocuments: async (files) => {
      for (const file of files) await backend.uploadKnowledge(file);
      await refresh();
    },
    deleteDocument: async (id) => {
      await backend.deleteKnowledge(id);
      setDocs((previous) => previous.filter((document) => document.id !== id));
    },
    refresh,
  };

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const context = useContext(CrmContext);
  if (!context) throw new Error("useCrm must be used inside <CrmProvider>");
  return context;
}
