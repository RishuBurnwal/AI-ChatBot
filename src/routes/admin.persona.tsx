import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";

export const Route = createFileRoute("/admin/persona")({
  component: PersonaPage,
});

function PersonaPage() {
  const { persona, setPersona, rules, setRules } = useCrm();
  const [draftPersona, setDraftPersona] = useState(persona);
  const [newRule, setNewRule] = useState("");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/15 p-3 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Editing this changes live AI behaviour — proceed carefully.</strong> Changes
            apply to every new conversation as soon as you save.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="persona">System prompt / persona</Label>
          <Textarea
            id="persona"
            value={draftPersona}
            onChange={(e) => setDraftPersona(e.target.value)}
            className="min-h-[420px] font-mono text-xs leading-relaxed"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              // TODO(api): persist persona server-side.
              setPersona(draftPersona);
              toast.success("Persona saved — live AI behaviour updated.");
            }}
          >
            Save persona
          </Button>
          <Button variant="outline" onClick={() => setDraftPersona(persona)}>
            Reset
          </Button>
        </div>
      </section>

      <aside className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Rules & special instructions</h2>
        <ul className="space-y-2">
          {rules.map((r, i) => (
            <li
              key={r}
              className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2.5"
            >
              <span className="text-xs font-semibold text-primary">{i + 1}.</span>
              <p className="flex-1 text-xs">{r}</p>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove rule"
                onClick={() => setRules(rules.filter((x) => x !== r))}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newRule.trim()) return;
            setRules([...rules, newRule.trim()]);
            setNewRule("");
          }}
        >
          <Input
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="Add a rule…"
            aria-label="New rule"
          />
          <Button type="submit" size="icon" aria-label="Add rule">
            <Plus className="size-4" />
          </Button>
        </form>
      </aside>
    </div>
  );
}
