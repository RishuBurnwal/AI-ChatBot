import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormField, IntakeDetails } from "@/lib/crm-types";

export interface IntakeFormProps {
  fields: FormField[];
  greeting: string;
  onSubmit: (values: IntakeDetails) => void;
}

/** Two-step pre-chat intake. Fields are admin-configurable via the Forms Builder. */
export function IntakeForm({ fields, greeting, onSubmit }: IntakeFormProps) {
  const active = fields.filter((f) => f.enabled);
  const steps = [active.slice(0, 3), active.slice(3)].filter((s) => s.length > 0);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const current = steps[step] ?? [];

  const next = () => {
    const missing = current.find((f) => f.required && !values[f.key]?.trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    setError(null);
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    onSubmit({
      name: values["name"] ?? "Guest",
      phone: values["phone"] ?? "",
      email: values["email"] ?? "",
      age: values["age"] ?? "",
      address: values["address"] ?? "",
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="border-b border-border bg-surface px-5 py-4">
        <h2 className="text-base font-semibold">Before we start</h2>
        <p className="mt-1 text-xs text-muted-foreground">{greeting}</p>
      </div>
      <form
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        {current.map((f) => (
          <div key={f.id} className="space-y-1.5">
            <Label htmlFor={f.key}>
              {f.label}
              {f.required ? " *" : " (optional)"}
            </Label>
            {f.type === "textarea" ? (
              <Textarea
                id={f.key}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            ) : (
              <Input
                id={f.key}
                type={f.type}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </div>
        ))}
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button type="submit" className="flex-1">
            {step < steps.length - 1 ? "Continue" : "Start chat"}
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Step {step + 1} of {steps.length}
        </p>
      </form>
    </div>
  );
}
