import { createFileRoute } from "@tanstack/react-router";
import { Camera, MapPin, Mic, MonitorUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCrm } from "@/lib/crm-store";
import type { PermissionKey } from "@/lib/crm-types";

export const Route = createFileRoute("/admin/permissions")({
  component: PermissionsPage,
});

const ITEMS: { key: PermissionKey; label: string; icon: typeof Camera; help: string }[] = [
  {
    key: "location",
    label: "Location",
    icon: MapPin,
    help: "Used for delivery estimates and regional routing.",
  },
  {
    key: "camera",
    label: "Camera",
    icon: Camera,
    help: "Required before a customer can start a video call.",
  },
  {
    key: "microphone",
    label: "Microphone",
    icon: Mic,
    help: "Required before a customer can start a voice call.",
  },
  {
    key: "screen",
    label: "Screen sharing",
    icon: MonitorUp,
    help: "Lets agents see the customer's screen.",
  },
];

function PermissionsPage() {
  const { requestedPermissions, setRequestedPermissions } = useCrm();

  return (
    <div className="max-w-2xl space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div>
        <h2 className="text-sm font-semibold">Permissions requested in the widget</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Only enabled permissions are shown to customers in the widget's permission prompts.
        </p>
      </div>
      {ITEMS.map(({ key, label, icon: Icon, help }) => (
        <div
          key={key}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <span className="grid size-9 place-items-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <Label htmlFor={`perm-${key}`} className="text-sm font-medium">
              {label}
            </Label>
            <p className="text-xs text-muted-foreground">{help}</p>
          </div>
          <Switch
            id={`perm-${key}`}
            checked={requestedPermissions[key]}
            onCheckedChange={(v) => setRequestedPermissions({ ...requestedPermissions, [key]: v })}
          />
        </div>
      ))}
    </div>
  );
}
