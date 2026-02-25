import * as WebIFC from "web-ifc";
import type { IfcProjectTreeIndex, IfcProjectTreeNode } from "./projectTreeUtils";
import type { ElementInfoData, ElementInfoField } from "../types/elementInfo";
import type { ElementPickData } from "./pickingUtils";

interface IfcLineLike {
  type?: number;
  Name?: { value?: string };
  LongName?: { value?: string };
  GlobalId?: { value?: string };
  Description?: { value?: string };
  ObjectType?: { value?: string };
  Tag?: { value?: string };
  PredefinedType?: unknown;
  [key: string]: unknown;
}

function safeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && value !== null && "value" in value) {
    const nested = (value as { value?: unknown }).value;
    return nested !== undefined && nested !== null ? String(nested) : null;
  }
  return null;
}

function addField(fields: ElementInfoField[], label: string, value: unknown): void {
  const normalized = safeValue(value) ?? "-";
  fields.push({ label, value: normalized });
}

function getSpatialContainerLabel(expressID: number, index: IfcProjectTreeIndex): string {
  let currentID: number | undefined = expressID;
  while (currentID !== undefined) {
    const node = index.nodes.get(currentID);
    if (!node) break;
    if (node.kind === "storey" || node.kind === "space" || node.kind === "building" || node.kind === "site") {
      return `${node.name} (${node.typeName})`;
    }
    currentID = index.parentByExpressID.get(currentID);
  }
  return "-";
}

export function buildElementInfoFromPick(data: ElementPickData): ElementInfoData {
  const line = (data.element ?? {}) as IfcLineLike;
  const fields: ElementInfoField[] = [];

  addField(fields, "Name", data.elementName);
  addField(fields, "LongName", line.LongName?.value);
  addField(fields, "IFC Type", data.typeName);
  addField(fields, "Express ID", data.expressID);
  addField(fields, "GlobalId", line.GlobalId?.value);
  addField(fields, "Description", line.Description?.value);
  addField(fields, "ObjectType", line.ObjectType?.value);
  addField(fields, "Tag", line.Tag?.value);
  addField(fields, "PredefinedType", line.PredefinedType);

  return {
    source: "scene",
    expressID: data.expressID,
    fields,
  };
}

export function buildElementInfoFromProjectNode(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  node: IfcProjectTreeNode,
  index: IfcProjectTreeIndex,
): ElementInfoData {
  const line = (ifcAPI.GetLine(modelID, node.expressID, true) ?? {}) as IfcLineLike;
  const typeName =
    typeof line.type === "number" ? ifcAPI.GetNameFromTypeCode(line.type) : node.typeName || "Unknown";
  const parentID = index.parentByExpressID.get(node.expressID);
  const parentNode = parentID !== undefined ? index.nodes.get(parentID) : undefined;
  const containedElementsCount = node.childExpressIDs.reduce((count, childID) => {
    const child = index.nodes.get(childID);
    if (!child) return count;
    return child.kind === "element" || child.kind === "unknown" ? count + 1 : count;
  }, 0);

  const fields: ElementInfoField[] = [];
  addField(fields, "Name", line.Name?.value || node.name);
  addField(fields, "LongName", line.LongName?.value);
  addField(fields, "IFC Type", typeName);
  addField(fields, "Express ID", node.expressID);
  addField(fields, "GlobalId", line.GlobalId?.value);
  addField(fields, "Parent Name/Type", parentNode ? `${parentNode.name} (${parentNode.typeName})` : "-");
  addField(fields, "Children Count", node.childExpressIDs.length);
  addField(fields, "Description", line.Description?.value);
  addField(fields, "ObjectType", line.ObjectType?.value);
  addField(fields, "Tag", line.Tag?.value);
  addField(fields, "PredefinedType", line.PredefinedType);
  addField(fields, "Contained Elements Count", containedElementsCount);
  addField(fields, "Storey/Spatial Container", getSpatialContainerLabel(node.expressID, index));

  return {
    source: "projectTree",
    expressID: node.expressID,
    fields,
  };
}
