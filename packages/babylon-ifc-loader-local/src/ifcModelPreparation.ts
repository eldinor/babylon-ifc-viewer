import type { RawGeometryPart, RawIfcModel } from "./ifcInit";

export type GeometryMergeMode = "none" | "by-express-color" | "by-color" | "two-material";
export type GeometryPreparationTier = "low" | "medium" | "high" | "explicit" | "legacy" | "renderOnly";

export interface AutoMergeStrategy {
  lowMaxParts: number;
  mediumMaxParts: number;
  lowMode?: Exclude<GeometryMergeMode, "none">; // default: by-express-color
  mediumMode?: Exclude<GeometryMergeMode, "none">; // default: by-color
  highMode?: Exclude<GeometryMergeMode, "none">; // default: two-material
}

export interface GeometryPreparationOptions {
  mergeMeshes?: boolean; // legacy: false -> "none", true -> "by-express-color"
  mergeMode?: GeometryMergeMode;
  autoMergeStrategy?: AutoMergeStrategy;
  generateNormals?: boolean; // default: false
  includeElementMap?: boolean; // default: true
  maxTrianglesPerMesh?: number;
  maxVerticesPerMesh?: number;
  profile?: "renderOnly";
  signal?: AbortSignal;
}

export interface PreparedIfcElementRange {
  triangleStart: number;
  triangleCount: number;
  expressID: number;
}

export interface PreparedIfcMeshData {
  expressID: number; // -1 means mesh contains multiple elements; use elementRanges for picking
  colorId: number;
  color: { x: number; y: number; z: number; w: number } | null;
  positions: Float32Array<ArrayBufferLike>;
  normals: Float32Array<ArrayBufferLike>;
  indices: Uint32Array<ArrayBufferLike>;
  elementRanges?: PreparedIfcElementRange[];
}

export interface PreparedIfcTelemetry {
  tier: GeometryPreparationTier;
  opaqueMeshCount: number;
  transparentMeshCount: number;
  elementRangeCount: number;
  elementMapBytes: number;
  geometryBytes: number;
  transferBytes: number; // populated by worker transport step; 0 on main-thread path
  includeElementMap: boolean;
}

export interface PreparedIfcModel {
  modelID: number;
  sourcePartCount: number;
  invalidPartCount: number;
  mergedGroupCount: number;
  mergeMode: GeometryMergeMode;
  telemetry: PreparedIfcTelemetry;
  meshes: PreparedIfcMeshData[];
}

interface InternalPreparedPart extends Omit<PreparedIfcMeshData, "elementRanges"> {
  geometryExpressID: number;
  isTransparent: boolean;
}

interface MergeResolution {
  mergeMode: GeometryMergeMode;
  tier: GeometryPreparationTier;
}

interface MeshChunkLimits {
  maxTrianglesPerMesh?: number;
  maxVerticesPerMesh?: number;
}

const PERFORMANCE_OPAQUE_COLOR_ID = -1001;
const PERFORMANCE_TRANSPARENT_COLOR_ID = -1002;
const PERFORMANCE_OPAQUE_COLOR = { x: 0.8, y: 0.8, z: 0.8, w: 1 };
const PERFORMANCE_TRANSPARENT_COLOR = { x: 0.8, y: 0.8, z: 0.8, w: 0.35 };

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

function areAllNormalsZero(normals: Float32Array<ArrayBufferLike>): boolean {
  for (let i = 0; i < normals.length; i++) {
    if (normals[i] !== 0) return false;
  }
  return true;
}

function computeNormals(
  positions: Float32Array<ArrayBufferLike>,
  indices: Uint32Array<ArrayBufferLike>,
): Float32Array<ArrayBufferLike> {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const x0 = positions[i0];
    const y0 = positions[i0 + 1];
    const z0 = positions[i0 + 2];
    const x1 = positions[i1];
    const y1 = positions[i1 + 1];
    const z1 = positions[i1 + 2];
    const x2 = positions[i2];
    const y2 = positions[i2 + 1];
    const z2 = positions[i2 + 2];

    const ux = x1 - x0;
    const uy = y1 - y0;
    const uz = z1 - z0;
    const vx = x2 - x0;
    const vy = y2 - y0;
    const vz = z2 - z0;

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    normals[i0] += nx;
    normals[i0 + 1] += ny;
    normals[i0 + 2] += nz;
    normals[i1] += nx;
    normals[i1 + 1] += ny;
    normals[i1 + 2] += nz;
    normals[i2] += nx;
    normals[i2 + 1] += ny;
    normals[i2 + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i];
    const y = normals[i + 1];
    const z = normals[i + 2];
    const len = Math.hypot(x, y, z);
    if (len > 0) {
      normals[i] = x / len;
      normals[i + 1] = y / len;
      normals[i + 2] = z / len;
    }
  }

  return normals;
}

function applyTransform(
  positions: Float32Array<ArrayBufferLike>,
  normals: Float32Array<ArrayBufferLike>,
  flatTransform: ArrayLike<number>,
): void {
  if (!flatTransform || flatTransform.length !== 16) return;

  const m00 = flatTransform[0];
  const m01 = flatTransform[1];
  const m02 = flatTransform[2];
  const m03 = flatTransform[3];
  const m10 = flatTransform[4];
  const m11 = flatTransform[5];
  const m12 = flatTransform[6];
  const m13 = flatTransform[7];
  const m20 = flatTransform[8];
  const m21 = flatTransform[9];
  const m22 = flatTransform[10];
  const m23 = flatTransform[11];
  const m30 = flatTransform[12];
  const m31 = flatTransform[13];
  const m32 = flatTransform[14];
  const m33 = flatTransform[15];

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    positions[i] = x * m00 + y * m10 + z * m20 + m30;
    positions[i + 1] = x * m01 + y * m11 + z * m21 + m31;
    positions[i + 2] = x * m02 + y * m12 + z * m22 + m32;

    if (m03 !== 0 || m13 !== 0 || m23 !== 0 || m33 !== 1) {
      const w = x * m03 + y * m13 + z * m23 + m33;
      if (w !== 0 && w !== 1) {
        positions[i] /= w;
        positions[i + 1] /= w;
        positions[i + 2] /= w;
      }
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i];
    const y = normals[i + 1];
    const z = normals[i + 2];

    const nx = x * m00 + y * m10 + z * m20;
    const ny = x * m01 + y * m11 + z * m21;
    const nz = x * m02 + y * m12 + z * m22;
    const len = Math.hypot(nx, ny, nz);

    if (len > 0) {
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
}

function validateRawPart(part: RawGeometryPart): string | null {
  const vertexCount = part.positions.length / 3;

  if (part.positions.length === 0 || part.positions.length % 3 !== 0) {
    return "positions must be a non-empty Float32Array with length divisible by 3";
  }
  if (part.indices.length === 0 || part.indices.length % 3 !== 0) {
    return "indices must be a non-empty Uint32Array with length divisible by 3";
  }
  for (let i = 0; i < part.positions.length; i++) {
    if (!Number.isFinite(part.positions[i])) {
      return `positions contains non-finite value at index ${i}`;
    }
  }
  for (let i = 0; i < part.normals.length; i++) {
    if (!Number.isFinite(part.normals[i])) {
      return `normals contains non-finite value at index ${i}`;
    }
  }
  for (let i = 0; i < part.indices.length; i++) {
    if (part.indices[i] >= vertexCount) {
      return `indices contains out-of-range vertex index ${part.indices[i]} (vertexCount=${vertexCount})`;
    }
  }
  return null;
}

function resolveMergeMode(model: RawIfcModel, opts: GeometryPreparationOptions): MergeResolution {
  if (opts.profile === "renderOnly") {
    return {
      mergeMode: "two-material",
      tier: "renderOnly",
    };
  }

  if (opts.mergeMode) {
    return {
      mergeMode: opts.mergeMode,
      tier: "explicit",
    };
  }

  if (opts.autoMergeStrategy) {
    const strategy = opts.autoMergeStrategy;
    const partCount = model.rawStats.partCount;
    const lowMode = strategy.lowMode ?? "by-express-color";
    const mediumMode = strategy.mediumMode ?? "by-color";
    const highMode = strategy.highMode ?? "two-material";
    if (partCount <= strategy.lowMaxParts) {
      return { mergeMode: lowMode, tier: "low" };
    }
    if (partCount <= strategy.mediumMaxParts) {
      return { mergeMode: mediumMode, tier: "medium" };
    }
    return { mergeMode: highMode, tier: "high" };
  }

  if (opts.mergeMeshes === false) {
    return {
      mergeMode: "none",
      tier: "legacy",
    };
  }

  return {
    mergeMode: "by-express-color",
    tier: "legacy",
  };
}

function createPreparedPart(part: RawGeometryPart, generateNormals: boolean): InternalPreparedPart {
  const positions = new Float32Array(part.positions);
  let normals: Float32Array<ArrayBufferLike> = new Float32Array(part.normals);
  const indices = new Uint32Array(part.indices);
  const hasInvalidNormalLength = normals.length !== positions.length;

  if (hasInvalidNormalLength || (generateNormals && areAllNormalsZero(normals))) {
    normals = computeNormals(positions, indices);
  }

  applyTransform(positions, normals, part.flatTransform);

  return {
    expressID: part.expressID,
    geometryExpressID: part.geometryExpressID,
    colorId: part.colorId,
    color: part.color,
    positions,
    normals,
    indices,
    isTransparent: Boolean(part.color && part.color.w < 1),
  };
}

function buildGroupKey(part: InternalPreparedPart, mode: GeometryMergeMode): string {
  switch (mode) {
    case "none":
      return `${part.expressID}-${part.geometryExpressID}-${part.colorId}`;
    case "by-express-color":
      return `${part.expressID}-${part.colorId}`;
    case "by-color":
      return `color-${part.colorId}`;
    case "two-material":
      return part.isTransparent ? "transparent" : "opaque";
    default: {
      const exhaustiveCheck: never = mode;
      return String(exhaustiveCheck);
    }
  }
}

function determineGroupMaterial(
  group: InternalPreparedPart[],
  mode: GeometryMergeMode,
): { colorId: number; color: { x: number; y: number; z: number; w: number } | null } {
  if (mode === "two-material") {
    if (group[0].isTransparent) {
      return {
        colorId: PERFORMANCE_TRANSPARENT_COLOR_ID,
        color: PERFORMANCE_TRANSPARENT_COLOR,
      };
    }
    return {
      colorId: PERFORMANCE_OPAQUE_COLOR_ID,
      color: PERFORMANCE_OPAQUE_COLOR,
    };
  }

  return {
    colorId: group[0].colorId,
    color: group[0].color,
  };
}

function determineGroupExpressID(group: InternalPreparedPart[]): number {
  const firstExpressID = group[0].expressID;
  for (let i = 1; i < group.length; i++) {
    if (group[i].expressID !== firstExpressID) {
      return -1;
    }
  }
  return firstExpressID;
}

function createRangesForSinglePart(part: InternalPreparedPart, includeElementMap: boolean): PreparedIfcElementRange[] | undefined {
  if (!includeElementMap) {
    return undefined;
  }
  return [
    {
      triangleStart: 0,
      triangleCount: part.indices.length / 3,
      expressID: part.expressID,
    },
  ];
}

function mergeParts(
  parts: InternalPreparedPart[],
  expressID: number,
  colorId: number,
  color: { x: number; y: number; z: number; w: number } | null,
  includeElementMap: boolean,
): PreparedIfcMeshData {
  let positionCount = 0;
  let normalCount = 0;
  let indexCount = 0;

  for (const part of parts) {
    positionCount += part.positions.length;
    normalCount += part.normals.length;
    indexCount += part.indices.length;
  }

  const positions = new Float32Array(positionCount);
  const normals = new Float32Array(normalCount);
  const indices = new Uint32Array(indexCount);
  const elementRanges: PreparedIfcElementRange[] | undefined = includeElementMap ? [] : undefined;

  let vertexOffset = 0;
  let positionOffset = 0;
  let normalOffset = 0;
  let indexOffset = 0;

  for (const part of parts) {
    if (elementRanges) {
      const triangleStart = indexOffset / 3;
      const triangleCount = part.indices.length / 3;

      const lastRange = elementRanges[elementRanges.length - 1];
      if (
        lastRange &&
        lastRange.expressID === part.expressID &&
        lastRange.triangleStart + lastRange.triangleCount === triangleStart
      ) {
        lastRange.triangleCount += triangleCount;
      } else {
        elementRanges.push({
          triangleStart,
          triangleCount,
          expressID: part.expressID,
        });
      }
    }

    positions.set(part.positions, positionOffset);
    normals.set(part.normals, normalOffset);
    for (let i = 0; i < part.indices.length; i++) {
      indices[indexOffset + i] = part.indices[i] + vertexOffset;
    }
    vertexOffset += part.positions.length / 3;
    positionOffset += part.positions.length;
    normalOffset += part.normals.length;
    indexOffset += part.indices.length;
  }

  return {
    expressID,
    colorId,
    color,
    positions,
    normals,
    indices,
    elementRanges,
  };
}

function toChunkLimits(options: GeometryPreparationOptions): MeshChunkLimits | null {
  const maxTrianglesPerMesh =
    typeof options.maxTrianglesPerMesh === "number" && options.maxTrianglesPerMesh > 0
      ? Math.floor(options.maxTrianglesPerMesh)
      : undefined;
  const maxVerticesPerMesh =
    typeof options.maxVerticesPerMesh === "number" && options.maxVerticesPerMesh > 0
      ? Math.floor(options.maxVerticesPerMesh)
      : undefined;

  if (maxTrianglesPerMesh === undefined && maxVerticesPerMesh === undefined) {
    return null;
  }

  return { maxTrianglesPerMesh, maxVerticesPerMesh };
}

function mergePartsWithChunking(
  parts: InternalPreparedPart[],
  expressID: number,
  colorId: number,
  color: { x: number; y: number; z: number; w: number } | null,
  limits: MeshChunkLimits | null,
  includeElementMap: boolean,
): PreparedIfcMeshData[] {
  if (!limits) {
    return [mergeParts(parts, expressID, colorId, color, includeElementMap)];
  }

  const meshes: PreparedIfcMeshData[] = [];
  let chunkParts: InternalPreparedPart[] = [];
  let chunkTriangles = 0;
  let chunkVertices = 0;

  const flushChunk = () => {
    if (chunkParts.length === 0) return;
    meshes.push(mergeParts(chunkParts, expressID, colorId, color, includeElementMap));
    chunkParts = [];
    chunkTriangles = 0;
    chunkVertices = 0;
  };

  for (const part of parts) {
    const partTriangles = part.indices.length / 3;
    const partVertices = part.positions.length / 3;
    const exceedsTriangleBudget =
      limits.maxTrianglesPerMesh !== undefined && chunkTriangles + partTriangles > limits.maxTrianglesPerMesh;
    const exceedsVertexBudget =
      limits.maxVerticesPerMesh !== undefined && chunkVertices + partVertices > limits.maxVerticesPerMesh;

    if (chunkParts.length > 0 && (exceedsTriangleBudget || exceedsVertexBudget)) {
      flushChunk();
    }

    chunkParts.push(part);
    chunkTriangles += partTriangles;
    chunkVertices += partVertices;
  }

  flushChunk();
  return meshes;
}

function toPreparedMeshData(
  part: InternalPreparedPart,
  colorId: number,
  color: { x: number; y: number; z: number; w: number } | null,
  includeElementMap: boolean,
): PreparedIfcMeshData {
  return {
    expressID: part.expressID,
    colorId,
    color,
    positions: part.positions,
    normals: part.normals,
    indices: part.indices,
    elementRanges: createRangesForSinglePart(part, includeElementMap),
  };
}

function countTransparentMeshes(meshes: PreparedIfcMeshData[]): { transparent: number; opaque: number } {
  let transparent = 0;
  let opaque = 0;
  for (const mesh of meshes) {
    if (mesh.color && mesh.color.w < 1) {
      transparent++;
    } else {
      opaque++;
    }
  }
  return { transparent, opaque };
}

function estimateGeometryBytes(meshes: PreparedIfcMeshData[]): number {
  let bytes = 0;
  for (const mesh of meshes) {
    bytes += mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength;
  }
  return bytes;
}

function countElementRanges(meshes: PreparedIfcMeshData[]): number {
  let count = 0;
  for (const mesh of meshes) {
    count += mesh.elementRanges?.length ?? 0;
  }
  return count;
}

export function prepareIfcModelGeometry(
  model: RawIfcModel,
  options: GeometryPreparationOptions = {},
): PreparedIfcModel {
  const opts: GeometryPreparationOptions = {
    mergeMeshes: true,
    generateNormals: false,
    includeElementMap: true,
    ...options,
  };
  const mergeResolution = resolveMergeMode(model, opts);
  const includeElementMap = opts.includeElementMap !== false;
  const chunkLimits = toChunkLimits(opts);

  let invalidPartCount = 0;
  const preparedParts: InternalPreparedPart[] = [];

  for (const part of model.parts) {
    throwIfAborted(opts.signal);
    const error = validateRawPart(part);
    if (error) {
      invalidPartCount++;
      continue;
    }
    preparedParts.push(createPreparedPart(part, Boolean(opts.generateNormals)));
  }

  const groups = new Map<string, InternalPreparedPart[]>();
  for (const part of preparedParts) {
    throwIfAborted(opts.signal);
    const key = buildGroupKey(part, mergeResolution.mergeMode);
    const group = groups.get(key);
    if (group) {
      group.push(part);
    } else {
      groups.set(key, [part]);
    }
  }

  const meshes: PreparedIfcMeshData[] = [];
  let mergedGroupCount = 0;
  for (const group of groups.values()) {
    throwIfAborted(opts.signal);
    if (group.length === 0) continue;

    const groupMaterial = determineGroupMaterial(group, mergeResolution.mergeMode);
    if (mergeResolution.mergeMode === "none" || group.length === 1) {
      for (const item of group) {
        meshes.push(toPreparedMeshData(item, groupMaterial.colorId, groupMaterial.color, includeElementMap));
      }
      continue;
    }

    meshes.push(
      ...mergePartsWithChunking(
        group,
        determineGroupExpressID(group),
        groupMaterial.colorId,
        groupMaterial.color,
        chunkLimits,
        includeElementMap,
      ),
    );
    mergedGroupCount++;
  }

  const meshKinds = countTransparentMeshes(meshes);
  const elementRangeCount = countElementRanges(meshes);
  const elementMapBytes = elementRangeCount * 12;

  return {
    modelID: model.modelID,
    sourcePartCount: model.rawStats.partCount,
    invalidPartCount,
    mergedGroupCount,
    mergeMode: mergeResolution.mergeMode,
    telemetry: {
      tier: mergeResolution.tier,
      opaqueMeshCount: meshKinds.opaque,
      transparentMeshCount: meshKinds.transparent,
      elementRangeCount,
      elementMapBytes,
      geometryBytes: estimateGeometryBytes(meshes),
      transferBytes: 0,
      includeElementMap,
    },
    meshes,
  };
}
