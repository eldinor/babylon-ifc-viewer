import {
  Scene,
  Mesh,
  VertexData,
  VertexBuffer,
  Matrix,
  AbstractMesh,
  TransformNode,
  Vector3,
  Color3,
  StandardMaterial,
  PBRMaterial,
} from "@babylonjs/core";
import type { RawIfcModel, RawGeometryPart } from "./ifcInit";
import type { PreparedIfcElementRange, PreparedIfcModel, PreparedIfcMeshData } from "./ifcModelPreparation";
import { logInfo, logWarn } from "./logging";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Configuration for scene building */
export interface SceneBuildOptions {
  mergeMeshes?: boolean; // default: true
  autoCenter?: boolean; // default: true
  doubleSided?: boolean; // default: true (backFaceCulling=false)
  generateNormals?: boolean; // default: false
  verbose?: boolean; // default: true
  freezeAfterBuild?: boolean; // default: true
  usePBRMaterials?: boolean; // default: false
  releaseRawPartsAfterBuild?: boolean; // default: true
}

export const MATERIAL_Z_OFFSET_STEP = 0.05;
export const MATERIAL_Z_OFFSET_WRAP = 1.0;
export const DEFAULT_IFC_MATERIAL_GRAY = 0.8;
export const DEFAULT_PBR_METALLIC = 0;
export const DEFAULT_PBR_ROUGHNESS = 0.7;

/** Result of building a scene */
export interface SceneBuildResult {
  meshes: AbstractMesh[];
  rootNode: TransformNode;
  stats: BuildStats;
}

/** Statistics from scene building */
export interface BuildStats {
  originalPartCount: number;
  finalMeshCount: number;
  mergedGroupCount: number;
  skippedGroupCount: number;
  materialCount: number;
  buildTimeMs: number;
}

/** Bounds information */
export interface BoundsInfo {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  size: Vector3;
  diagonal: number;
}

/** Private interface for mesh with color */
interface MeshWithColor {
  mesh: Mesh;
  colorId: number;
  color: { x: number; y: number; z: number; w: number } | null;
}

interface IfcMaterialMetadata {
  color: { r: number; g: number; b: number; a: number } | null;
}

export interface IfcPreparedMeshMetadata {
  modelID: number;
  expressID: number;
  elementRanges?: PreparedIfcElementRange[];
}

// ============================================================================
// PUBLIC API - Scene Building
// ============================================================================

/**
 * Build a Babylon.js scene from raw IFC model data
 */
export function buildIfcModel(
  model: RawIfcModel | PreparedIfcModel,
  scene: Scene,
  options: SceneBuildOptions = {},
): SceneBuildResult {
  const startTime = performance.now();

  const opts: SceneBuildOptions = {
    mergeMeshes: true,
    autoCenter: true,
    doubleSided: true,
    generateNormals: false,
    verbose: true,
    freezeAfterBuild: true,
    usePBRMaterials: false,
    releaseRawPartsAfterBuild: true,
    ...options,
  };

  if (opts.verbose) {
    const inputPartCount = isPreparedIfcModel(model) ? model.sourcePartCount : model.parts.length;
    logInfo(`\nBuilding Babylon.js scene from ${inputPartCount} raw parts...`, { modelID: model.modelID });
  }

  /*
  const skybox = MeshBuilder.CreateBox("skyBox", { size: 10000 }, scene);
  const skyboxMaterial = new PBRMaterial("skyBoxMaterial", scene);
  skyboxMaterial.backFaceCulling = false;
  skyboxMaterial.reflectionTexture = scene.environmentTexture;
  skyboxMaterial.reflectionTexture!.coordinatesMode = Texture.SKYBOX_MODE;
  skyboxMaterial.disableLighting = true;
  skyboxMaterial.microSurface = 0.3;
  // skybox.material = skyboxMaterial;
  */

  // Create root transform node (without scaling yet)
  const rootNode = new TransformNode("ifc-root", scene);

  if (isPreparedIfcModel(model)) {
    const materialCache = new Map<number, StandardMaterial | PBRMaterial>();
    const finalMeshes: AbstractMesh[] = [];
    const meshNameCounts = new Map<string, number>();
    let materialZOffset = 0;

    for (let meshIndex = 0; meshIndex < model.meshes.length; meshIndex++) {
      const prepared = model.meshes[meshIndex];
      const mesh = createMeshFromPreparedData(prepared, model.modelID, meshIndex, scene, rootNode);
      const material = getMaterial(prepared.colorId, prepared.color, scene, materialCache, materialZOffset, opts);
      materialZOffset = (materialZOffset + MATERIAL_Z_OFFSET_STEP) % MATERIAL_Z_OFFSET_WRAP;
      const baseName = mesh.name;
      const baseCount = meshNameCounts.get(baseName) ?? 0;
      meshNameCounts.set(baseName, baseCount + 1);
      if (baseCount > 0) {
        mesh.name = `${baseName}-${baseCount}`;
      }
      mesh.material = material;
      finalMeshes.push(mesh);
    }

    rootNode.scaling.z = -1;
    rootNode.computeWorldMatrix(true);

    if (opts.autoCenter) {
      const bounds = getModelBounds(finalMeshes);
      if (bounds) {
        const centerOffset = bounds.center;
        rootNode.position.subtractInPlace(centerOffset);
        if (opts.verbose) {
          logInfo(
            `  Model auto-centered at origin (offset: ${centerOffset.x.toFixed(2)}, ${centerOffset.y.toFixed(2)}, ${centerOffset.z.toFixed(2)})`,
            { modelID: model.modelID },
          );
        }
      }
    }

    const buildTimeMs = performance.now() - startTime;
    const stats: BuildStats = {
      originalPartCount: model.sourcePartCount,
      finalMeshCount: finalMeshes.length,
      mergedGroupCount: model.mergedGroupCount,
      skippedGroupCount: 0,
      materialCount: materialCache.size,
      buildTimeMs,
    };

    if (opts.freezeAfterBuild) {
      rootNode.getChildMeshes().forEach((mesh) => {
        mesh.freezeWorldMatrix();
      });
      scene.materials.forEach((material) => {
        if (material.name.startsWith("ifc-material-")) {
          material.freeze();
        }
      });
    }

    return {
      meshes: finalMeshes,
      rootNode,
      stats,
    };
  }

  // Validate and create meshes from raw parts
  let invalidPartCount = 0;
  const validParts = model.parts.filter((part) => {
    const error = validateRawPart(part);
    if (error) {
      invalidPartCount++;
      if (opts.verbose) {
        logWarn(`Skipping invalid part: ${error}`, {
          modelID: model.modelID,
          expressID: part.expressID,
          geometryExpressID: part.geometryExpressID,
        });
      }
      return false;
    }
    return true;
  });
  const meshesWithColor: MeshWithColor[] = validParts.map((part) => {
    return createMeshFromPart(part, model.modelID, scene, rootNode, opts);
  });

  if (opts.verbose) {
    logInfo(`  Created ${meshesWithColor.length} initial meshes`, { modelID: model.modelID });
    if (invalidPartCount > 0) {
      logInfo(`  Skipped ${invalidPartCount} invalid geometry part(s)`, { modelID: model.modelID });
    }
  }

  // Group by (expressID + colorId)
  const meshGroups = groupMeshesByKey(meshesWithColor);

  if (opts.verbose) {
    logInfo(`  Grouped into ${meshGroups.size} unique (expressID + material) combinations`, { modelID: model.modelID });
  }

  // Create materials and merge groups
  const materialCache = new Map<number, StandardMaterial | PBRMaterial>();
  const finalMeshes: AbstractMesh[] = [];
  let mergedCount = 0;
  let skippedCount = 0;
  let materialZOffset = 0;

  meshGroups.forEach((group) => {
    const meshes = group.map((item) => item.mesh);
    const expressID = meshes[0].metadata!.expressID;
    const colorId = group[0].colorId;
    const color = group[0].color;

    // Get or create material
    const material = getMaterial(colorId, color, scene, materialCache, materialZOffset, opts);
    // Increment z-offset with modulo to prevent infinite growth
    materialZOffset = (materialZOffset + MATERIAL_Z_OFFSET_STEP) % MATERIAL_Z_OFFSET_WRAP;

    if (meshes.length === 1) {
      // Single mesh - no merging needed
      const mesh = meshes[0];
      mesh.name = `ifc-${expressID}`;
      mesh.material = material;
      finalMeshes.push(mesh);
    } else if (opts.mergeMeshes) {
      // Multiple meshes - merge parts belonging to the same element/material group.
      const mergedMesh = Mesh.MergeMeshes(
        meshes,
        true, // disposeSource
        true, // allow32BitsIndices
        undefined, // meshSubclass
        false, // subdivideWithSubMeshes
        false, // multiMultiMaterials
      );

      if (mergedMesh) {
        mergedMesh.name = `ifc-${expressID}`;
        mergedMesh.parent = rootNode;
        mergedMesh.material = material;
        mergedMesh.metadata = {
          expressID: expressID,
          modelID: model.modelID,
        };
        mergedMesh.isVisible = true;
        finalMeshes.push(mergedMesh);
        mergedCount++;
      } else {
        // Merge failed - keep original meshes
        meshes.forEach((mesh) => {
          mesh.name = `ifc-${expressID}`;
          mesh.material = material;
          finalMeshes.push(mesh);
        });
        skippedCount++;
      }
    } else {
      // Merging disabled - keep all meshes
      meshes.forEach((mesh) => {
        mesh.name = `ifc-${expressID}`;
        mesh.material = material;
        finalMeshes.push(mesh);
      });
    }
  });

  // Apply Z-axis flip for coordinate system conversion (IFC to Babylon)
  // This must be done AFTER all meshes are created and transforms are baked
  rootNode.scaling.z = -1;

  // Force update of world matrix to apply scaling
  rootNode.computeWorldMatrix(true);

  // Auto-center the model if requested
  if (opts.autoCenter) {
    const bounds = getModelBounds(finalMeshes);
    if (bounds) {
      const centerOffset = bounds.center;
      rootNode.position.subtractInPlace(centerOffset);
      if (opts.verbose) {
        logInfo(
          `  Model auto-centered at origin (offset: ${centerOffset.x.toFixed(2)}, ${centerOffset.y.toFixed(2)}, ${centerOffset.z.toFixed(2)})`,
          { modelID: model.modelID },
        );
      }
    }
  }

  const buildTimeMs = performance.now() - startTime;

  const stats: BuildStats = {
    originalPartCount: model.rawStats.partCount,
    finalMeshCount: finalMeshes.length,
    mergedGroupCount: mergedCount,
    skippedGroupCount: skippedCount,
    materialCount: materialCache.size,
    buildTimeMs,
  };

  if (opts.verbose) {
    logInfo(`\nModel building complete:`, { modelID: model.modelID });
    logInfo(`  Original parts: ${stats.originalPartCount}`, { modelID: model.modelID });
    logInfo(`  Merged groups: ${stats.mergedGroupCount}`, { modelID: model.modelID });
    logInfo(`  Skipped groups: ${stats.skippedGroupCount}`, { modelID: model.modelID });
    logInfo(`  Final meshes: ${stats.finalMeshCount}`, { modelID: model.modelID });
    logInfo(`  Materials created: ${stats.materialCount}`, { modelID: model.modelID });
    logInfo(`  Build time: ${stats.buildTimeMs.toFixed(2)}ms`, { modelID: model.modelID });
  }

  if (opts.freezeAfterBuild) {
    // Freeze only IFC meshes that are children of ifc-root
    rootNode.getChildMeshes().forEach((mesh) => {
      mesh.freezeWorldMatrix();
    });
    // Freeze IFC materials only
    scene.materials.forEach((material) => {
      if (material.name.startsWith("ifc-material-")) {
        material.freeze();
      }
    });
    if (opts.verbose) {
      logInfo(`  IFC meshes and materials frozen for optimal performance`, { modelID: model.modelID });
    }
  }

  if (opts.releaseRawPartsAfterBuild) {
    model.parts = [];
  }

  return {
    meshes: finalMeshes,
    rootNode,
    stats,
  };
}

/**
 * Dispose all IFC meshes, materials, and the root node
 */
export function disposeIfcModel(scene: Scene): void {
  // Dispose all IFC materials
  let materialCount = 0;
  scene.materials.forEach((material) => {
    if (material.name.startsWith("ifc-material-")) {
      material.dispose();
      materialCount++;
    }
  });

  // Find and dispose the ifc-root node (this will dispose all child meshes)
  const rootNode = scene.getTransformNodeByName("ifc-root");
  if (rootNode) {
    rootNode.dispose();
    logInfo(`ifc-root node and all child meshes disposed`);
  }

  if (materialCount > 0) {
    logInfo(`${materialCount} IFC materials disposed`);
  }
}

/**
 * Get model bounds for camera framing
 */
export function getModelBounds(meshes: AbstractMesh[]): BoundsInfo | null {
  if (meshes.length === 0) return null;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let validBoundsFound = false;

  meshes.forEach((mesh) => {
    if (!mesh.isVisible || mesh.getTotalVertices() === 0) return;

    // Force update of bounding info
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(false, false);

    // Get the bounding info
    const boundingInfo = mesh.getBoundingInfo();

    // Get min and max in world space
    const min = boundingInfo.boundingBox.minimumWorld;
    const max = boundingInfo.boundingBox.maximumWorld;

    // Update bounds
    minX = Math.min(minX, min.x);
    minY = Math.min(minY, min.y);
    minZ = Math.min(minZ, min.z);
    maxX = Math.max(maxX, max.x);
    maxY = Math.max(maxY, max.y);
    maxZ = Math.max(maxZ, max.z);

    validBoundsFound = true;
  });

  if (!validBoundsFound) return null;

  const min = new Vector3(minX, minY, minZ);
  const max = new Vector3(maxX, maxY, maxZ);
  const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
  const diagonal = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z);

  return { min, max, center, size, diagonal };
}

/**
 * Center the model at origin (useful for camera positioning)
 */
export function centerModelAtOrigin(meshes: AbstractMesh[], rootNode?: TransformNode): Vector3 {
  const bounds = getModelBounds(meshes);
  if (!bounds) return Vector3.Zero();

  const offset = bounds.center.clone();

  if (rootNode) {
    // Move the entire root node to center the model
    rootNode.position.subtractInPlace(offset);
  } else {
    // Move individual meshes
    meshes.forEach((mesh) => {
      mesh.position.subtractInPlace(offset);
    });
  }

  logInfo(`Model centered at origin, offset: (${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(2)})`);

  return offset;
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Create a Babylon mesh from a raw geometry part
 */
function createMeshFromPart(
  part: RawGeometryPart,
  modelID: number,
  scene: Scene,
  rootNode: TransformNode,
  options: SceneBuildOptions,
): MeshWithColor {
  const meshName = `ifc-${part.expressID}-part-${part.geometryExpressID}`;
  const mesh = new Mesh(meshName, scene);
  mesh.parent = rootNode;

  // Add metadata
  mesh.metadata = {
    expressID: part.expressID,
    modelID: modelID,
  };

  // Check if normals need to be generated
  let normals = part.normals;
  const hasInvalidNormalLength = normals.length !== part.positions.length;
  const shouldGenerateNormals = (options.generateNormals && areAllNormalsZero(normals)) || hasInvalidNormalLength;
  if (shouldGenerateNormals) {
    const tempNormals: number[] = [];
    VertexData.ComputeNormals(part.positions, part.indices, tempNormals);
    normals = new Float32Array(tempNormals);
  }

  // Apply vertex data
  const vertexData = new VertexData();
  vertexData.positions = part.positions;
  vertexData.normals = normals;
  vertexData.indices = part.indices;
  vertexData.applyToMesh(mesh);

  // Apply transformation
  if (part.flatTransform && part.flatTransform.length === 16) {
    const matrix = Matrix.FromArray(part.flatTransform);
    mesh.bakeTransformIntoVertices(matrix);
  }

  mesh.isVisible = true;

  return {
    mesh,
    colorId: part.colorId,
    color: part.color,
  };
}

function createMeshFromPreparedData(
  prepared: PreparedIfcMeshData,
  modelID: number,
  meshIndex: number,
  scene: Scene,
  rootNode: TransformNode,
): Mesh {
  const meshName = prepared.expressID >= 0 ? `ifc-${prepared.expressID}` : `ifc-merged-${meshIndex}`;
  const mesh = new Mesh(meshName, scene);
  mesh.parent = rootNode;
  mesh.metadata = {
    expressID: prepared.expressID,
    modelID,
    elementRanges: prepared.elementRanges,
  } satisfies IfcPreparedMeshMetadata;

  const vertexData = new VertexData();
  vertexData.positions = prepared.positions;
  vertexData.normals = prepared.normals;
  vertexData.indices = prepared.indices;
  vertexData.applyToMesh(mesh);
  mesh.isVisible = true;
  return mesh;
}

function isPreparedIfcModel(model: RawIfcModel | PreparedIfcModel): model is PreparedIfcModel {
  return "meshes" in model && "sourcePartCount" in model;
}

function isPreparedMeshMetadata(metadata: unknown): metadata is IfcPreparedMeshMetadata {
  if (typeof metadata !== "object" || metadata === null) {
    return false;
  }
  const value = metadata as Partial<IfcPreparedMeshMetadata>;
  return (
    typeof value.modelID === "number" &&
    typeof value.expressID === "number" &&
    (value.elementRanges === undefined || Array.isArray(value.elementRanges))
  );
}

export function resolveExpressIDFromMeshPick(mesh: AbstractMesh, faceId: number | null | undefined): number | null {
  if (!isPreparedMeshMetadata(mesh.metadata)) {
    return null;
  }
  if (mesh.metadata.expressID >= 0) {
    return mesh.metadata.expressID;
  }
  if (typeof faceId !== "number" || faceId < 0) {
    return null;
  }
  const ranges = mesh.metadata.elementRanges;
  if (!ranges || ranges.length === 0) {
    return null;
  }
  return resolveExpressIDFromRanges(ranges, faceId);
}

export function createElementOverlayMesh(sourceMesh: AbstractMesh, expressID: number): Mesh | null {
  const extracted = extractPreparedMeshSelection(sourceMesh, new Set([expressID]), `${sourceMesh.name}-overlay-${expressID}`);
  if (!extracted) return null;

  const { mesh: overlayMesh, modelID } = extracted;
  overlayMesh.parent = sourceMesh.parent;
  overlayMesh.isPickable = false;
  overlayMesh.metadata = {
    expressID,
    modelID,
    isOverlay: true,
  };
  return overlayMesh;
}

export function createFilteredMeshFromSourceMesh(
  sourceMesh: AbstractMesh,
  selectedExpressIDs: ReadonlySet<number>,
): Mesh | null {
  const extracted = extractPreparedMeshSelection(sourceMesh, selectedExpressIDs, `${sourceMesh.name}-filtered`);
  if (!extracted) return null;

  extracted.mesh.metadata = extracted.metadata;
  return extracted.mesh;
}

function resolveExpressIDFromRanges(ranges: PreparedIfcElementRange[], faceId: number): number | null {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid];
    const start = range.triangleStart;
    const end = start + range.triangleCount;
    if (faceId < start) {
      high = mid - 1;
      continue;
    }
    if (faceId >= end) {
      low = mid + 1;
      continue;
    }
    return range.expressID;
  }

  return null;
}

function extractPreparedMeshSelection(
  sourceMesh: AbstractMesh,
  selectedExpressIDs: ReadonlySet<number>,
  meshName: string,
): { mesh: Mesh; metadata: IfcPreparedMeshMetadata; modelID: number } | null {
  if (!(sourceMesh instanceof Mesh)) {
    return null;
  }
  if (!isPreparedMeshMetadata(sourceMesh.metadata)) {
    return null;
  }

  const positions = sourceMesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = sourceMesh.getIndices();
  if (!positions || !indices || positions.length === 0 || indices.length === 0) {
    return null;
  }

  const selection = buildSelectionRanges(sourceMesh.metadata, indices.length / 3, selectedExpressIDs);
  if (!selection) {
    return null;
  }

  const normals = sourceMesh.getVerticesData(VertexBuffer.NormalKind);
  const nextPositions: number[] = [];
  const nextNormals: number[] | null = normals && normals.length === positions.length ? [] : null;
  const nextIndices: number[] = [];
  const vertexMap = new Map<number, number>();

  for (const range of selection.sourceRanges) {
    const triangleEnd = range.triangleStart + range.triangleCount;
    for (let triangleIndex = range.triangleStart; triangleIndex < triangleEnd; triangleIndex++) {
      const baseIndex = triangleIndex * 3;
      for (let i = 0; i < 3; i += 1) {
        const sourceVertexIndex = indices[baseIndex + i];
        let targetVertexIndex = vertexMap.get(sourceVertexIndex);
        if (targetVertexIndex === undefined) {
          targetVertexIndex = nextPositions.length / 3;
          vertexMap.set(sourceVertexIndex, targetVertexIndex);
          const positionOffset = sourceVertexIndex * 3;
          nextPositions.push(
            positions[positionOffset],
            positions[positionOffset + 1],
            positions[positionOffset + 2],
          );
          if (nextNormals) {
            nextNormals.push(
              normals![positionOffset],
              normals![positionOffset + 1],
              normals![positionOffset + 2],
            );
          }
        }
        nextIndices.push(targetVertexIndex);
      }
    }
  }

  if (nextPositions.length === 0 || nextIndices.length === 0) {
    return null;
  }

  const extractedMesh = new Mesh(meshName, sourceMesh.getScene());
  extractedMesh.position.copyFrom(sourceMesh.position);
  if (sourceMesh.rotationQuaternion) {
    extractedMesh.rotationQuaternion = sourceMesh.rotationQuaternion.clone();
  } else {
    extractedMesh.rotation.copyFrom(sourceMesh.rotation);
  }
  extractedMesh.scaling.copyFrom(sourceMesh.scaling);
  extractedMesh.renderingGroupId = sourceMesh.renderingGroupId;

  const vertexData = new VertexData();
  vertexData.positions = nextPositions;
  vertexData.indices = nextIndices;
  if (nextNormals) {
    vertexData.normals = nextNormals;
  }
  vertexData.applyToMesh(extractedMesh);
  extractedMesh.refreshBoundingInfo(true);

  return {
    mesh: extractedMesh,
    metadata: {
      modelID: sourceMesh.metadata.modelID,
      expressID: selection.expressID,
      elementRanges: selection.outputRanges,
    },
    modelID: sourceMesh.metadata.modelID,
  };
}

function buildSelectionRanges(
  metadata: IfcPreparedMeshMetadata,
  totalTriangleCount: number,
  selectedExpressIDs: ReadonlySet<number>,
): { sourceRanges: PreparedIfcElementRange[]; outputRanges: PreparedIfcElementRange[]; expressID: number } | null {
  if (selectedExpressIDs.size === 0) return null;

  if (metadata.expressID >= 0) {
    if (!selectedExpressIDs.has(metadata.expressID)) {
      return null;
    }
    const range = {
      triangleStart: 0,
      triangleCount: totalTriangleCount,
      expressID: metadata.expressID,
    };
    return {
      sourceRanges: [range],
      outputRanges: [range],
      expressID: metadata.expressID,
    };
  }

  const sourceRanges = metadata.elementRanges ?? [];
  const selectedSourceRanges: PreparedIfcElementRange[] = [];
  const outputRanges: PreparedIfcElementRange[] = [];
  let outputTriangleStart = 0;
  const uniqueExpressIDs = new Set<number>();

  for (const range of sourceRanges) {
    if (!selectedExpressIDs.has(range.expressID)) continue;
    selectedSourceRanges.push(range);
    uniqueExpressIDs.add(range.expressID);

    const lastRange = outputRanges[outputRanges.length - 1];
    if (
      lastRange &&
      lastRange.expressID === range.expressID &&
      lastRange.triangleStart + lastRange.triangleCount === outputTriangleStart
    ) {
      lastRange.triangleCount += range.triangleCount;
    } else {
      outputRanges.push({
        triangleStart: outputTriangleStart,
        triangleCount: range.triangleCount,
        expressID: range.expressID,
      });
    }
    outputTriangleStart += range.triangleCount;
  }

  if (selectedSourceRanges.length === 0) {
    return null;
  }

  return {
    sourceRanges: selectedSourceRanges,
    outputRanges,
    expressID: uniqueExpressIDs.size === 1 ? outputRanges[0].expressID : -1,
  };
}

function areAllNormalsZero(normals: Float32Array): boolean {
  for (let i = 0; i < normals.length; i++) {
    if (normals[i] !== 0) {
      return false;
    }
  }
  return true;
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

/**
 * Group meshes by (expressID + colorId)
 */
function groupMeshesByKey(meshesWithColor: MeshWithColor[]): Map<string, MeshWithColor[]> {
  const groupKey = (expressID: number, colorId: number) => `${expressID}-${colorId}`;
  const meshGroups = new Map<string, MeshWithColor[]>();

  meshesWithColor.forEach((item) => {
    const expressID = item.mesh.metadata!.expressID;
    const key = groupKey(expressID, item.colorId);

    if (!meshGroups.has(key)) {
      meshGroups.set(key, []);
    }
    meshGroups.get(key)!.push(item);
  });

  return meshGroups;
}

/**
 * Get or create a material for a color
 */
function getMaterial(
  colorId: number,
  color: { x: number; y: number; z: number; w: number } | null,
  scene: Scene,
  materialCache: Map<number, StandardMaterial | PBRMaterial>,
  materialZOffset: number,
  options: SceneBuildOptions,
): StandardMaterial | PBRMaterial {
  if (materialCache.has(colorId)) {
    return materialCache.get(colorId)!;
  }

  let material: StandardMaterial | PBRMaterial;

  if (options.usePBRMaterials) {
    // Create PBR material
    const pbrMaterial = new PBRMaterial(`ifc-material-${colorId}`, scene);

    if (color) {
      pbrMaterial.albedoColor = new Color3(color.x, color.y, color.z);
      pbrMaterial.alpha = color.w;
    } else {
      // Default gray color
      pbrMaterial.albedoColor = new Color3(
        DEFAULT_IFC_MATERIAL_GRAY,
        DEFAULT_IFC_MATERIAL_GRAY,
        DEFAULT_IFC_MATERIAL_GRAY,
      );
    }

    // Set PBR-specific properties for non-metallic surfaces (typical for building materials)
    pbrMaterial.metallic = DEFAULT_PBR_METALLIC;
    pbrMaterial.roughness = DEFAULT_PBR_ROUGHNESS;

    // Add z-offset to prevent z-fighting
    pbrMaterial.zOffset = materialZOffset;

    // Set backface culling based on options
    pbrMaterial.backFaceCulling = !options.doubleSided;

    material = pbrMaterial;
  } else {
    // Create Standard material (default)
    const standardMaterial = new StandardMaterial(`ifc-material-${colorId}`, scene);

    if (color) {
      standardMaterial.diffuseColor = new Color3(color.x, color.y, color.z);
      standardMaterial.alpha = color.w;
    } else {
      // Default gray color
      standardMaterial.diffuseColor = new Color3(
        DEFAULT_IFC_MATERIAL_GRAY,
        DEFAULT_IFC_MATERIAL_GRAY,
        DEFAULT_IFC_MATERIAL_GRAY,
      );
    }

    // Add z-offset to prevent z-fighting
    standardMaterial.zOffset = materialZOffset;

    // Set backface culling based on options
    standardMaterial.backFaceCulling = !options.doubleSided;

    material = standardMaterial;
  }

  material.metadata = {
    color: color ? { r: color.x, g: color.y, b: color.z, a: color.w } : null,
  } satisfies IfcMaterialMetadata;

  materialCache.set(colorId, material);
  return material;
}
