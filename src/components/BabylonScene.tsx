import { useEffect, useRef, useState, useCallback } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Matrix,
  TransformNode,
  Vector3,
  Color3,
  Color4,
  Plane,
  Material,
} from "@babylonjs/core";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { GLTF2Export } from "@babylonjs/serializers/glTF/2.0/glTFSerializer";
import type { MergePreset, PickMode, SectionAxis } from "../types/app";
import {
  createIfcLoader,
  buildIfcModel,
  createFilteredMeshFromSourceMesh,
  disposeIfcModel,
  getModelBounds,
} from "../loader";
import type {
  IfcLoader,
  IfcMaterialInfoResult,
  IfcWorkerProgressEvent,
  PreparedIfcElementBounds,
  PreparedIfcModel,
  ProjectInfoResult,
} from "../loader";
import { setupPickingHandler, type ElementPickData, type PickingManager } from "../utils/pickingUtils";
import type { IfcProjectTreeIndex } from "../utils/projectTreeUtils";

/**
 * Data passed to parent when an IFC model is loaded
 */
export interface IfcModelData {
  projectInfo: ProjectInfoResult | null;
  modelID: number;
  ifcGlobalId: string; // GlobalId from IFC file
  ifcSchema: string;
  partCount: number;
  meshCount: number;
  ifcMaterials: IfcMaterialInfo[];
  loader: IfcLoader;
  projectTreeIndex: IfcProjectTreeIndex;
  boundsByExpressID: Map<number, PreparedIfcElementBounds>;
  dimensionsByExpressID: Map<number, { length: number; width: number; height: number; elevation: number }>;
  lengthUnitSymbol: string;
  sourceFileName: string;
  sourceFileSizeBytes: number | null;
  axisRanges: {
    x: { min: number; max: number };
    y: { min: number; max: number };
    z: { min: number; max: number };
  };
}

export interface IfcMaterialInfo {
  expressID: number;
  name: string;
  relatedElementExpressIDs: number[];
  colorHex: string | null;
}

export interface SceneStats {
  fps: number | null;
  drawCalls: number | null;
  memoryMb: number | null;
}

interface BabylonSceneProps {
  onModelLoaded?: (modelData: IfcModelData | null) => void;
  onSceneStatsUpdate?: (stats: SceneStats) => void;
  /** Explicit element express IDs visibility filter (overrides storey/site filters when set) */
  visibleExpressIDs?: Set<number> | null;
  /** Explicit hidden express IDs (applied on top of visibility filter) */
  hiddenExpressIDs?: Set<number>;
  /** Callback when an IFC element is picked */
  onElementPicked?: (data: ElementPickData | null) => void;
  sceneBackgroundColor?: string;
  highlightColor?: string;
  mergePreset?: MergePreset;
  largeModelThreshold?: number;
  meshChunkSize?: number;
  sectionState?: { enabled: boolean; axis: SectionAxis; position: number | null; inverted: boolean };
  pickMode?: PickMode;
  pickingEnabled?: boolean;
  measurePinnedFirstExpressID?: number | null;
}

function toColor4(hex: string): Color4 {
  return Color4.FromHexString(`${hex}ff`);
}

function toColor3(hex: string): Color3 {
  return Color3.FromHexString(hex);
}

function darkenColor(color: Color3, factor: number): Color3 {
  const clamped = Math.max(0, Math.min(1, factor));
  return new Color3(color.r * clamped, color.g * clamped, color.b * clamped);
}

function resolveAutoMergeStrategy(mergePreset: MergePreset, largeModelThreshold: number) {
  switch (mergePreset) {
    case "hybrid":
      return {
        lowMaxParts: 1500,
        mediumMaxParts: largeModelThreshold,
        lowMode: "by-express-color" as const,
        mediumMode: "by-color" as const,
        highMode: "two-material" as const,
      };
    case "aggressive":
      return {
        lowMaxParts: 1500,
        mediumMaxParts: largeModelThreshold,
        lowMode: "by-color" as const,
        mediumMode: "two-material" as const,
        highMode: "two-material" as const,
      };
    case "balanced":
    default:
      return {
        lowMaxParts: 1500,
        mediumMaxParts: largeModelThreshold,
        lowMode: "by-color" as const,
        mediumMode: "by-color" as const,
        highMode: "two-material" as const,
      };
  }
}

function resolveMaxVerticesPerMesh(meshChunkSize: number): number {
  return Math.max(3, Math.floor(meshChunkSize * 1.5));
}

function formatLoadProgress(event: IfcWorkerProgressEvent): string {
  switch (event.phase) {
    case "load-start":
      return "10% Reading IFC data";
    case "load-done":
      return "45% IFC parsed";
    case "prepare-start":
      return "55% Preparing geometry";
    case "prepare-done":
      return "80% Geometry prepared";
    default:
      return "Working";
  }
}

interface CameraViewSnapshot {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function channelToHex(value: number): string {
  return Math.round(clamp01(value) * 255).toString(16).padStart(2, "0");
}

function parseColorChannel(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return clamp01(value);
  if (value && typeof value === "object" && "value" in value) {
    const nested = (value as { value?: unknown }).value;
    if (typeof nested === "number" && Number.isFinite(nested)) return clamp01(nested);
  }
  return null;
}

function extractMeshIfcColorHex(mesh: Scene["meshes"][number]): string | null {
  const material = mesh.material as (Material & { metadata?: unknown }) | null;
  if (!material || !material.metadata || typeof material.metadata !== "object") return null;
  const color = (material.metadata as { color?: unknown }).color;
  if (!color || typeof color !== "object") return null;
  const rgba = color as { r?: unknown; g?: unknown; b?: unknown; x?: unknown; y?: unknown; z?: unknown };
  const red = parseColorChannel(rgba.r ?? rgba.x);
  const green = parseColorChannel(rgba.g ?? rgba.y);
  const blue = parseColorChannel(rgba.b ?? rgba.z);
  if (red === null || green === null || blue === null) return null;
  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
}

function getMeshExpressID(mesh: Scene["meshes"][number]): number | null {
  const metadata = mesh.metadata as { expressID?: unknown; isOverlay?: unknown } | null;
  if (metadata?.isOverlay === true) return null;
  return typeof metadata?.expressID === "number" && metadata.expressID >= 0 ? metadata.expressID : null;
}

function getMeshElementExpressIDs(mesh: Scene["meshes"][number]): number[] {
  const directExpressID = getMeshExpressID(mesh);
  if (directExpressID !== null) return [directExpressID];

  const metadata = mesh.metadata as { elementRanges?: Array<{ expressID?: unknown }> } | null;
  if (!Array.isArray(metadata?.elementRanges)) return [];

  const ids = new Set<number>();
  metadata.elementRanges.forEach((range) => {
    if (typeof range?.expressID === "number" && range.expressID >= 0) {
      ids.add(range.expressID);
    }
  });
  return Array.from(ids);
}

function meshContainsExpressID(mesh: Scene["meshes"][number], expressID: number): boolean {
  return getMeshElementExpressIDs(mesh).includes(expressID);
}

function buildAxisRanges(meshes: Scene["meshes"]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let hasBounds = false;

  meshes.forEach((mesh) => {
    const boundingInfo = mesh.getBoundingInfo();
    if (!boundingInfo) return;
    const min = boundingInfo.boundingBox.minimumWorld;
    const max = boundingInfo.boundingBox.maximumWorld;
    minX = Math.min(minX, min.x);
    minY = Math.min(minY, min.y);
    minZ = Math.min(minZ, min.z);
    maxX = Math.max(maxX, max.x);
    maxY = Math.max(maxY, max.y);
    maxZ = Math.max(maxZ, max.z);
    hasBounds = true;
  });

  if (!hasBounds) {
    return {
      x: { min: -10, max: 10 },
      y: { min: -10, max: 10 },
      z: { min: -10, max: 10 },
    };
  }

  return {
    x: { min: minX, max: maxX },
    y: { min: minY, max: maxY },
    z: { min: minZ, max: maxZ },
  };
}

function toDimensions(bounds: PreparedIfcElementBounds) {
  return {
    length: bounds.maxX - bounds.minX,
    width: bounds.maxY - bounds.minY,
    height: bounds.maxZ - bounds.minZ,
    elevation: (bounds.minY + bounds.maxY) * 0.5,
  };
}

function transformBounds(bounds: PreparedIfcElementBounds, matrix: Matrix): PreparedIfcElementBounds {
  const corners = [
    new Vector3(bounds.minX, bounds.minY, bounds.minZ),
    new Vector3(bounds.minX, bounds.minY, bounds.maxZ),
    new Vector3(bounds.minX, bounds.maxY, bounds.minZ),
    new Vector3(bounds.minX, bounds.maxY, bounds.maxZ),
    new Vector3(bounds.maxX, bounds.minY, bounds.minZ),
    new Vector3(bounds.maxX, bounds.minY, bounds.maxZ),
    new Vector3(bounds.maxX, bounds.maxY, bounds.minZ),
    new Vector3(bounds.maxX, bounds.maxY, bounds.maxZ),
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  corners.forEach((corner) => {
    const transformed = Vector3.TransformCoordinates(corner, matrix);
    minX = Math.min(minX, transformed.x);
    minY = Math.min(minY, transformed.y);
    minZ = Math.min(minZ, transformed.z);
    maxX = Math.max(maxX, transformed.x);
    maxY = Math.max(maxY, transformed.y);
    maxZ = Math.max(maxZ, transformed.z);
  });

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function transformBoundsMap(
  boundsByExpressID: Map<number, PreparedIfcElementBounds>,
  matrix: Matrix,
): Map<number, PreparedIfcElementBounds> {
  const transformed = new Map<number, PreparedIfcElementBounds>();
  boundsByExpressID.forEach((bounds, expressID) => {
    transformed.set(expressID, transformBounds(bounds, matrix));
  });
  return transformed;
}

function buildDimensionsMapFromBounds(
  boundsByExpressID: Map<number, PreparedIfcElementBounds>,
): Map<number, { length: number; width: number; height: number; elevation: number }> {
  const map = new Map<number, { length: number; width: number; height: number; elevation: number }>();
  boundsByExpressID.forEach((bounds, expressID) => {
    const dimensions = toDimensions(bounds);
    if ([dimensions.length, dimensions.width, dimensions.height, dimensions.elevation].every(Number.isFinite)) {
      map.set(expressID, dimensions);
    }
  });
  return map;
}

function syncTransformNode(source: TransformNode, target: TransformNode): void {
  target.position.copyFrom(source.position);
  if (source.rotationQuaternion) {
    target.rotationQuaternion = source.rotationQuaternion.clone();
  } else {
    target.rotation.copyFrom(source.rotation);
  }
  target.scaling.copyFrom(source.scaling);
  target.computeWorldMatrix(true);
}

function readIfcMaterials(materials: IfcMaterialInfoResult[], meshes: Scene["meshes"]): IfcMaterialInfo[] {
  const meshColorByExpressID = new Map<number, string>();
  meshes.forEach((mesh) => {
    const expressID = getMeshExpressID(mesh);
    if (expressID === null || meshColorByExpressID.has(expressID)) return;
    const colorHex = extractMeshIfcColorHex(mesh);
    if (colorHex) meshColorByExpressID.set(expressID, colorHex);
  });

  return materials.map((material) => ({
    expressID: material.expressID,
    name: material.name,
    relatedElementExpressIDs: [...material.relatedElementExpressIDs],
    colorHex:
      material.relatedElementExpressIDs
        .map((id) => meshColorByExpressID.get(id) ?? null)
        .find((value): value is string => value !== null) ?? material.colorHex,
  }));
}

function BabylonScene({
  onModelLoaded,
  onSceneStatsUpdate,
  visibleExpressIDs,
  hiddenExpressIDs,
  onElementPicked,
  sceneBackgroundColor = "#1b043e",
  highlightColor = "#008080",
  mergePreset = "balanced",
  largeModelThreshold = 45000,
  meshChunkSize = 200000,
  sectionState,
  pickMode = "select",
  pickingEnabled = true,
  measurePinnedFirstExpressID = null,
}: BabylonSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const loaderRef = useRef<IfcLoader | null>(null);
  const modelRef = useRef<PreparedIfcModel | null>(null);
  const baseRootRef = useRef<TransformNode | null>(null);
  const filteredRootRef = useRef<TransformNode | null>(null);
  const sceneInstrumentationRef = useRef<SceneInstrumentation | null>(null);
  const pickingManagerRef = useRef<PickingManager | null>(null);
  const savedViewRef = useRef<CameraViewSnapshot | null>(null);
  const elementBoundsRef = useRef<Map<number, PreparedIfcElementBounds>>(new Map());
  const hasAutoLoadedSampleRef = useRef(false);
  const onModelLoadedRef = useRef<typeof onModelLoaded>(onModelLoaded);
  const onSceneStatsUpdateRef = useRef<typeof onSceneStatsUpdate>(onSceneStatsUpdate);
  const onElementPickedRef = useRef<typeof onElementPicked>(onElementPicked);
  const sceneBackgroundColorRef = useRef(sceneBackgroundColor);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgressText, setLoadingProgressText] = useState("0% Starting");
  const [error, setError] = useState<string | null>(null);
  const [ifcReady, setIfcReady] = useState(false);

  const disposeFilteredRoot = useCallback(() => {
    const root = filteredRootRef.current;
    if (!root) return;
    root.getChildMeshes().forEach((mesh) => {
      mesh.dispose(false, false);
    });
    root.dispose();
    filteredRootRef.current = null;
  }, []);

  const buildFilteredRoot = useCallback(
    (selectedExpressIDs: ReadonlySet<number>): number => {
      const scene = sceneRef.current;
      const baseRoot = baseRootRef.current;
      if (!scene || !baseRoot) return 0;

      disposeFilteredRoot();

      const filteredRoot = new TransformNode("ifc-filter-root", scene);
      syncTransformNode(baseRoot, filteredRoot);

      let createdMeshCount = 0;
      baseRoot.getChildMeshes().forEach((sourceMesh) => {
        const overlayMetadata = sourceMesh.metadata as { isOverlay?: unknown } | null;
        if (overlayMetadata?.isOverlay === true) return;

        const filteredMesh = createFilteredMeshFromSourceMesh(sourceMesh, selectedExpressIDs);
        if (!filteredMesh) return;

        filteredMesh.parent = filteredRoot;
        filteredMesh.material = sourceMesh.material;
        filteredMesh.isPickable = sourceMesh.isPickable;
        filteredMesh.visibility = sourceMesh.visibility;
        filteredMesh.renderingGroupId = sourceMesh.renderingGroupId;
        createdMeshCount += 1;
      });

      if (createdMeshCount === 0) {
        filteredRoot.dispose();
        return 0;
      }

      filteredRoot.computeWorldMatrix(true);
      filteredRootRef.current = filteredRoot;
      return createdMeshCount;
    },
    [disposeFilteredRoot],
  );

  useEffect(() => {
    onModelLoadedRef.current = onModelLoaded;
  }, [onModelLoaded]);

  useEffect(() => {
    onSceneStatsUpdateRef.current = onSceneStatsUpdate;
  }, [onSceneStatsUpdate]);

  useEffect(() => {
    onElementPickedRef.current = onElementPicked;
  }, [onElementPicked]);

  useEffect(() => {
    sceneBackgroundColorRef.current = sceneBackgroundColor;
  }, [sceneBackgroundColor]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const engine = engineRef.current;
      const instrumentation = sceneInstrumentationRef.current;
      if (!engine || !instrumentation || !onSceneStatsUpdateRef.current) return;

      const fpsRaw = engine.getFps();
      const fps = Number.isFinite(fpsRaw) ? Math.round(fpsRaw) : null;

      const drawCallsRaw = instrumentation.drawCallsCounter.current;
      const drawCalls = typeof drawCallsRaw === "number" && Number.isFinite(drawCallsRaw) ? drawCallsRaw : null;

      const memoryBytes = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
      const memoryMb = typeof memoryBytes === "number" && Number.isFinite(memoryBytes) ? memoryBytes / (1024 * 1024) : null;

      onSceneStatsUpdateRef.current({ fps, drawCalls, memoryMb });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

// Effect to show/hide meshes based on project tree subtree selection
  useEffect(() => {
    const scene = sceneRef.current;
    const baseRoot = baseRootRef.current;
    if (!scene || !baseRoot) return;
    const effectiveHiddenExpressIDs = hiddenExpressIDs ?? new Set<number>();

    // Reset transient pick overlays so they do not reference disposed or hidden roots.
    pickingManagerRef.current?.clearHighlight();

    const hasSelectionFilter = visibleExpressIDs !== null;
    const hasHiddenFilter = effectiveHiddenExpressIDs.size > 0;

    if (hasSelectionFilter || hasHiddenFilter) {
      const selectedRenderableIDs = new Set<number>();

      if (visibleExpressIDs) {
        visibleExpressIDs.forEach((expressID) => {
          if (!effectiveHiddenExpressIDs.has(expressID) && elementBoundsRef.current.has(expressID)) {
            selectedRenderableIDs.add(expressID);
          }
        });
      } else {
        elementBoundsRef.current.forEach((_, expressID) => {
          if (!effectiveHiddenExpressIDs.has(expressID)) {
            selectedRenderableIDs.add(expressID);
          }
        });
      }

      baseRoot.setEnabled(false);

      if (selectedRenderableIDs.size === 0) {
        disposeFilteredRoot();
        console.log("Spatial filter: no renderable elements remain after filtering");
        return;
      }

      const filteredMeshCount = buildFilteredRoot(selectedRenderableIDs);
      console.log(
        `Spatial filter: filtered root rebuilt (${filteredMeshCount} meshes for ${selectedRenderableIDs.size} visible elements)`,
      );
      return;
    }

    disposeFilteredRoot();
    baseRoot.setEnabled(true);

    let visibleCount = 0;
    let hiddenCount = 0;

    baseRoot.getChildMeshes().forEach((mesh) => {
      const overlayMetadata = mesh.metadata as { isOverlay?: unknown } | null;
      if (overlayMetadata?.isOverlay === true) return;
      const meshExpressIDs = getMeshElementExpressIDs(mesh);
      const notHidden =
        meshExpressIDs.length > 0 ? meshExpressIDs.some((expressID) => !effectiveHiddenExpressIDs.has(expressID)) : true;
      mesh.isVisible = notHidden;
      mesh.setEnabled(notHidden);

      if (notHidden) {
        visibleCount++;
      } else {
        hiddenCount++;
      }
    });

    console.log(`Spatial filter: ${visibleCount} visible, ${hiddenCount} hidden (project subtree: off)`);
  }, [buildFilteredRoot, disposeFilteredRoot, hiddenExpressIDs, visibleExpressIDs]);

  // Initialize engine and scene
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let resizeTimeoutId: number | undefined
    let resizeObserver: ResizeObserver | null = null
    let disposed = false

    const initializeScene = () => {
      if (disposed) return

      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      })
      engineRef.current = engine

      const scene = new Scene(engine)
      sceneRef.current = scene
      scene.clearColor = toColor4(sceneBackgroundColorRef.current)
      sceneInstrumentationRef.current = new SceneInstrumentation(scene)

      // Create camera
      const camera = new ArcRotateCamera(
        'camera',
        -Math.PI / 2,
        Math.PI / 2.5,
        10,
        Vector3.Zero(),
        scene
      )
      camera.attachControl(canvas, true)
      camera.lowerRadiusLimit = 1
      camera.upperRadiusLimit = 500
      camera.wheelPrecision = 10

      // Create lights for PBR
      const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)
      light.intensity = 0.7
      light.groundColor = new Color3(0.3, 0.3, 0.3)

      // Render loop
      engine.runRenderLoop(() => {
        scene.render()
      })

      // Handle window resize
      const handleResize = () => {
        engine.resize()
      }
      window.addEventListener('resize', handleResize)
      resizeObserver = new ResizeObserver(() => {
        if (resizeTimeoutId !== undefined) {
          window.clearTimeout(resizeTimeoutId)
        }
        // Avoid resizing every frame during sidebar width transition.
        resizeTimeoutId = window.setTimeout(() => {
          engine.resize()
        }, 120)
      })
      resizeObserver.observe(canvas)

      // Initialize the unified IFC loader once and reuse it for all file loads.
      const initIfc = async () => {
        const loader = createIfcLoader()
        try {
          await loader.init('/')
          if (disposed) {
            await loader.dispose()
            return
          }
          loaderRef.current = loader
          console.log('IFC loader initialized')
          setIfcReady(true)
        } catch (err) {
          if (!disposed) {
            loaderRef.current = null
          }
          await loader.dispose().catch(() => undefined)
          console.error('Failed to initialize IFC loader:', err)
          setError('Failed to initialize IFC loader')
        }
      }
      void initIfc()

      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }

    let removeResizeListener: (() => void) | undefined
    // Defer initialization so the first StrictMode test mount can cleanly cancel it.
    const initTimeoutId = window.setTimeout(() => {
      removeResizeListener = initializeScene()
    }, 0)

    // Cleanup
    return () => {
      disposed = true
      if (initTimeoutId !== undefined) {
        window.clearTimeout(initTimeoutId)
      }
      removeResizeListener?.()
      resizeObserver?.disconnect()
      if (resizeTimeoutId !== undefined) {
        window.clearTimeout(resizeTimeoutId)
      }
      
      // Dispose IFC model if loaded
      if (sceneRef.current) {
        disposeIfcModel(sceneRef.current)
      }
      disposeFilteredRoot()

      if (pickingManagerRef.current) {
        pickingManagerRef.current.dispose()
        pickingManagerRef.current = null
      }

      if (sceneInstrumentationRef.current) {
        sceneInstrumentationRef.current.dispose()
        sceneInstrumentationRef.current = null
      }
      
      // Close the active IFC model and release the loader.
      if (loaderRef.current && modelRef.current && modelRef.current.modelID >= 0) {
        void loaderRef.current.closeIfcModel(modelRef.current.modelID)
      }
      if (loaderRef.current) {
        void loaderRef.current.dispose()
        loaderRef.current = null
      }
      baseRootRef.current = null
      elementBoundsRef.current = new Map()
      modelRef.current = null
      
      engineRef.current?.dispose()
      engineRef.current = null
      sceneRef.current = null
    }
  }, [disposeFilteredRoot])

  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.clearColor = toColor4(sceneBackgroundColor);
  }, [sceneBackgroundColor]);

  useEffect(() => {
    if (!pickingManagerRef.current) return;
    pickingManagerRef.current.setHighlightOptions({ highlightColor: toColor3(highlightColor) });
  }, [highlightColor]);

  useEffect(() => {
    if (!pickingManagerRef.current) return;
    pickingManagerRef.current.setEnabled(pickingEnabled);
  }, [pickingEnabled]);

  useEffect(() => {
    const manager = pickingManagerRef.current;
    const scene = sceneRef.current;
    if (!manager || !scene) return;

    if (pickMode !== "measure" || measurePinnedFirstExpressID === null) {
      manager.setPersistentHighlight(null);
      return;
    }

    const firstMesh =
      scene.meshes.find((mesh) => mesh.isEnabled() && mesh.isVisible && meshContainsExpressID(mesh, measurePinnedFirstExpressID)) ??
      scene.meshes.find((mesh) => meshContainsExpressID(mesh, measurePinnedFirstExpressID));
    manager.setPersistentHighlight(firstMesh ?? null, measurePinnedFirstExpressID, {
      highlightColor: darkenColor(toColor3(highlightColor), 0.55),
      highlightAlpha: 0.38,
    });
  }, [hiddenExpressIDs, highlightColor, measurePinnedFirstExpressID, pickMode, visibleExpressIDs]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!sectionState?.enabled || sectionState.position === null) {
      scene.clipPlane = null;
    } else {
      const direction = sectionState.inverted ? -1 : 1;
      if (sectionState.axis === "x") {
        scene.clipPlane = new Plane(direction, 0, 0, -direction * sectionState.position);
      } else if (sectionState.axis === "y") {
        scene.clipPlane = new Plane(0, direction, 0, -direction * sectionState.position);
      } else {
        scene.clipPlane = new Plane(0, 0, direction, -direction * sectionState.position);
      }
    }

    scene.materials.forEach((material) => {
      const wasFrozen = material.isFrozen;
      if (wasFrozen) {
        material.unfreeze();
      }
      material.markAsDirty(Material.AllDirtyFlag);
      if (wasFrozen) {
        material.freeze();
      }
    });
  }, [sectionState]);

  const fitToExpressIDs = useCallback((expressIDs: number[]) => {
    const scene = sceneRef.current;
    if (!scene || expressIDs.length === 0) return;
    const camera = scene.activeCamera as ArcRotateCamera | null;
    if (!camera) return;

    const targetIDs = new Set(expressIDs);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let hasBounds = false;

    targetIDs.forEach((expressID) => {
      const bounds = elementBoundsRef.current.get(expressID);
      if (!bounds) return;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      minZ = Math.min(minZ, bounds.minZ);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
      maxZ = Math.max(maxZ, bounds.maxZ);
      hasBounds = true;
    });

    if (!hasBounds) {
      scene.meshes.forEach((mesh) => {
        const meshExpressIDs = getMeshElementExpressIDs(mesh);
        if (meshExpressIDs.length === 0 || !meshExpressIDs.some((expressID) => targetIDs.has(expressID))) return;
        const boundingInfo = mesh.getBoundingInfo();
        if (!boundingInfo) return;
        const min = boundingInfo.boundingBox.minimumWorld;
        const max = boundingInfo.boundingBox.maximumWorld;
        minX = Math.min(minX, min.x);
        minY = Math.min(minY, min.y);
        minZ = Math.min(minZ, min.z);
        maxX = Math.max(maxX, max.x);
        maxY = Math.max(maxY, max.y);
        maxZ = Math.max(maxZ, max.z);
        hasBounds = true;
      });
    }

    if (!hasBounds) return;
    const center = new Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
    const diagonal = Math.max(size.length(), 0.5);
    const nextRadius = diagonal * 1.6;

    camera.target.copyFrom(center);
    if (camera.lowerRadiusLimit !== null && camera.lowerRadiusLimit !== undefined) {
      camera.radius = Math.max(nextRadius, camera.lowerRadiusLimit);
    } else {
      camera.radius = nextRadius;
    }
  }, []);

  const saveCurrentView = useCallback((): boolean => {
    const scene = sceneRef.current;
    if (!scene) return false;
    const camera = scene.activeCamera as ArcRotateCamera | null;
    if (!camera) return false;
    savedViewRef.current = {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: camera.target.clone(),
    };
    return true;
  }, []);

  const restoreSavedView = useCallback((): boolean => {
    const scene = sceneRef.current;
    if (!scene || !savedViewRef.current) return false;
    const camera = scene.activeCamera as ArcRotateCamera | null;
    if (!camera) return false;
    const snap = savedViewRef.current;
    camera.alpha = snap.alpha;
    camera.beta = snap.beta;
    camera.radius = snap.radius;
    camera.target.copyFrom(snap.target);
    return true;
  }, []);

  const getHighlightedExpressID = useCallback((): number | null => {
    return pickingManagerRef.current?.getCurrentHighlightedExpressID() ?? null;
  }, []);

  const exportCurrentGlb = useCallback(async (expressIDs?: number[]): Promise<boolean> => {
    const scene = sceneRef.current;
    if (!scene) return false;
    const selectedSet = Array.isArray(expressIDs) ? new Set(expressIDs) : null;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `ifc-selection-${timestamp}.glb`;

    try {
      const gltf = await GLTF2Export.GLBAsync(scene, fileName, {
        shouldExportNode: (node) => {
          const candidate = node as unknown as {
            metadata?: {
              expressID?: unknown;
              elementRanges?: Array<{ expressID?: unknown }>;
            };
            isEnabled?: () => boolean;
            isVisible?: boolean;
          };
          const directExpressID =
            typeof candidate.metadata?.expressID === "number" && candidate.metadata.expressID >= 0
              ? candidate.metadata.expressID
              : null;
          const meshExpressIDs =
            directExpressID !== null
              ? [directExpressID]
              : Array.isArray(candidate.metadata?.elementRanges)
                ? candidate.metadata.elementRanges
                    .map((range) =>
                      typeof range?.expressID === "number" && range.expressID >= 0 ? range.expressID : null,
                    )
                    .filter((expressID): expressID is number => expressID !== null)
                : [];
          if (meshExpressIDs.length === 0) return false;
          if (selectedSet) return meshExpressIDs.some((expressID) => selectedSet.has(expressID));
          const enabled = typeof candidate.isEnabled === "function" ? candidate.isEnabled() : true;
          return enabled && candidate.isVisible !== false;
        },
      });

      const files = gltf.glTFFiles as Record<string, Blob>;
      const glbEntry = Object.entries(files).find(([name]) => name.toLowerCase().endsWith(".glb"));
      if (!glbEntry) return false;

      const [, blob] = glbEntry;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      console.error("Failed to export GLB:", error);
      return false;
    }
  }, []);

// Function to load IFC file
  const loadIfcFile = useCallback(async (file: File | string) => {
    if (!loaderRef.current || !sceneRef.current) {
      setError('IFC loader not initialized')
      return
    }

    setIsLoading(true)
    setLoadingProgressText("0% Starting");
    setError(null)

    // Clear any existing element selection and highlights immediately
    // This ensures the Element Info panel doesn't persist from previous model
    if (onElementPickedRef.current) {
      onElementPickedRef.current(null);
    }

    try {
      const sourceFileName =
        typeof file === "string" ? file.split(/[\\/]/).pop() || file : file.name;
      const sourceFileSizeBytes = typeof file === "string" ? null : file.size;

      // Dispose previous model
      if (sceneRef.current) {
        disposeIfcModel(sceneRef.current)
      }
      disposeFilteredRoot()
      baseRootRef.current = null
      elementBoundsRef.current = new Map()
      
      // Close previous IFC model
      if (modelRef.current && loaderRef.current && modelRef.current.modelID >= 0) {
        await loaderRef.current.closeIfcModel(modelRef.current.modelID)
        modelRef.current = null
      }

      if (pickingManagerRef.current) {
        pickingManagerRef.current.dispose()
        pickingManagerRef.current = null
      }

      // Keep per-element meshes so isolate/filter workflows remain correct with the prepared loader.
      const model = await loaderRef.current.loadPreparedIfcModel(file, {
        coordinateToOrigin: true,
        verbose: false,
        keepModelOpen: true,
        onProgress: (event) => {
          setLoadingProgressText(formatLoadProgress(event));
        },
      }, {
        generateNormals: false,
        includeElementMap: true,
        maxTrianglesPerMesh: meshChunkSize,
        maxVerticesPerMesh: resolveMaxVerticesPerMesh(meshChunkSize),
        autoMergeStrategy: resolveAutoMergeStrategy(mergePreset, largeModelThreshold),
      })
      if (model.modelID < 0) {
        throw new Error('Prepared IFC model is not open for interactive queries')
      }
      modelRef.current = model

      // Get project info
      setLoadingProgressText("90% Reading model metadata");
      const projectInfo = await loaderRef.current.getProjectInfo(model.modelID)
      const modelMetadata = await loaderRef.current.getModelMetadata(model.modelID)
      console.log('Project info:', projectInfo)

      // Build Babylon.js scene (materials handled by babylon-ifc-loader)
      setLoadingProgressText("95% Building Babylon meshes");
      const currentScene = sceneRef.current
      const { meshes, rootNode } = buildIfcModel(model, currentScene, {
        autoCenter: true,
        mergeMeshes: true,
        doubleSided: true,
        generateNormals: false,
        verbose: false,
        freezeAfterBuild: true,
        usePBRMaterials: false,
      })
      baseRootRef.current = rootNode
      rootNode.computeWorldMatrix(true)
      const boundsByExpressID = transformBoundsMap(model.boundsByExpressID, rootNode.getWorldMatrix())
      elementBoundsRef.current = boundsByExpressID

      // Position camera to fit model
      const bounds = getModelBounds(meshes)
      if (bounds) {
        const camera = sceneRef.current.activeCamera as ArcRotateCamera
        if (camera) {
          camera.target = bounds.center
          camera.radius = bounds.diagonal * 1.5
        }
      }

      // Notify parent component with metadata returned from the worker-owned IFC model.
      if (onModelLoadedRef.current && loaderRef.current) {
        const dimensionsByExpressID = buildDimensionsMapFromBounds(boundsByExpressID);
        onModelLoadedRef.current({
          projectInfo,
          modelID: model.modelID,
          ifcGlobalId: modelMetadata.ifcGlobalId || `model_${model.modelID}`,
          ifcSchema: modelMetadata.ifcSchema,
          partCount: model.sourcePartCount,
          meshCount: meshes.length,
          ifcMaterials: readIfcMaterials(modelMetadata.ifcMaterials, meshes),
          loader: loaderRef.current,
          projectTreeIndex: modelMetadata.projectTreeIndex,
          boundsByExpressID,
          dimensionsByExpressID,
          lengthUnitSymbol: modelMetadata.lengthUnit.symbol,
          sourceFileName,
          sourceFileSizeBytes,
          axisRanges: buildAxisRanges(meshes),
        })
      }

      // Setup picking handler
      setLoadingProgressText("99% Finalizing scene");
      if (loaderRef.current && sceneRef.current) {
        pickingManagerRef.current = setupPickingHandler(sceneRef.current, loaderRef.current, {
          highlightColor: toColor3(highlightColor),
          onElementPicked: (data) => {
            if (onElementPickedRef.current) {
              const pickBounds = elementBoundsRef.current.get(data.expressID);
              onElementPickedRef.current(pickBounds ? { ...data, bounds: pickBounds } : data);
            }
            console.log("Picked element:", data);
          },
          // Keep panel open when clicking outside model; only close via close icon or model reload.
        });
      }

      console.log(`✓ IFC model loaded: ${meshes.length} meshes`)
    } catch (err) {
      console.error('Failed to load IFC:', err)
      setError(err instanceof Error ? err.message : 'Failed to load IFC file')
      if (onModelLoadedRef.current) {
        onModelLoadedRef.current(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [disposeFilteredRoot, highlightColor, largeModelThreshold, mergePreset, meshChunkSize])

  // Handle file input
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      loadIfcFile(file)
    }
  }, [loadIfcFile])

  // Handle drag and drop
  const handleDrop = useCallback((event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file && file.name.toLowerCase().endsWith('.ifc')) {
      loadIfcFile(file)
    }
  }, [loadIfcFile])

  const handleDragOver = useCallback((event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault()
  }, [])

  // Expose loadIfcFile function globally for parent components
  useEffect(() => {
    window.loadIfcFile = loadIfcFile
    return () => {
      delete window.loadIfcFile
    }
  }, [loadIfcFile])

  useEffect(() => {
    window.fitToExpressIDs = fitToExpressIDs;
    return () => {
      delete window.fitToExpressIDs;
    };
  }, [fitToExpressIDs]);

  useEffect(() => {
    window.saveCurrentView = saveCurrentView;
    window.restoreSavedView = restoreSavedView;
    return () => {
      delete window.saveCurrentView;
      delete window.restoreSavedView;
    };
  }, [restoreSavedView, saveCurrentView]);

  useEffect(() => {
    window.getHighlightedExpressID = getHighlightedExpressID;
    return () => {
      delete window.getHighlightedExpressID;
    };
  }, [getHighlightedExpressID]);

  useEffect(() => {
    window.exportCurrentGlb = exportCurrentGlb;
    return () => {
      delete window.exportCurrentGlb;
    };
  }, [exportCurrentGlb]);

  // Auto-load sample.ifc when WebIFC is ready
  useEffect(() => {
    if (!ifcReady || !sceneRef.current || hasAutoLoadedSampleRef.current) return;
    hasAutoLoadedSampleRef.current = true;
    void loadIfcFile('./sample.ifc');
  }, [ifcReady, loadIfcFile])

return (
    <div className="babylon-scene-container">
      <canvas
        ref={canvasRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ width: '100%', height: '100%', outline: 'none' }}
      />
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <span>Loading IFC model...</span>
          <div className="loading-progress">{loadingProgressText}</div>
        </div>
      )}
      {error && (
        <div className="error-overlay">
          <span>{error}</span>
        </div>
      )}
      <input
        type="file"
        id="ifc-file-input"
        accept=".ifc"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default BabylonScene
