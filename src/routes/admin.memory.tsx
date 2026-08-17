import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCrm } from "@/lib/crm-store";

export const Route = createFileRoute("/admin/memory")({
  component: MemoryPage,
});

function MemoryPage() {
  const { docs, uploadDocuments, deleteDocument } = useCrm();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    try {
      await uploadDocuments(Array.from(files));
      toast.success("Documents saved to SQLite and Excel");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors",
          dragging && "border-primary bg-accent/40",
        )}
      >
        <UploadCloud className="size-8 text-primary" />
        <p className="text-sm font-medium">Drag & drop company documents</p>
        <p className="text-xs text-muted-foreground">
          PDF, DOCX, Markdown or TXT — up to 25 MB each
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Saving..." : "Browse files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.md,.txt"
          className="hidden"
          onChange={(e) => void addFiles(e.target.files)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Knowledge base ({docs.length})</h2>
        </header>
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {d.kind.toUpperCase()} · {d.sizeKb} KB ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString()}
                </p>
              </div>
              <Badge
                className={
                  d.status === "ready"
                    ? "bg-success text-success-foreground"
                    : d.status === "failed"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-warning text-warning-foreground"
                }
              >
                {d.status}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${d.name}`}
                onClick={() =>
                  void deleteDocument(d.id).catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Delete failed"),
                  )
                }
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
          {docs.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              No documents yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
