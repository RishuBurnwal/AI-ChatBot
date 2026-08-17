import { createFileRoute } from "@tanstack/react-router";
import { Check, KeyRound } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCrm } from "@/lib/crm-store";

export const Route = createFileRoute("/admin/provider")({
  component: ProviderPage,
});

function ProviderPage() {
  const crm = useCrm();
  const active = crm.providers.find((p) => p.id === crm.activeProviderId);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Active provider</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The selected provider and model power every AI reply in the widget.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crm.providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                crm.setActiveProviderId(p.id);
                crm.setActiveModel(p.models[0] ?? "");
              }}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-3 text-left text-sm transition-colors",
                crm.activeProviderId === p.id
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border bg-surface hover:bg-muted",
              )}
            >
              <span className="font-medium">{p.label}</span>
              {crm.activeProviderId === p.id ? (
                <Check className="size-4" />
              ) : (
                <Badge variant="secondary">{p.models.length} models</Badge>
              )}
            </button>
          ))}
        </div>

        {active && (
          <div className="mt-4 max-w-sm space-y-1.5">
            <Label>Model</Label>
            <Select value={crm.activeModel} onValueChange={crm.setActiveModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {active.models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" /> API keys
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          API keys are read securely by the backend from <code>.env.local</code>. They are never
          returned to the browser or written to SQLite and Excel.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Provider and model selections above are saved automatically to SQLite.
        </p>
      </section>
    </div>
  );
}
