import { Camera, Mic, MonitorUp, MapPin, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { PermissionKey, PermissionState } from "@/lib/crm-types";

const META: Record<PermissionKey, { label: string; icon: typeof Camera; why: string }> = {
  location: { label: "Location", icon: MapPin, why: "Helps us show correct delivery estimates." },
  camera: { label: "Camera", icon: Camera, why: "Needed for video calls with an agent." },
  microphone: { label: "Microphone", icon: Mic, why: "Needed for voice calls with an agent." },
  screen: {
    label: "Screen sharing",
    icon: MonitorUp,
    why: "Lets an agent see the issue you're facing.",
  },
};

export interface PermissionCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requested: Record<PermissionKey, boolean>;
  states: Record<PermissionKey, PermissionState>;
  onChange: (key: PermissionKey, state: PermissionState) => void;
}

export function PermissionCenter({
  open,
  onOpenChange,
  requested,
  states,
  onChange,
}: PermissionCenterProps) {
  const keys = (Object.keys(META) as PermissionKey[]).filter((k) => requested[k]);
  const request = (key: PermissionKey, grant: boolean) => {
    onChange(key, grant ? "granted" : "denied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Device & data permissions</DialogTitle>
          <DialogDescription>
            Grant only what you're comfortable with. You can change these at any time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {keys.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This workspace doesn't request any permissions.
            </p>
          )}
          {keys.map((key) => {
            const { label, icon: Icon, why } = META[key];
            const state = states[key];
            return (
              <div key={key} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-md bg-accent p-2 text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{label}</p>
                      {state === "granted" && (
                        <Badge className="bg-success text-success-foreground">
                          <Check className="mr-1 size-3" /> Granted
                        </Badge>
                      )}
                      {state === "denied" && <Badge variant="destructive">Denied</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{why}</p>
                    {state === "denied" && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                        <X className="size-3" /> No permission granted — this feature stays
                        disabled.
                      </p>
                    )}
                    {state !== "granted" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => request(key, true)}>
                          Allow
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => request(key, false)}>
                          Not now
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
