import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronRight,
  Folder,
  FileText,
  Camera,
  Mic,
  MapPin,
  MonitorUp,
  Trash2,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCrm } from "@/lib/crm-store";
import type { ChatSession, PermissionKey, PermissionState } from "@/lib/crm-types";

export const Route = createFileRoute("/admin/users")({
  component: UsersAndSessions,
});

const PERM_META: Record<PermissionKey, { label: string; icon: typeof Camera }> = {
  location: { label: "Location", icon: MapPin },
  camera: { label: "Camera", icon: Camera },
  microphone: { label: "Mic", icon: Mic },
  screen: { label: "Screen", icon: MonitorUp },
};

function permTone(state: PermissionState) {
  if (state === "granted") return "bg-success text-success-foreground";
  if (state === "denied") return "bg-destructive text-destructive-foreground";
  return "bg-muted text-muted-foreground";
}

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });

function SessionTree({
  sessions,
  onDelete,
}: {
  sessions: ChatSession[];
  onDelete: (id: string) => Promise<void>;
}) {
  const [openSession, setOpenSession] = useState<string | null>(null);
  const groups = sessions.reduce<Record<string, ChatSession[]>>((acc, s) => {
    const key = dayKey(s.startedAt);
    acc[key] = [...(acc[key] ?? []), s];
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([day, list]) => (
        <div key={day} className="rounded-lg border border-border bg-surface p-3">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <Folder className="size-4 text-primary" /> {day}
            <span className="text-muted-foreground">({list.length})</span>
          </p>
          <ul className="mt-2 space-y-2 border-l border-border pl-4">
            {list.map((s) => (
              <li key={s.id}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOpenSession(openSession === s.id ? null : s.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 transition-transform",
                        openSession === s.id && "rotate-90",
                      )}
                    />
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{s.id}</span>
                    <Badge variant="secondary" className="ml-auto capitalize">
                      {s.status}
                    </Badge>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete session ${s.id}`}
                    onClick={() => {
                      void onDelete(s.id).catch((error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "Delete failed"),
                      );
                    }}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
                {openSession === s.id && (
                  <div className="ml-6 mt-2 space-y-3 rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(PERM_META) as PermissionKey[]).map((k) => {
                        const { label, icon: Icon } = PERM_META[k];
                        return (
                          <Badge key={k} className={permTone(s.permissions[k])}>
                            <Icon className="mr-1 size-3" />
                            {label}: {s.permissions[k]}
                          </Badge>
                        );
                      })}
                    </div>
                    <div className="space-y-1.5">
                      {s.messages.map((m) => (
                        <p key={m.id} className="text-xs">
                          <span className="font-semibold capitalize text-muted-foreground">
                            {m.sender}:{" "}
                          </span>
                          {m.text}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UsersAndSessions() {
  const { users, sessions, deleteUser, deleteSession } = useCrm();
  const [expanded, setExpanded] = useState<string | null>(users[0]?.id ?? null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <a href="/api/export.xlsx" download>
            <Download className="mr-1.5 size-4" /> Download live Excel
          </a>
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_80px] gap-3 border-b border-border bg-surface px-4 py-2.5 text-xs font-semibold text-muted-foreground md:grid">
          <span>Customer</span>
          <span>Email</span>
          <span>Phone</span>
          <span>Sessions / Actions</span>
        </div>
        <ul className="divide-y divide-border">
          {users.map((u) => {
            const userSessions = sessions.filter((s) => s.userId === u.id);
            const isOpen = expanded === u.id;
            return (
              <li key={u.id}>
                <div className="flex items-center hover:bg-muted">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : u.id)}
                    className="grid min-w-0 flex-1 grid-cols-1 gap-1 px-4 py-3 text-left text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_80px] md:items-center md:gap-3"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <ChevronRight
                        className={cn("size-4 transition-transform", isOpen && "rotate-90")}
                      />
                      {u.intake.name}
                    </span>
                    <span className="truncate text-muted-foreground">{u.intake.email}</span>
                    <span className="truncate text-muted-foreground">{u.intake.phone}</span>
                    <span className="text-muted-foreground">{userSessions.length}</span>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="mr-3 shrink-0"
                    aria-label={`Delete ${u.intake.name}`}
                    onClick={() => {
                      void deleteUser(u.id)
                        .then(() => toast.success("Customer deleted"))
                        .catch((error: unknown) =>
                          toast.error(error instanceof Error ? error.message : "Delete failed"),
                        );
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                {isOpen && (
                  <div className="space-y-4 border-t border-border bg-surface/60 px-4 py-4">
                    <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <Detail label="Name" value={u.intake.name} />
                      <Detail label="Phone" value={u.intake.phone} />
                      <Detail label="Age" value={u.intake.age || "—"} />
                      <Detail label="Address" value={u.intake.address || "—"} />
                    </div>
                    <SessionTree sessions={userSessions} onDelete={deleteSession} />
                  </div>
                )}
              </li>
            );
          })}
          {users.length === 0 && (
            <li className="px-4 py-12 text-center text-sm text-muted-foreground">
              No customers yet. New widget conversations will appear here.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
