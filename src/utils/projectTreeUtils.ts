import * as WebIFC from "web-ifc";

type IfcRef = number | { value?: number };

interface IfcLineLike {
  type?: number;
  Name?: { value?: string };
  LongName?: { value?: string };
  Elevation?: unknown;
  RefElevation?: unknown;
  ElevationOfRefHeight?: unknown;
  ObjectPlacement?: unknown;
  RelatedObjects?: IfcRef[];
  RelatingObject?: IfcRef;
  RelatedElements?: IfcRef[];
  RelatingStructure?: IfcRef;
  [key: string]: unknown;
}

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

function asLine(line: unknown): IfcLineLike {
  return (line && typeof line === "object" ? line : {}) as IfcLineLike;
}

function getRefId(ref: IfcRef | undefined): number | undefined {
  if (typeof ref === "number" && Number.isFinite(ref)) return ref;
  if (ref && typeof ref === "object" && Number.isFinite(ref.value)) return ref.value;
  return undefined;
}

function getRefIds(refs: unknown): number[] {
  if (!Array.isArray(refs)) return [];
  const ids: number[] = [];
  refs.forEach((ref) => {
    const id = getRefId(ref as IfcRef);
    if (id !== undefined) ids.push(id);
  });
  return ids;
}

function getEntityName(line: IfcLineLike, expressID: number): string {
  return line.Name?.value || line.LongName?.value || `${expressID}`;
}

function extractNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === "object" && "value" in value) {
    return extractNumber((value as { value?: unknown }).value);
  }
  return undefined;
}

function extractPlacementElevation(line: IfcLineLike): number | undefined {
  const placement = line.ObjectPlacement as Record<string, unknown> | undefined;
  if (!placement || typeof placement !== "object") return undefined;
  const relativePlacement = placement.RelativePlacement as Record<string, unknown> | undefined;
  if (!relativePlacement || typeof relativePlacement !== "object") return undefined;
  const location = relativePlacement.Location as Record<string, unknown> | undefined;
  if (!location || typeof location !== "object") return undefined;
  const coords = location.Coordinates;
  if (!Array.isArray(coords) || coords.length < 3) return undefined;
  return extractNumber(coords[2]);
}

function extractNodeElevation(line: IfcLineLike): number | undefined {
  return (
    extractNumber(line.Elevation) ??
    extractNumber(line.RefElevation) ??
    extractNumber(line.ElevationOfRefHeight) ??
    extractPlacementElevation(line)
  );
}

function getNodeKind(typeCode: number): IfcProjectTreeNodeKind {
  if (typeCode === WebIFC.IFCPROJECT) return "project";
  if (typeCode === WebIFC.IFCSITE) return "site";
  if (typeCode === WebIFC.IFCBUILDING) return "building";
  if (typeCode === WebIFC.IFCBUILDINGSTOREY) return "storey";
  if (typeCode === WebIFC.IFCSPACE) return "space";
  if (typeCode > 0) return "element";
  return "unknown";
}

function appendToMap(map: Map<number, number[]>, key: number, values: number[]): void {
  if (values.length === 0) return;
  const existing = map.get(key);
  if (existing) {
    existing.push(...values);
  } else {
    map.set(key, [...values]);
  }
}

function buildAggregateRelations(ifcAPI: WebIFC.IfcAPI, modelID: number): Map<number, number[]> {
  const map = new Map<number, number[]>();
  const relIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);

  for (let i = 0; i < relIDs.size(); i++) {
    const relID = relIDs.get(i);
    const relLine = asLine(ifcAPI.GetLine(modelID, relID, false));
    const parentID = getRefId(relLine.RelatingObject);
    if (parentID === undefined) continue;
    const childIDs = getRefIds(relLine.RelatedObjects);
    appendToMap(map, parentID, childIDs);
  }

  return map;
}

function buildContainmentRelations(ifcAPI: WebIFC.IfcAPI, modelID: number): Map<number, number[]> {
  const map = new Map<number, number[]>();
  const relIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);

  for (let i = 0; i < relIDs.size(); i++) {
    const relID = relIDs.get(i);
    const relLine = asLine(ifcAPI.GetLine(modelID, relID, false));
    const structureID = getRefId(relLine.RelatingStructure);
    if (structureID === undefined) continue;
    const elementIDs = getRefIds(relLine.RelatedElements);
    appendToMap(map, structureID, elementIDs);
  }

  return map;
}

/**
 * Builds a lazy-ready IFC tree index.
 * Nodes are created flat and children are resolved via `childExpressIDs`,
 * so UI can render/expand recursively without prebuilding the full nested object graph.
 */
export function buildIfcProjectTreeIndex(ifcAPI: WebIFC.IfcAPI, modelID: number): IfcProjectTreeIndex {
  const aggregateByParent = buildAggregateRelations(ifcAPI, modelID);
  const containedByStructure = buildContainmentRelations(ifcAPI, modelID);
  const parentByExpressID = new Map<number, number>();

  const allParentIDs = new Set<number>([...aggregateByParent.keys(), ...containedByStructure.keys()]);
  const allChildIDs = new Set<number>();

  aggregateByParent.forEach((children, parentID) => {
    children.forEach((childID) => {
      allChildIDs.add(childID);
      if (!parentByExpressID.has(childID)) parentByExpressID.set(childID, parentID);
    });
  });

  containedByStructure.forEach((children, parentID) => {
    children.forEach((childID) => {
      allChildIDs.add(childID);
      if (!parentByExpressID.has(childID)) parentByExpressID.set(childID, parentID);
    });
  });

  const allNodeIDs = new Set<number>([...allParentIDs, ...allChildIDs]);

  const projectIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
  const roots: number[] = [];
  for (let i = 0; i < projectIDs.size(); i++) {
    roots.push(projectIDs.get(i));
    allNodeIDs.add(projectIDs.get(i));
  }

  const nodes = new Map<number, IfcProjectTreeNode>();
  allNodeIDs.forEach((expressID) => {
    const line = asLine(ifcAPI.GetLine(modelID, expressID, false));
    const typeCode = typeof line.type === "number" ? line.type : 0;
    const typeName = typeCode ? ifcAPI.GetNameFromTypeCode(typeCode) : "UNKNOWN";
    const aggregateChildren = aggregateByParent.get(expressID) ?? [];
    const containedChildren = containedByStructure.get(expressID) ?? [];
    const childExpressIDs = [...new Set([...aggregateChildren, ...containedChildren])];

    nodes.set(expressID, {
      id: `${typeName}_${expressID}`,
      expressID,
      typeCode,
      typeName,
      kind: getNodeKind(typeCode),
      name: getEntityName(line, expressID),
      childExpressIDs,
      elevation: extractNodeElevation(line),
    });
  });

  return { roots, nodes, parentByExpressID };
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
