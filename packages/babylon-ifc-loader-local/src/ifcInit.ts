import * as WebIFC from "web-ifc";
import { logError, logInfo, logWarn } from "./logging";

// ============================================================================
// TYPE DEFINITIONS - Intermediate Data Contract
// ============================================================================

/** Single piece of placed geometry from web-ifc */
export interface RawGeometryPart {
  expressID: number;
  geometryExpressID: number;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  flatTransform: ArrayLike<number>;
  color: { x: number; y: number; z: number; w: number } | null;
  colorId: number;
}

/** Complete raw model returned by loadIfcModel */
export interface RawIfcModel {
  modelID: number;
  parts: RawGeometryPart[];
  rawStats: {
    partCount: number;
    vertexCount: number;
    triangleCount: number;
  };
}

/** Configuration for IFC loader */
export interface IfcInitOptions {
  coordinateToOrigin?: boolean; // web-ifc COORDINATE_TO_ORIGIN (default: true)
  verbose?: boolean; // console logging (default: true)
  signal?: AbortSignal; // cancellation signal for fetch/parse
}

/** projectInfo extracted from IFC file */
export interface ProjectInfoResult {
  projectName: string | null;
  projectDescription: string | null;
  application: string | null;
  author: string | null;
  organization: string | null;
}

export interface IfcLengthUnitInfo {
  symbol: string;
  name: string;
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

export interface IfcMaterialInfoResult {
  expressID: number;
  name: string;
  relatedElementExpressIDs: number[];
  colorHex: string | null;
}

export interface IfcModelMetadataResult {
  ifcSchema: string;
  ifcGlobalId: string;
  lengthUnit: IfcLengthUnitInfo;
  projectTreeIndex: IfcProjectTreeIndex;
  ifcMaterials: IfcMaterialInfoResult[];
}

interface DisposableGeometry {
  delete?: () => void;
}

interface GeometryErrorContext {
  modelID: number;
  expressID: number;
  geometryExpressID: number;
}

type IfcRef = number | { value?: number };

interface IfcLineLike {
  type?: number;
  Name?: { value?: string };
  LongName?: { value?: string };
  GlobalId?: { value?: string };
  Description?: { value?: string };
  ObjectType?: { value?: string };
  Tag?: { value?: string };
  PredefinedType?: unknown;
  Elevation?: unknown;
  RefElevation?: unknown;
  ElevationOfRefHeight?: unknown;
  ObjectPlacement?: unknown;
  RelatedObjects?: IfcRef[];
  RelatingObject?: IfcRef;
  RelatedElements?: IfcRef[];
  RelatingStructure?: IfcRef;
  RelatingMaterial?: unknown;
  UnitsInContext?: unknown;
  Units?: unknown;
  UnitType?: unknown;
  Prefix?: unknown;
  Red?: unknown;
  Green?: unknown;
  Blue?: unknown;
  [key: string]: unknown;
}

const SI_PREFIX_TO_SYMBOL: Record<string, string> = {
  EXA: "E",
  PETA: "P",
  TERA: "T",
  GIGA: "G",
  MEGA: "M",
  KILO: "k",
  HECTO: "h",
  DECA: "da",
  DECI: "d",
  CENTI: "c",
  MILLI: "m",
  MICRO: "u",
  NANO: "n",
  PICO: "p",
  FEMTO: "f",
  ATTO: "a",
};

class IfcGeometryProcessingError extends Error {
  readonly context: GeometryErrorContext;
  readonly cause: unknown;

  constructor(context: GeometryErrorContext, cause: unknown) {
    super(
      `Error processing geometry (modelID=${context.modelID}, expressID=${context.expressID}, geometryExpressID=${context.geometryExpressID})`,
    );
    this.name = "IfcGeometryProcessingError";
    this.context = context;
    this.cause = cause;
  }
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Operation was aborted", "AbortError");
  }
  const error = new Error("Operation was aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function disposeGeometry(geometry: unknown): void {
  if (geometry && typeof geometry === "object" && "delete" in geometry) {
    const disposable = geometry as DisposableGeometry;
    disposable.delete?.();
  }
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

function readText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    const nested = (value as { value?: unknown }).value;
    if (typeof nested === "string") return nested;
  }
  return null;
}

function ifcText(value: unknown): string | null {
  const text = readText(value);
  if (text === null) return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function getEntityName(line: IfcLineLike, expressID: number): string {
  return ifcText(line.Name) ?? ifcText(line.LongName) ?? `${expressID}`;
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

function normalizeUnitType(unitType: unknown): string {
  return (readText(unitType) ?? "").toUpperCase();
}

function normalizePrefix(prefix: unknown): string {
  return (readText(prefix) ?? "").toUpperCase();
}

function normalizeName(name: unknown): string {
  return (readText(name) ?? "").toUpperCase();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function channelToHex(value: number): string {
  return Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, "0");
}

function parseColorChannel(value: unknown): number | null {
  const numeric = extractNumber(value);
  if (numeric === undefined) return null;
  return clamp01(numeric);
}

function extractIfcColor(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  const directRed = parseColorChannel(obj.Red);
  const directGreen = parseColorChannel(obj.Green);
  const directBlue = parseColorChannel(obj.Blue);
  if (directRed !== null && directGreen !== null && directBlue !== null) {
    return `#${channelToHex(directRed)}${channelToHex(directGreen)}${channelToHex(directBlue)}`;
  }

  const xyzRed = parseColorChannel(obj.x ?? obj.X);
  const xyzGreen = parseColorChannel(obj.y ?? obj.Y);
  const xyzBlue = parseColorChannel(obj.z ?? obj.Z);
  if (xyzRed !== null && xyzGreen !== null && xyzBlue !== null) {
    return `#${channelToHex(xyzRed)}${channelToHex(xyzGreen)}${channelToHex(xyzBlue)}`;
  }

  const fieldsToCheck = ["SurfaceColour", "DiffuseColour", "Colour", "BaseColor", "RGB"];
  for (const field of fieldsToCheck) {
    if (!(field in obj)) continue;
    const nestedHex = extractIfcColor(obj[field]);
    if (nestedHex) return nestedHex;
  }

  for (const nested of Object.values(obj)) {
    const nestedHex = extractIfcColor(nested);
    if (nestedHex) return nestedHex;
  }

  return null;
}

// ============================================================================
// PUBLIC API - Initialization
// ============================================================================

/**
 * Initialize the web-ifc API
 * This should be called once at application startup
 */
export async function initializeWebIFC(
  wasmPath?: string,
  logLevel: WebIFC.LogLevel = WebIFC.LogLevel.LOG_LEVEL_ERROR,
): Promise<WebIFC.IfcAPI> {
  const ifcAPI = new WebIFC.IfcAPI();

  // Set custom WASM path if provided
  if (wasmPath) {
    ifcAPI.SetWasmPath(wasmPath);
  }

  // Initialize the API
  const startTime = performance.now();
  await ifcAPI.Init();

  // Set log level
  ifcAPI.SetLogLevel(logLevel);

  logInfo(`Web-IFC initialized in ${(performance.now() - startTime).toFixed(2)}ms`);

  return ifcAPI;
}

// ============================================================================
// PUBLIC API - Model Loading
// ============================================================================

/**
 * Load an IFC file and extract raw geometry data
 * Returns a RawIfcModel with no Babylon.js dependencies
 */
export async function loadIfcModel(
  ifcAPI: WebIFC.IfcAPI,
  source: string | File | ArrayBuffer,
  options: IfcInitOptions = {},
): Promise<RawIfcModel> {
  const opts: IfcInitOptions = {
    coordinateToOrigin: true,
    verbose: true,
    ...options,
  };

  throwIfAborted(opts.signal);

  // Step 1: Open the model
  const modelID = await openModel(ifcAPI, source, opts);

  try {
    throwIfAborted(opts.signal);

    // Step 2: Stream geometry and extract raw data
    const { parts, rawStats } = streamGeometry(ifcAPI, modelID, opts);

    throwIfAborted(opts.signal);

    if (opts.verbose) {
      logInfo(`\nRaw model statistics:`, { modelID });
      logInfo(`  Parts extracted: ${rawStats.partCount}`, { modelID });
      logInfo(`  Vertices: ${rawStats.vertexCount.toLocaleString()}`, { modelID });
      logInfo(`  Triangles: ${rawStats.triangleCount.toLocaleString()}`, { modelID });
    }

    return {
      modelID,
      parts,
      rawStats,
    };
  } catch (error) {
    if (ifcAPI.IsModelOpen(modelID)) {
      ifcAPI.CloseModel(modelID);
    }
    throw error;
  }
}

/**
 * Close IFC model and free memory
 */
export function closeIfcModel(ifcAPI: WebIFC.IfcAPI, modelID: number): void {
  if (ifcAPI.IsModelOpen(modelID)) {
    ifcAPI.CloseModel(modelID);
    logInfo("Model closed and memory freed", { modelID });
  }
}

// ============================================================================
// PUBLIC API - projectInfo Extraction
// ============================================================================

/**
 * Extract high-level IFC projectInfo (project, application, author, organization)
 */
export function getProjectInfo(ifcAPI: WebIFC.IfcAPI, modelID: number): ProjectInfoResult {
  const projectInfo: ProjectInfoResult = {
    projectName: null,
    projectDescription: null,
    application: null,
    author: null,
    organization: null,
  };

  try {
    // Get all lines of type IFCPROJECT
    const projects = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (projects.size() > 0) {
      const projectID = projects.get(0);
      const project = ifcAPI.GetLine(modelID, projectID, false);

      if (project) {
        projectInfo.projectName = project.Name?.value || project.LongName?.value || null;
        projectInfo.projectDescription = project.Description?.value || null;
      }
    }

    // Get IFCAPPLICATION for application info
    const applications = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCAPPLICATION);
    if (applications.size() > 0) {
      const appID = applications.get(0);
      const app = ifcAPI.GetLine(modelID, appID, false);

      if (app) {
        projectInfo.application = app.ApplicationFullName?.value || app.ApplicationIdentifier?.value || null;
      }
    }

    // Get IFCPERSON for author info
    const persons = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPERSON);
    if (persons.size() > 0) {
      const personID = persons.get(0);
      const person = ifcAPI.GetLine(modelID, personID, false);

      if (person) {
        const givenName = person.GivenName?.value || "";
        const familyName = person.FamilyName?.value || "";
        const id = person.Identification?.value || "";
        projectInfo.author = [givenName, familyName, id].filter(Boolean).join(" ") || null;
      }
    }

    // Get IFCORGANIZATION
    const organizations = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCORGANIZATION);
    if (organizations.size() > 0) {
      const orgID = organizations.get(0);
      const org = ifcAPI.GetLine(modelID, orgID, false);

      if (org) {
        projectInfo.organization = org.Name?.value || null;
      }
    }
  } catch (error) {
    logWarn("Error extracting IFC projectInfo", { modelID }, error);
  }

  return projectInfo;
}

function buildAggregateRelations(ifcAPI: WebIFC.IfcAPI, modelID: number): Map<number, number[]> {
  const map = new Map<number, number[]>();
  const relIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);

  for (let i = 0; i < relIDs.size(); i += 1) {
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

  for (let i = 0; i < relIDs.size(); i += 1) {
    const relID = relIDs.get(i);
    const relLine = asLine(ifcAPI.GetLine(modelID, relID, false));
    const structureID = getRefId(relLine.RelatingStructure);
    if (structureID === undefined) continue;
    const elementIDs = getRefIds(relLine.RelatedElements);
    appendToMap(map, structureID, elementIDs);
  }

  return map;
}

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
  for (let i = 0; i < projectIDs.size(); i += 1) {
    const projectID = projectIDs.get(i);
    roots.push(projectID);
    allNodeIDs.add(projectID);
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

function parseLengthUnitSymbol(unit: IfcLineLike): IfcLengthUnitInfo | null {
  const unitType = normalizeUnitType(unit.UnitType);
  if (unitType && unitType !== "LENGTHUNIT") return null;

  const name = normalizeName(unit.Name);
  const prefix = normalizePrefix(unit.Prefix);

  if (name === "METRE" || name === "METER") {
    const symbolPrefix = SI_PREFIX_TO_SYMBOL[prefix] ?? "";
    return {
      symbol: `${symbolPrefix}m`,
      name: `${prefix ? `${prefix.toLowerCase()} ` : ""}metre`.trim(),
    };
  }

  if (name) {
    return { symbol: name.toLowerCase(), name: name.toLowerCase() };
  }

  return null;
}

function getUnitsArray(unitsInContext: unknown): unknown[] {
  const ctx = asLine(unitsInContext);
  if (Array.isArray(ctx.Units)) return ctx.Units;
  return [];
}

export function getIfcLengthUnitInfo(ifcAPI: WebIFC.IfcAPI, modelID: number): IfcLengthUnitInfo {
  try {
    const projectIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (projectIDs.size() === 0) return { symbol: "m", name: "metre" };

    const projectLine = asLine(ifcAPI.GetLine(modelID, projectIDs.get(0), true));
    const units = getUnitsArray(projectLine.UnitsInContext);
    for (const unitRef of units) {
      const unitLine = asLine(unitRef);
      const parsed = parseLengthUnitSymbol(unitLine);
      if (parsed) return parsed;
    }
  } catch (error) {
    logWarn("Failed to read IFC length unit", { modelID }, error);
  }

  return { symbol: "m", name: "metre" };
}

function collectIfcMaterialRefs(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  value: unknown,
  out: Set<number>,
  visitedRefs: Set<number>,
): void {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectIfcMaterialRefs(ifcAPI, modelID, entry, out, visitedRefs));
    return;
  }

  const refId = getRefId(value as IfcRef);
  if (refId === undefined || visitedRefs.has(refId)) return;
  visitedRefs.add(refId);

  try {
    const line = ifcAPI.GetLine(modelID, refId, false) as { type?: unknown } & Record<string, unknown>;
    if (!line || typeof line !== "object" || typeof line.type !== "number") return;

    const typeName = ifcAPI.GetNameFromTypeCode(line.type).toUpperCase();

    switch (typeName) {
      case "IFCMATERIAL":
        out.add(refId);
        return;
      case "IFCMATERIALLIST":
        collectIfcMaterialRefs(ifcAPI, modelID, line.Materials, out, visitedRefs);
        return;
      case "IFCMATERIALLAYER":
      case "IFCMATERIALCONSTITUENT":
      case "IFCMATERIALPROFILE":
        collectIfcMaterialRefs(ifcAPI, modelID, line.Material, out, visitedRefs);
        return;
      case "IFCMATERIALLAYERSET":
        collectIfcMaterialRefs(ifcAPI, modelID, line.MaterialLayers, out, visitedRefs);
        return;
      case "IFCMATERIALLAYERSETUSAGE":
        collectIfcMaterialRefs(ifcAPI, modelID, line.ForLayerSet, out, visitedRefs);
        return;
      case "IFCMATERIALCONSTITUENTSET":
        collectIfcMaterialRefs(ifcAPI, modelID, line.MaterialConstituents, out, visitedRefs);
        return;
      case "IFCMATERIALPROFILESET":
        collectIfcMaterialRefs(ifcAPI, modelID, line.MaterialProfiles, out, visitedRefs);
        return;
      case "IFCMATERIALPROFILESETUSAGE":
        collectIfcMaterialRefs(ifcAPI, modelID, line.ForProfileSet, out, visitedRefs);
        return;
      case "IFCMATERIALPROFILESETUSAGETAPERING":
        collectIfcMaterialRefs(ifcAPI, modelID, line.ForProfileSet, out, visitedRefs);
        collectIfcMaterialRefs(ifcAPI, modelID, line.ForProfileEndSet, out, visitedRefs);
        return;
      default:
        return;
    }
  } catch {
    // Ignore unresolved references.
  }
}

export function readIfcMaterials(ifcAPI: WebIFC.IfcAPI, modelID: number): IfcMaterialInfoResult[] {
  try {
    const ids = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCMATERIAL);
    const relatedElementsByMaterial = new Map<number, Set<number>>();
    const relIds = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);

    for (let i = 0; i < relIds.size(); i += 1) {
      const relExpressID = relIds.get(i);
      const relLine = ifcAPI.GetLine(modelID, relExpressID, false) as {
        RelatingMaterial?: unknown;
        RelatedObjects?: unknown;
      };

      const materialIDs = new Set<number>();
      collectIfcMaterialRefs(ifcAPI, modelID, relLine.RelatingMaterial, materialIDs, new Set<number>());
      const relatedObjectIDs = getRefIds(relLine.RelatedObjects);

      materialIDs.forEach((materialID) => {
        const existing = relatedElementsByMaterial.get(materialID) ?? new Set<number>();
        relatedObjectIDs.forEach((id) => existing.add(id));
        relatedElementsByMaterial.set(materialID, existing);
      });
    }

    const materials: IfcMaterialInfoResult[] = [];
    for (let i = 0; i < ids.size(); i += 1) {
      const expressID = ids.get(i);
      const line = asLine(ifcAPI.GetLine(modelID, expressID, true));
      materials.push({
        expressID,
        name: ifcText(line.Name) ?? `IFCMATERIAL #${expressID}`,
        relatedElementExpressIDs: Array.from(relatedElementsByMaterial.get(expressID) ?? []).sort((a, b) => a - b),
        colorHex: extractIfcColor(line),
      });
    }

    return materials.sort((a, b) => a.name.localeCompare(b.name) || a.expressID - b.expressID);
  } catch (error) {
    logWarn("Failed to read IFC materials", { modelID }, error);
    return [];
  }
}

export function getIfcModelMetadata(ifcAPI: WebIFC.IfcAPI, modelID: number): IfcModelMetadataResult {
  let ifcGlobalId = "";
  try {
    const projectIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (projectIDs.size() > 0) {
      const projectData = asLine(ifcAPI.GetLine(modelID, projectIDs.get(0), true));
      ifcGlobalId = ifcText(projectData.GlobalId) ?? "";
    }
  } catch (error) {
    logWarn("Failed to read IFC project GlobalId", { modelID }, error);
  }

  return {
    ifcSchema: ifcAPI.GetModelSchema(modelID) || "Unknown IFC",
    ifcGlobalId,
    lengthUnit: getIfcLengthUnitInfo(ifcAPI, modelID),
    projectTreeIndex: buildIfcProjectTreeIndex(ifcAPI, modelID),
    ifcMaterials: readIfcMaterials(ifcAPI, modelID),
  };
}

// ============================================================================
// PRIVATE HELPERS - Model Loading
// ============================================================================

/**
 * Open an IFC model from URL or File
 */
async function openModel(
  ifcAPI: WebIFC.IfcAPI,
  source: string | File | ArrayBuffer,
  options: IfcInitOptions,
): Promise<number> {
  let data: ArrayBuffer;
  throwIfAborted(options.signal);

  if (typeof source === "string") {
    logInfo(`Fetching IFC from URL: ${source}`);
    const response = options.signal ? await fetch(source, { signal: options.signal }) : await fetch(source);
    logInfo(
      `Fetch response: status=${response.status}, ok=${response.ok}, type=${response.headers.get("content-type")}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch IFC file: HTTP ${response.status} ${response.statusText}`);
    }

    data = await response.arrayBuffer();
    logInfo(`Received ${(data.byteLength / 1024 / 1024).toFixed(2)} MB`);
  } else if (source instanceof File) {
    logInfo(`Loading IFC file: ${source.name} (${(source.size / 1024 / 1024).toFixed(2)} MB)`);
    data = await source.arrayBuffer();
  } else {
    data = source;
    logInfo(`Loading IFC from ArrayBuffer (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  }

  throwIfAborted(options.signal);

  // Configure loader settings
  const settings: WebIFC.LoaderSettings = {
    COORDINATE_TO_ORIGIN: options.coordinateToOrigin ?? true,
    CIRCLE_SEGMENTS: 24,
    MEMORY_LIMIT: 2147483648,
    TAPE_SIZE: 67108864,
  };

  logInfo(`Opening IFC model (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)...`);
  const modelID = ifcAPI.OpenModel(new Uint8Array(data), settings);
  logInfo("OpenModel returned", { modelID });

  if (modelID === -1) {
    throw new Error("Failed to open IFC model");
  }

  return modelID;
}

/**
 * Stream geometry and extract raw data (no Babylon.js dependencies)
 */
function streamGeometry(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  options: IfcInitOptions,
): { parts: RawGeometryPart[]; rawStats: { partCount: number; vertexCount: number; triangleCount: number } } {
  throwIfAborted(options.signal);
  const parts: RawGeometryPart[] = [];
  let totalVertices = 0;
  let totalTriangles = 0;

  // Stream all meshes
  ifcAPI.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
    const placedGeometries = flatMesh.geometries;

    for (let i = 0; i < placedGeometries.size(); i++) {
      throwIfAborted(options.signal);
      const placedGeometry = placedGeometries.get(i);

      // Skip invalid geometries
      if (!placedGeometry || placedGeometry.geometryExpressID === undefined) continue;

      // Get geometry data
      const geometry = ifcAPI.GetGeometry(modelID, placedGeometry.geometryExpressID);
      if (!geometry) continue;

      try {
        const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

        if (verts.length === 0 || indices.length === 0) {
          disposeGeometry(geometry);
          continue;
        }

        // Extract positions and normals
        const numVertices = verts.length / 6;
        const positions = new Float32Array(numVertices * 3);
        const normals = new Float32Array(numVertices * 3);

        for (let v = 0; v < numVertices; v++) {
          positions[v * 3] = verts[v * 6];
          positions[v * 3 + 1] = verts[v * 6 + 1];
          positions[v * 3 + 2] = verts[v * 6 + 2];
          normals[v * 3] = verts[v * 6 + 3];
          normals[v * 3 + 1] = verts[v * 6 + 4];
          normals[v * 3 + 2] = verts[v * 6 + 5];
        }

        // Get color information
        const color = placedGeometry.color;
        let colorId: number;
        if (color) {
          colorId =
            Math.floor(color.x * 255) +
            Math.floor(color.y * 255) * 256 +
            Math.floor(color.z * 255) * 256 * 256 +
            Math.floor(color.w * 255) * 256 * 256 * 256;
        } else {
          colorId = 0; // Default color
        }

        // Store raw geometry part
        parts.push({
          expressID: flatMesh.expressID,
          geometryExpressID: placedGeometry.geometryExpressID,
          positions,
          normals,
          indices: new Uint32Array(indices),
          flatTransform: placedGeometry.flatTransformation,
          color,
          colorId,
        });

        // Update stats
        totalVertices += numVertices;
        totalTriangles += indices.length / 3;

        // Clean up WASM memory
        disposeGeometry(geometry);
      } catch (error) {
        const context: GeometryErrorContext = {
          modelID,
          expressID: flatMesh.expressID,
          geometryExpressID: placedGeometry.geometryExpressID,
        };
        logError("Error processing geometry", context, new IfcGeometryProcessingError(context, error));
        disposeGeometry(geometry);
      }
    }
  });

  if (options.verbose) {
    logInfo(`\nCollected ${parts.length} geometry parts`, { modelID });
  }

  return {
    parts,
    rawStats: {
      partCount: parts.length,
      vertexCount: totalVertices,
      triangleCount: totalTriangles,
    },
  };
}





