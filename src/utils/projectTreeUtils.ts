export type IfcProjectTreeNodeKind = "project" | "site" | "building" | "storey" | "space" | "element" | "unknown";

export interface IfcProjectTreeNode {
  id: string;
  expressID: number;
  typeCode: number;
  typeName: string;
  kind: IfcProjectTreeNodeKind;
  name: string;
  childExpressIDs: number[];
  elevation?: number;
}

export interface IfcProjectTreeIndex {
  roots: number[];
  nodes: Map<number, IfcProjectTreeNode>;
  parentByExpressID: Map<number, number>;
}

export function collectSubtreeExpressIDs(rootExpressID: number, index: IfcProjectTreeIndex): number[] {
  const ids: number[] = [];
  const stack: number[] = [rootExpressID];
  const visited = new Set<number>();

  while (stack.length > 0) {
    const currentID = stack.pop();
    if (currentID === undefined || visited.has(currentID)) continue;
    visited.add(currentID);
    ids.push(currentID);
    const node = index.nodes.get(currentID);
    if (!node) continue;
    if (node.childExpressIDs.length > 0) {
      stack.push(...node.childExpressIDs);
    }
  }

  return ids;
}
