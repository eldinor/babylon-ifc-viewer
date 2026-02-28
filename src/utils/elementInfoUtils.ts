import type { IfcProjectTreeIndex, IfcProjectTreeNode } from "./projectTreeUtils";
import type { ElementInfoData, ElementInfoField, RelatedElementItem } from "../types/elementInfo";
import type { ElementPickData } from "./pickingUtils";
import type { ElementDataResult } from "../loader";

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

interface ElementDimensions {
  length?: number;
  width?: number;
  height?: number;
  elevation?: number;
}

export interface ElementDimensionsFallback {
  length: number;
  width: number;
  height: number;
  elevation?: number;
}

interface DimensionFieldOptions {
  unitSymbol?: string;
}

const DIRECT_DIMENSION_KEYS: Record<keyof ElementDimensions, string[]> = {
  length: ["OverallLength", "Length", "XDim"],
  width: ["OverallWidth", "Width", "YDim"],
  height: ["OverallHeight", "Height", "ZDim", "Depth"],
  elevation: ["Elevation"],
};

const VALUE_KEYS = ["LengthValue", "NominalValue", "value", "wrappedValue", "ValueComponent"];

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

function extractNumber(value: unknown, depth = 0): number | null {
  if (depth > 3) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!value || typeof value !== "object") return null;

  const wrapped = value as Record<string, unknown>;
  for (const key of VALUE_KEYS) {
    if (key in wrapped) {
      const nested = extractNumber(wrapped[key], depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function formatDimension(value: number, unitSymbol?: string): string {
  const rounded = Math.round(value * 1000) / 1000;
  const raw = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/\.?0+$/, "");
  return unitSymbol ? `${raw} ${unitSymbol}` : raw;
}

function inferDimensionKey(name: string): keyof ElementDimensions | null {
  const lowered = name.toLowerCase();
  if (lowered.includes("length") || lowered.includes("xdim")) return "length";
  if (lowered.includes("width") || lowered.includes("ydim")) return "width";
  if (lowered.includes("elevation")) return "elevation";
  if (lowered.includes("height") || lowered.includes("depth") || lowered.includes("zdim")) return "height";
  return null;
}

function extractIfcDimensions(line: IfcLineLike): ElementDimensions {
  const dimensions: ElementDimensions = {};

  // Fast path for direct IFC dimension fields (e.g. OverallWidth/OverallHeight).
  (Object.keys(DIRECT_DIMENSION_KEYS) as Array<keyof ElementDimensions>).forEach((dimensionKey) => {
    for (const key of DIRECT_DIMENSION_KEYS[dimensionKey]) {
      const numeric = extractNumber((line as Record<string, unknown>)[key]);
      if (numeric !== null) {
        dimensions[dimensionKey] = numeric;
        break;
      }
    }
  });

  const seen = new WeakSet<object>();
  let visitedNodes = 0;
  const maxVisitedNodes = 2000;

  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (visitedNodes >= maxVisitedNodes) return;
    if (seen.has(value)) return;
    seen.add(value);
    visitedNodes += 1;

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const candidate = value as Record<string, unknown>;
    const name = safeValue(candidate.Name) ?? "";
    if (name) {
      const dimensionKey = inferDimensionKey(name);
      if (dimensionKey && dimensions[dimensionKey] === undefined) {
        const numeric = extractNumber(candidate.LengthValue) ?? extractNumber(candidate.NominalValue);
        if (numeric !== null) {
          dimensions[dimensionKey] = numeric;
        }
      }
    }

    Object.values(candidate).forEach(visit);
  };

  visit(line);
  if (dimensions.elevation === undefined) {
    const placementElevation = extractPlacementElevation(line);
    if (placementElevation !== null) {
      dimensions.elevation = placementElevation;
    }
  }
  return dimensions;
}

function extractPlacementElevation(line: IfcLineLike): number | null {
  const placement = line.ObjectPlacement as Record<string, unknown> | undefined;
  if (!placement || typeof placement !== "object") return null;
  const relativePlacement = placement.RelativePlacement as Record<string, unknown> | undefined;
  if (!relativePlacement || typeof relativePlacement !== "object") return null;
  const location = relativePlacement.Location as Record<string, unknown> | undefined;
  if (!location || typeof location !== "object") return null;
  const coords = location.Coordinates;
  if (!Array.isArray(coords) || coords.length < 3) return null;
  return extractNumber(coords[2]);
}

function getMeshBoundingDimensions(data: ElementPickData): ElementDimensions | null {
  const boundingInfo = data.mesh.getBoundingInfo();
  if (!boundingInfo) return null;

  const ext = boundingInfo.boundingBox.extendSizeWorld;
  const center = boundingInfo.boundingBox.centerWorld;
  const x = ext.x * 2;
  const y = ext.y * 2;
  const z = ext.z * 2;

  if (![x, y, z, center.y].every(Number.isFinite)) return null;
  return { length: x, width: y, height: z, elevation: center.y };
}

function addDimensionFields(
  fields: ElementInfoField[],
  semanticDimensions: ElementDimensions,
  fallbackDimensions?: ElementDimensions | null,
  options?: DimensionFieldOptions,
): void {
  const hasSemantic =
    semanticDimensions.length !== undefined ||
    semanticDimensions.width !== undefined ||
    semanticDimensions.height !== undefined ||
    semanticDimensions.elevation !== undefined;
  const source = hasSemantic ? semanticDimensions : fallbackDimensions ?? {};
  const suffix = hasSemantic ? "" : " (bbox)";

  addField(
    fields,
    `Length${suffix}`,
    source.length !== undefined ? formatDimension(source.length, options?.unitSymbol) : "-",
  );
  addField(
    fields,
    `Width${suffix}`,
    source.width !== undefined ? formatDimension(source.width, options?.unitSymbol) : "-",
  );
  addField(
    fields,
    `Height${suffix}`,
    source.height !== undefined ? formatDimension(source.height, options?.unitSymbol) : "-",
  );
  addField(
    fields,
    `Elevation${suffix}`,
    source.elevation !== undefined ? formatDimension(source.elevation, options?.unitSymbol) : "-",
  );
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

function createRelatedElementsFromIndex(
  expressID: number,
  index: IfcProjectTreeIndex,
  maxItems = 24,
): RelatedElementItem[] {
  const related: RelatedElementItem[] = [];
  const seen = new Set<number>();
  const push = (id: number, relation: string) => {
    if (seen.has(id)) return;
    const node = index.nodes.get(id);
    if (!node) return;
    seen.add(id);
    related.push({
      expressID: node.expressID,
      name: node.name,
      typeName: node.typeName,
      relation,
    });
  };

  const parentID = index.parentByExpressID.get(expressID);
  if (parentID !== undefined) {
    push(parentID, "Parent");
    const parentNode = index.nodes.get(parentID);
    if (parentNode) {
      parentNode.childExpressIDs
        .filter((childID) => childID !== expressID)
        .slice(0, 8)
        .forEach((siblingID) => push(siblingID, "Sibling"));
    }
  }

  const node = index.nodes.get(expressID);
  if (node) {
    node.childExpressIDs.slice(0, 12).forEach((childID) => push(childID, "Child"));
  }

  return related.slice(0, maxItems);
}

export function buildElementInfoFromPick(
  data: ElementPickData,
  options?: DimensionFieldOptions & { projectTreeIndex?: IfcProjectTreeIndex | null },
): ElementInfoData {
  const line = (data.element ?? {}) as IfcLineLike;
  const semanticDimensions = extractIfcDimensions(line);
  const bboxDimensions = getMeshBoundingDimensions(data);
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
  addDimensionFields(fields, semanticDimensions, bboxDimensions, options);

  return {
    source: "scene",
    expressID: data.expressID,
    fields,
    relatedElements: options?.projectTreeIndex
      ? createRelatedElementsFromIndex(data.expressID, options.projectTreeIndex)
      : undefined,
  };
}

function buildElementInfoFromProjectNodeLine(
  line: IfcLineLike,
  typeName: string,
  node: IfcProjectTreeNode,
  index: IfcProjectTreeIndex,
  fallbackDimensions?: ElementDimensionsFallback,
  options?: DimensionFieldOptions,
): ElementInfoData {
  const dimensions = extractIfcDimensions(line);
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
  addDimensionFields(fields, dimensions, fallbackDimensions, options);
  addField(fields, "Contained Elements Count", containedElementsCount);
  addField(fields, "Storey/Spatial Container", getSpatialContainerLabel(node.expressID, index));

  return {
    source: "projectTree",
    expressID: node.expressID,
    fields,
    relatedElements: createRelatedElementsFromIndex(node.expressID, index),
  };
}

export function buildElementInfoFromProjectNodeResult(
  result: ElementDataResult,
  node: IfcProjectTreeNode,
  index: IfcProjectTreeIndex,
  fallbackDimensions?: ElementDimensionsFallback,
  options?: DimensionFieldOptions,
): ElementInfoData {
  const line = (result.element ?? {}) as IfcLineLike;
  const typeName = result.typeName || node.typeName || "Unknown";
  return buildElementInfoFromProjectNodeLine(line, typeName, node, index, fallbackDimensions, options);
}
