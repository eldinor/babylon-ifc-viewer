import { useEffect, useRef, useState, useCallback } from "react";
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
import {
  setupPickingHandler,
  type PickingManager,
  type PickingOptions,
  type ElementPickData,
} from "../utils/pickingUtils";

/**
 * Data passed to parent when an IFC model is loaded
 */
export interface IfcModelData {
  projectInfo: ProjectInfoResult | null;
  modelID: number;
  storeyMap: Map<number, number>;
  ifcAPI: WebIFC.IfcAPI;
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
  /** Options for mesh picking/highlighting */
  pickingOptions?: PickingOptions;
  /** Callback when an IFC element is picked */
  onElementPicked?: (data: ElementPickData) => void;
}

function BabylonScene({
  onModelLoaded,
  storeyMap,
  siteExpressId,
  visibleStoreyIds,
  isSiteVisible,
  pickingOptions,
  onElementPicked,
}: BabylonSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const ifcAPIRef = useRef<WebIFC.IfcAPI | null>(null);
  const modelRef = useRef<RawIfcModel | null>(null);
  const pickingManagerRef = useRef<PickingManager | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          // Mesh without storey assignment - show in all visible mode
          shouldShow = visibleStoreyIds === null || visibleStoreyIds === undefined;
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

    console.log(`Spatial filter: ${visibleCount} visible, ${hiddenCount} hidden (visible storeys: ${visibleStoreyIds == null ? 'all' : visibleStoreyIds.size})`);
  }, [storeyMap, siteExpressId, visibleStoreyIds, isSiteVisible]);

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

    // Initialize WebIFC
    const initIfc = async () => {
      try {
        const ifcAPI = await initializeWebIFC('./', WebIFC.LogLevel.LOG_LEVEL_ERROR)
        ifcAPIRef.current = ifcAPI
        console.log('✓ WebIFC initialized')
        
        // Setup picking handler
        if (sceneRef.current) {
          pickingManagerRef.current = setupPickingHandler(sceneRef.current, ifcAPI, {
            ...pickingOptions,
            onElementPicked: (data: ElementPickData) => {
              console.log(`🎯 Picked: ${data.typeName} - ${data.elementName} (ID: ${data.expressID})`)
              onElementPicked?.(data)
            },
          })
          console.log('✓ Picking handler initialized')
        }
      } catch (err) {
        console.error('Failed to initialize WebIFC:', err)
        setError('Failed to initialize IFC loader')
      }
    }
    initIfc()

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      
      // Dispose picking manager
      if (pickingManagerRef.current) {
        pickingManagerRef.current.dispose()
        pickingManagerRef.current = null
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
  }, [pickingOptions, onElementPicked])

  // Function to load IFC file
  const loadIfcFile = useCallback(async (file: File | string) => {
    if (!ifcAPIRef.current || !sceneRef.current) {
      setError('IFC loader not initialized')
      return
    }

    setIsLoading(true)
    setError(null)

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

      // Notify parent component with full model data
      if (onModelLoaded && ifcAPIRef.current) {
        onModelLoaded({
          projectInfo,
          modelID: model.modelID,
          storeyMap: model.storeyMap,
          ifcAPI: ifcAPIRef.current,
        })
      }

      console.log(`✓ IFC model loaded: ${meshes.length} meshes`)
    } catch (err) {
      console.error('Failed to load IFC:', err)
      setError(err instanceof Error ? err.message : 'Failed to load IFC file')
      if (onModelLoaded) {
        onModelLoaded(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [onModelLoaded])

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
    const win = window as unknown as { loadIfcFile?: (file: File | string) => Promise<void> }
    win.loadIfcFile = loadIfcFile
    return () => {
      delete win.loadIfcFile
    }
  }, [loadIfcFile])

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