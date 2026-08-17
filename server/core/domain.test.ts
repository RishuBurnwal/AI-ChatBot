import { describe, expect, it } from "vitest";
import { normalizePermissionResult, validateQuestionGraph } from "./domain";

describe("permission consent", () => {
  it("stores denied permission using the required literal", () => {
    expect(normalizePermissionResult("denied")).toBe("No permission granted");
  });
});

describe("question graph", () => {
  it("accepts branching trees", () => {
    expect(
      validateQuestionGraph([
        { id: "root", text: "Choose", nextQuestionIds: ["a", "b"] },
        { id: "a", text: "A", nextQuestionIds: [] },
        { id: "b", text: "B", nextQuestionIds: [] },
      ]),
    ).toEqual({ valid: true, errors: [] });
  });

  it("rejects missing edges and cycles", () => {
    const result = validateQuestionGraph([
      { id: "a", text: "A", nextQuestionIds: ["b", "missing"] },
      { id: "b", text: "B", nextQuestionIds: ["a"] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/missing/i);
    expect(result.errors.join(" ")).toMatch(/cycle/i);
  });
});
