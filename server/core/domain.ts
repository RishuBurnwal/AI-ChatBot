export const NO_PERMISSION_GRANTED = "No permission granted" as const;

export type StoredPermission = "granted" | typeof NO_PERMISSION_GRANTED;

export function normalizePermissionResult(state: "granted" | "denied"): StoredPermission {
  return state === "granted" ? "granted" : NO_PERMISSION_GRANTED;
}

export interface QuestionNode {
  id: string;
  text: string;
  nextQuestionIds: string[];
}

export function validateQuestionGraph(nodes: QuestionNode[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) errors.push(`Duplicate question id: ${node.id}`);
    ids.add(node.id);
  }
  for (const node of nodes) {
    for (const nextId of node.nextQuestionIds) {
      if (!ids.has(nextId)) errors.push(`Missing question referenced by ${node.id}: ${nextId}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cyclic = (byId.get(id)?.nextQuestionIds ?? [])
      .filter((nextId) => byId.has(nextId))
      .some(visit);
    visiting.delete(id);
    visited.add(id);
    return cyclic;
  };
  if (nodes.some((node) => visit(node.id))) errors.push("Question graph contains a cycle");

  return { valid: errors.length === 0, errors };
}
