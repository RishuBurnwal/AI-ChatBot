import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, LayoutDashboard, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexus Support — AI CRM & Live Support Platform" },
      {
        name: "description",
        content:
          "Run an AI chatbot on any LLM provider, with persistent memory, live agent handoff, and a full CRM dashboard.",
      },
      { property: "og:title", content: "Nexus Support — AI CRM & Live Support Platform" },
      {
        property: "og:description",
        content: "AI chat widget plus an agent dashboard for live chats, sessions, and knowledge.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-16">
      <div className="w-full max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
          <Bot className="size-3.5 text-primary" /> AI CRM + Live Support
        </span>
        <h1 className="mt-5 text-4xl font-bold sm:text-5xl">Nexus Support</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          One platform, two surfaces: a customer chat widget powered by any LLM provider, and an
          agent dashboard for live chats, sessions, memory, and AI behaviour.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/admin">
              <LayoutDashboard className="mr-2 size-4" /> Open admin dashboard
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/widget">
              <MessagesSquare className="mr-2 size-4" /> Open chat widget
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
