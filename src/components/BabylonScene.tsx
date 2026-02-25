import { useEffect, useRef, useState, useCallback } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color3,
  Color4,
  Plane,
  Material,
} from "@babylonjs/core";
import type { SectionAxis } from "../types/app";
import {
  initializeWebIFC,
  loadIfcModel,
  closeIfcModel,
  getProjectInfo,
  buildIfcModel,
  disposeIfcModel,
  getModelBounds,
} from "babylon-ifc-loader";
import type { RawIfcModel, ProjectInfoResult } from "babylon-ifc-loader";
import * as WebIFC from "web-ifc";
import { setupPickingHandler, type ElementPickData, type PickingManager } from "../utils/pickingUtils";
import { getIfcLengthUnitInfo } from "../utils/ifcUnits";

/**
 * Data passed to parent when an IFC model is loaded
 */
export interface IfcModelData {
  projectInfo: ProjectInfoResult | null;
  modelID: number;
  ifcGlobalId: string; // GlobalId from IFC file
  ifcAPI: WebIFC.IfcAPI;
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

interface BabylonSceneProps {
  onModelLoaded?: (modelData: IfcModelData | null) => void;
  /** Explicit element express IDs visibility filter (overrides storey/site filters when set) */
  visibleExpressIDs?: Set<number> | null;
  /** Callback when an IFC element is picked */
  onElementPicked?: (data: ElementPickData | null) => void;
  sceneBackgroundColor?: string;
  highlightColor?: string;
  sectionState?: { enabled: boolean; axis: SectionAxis; position: number | null };
}

function toColor4(hex: string): Color4 {
  return Color4.FromHexString(`${hex}ff`);
}

function toColor3(hex: string): Color3 {
  return Color3.FromHexString(hex);
}

interface CameraViewSnapshot {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}

function getMeshExpressID(mesh: Scene["meshes"][number]): number | null {
  const metadata = mesh.metadata as { expressID?: unknown } | null;
  return typeof metadata?.expressID === "number" ? metadata.expressID : null;
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

function BabylonScene({
  onModelLoaded,
  visibleExpressIDs,
  onElementPicked,
  sceneBackgroundColor = "#1b043e",
  highlightColor = "#008080",
  sectionState,
}: BabylonSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const ifcAPIRef = useRef<WebIFC.IfcAPI | null>(null);
  const modelRef = useRef<RawIfcModel | null>(null);
  const pickingManagerRef = useRef<PickingManager | null>(null);
  const savedViewRef = useRef<CameraViewSnapshot | null>(null);
  const onModelLoadedRef = useRef<typeof onModelLoaded>(onModelLoaded);
  const onElementPickedRef = useRef<typeof onElementPicked>(onElementPicked);
  const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [ifcReady, setIfcReady] = useState(false);

  useEffect(() => {
    onModelLoadedRef.current = onModelLoaded;
  }, [onModelLoaded]);

  useEffect(() => {
    onElementPickedRef.current = onElementPicked;
  }, [onElementPicked]);

  const buildDimensionsMap = useCallback((meshes: Scene["meshes"]) => {
    const map = new Map<number, { length: number; width: number; height: number; elevation: number }>();
    meshes.forEach((mesh) => {
      const metadata = mesh.metadata as { expressID?: unknown } | null;
      const expressID = typeof metadata?.expressID === "number" ? metadata.expressID : null;
      if (expressID === null || map.has(expressID)) return;
      const boundingInfo = mesh.getBoundingInfo();
      if (!boundingInfo) return;
      const ext = boundingInfo.boundingBox.extendSizeWorld;
      const center = boundingInfo.boundingBox.centerWorld;
      const length = ext.x * 2;
      const width = ext.y * 2;
      const height = ext.z * 2;
      const elevation = center.y;
      if ([length, width, height, elevation].every(Number.isFinite)) {
        map.set(expressID, { length, width, height, elevation });
      }
    });
    return map;
  }, []);

// Effect to show/hide meshes based on project tree subtree selection
  useEffect(() => {
    if (!sceneRef.current) return;

    const meshes = sceneRef.current.meshes;
    let visibleCount = 0;
    let hiddenCount = 0;

    meshes.forEach((mesh) => {
      const expressID = mesh.metadata?.expressID;
      const shouldShow = visibleExpressIDs && expressID !== undefined ? visibleExpressIDs.has(expressID) : true;
      mesh.isVisible = shouldShow;
      mesh.setEnabled(shouldShow);

      if (shouldShow) {
        visibleCount++;
      } else {
        hiddenCount++;
      }
    });

    console.log(
      `Spatial filter: ${visibleCount} visible, ${hiddenCount} hidden (project subtree: ${visibleExpressIDs ? visibleExpressIDs.size : "off"})`,
    );
  }, [visibleExpressIDs]);

  // Initialize engine and scene
  useEffect(() => {
    if (!canvasRef.current) return

    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    })
    engineRef.current = engine

    const scene = new Scene(engine)
    sceneRef.current = scene

    // Create camera
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 2.5,
      10,
      Vector3.Zero(),
      scene
    )
    camera.attachControl(canvasRef.current, true)
    camera.lowerRadiusLimit = 1
    camera.upperRadiusLimit = 500
    camera.wheelPrecision = 10

    // Create lights for PBR
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)
    light.intensity = 0.8
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
    let resizeTimeoutId: number | undefined
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeoutId !== undefined) {
        window.clearTimeout(resizeTimeoutId)
      }
      // Avoid resizing every frame during sidebar width transition.
      resizeTimeoutId = window.setTimeout(() => {
        engine.resize()
      }, 120)
    })
    resizeObserver.observe(canvasRef.current)

    // Initialize WebIFC
    const initIfc = async () => {
      try {
        const ifcAPI = await initializeWebIFC('./', WebIFC.LogLevel.LOG_LEVEL_ERROR)
        ifcAPIRef.current = ifcAPI
        console.log('✓ WebIFC initialized')
        setIfcReady(true)
      } catch (err) {
        console.error('Failed to initialize WebIFC:', err)
        setError('Failed to initialize IFC loader')
      }
    }
    initIfc()

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      if (resizeTimeoutId !== undefined) {
        window.clearTimeout(resizeTimeoutId)
      }
      
      // Dispose IFC model if loaded
      if (sceneRef.current) {
        disposeIfcModel(sceneRef.current)
      }

      if (pickingManagerRef.current) {
        pickingManagerRef.current.dispose()
        pickingManagerRef.current = null
      }
      
      // Close IFC model
      if (ifcAPIRef.current && modelRef.current) {
        closeIfcModel(ifcAPIRef.current, modelRef.current.modelID)
      }
      
      engine.dispose()
    }
  }, [])

  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.clearColor = toColor4(sceneBackgroundColor);
  }, [sceneBackgroundColor]);

  useEffect(() => {
    if (!pickingManagerRef.current) return;
    pickingManagerRef.current.setHighlightOptions({ highlightColor: toColor3(highlightColor) });
  }, [highlightColor]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!sectionState?.enabled || sectionState.position === null) {
      scene.clipPlane = null;
    } else if (sectionState.axis === "x") {
      scene.clipPlane = new Plane(1, 0, 0, -sectionState.position);
    } else if (sectionState.axis === "y") {
      scene.clipPlane = new Plane(0, 1, 0, -sectionState.position);
    } else {
      scene.clipPlane = new Plane(0, 0, 1, -sectionState.position);
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

    scene.meshes.forEach((mesh) => {
      const expressID = getMeshExpressID(mesh);
      if (expressID === null || !targetIDs.has(expressID)) return;
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

// Function to load IFC file
  const loadIfcFile = useCallback(async (file: File | string) => {
    if (!ifcAPIRef.current || !sceneRef.current) {
      setError('IFC loader not initialized')
      return
    }

    setIsLoading(true)
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
      
      // Close previous IFC model
      if (modelRef.current && ifcAPIRef.current) {
        closeIfcModel(ifcAPIRef.current, modelRef.current.modelID)
        modelRef.current = null
      }

      if (pickingManagerRef.current) {
        pickingManagerRef.current.dispose()
        pickingManagerRef.current = null
      }

      // Load IFC model
      const model = await loadIfcModel(ifcAPIRef.current, file, {
        coordinateToOrigin: true,
        verbose: false,
      })
      modelRef.current = model

      // Get project info
      const projectInfo = getProjectInfo(ifcAPIRef.current, model.modelID)
      console.log('Project info:', projectInfo)

      // Build Babylon.js scene (materials handled by babylon-ifc-loader)
      const currentScene = sceneRef.current
      const { meshes } = buildIfcModel(model, currentScene, {
        autoCenter: true,
        mergeMeshes: true,
        doubleSided: true,
        generateNormals: false,
        verbose: false,
        freezeAfterBuild: true,
      })

      // Position camera to fit model
      const bounds = getModelBounds(meshes)
      if (bounds) {
        const camera = sceneRef.current.activeCamera as ArcRotateCamera
        if (camera) {
          camera.target = bounds.center
          camera.radius = bounds.diagonal * 1.5
        }
      }

// Extract IFC GlobalId from IFCProject entity
      let ifcGlobalId = "";
      try {
        // Get all IFCPROJECT elements
        const projectIDs = ifcAPIRef.current.GetLineIDsWithType(model.modelID, WebIFC.IFCPROJECT);
        if (projectIDs.size() > 0) {
          const projectID = projectIDs.get(0);
          const projectData = ifcAPIRef.current.GetLine(model.modelID, projectID, true);
          ifcGlobalId = projectData.GlobalId?.value || "";
        }
      } catch (error) {
        console.warn('Failed to extract IFC GlobalId:', error);
        ifcGlobalId = `model_${model.modelID}`;
      }

// Notify parent component with full model data
      if (onModelLoadedRef.current && ifcAPIRef.current) {
        const dimensionsByExpressID = buildDimensionsMap(meshes);
        const lengthUnit = getIfcLengthUnitInfo(ifcAPIRef.current, model.modelID);
        onModelLoadedRef.current({
          projectInfo,
          modelID: model.modelID,
          ifcGlobalId,
          ifcAPI: ifcAPIRef.current,
          dimensionsByExpressID,
          lengthUnitSymbol: lengthUnit.symbol,
          sourceFileName,
          sourceFileSizeBytes,
          axisRanges: buildAxisRanges(meshes),
        })
      }

      // Setup picking handler
      if (ifcAPIRef.current && sceneRef.current) {
        pickingManagerRef.current = setupPickingHandler(sceneRef.current, ifcAPIRef.current, {
          highlightColor: toColor3(highlightColor),
          onElementPicked: (data) => {
            if (onElementPickedRef.current) {
              onElementPickedRef.current(data);
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
  }, [buildDimensionsMap, highlightColor])

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

  // Auto-load sample.ifc when WebIFC is ready
  useEffect(() => {
    if (ifcReady && ifcAPIRef.current && sceneRef.current) {
      loadIfcFile('./sample.ifc')
    }
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
