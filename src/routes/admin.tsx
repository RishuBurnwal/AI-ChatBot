import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Cpu,
  FileStack,
  FileSpreadsheet,
  FormInput,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { currentAgent, useCrm } from "@/lib/crm-store";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Agent Dashboard — Nexus Support Admin" },
      {
        name: "description",
        content:
          "Manage live chats, customer sessions, AI persona, knowledge base, and provider settings in one dashboard.",
      },
      { property: "og:title", content: "Agent Dashboard — Nexus Support Admin" },
      {
        property: "og:description",
        content: "Live chats, CRM sessions, AI persona and provider configuration.",
      },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin/live-chats", label: "Live Chats", icon: MessagesSquare },
  { to: "/admin/users", label: "Users & Sessions", icon: Users },
  { to: "/admin/form-submissions", label: "Form Submissions", icon: FileSpreadsheet },
  { to: "/admin/forms", label: "Forms Builder", icon: FormInput },
  { to: "/admin/memory", label: "Memory / Knowledge", icon: FileStack },
  { to: "/admin/persona", label: "AI Persona & Rules", icon: Bot },
  { to: "/admin/provider", label: "AI Provider", icon: Cpu },
  { to: "/admin/permissions", label: "Permissions", icon: ShieldCheck },
  { to: "/admin/general", label: "General Settings", icon: Settings },
] as const;

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { sessions } = useCrm();
  const handoffs = sessions.filter((s) => s.handoffRequested).length;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 flex items-center gap-2.5 px-2 py-2">
        <span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Bot className="size-4" />
        </span>
        <div>
          <p className="font-display text-sm font-semibold text-sidebar-foreground">
            Nexus Support
          </p>
          <p className="text-[11px] text-sidebar-foreground/60">AI CRM & Live Support</p>
        </div>
      </div>
      {NAV.map(({ to, label, icon: Icon }) => {
        const isActive = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {to === "/admin/live-chats" && handoffs > 0 && (
              <Badge className="bg-destructive text-destructive-foreground">{handoffs}</Badge>
            )}
          </Link>
        );
      })}
      <div className="mt-auto rounded-lg bg-sidebar-accent/60 p-3 text-xs text-sidebar-foreground/80">
        {/* TODO(auth): replace with the real signed-in user session. */}
        <p className="font-medium text-sidebar-foreground">{currentAgent.name}</p>
        <p>Logged in as {currentAgent.role}</p>
      </div>
    </nav>
  );
}

function AdminLayout() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = NAV.find((n) => n.to === pathname)?.label ?? "Dashboard";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 bg-sidebar lg:block">
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
          <Button asChild variant="outline" size="sm">
            <Link to="/widget">Open widget</Link>
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
