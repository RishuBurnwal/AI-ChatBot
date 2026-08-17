import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";

export const Route = createFileRoute("/admin/general")({
  component: GeneralSettings,
});

function GeneralSettings() {
  const { general, setGeneral, quickReplies, setQuickReplies } = useCrm();

  return (
    <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Workspace</h2>
        <div className="space-y-1.5">
          <Label htmlFor="brand">Brand name</Label>
          <Input
            id="brand"
            value={general.brandName}
            onChange={(e) => setGeneral({ ...general, brandName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="greeting">Widget greeting</Label>
          <Textarea
            id="greeting"
            value={general.widgetGreeting}
            onChange={(e) => setGeneral({ ...general, widgetGreeting: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hours">Office hours</Label>
          <Input
            id="hours"
            value={general.officeHours}
            onChange={(e) => setGeneral({ ...general, officeHours: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
          <div>
            <Label htmlFor="autoHandoff" className="text-sm font-medium">
              Automatic handoff
            </Label>
            <p className="text-xs text-muted-foreground">Escalate when AI confidence is low.</p>
          </div>
          <Switch
            id="autoHandoff"
            checked={general.autoHandoff}
            onCheckedChange={(v) => setGeneral({ ...general, autoHandoff: v })}
          />
        </div>
        <Button onClick={() => toast.success("All settings are saved live.")}>Saved live</Button>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Widget quick replies</h2>
        <p className="text-xs text-muted-foreground">
          One per line — shown as buttons in the chat widget.
        </p>
        <Textarea
          className="min-h-40"
          aria-label="Quick replies"
          value={quickReplies.join("\n")}
          onChange={(e) =>
            setQuickReplies(e.target.value.split("\n").filter((l) => l.trim() !== ""))
          }
        />
      </section>
    </div>
  );
}
