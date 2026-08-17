import mammoth from "mammoth";
import pdf from "pdf-parse";

const supported = new Set(["pdf", "docx", "md", "txt"]);

export async function extractDocumentText(filename: string, buffer: Buffer) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!supported.has(extension)) throw new Error("Unsupported document type");
  if (extension === "pdf") return (await pdf(buffer)).text.trim();
  if (extension === "docx") return (await mammoth.extractRawText({ buffer })).value.trim();
  return buffer.toString("utf8").trim();
}
