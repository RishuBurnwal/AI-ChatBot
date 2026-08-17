import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Download, FileSpreadsheet, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrm } from "@/lib/crm-store";
import type { PermissionState } from "@/lib/crm-types";

export const Route = createFileRoute("/admin/form-submissions")({
  component: FormSubmissionsPage,
});

function dateKey(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readableDate(iso: string) {
  return new Date(iso).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function permissionLabel(state: PermissionState | undefined) {
  if (state === "granted") return "Granted";
  if (state === "denied") return "Denied";
  return "Not requested";
}

function FormSubmissionsPage() {
  const { users, sessions, loading } = useCrm();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const submissions = useMemo(
    () =>
      users
        .filter((user) => {
          const date = dateKey(user.createdAt);
          return (!from || date >= from) && (!to || date <= to);
        })
        .map((user) => {
          const userSessions = sessions
            .filter((session) => session.userId === user.id)
            .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
          return { user, userSessions, latest: userSessions[0] };
        }),
    [from, sessions, to, users],
  );
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const exportUrl = `/api/form-submissions.xlsx${params.size ? `?${params.toString()}` : ""}`;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total submissions
          </p>
          <p className="mt-2 text-2xl font-semibold">{users.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Filtered rows
          </p>
          <p className="mt-2 text-2xl font-semibold">{submissions.length}</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
          <span className="grid size-10 place-items-center rounded-full bg-success/15 text-success">
            <Radio className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Live SQLite data</p>
            <p className="text-xs text-muted-foreground">Updates when a new form is submitted</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-col gap-4 border-b border-border p-4 xl:flex-row xl:items-end">
          <div className="mr-auto flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FileSpreadsheet className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">All submitted forms</h2>
              <p className="text-xs text-muted-foreground">One spreadsheet row per customer form</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[170px_170px_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="submissions-from">From date</Label>
              <Input
                id="submissions-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="submissions-to">To date</Label>
              <Input
                id="submissions-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!from && !to}
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              <CalendarDays className="mr-1.5 size-4" /> Clear dates
            </Button>
            <Button asChild>
              <a href={exportUrl} download>
                <Download className="mr-1.5 size-4" /> Download filtered Excel
              </a>
            </Button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-330px)] min-h-72 overflow-auto">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
              <tr>
                {[
                  "#",
                  "Submitted at",
                  "Name",
                  "Email",
                  "Phone",
                  "Age",
                  "Address",
                  "Sessions",
                  "Latest status",
                  "Location",
                  "Camera",
                  "Microphone",
                  "Screen",
                  "Last seen",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="whitespace-nowrap border-b border-r border-primary-foreground/20 px-3 py-2.5 text-left font-semibold"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map(({ user, userSessions, latest }, index) => (
                <tr key={user.id} className="odd:bg-card even:bg-muted/40 hover:bg-accent/50">
                  <Cell>{index + 1}</Cell>
                  <Cell>{readableDate(user.createdAt)}</Cell>
                  <Cell className="font-semibold">{user.intake.name}</Cell>
                  <Cell>{user.intake.email}</Cell>
                  <Cell>{user.intake.phone || "—"}</Cell>
                  <Cell>{user.intake.age || "—"}</Cell>
                  <Cell className="max-w-80 whitespace-normal">{user.intake.address || "—"}</Cell>
                  <Cell>{userSessions.length}</Cell>
                  <Cell>
                    <Badge variant="secondary" className="capitalize">
                      {latest?.status ?? "none"}
                    </Badge>
                  </Cell>
                  <Cell>{permissionLabel(latest?.permissions.location)}</Cell>
                  <Cell>{permissionLabel(latest?.permissions.camera)}</Cell>
                  <Cell>{permissionLabel(latest?.permissions.microphone)}</Cell>
                  <Cell>{permissionLabel(latest?.permissions.screen)}</Cell>
                  <Cell>{readableDate(latest?.startedAt ?? user.lastSeen)}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && submissions.length === 0 && (
            <div className="grid min-h-64 place-items-center px-4 text-center text-sm text-muted-foreground">
              No form submissions match this date range.
            </div>
          )}
          {loading && (
            <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
              Loading form submissions…
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap border-b border-r border-border px-3 py-2.5 ${className}`}>
      {children}
    </td>
  );
}
