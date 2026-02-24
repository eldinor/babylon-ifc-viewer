import { useEffect, useRef, useState, useCallback, useImperativeHandle } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color3,
} from "@babylonjs/core";
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

/**
 * Data passed to parent when an IFC model is loaded
 */
export interface IfcModelData {
  projectInfo: ProjectInfoResult | null;
  modelID: number;
  ifcGlobalId: string; // GlobalId from IFC file
  storeyMap: Map<number, number>;
  ifcAPI: WebIFC.IfcAPI;
}

/**
 * Handle exposed by BabylonScene to parent components
 */
export interface BabylonSceneHandle {
  loadIfcFile: (file: File | string) => Promise<void>;
}

interface BabylonSceneProps {
  onModelLoaded?: (modelData: IfcModelData | null) => void;
  /** Storey map from model data for filtering meshes */
  storeyMap?: Map<number, number>;
  /** Site expressID for filtering site mesh */
  siteExpressId?: number | null;
  /** Set of storey IDs that should be visible (null = all visible) */
  visibleStoreyIds?: Set<number> | null;
  /** Whether the site should be visible */
  isSiteVisible?: boolean;
  /** Callback when an IFC element is picked */
  onElementPicked?: (data: ElementPickData | null) => void;
  /** Ref to expose loadIfcFile to parent */
  ref?: React.Ref<BabylonSceneHandle>;
}

function BabylonScene({ onModelLoaded, storeyMap, siteExpressId, visibleStoreyIds, isSiteVisible, onElementPicked, ref }: BabylonSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const ifcAPIRef = useRef<WebIFC.IfcAPI | null>(null);
  const modelRef = useRef<RawIfcModel | null>(null);
  const pickingManagerRef = useRef<PickingManager | null>(null);

  // Store callbacks in refs so loadIfcFile doesn't get recreated when they change
  const onModelLoadedRef = useRef(onModelLoaded);
  onModelLoadedRef.current = onModelLoaded;
  const onElementPickedRef = useRef(onElementPicked);
  onElementPickedRef.current = onElementPicked;

  const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [ifcReady, setIfcReady] = useState(false);

// Effect to show/hide meshes based on visible storeys
  useEffect(() => {
    if (!sceneRef.current) return;

    const meshes = sceneRef.current.meshes;
    let visibleCount = 0;
    let hiddenCount = 0;

    meshes.forEach((mesh) => {
      if (mesh.metadata?.expressID !== undefined) {
        const meshStoreyId = storeyMap?.get(mesh.metadata.expressID);

        // Determine visibility based on visibleStoreyIds
        let shouldShow = true;

        // Check if this is a site mesh
        const isSiteMesh = siteExpressId !== null && siteExpressId !== undefined && mesh.metadata.expressID === siteExpressId;
        
        if (isSiteMesh) {
          // Site mesh: use isSiteVisible
          shouldShow = isSiteVisible !== false;
        } else if (meshStoreyId !== undefined) {
          // Regular mesh with storey assignment
          if (visibleStoreyIds === null || visibleStoreyIds === undefined) {
            // All visible mode
            shouldShow = true;
          } else {
            // Only show if storey is in visible set
            shouldShow = visibleStoreyIds.has(meshStoreyId);
          }
        } else {
          // Mesh without storey assignment - show in all visible mode or when site is selected (empty set)
          shouldShow = visibleStoreyIds === null || visibleStoreyIds === undefined || (visibleStoreyIds && visibleStoreyIds.size === 0);
        }

        mesh.isVisible = shouldShow;
        mesh.setEnabled(shouldShow);

        if (shouldShow) {
          visibleCount++;
        } else {
          hiddenCount++;
        }
      }
    });

    console.log(`Spatial filter: ${visibleCount} visible, ${hiddenCount} hidden (visible storeys: ${visibleStoreyIds === null ? 'all' : visibleStoreyIds?.size ?? 0})`);
  }, [storeyMap, siteExpressId, visibleStoreyIds, isSiteVisible]);

  // Initialize engine and scene
  useEffect(() => {
    console.log("[v0] Engine init effect: canvas=", !!canvasRef.current)
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

    // Handle resize via ResizeObserver on container (responds to sidebar collapse, window resize, etc.)
    const container = containerRef.current
    let resizeObserver: ResizeObserver | null = null
    if (container) {
      resizeObserver = new ResizeObserver(() => {
        engine.resize()
      })
      resizeObserver.observe(container)
    }

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
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      
      // Dispose picking manager
      if (pickingManagerRef.current) {
        pickingManagerRef.current.dispose();
        pickingManagerRef.current = null;
      }

      // Dispose IFC model if loaded
      if (sceneRef.current) {
        disposeIfcModel(sceneRef.current)
      }
      
      // Close IFC model
      if (ifcAPIRef.current && modelRef.current) {
        closeIfcModel(ifcAPIRef.current, modelRef.current.modelID)
      }
      
      engine.dispose()
    }
  }, [])

// Function to load IFC file
  const loadIfcFile = useCallback(async (file: File | string) => {
    console.log("[v0] loadIfcFile called with:", typeof file === 'string' ? file : file.name)
    console.log("[v0] ifcAPI:", !!ifcAPIRef.current, "scene:", !!sceneRef.current)
    if (!ifcAPIRef.current || !sceneRef.current) {
      console.log("[v0] ERROR: IFC loader not initialized")
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

    // Dispose previous picking manager to prevent stacking observers
    if (pickingManagerRef.current) {
      pickingManagerRef.current.dispose();
      pickingManagerRef.current = null;
    }

    try {
      // Dispose previous model
      if (sceneRef.current) {
        disposeIfcModel(sceneRef.current)
      }
      
      // Close previous IFC model
      if (modelRef.current && ifcAPIRef.current) {
        closeIfcModel(ifcAPIRef.current, modelRef.current.modelID)
        modelRef.current = null
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
        onModelLoadedRef.current({
          projectInfo,
          modelID: model.modelID,
          ifcGlobalId,
          storeyMap: model.storeyMap,
          ifcAPI: ifcAPIRef.current,
        })
      }

// Setup picking handler
      if (ifcAPIRef.current && sceneRef.current) {
        pickingManagerRef.current = setupPickingHandler(sceneRef.current, ifcAPIRef.current, {
          onElementPicked: (data) => {
            if (onElementPickedRef.current) {
              onElementPickedRef.current(data);
            }
            console.log("Picked element:", data);
          },
          onClear: () => {
            if (onElementPickedRef.current) {
              onElementPickedRef.current(null);
            }
            console.log("Highlight cleared");
          },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Expose loadIfcFile to parent via ref
  useImperativeHandle(ref, () => ({
    loadIfcFile,
  }), [loadIfcFile])

  // Auto-load sample.ifc when WebIFC is ready
  useEffect(() => {
    console.log("[v0] Auto-load effect: ifcReady=", ifcReady, "ifcAPI=", !!ifcAPIRef.current, "scene=", !!sceneRef.current)
    if (ifcReady && ifcAPIRef.current && sceneRef.current) {
      console.log("[v0] Calling loadIfcFile('./sample.ifc')")
      loadIfcFile('./sample.ifc')
    }
  }, [ifcReady, loadIfcFile])

return (
    <div ref={containerRef} className="babylon-scene-container">
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
    </div>
  )
}

export default BabylonScene
