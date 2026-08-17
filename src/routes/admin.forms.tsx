import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCrm } from "@/lib/crm-store";
import type { FormField, QuestionNode } from "@/lib/crm-types";

export const Route = createFileRoute("/admin/forms")({
  component: FormsBuilder,
});

const TYPES: FormField["type"][] = ["text", "email", "tel", "number", "textarea"];

function FormsBuilder() {
  return (
    <Tabs defaultValue="intake" className="space-y-4">
      <TabsList>
        <TabsTrigger value="intake">Pre-chat intake form</TabsTrigger>
        <TabsTrigger value="tree">Predefined questions</TabsTrigger>
      </TabsList>
      <TabsContent value="intake">
        <IntakeFields />
      </TabsContent>
      <TabsContent value="tree">
        <QuestionTree />
      </TabsContent>
    </Tabs>
  );
}

function IntakeFields() {
  const { formFields, setFormFields } = useCrm();

  const update = (id: string, patch: Partial<FormField>) =>
    setFormFields(formFields.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      {formFields.map((f) => (
        <div
          key={f.id}
          className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[2fr_1.5fr_140px_auto]"
        >
          <div className="space-y-1.5">
            <Label htmlFor={`label-${f.id}`}>Label</Label>
            <Input
              id={`label-${f.id}`}
              value={f.label}
              onChange={(e) => update(f.id, { label: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`key-${f.id}`}>Field key</Label>
            <Input
              id={`key-${f.id}`}
              value={f.key}
              onChange={(e) => update(f.id, { key: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={f.type}
              onValueChange={(v) => update(f.id, { type: v as FormField["type"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-4 pb-1">
            <div className="flex items-center gap-2">
              <Switch
                id={`req-${f.id}`}
                checked={f.required}
                onCheckedChange={(v) => update(f.id, { required: v })}
              />
              <Label htmlFor={`req-${f.id}`} className="text-xs">
                Required
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={`en-${f.id}`}
                checked={f.enabled}
                onCheckedChange={(v) => update(f.id, { enabled: v })}
              />
              <Label htmlFor={`en-${f.id}`} className="text-xs">
                Shown
              </Label>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Delete ${f.label}`}
              onClick={() => setFormFields(formFields.filter((x) => x.id !== f.id))}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          setFormFields([
            ...formFields,
            {
              id: crypto.randomUUID(),
              label: "New field",
              key: `field_${formFields.length + 1}`,
              type: "text",
              required: false,
              enabled: true,
            },
          ])
        }
      >
        <Plus className="mr-1.5 size-4" /> Add field
      </Button>
    </div>
  );
}

function QuestionTree() {
  const { questionTree, setQuestionTree } = useCrm();
  const [selected, setSelected] = useState<string | null>(questionTree[0]?.id ?? null);

  const node = questionTree.find((n) => n.id === selected) ?? null;
  const children = (parentId: string | null) => questionTree.filter((n) => n.parentId === parentId);

  const addChild = (parentId: string | null) => {
    const fresh: QuestionNode = { id: crypto.randomUUID(), text: "New question", parentId };
    setQuestionTree([...questionTree, fresh]);
    setSelected(fresh.id);
  };

  const removeNode = (id: string) => {
    const ids = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of questionTree) {
        if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
          ids.add(n.id);
          changed = true;
        }
      }
    }
    setQuestionTree(questionTree.filter((n) => !ids.has(n.id)));
    setSelected(null);
  };

  const descendants = (id: string): string[] => {
    const kids = children(id).map((k) => k.id);
    return kids.flatMap((k) => [k, ...descendants(k)]);
  };

  const renderBranch = (parentId: string | null, depth = 0) => (
    <ul className={depth === 0 ? "space-y-2" : "mt-2 space-y-2 border-l border-border pl-4"}>
      {children(parentId).map((n) => (
        <li key={n.id}>
          <div className="flex items-center gap-2">
            {depth > 0 && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />}
            <button
              type="button"
              onClick={() => setSelected(n.id)}
              className={
                "flex-1 truncate rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                (selected === n.id
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border bg-card hover:bg-muted")
              }
            >
              {n.text}
            </button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Add follow-up"
              onClick={() => addChild(n.id)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {renderBranch(n.id, depth + 1)}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Question flow</h2>
          <Button size="sm" variant="outline" onClick={() => addChild(null)}>
            <Plus className="mr-1.5 size-4" /> Root question
          </Button>
        </div>
        {renderBranch(null)}
      </div>

      <aside className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Node editor</h2>
        {!node ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Select a node in the tree to edit it.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="node-text">Question text</Label>
              <Input
                id="node-text"
                value={node.text}
                onChange={(e) =>
                  setQuestionTree(
                    questionTree.map((n) =>
                      n.id === node.id ? { ...n, text: e.target.value } : n,
                    ),
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Re-link under</Label>
              <Select
                value={node.parentId ?? "root"}
                onValueChange={(v) =>
                  setQuestionTree(
                    questionTree.map((n) =>
                      n.id === node.id ? { ...n, parentId: v === "root" ? null : v } : n,
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">Top level</SelectItem>
                  {questionTree
                    .filter((n) => n.id !== node.id && !descendants(node.id).includes(n.id))
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.text}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => addChild(node.id)}>
                <Plus className="mr-1.5 size-4" /> Follow-up
              </Button>
              <Button variant="destructive" onClick={() => removeNode(node.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
