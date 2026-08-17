import { describe, expect, it } from "vitest";
import { extractDocumentText } from "./document-service";

describe("document extraction", () => {
  it.each(["txt", "md"])("extracts UTF-8 %s documents", async (extension) => {
    await expect(
      extractDocumentText(`knowledge.${extension}`, Buffer.from("  Support policy  ")),
    ).resolves.toBe("Support policy");
  });

  it("rejects unsupported files", async () => {
    await expect(extractDocumentText("malware.exe", Buffer.from("x"))).rejects.toThrow(
      /unsupported/i,
    );
  });
});
