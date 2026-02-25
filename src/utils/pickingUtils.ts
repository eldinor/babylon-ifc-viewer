import { Scene, AbstractMesh, Color3, PointerEventTypes } from "@babylonjs/core";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { Observer } from "@babylonjs/core/Misc/observable";
import * as WebIFC from "web-ifc";

interface IfcElement {
  type?: number;
  Name?: { value?: string };
  [key: string]: unknown;
}

interface IfcMeshMetadata {
  expressID: number;
  modelID: number;
}

function isIfcMeshMetadata(metadata: unknown): metadata is IfcMeshMetadata {
  if (!metadata || typeof metadata !== "object") return false;
  const candidate = metadata as Partial<IfcMeshMetadata>;
  return Number.isFinite(candidate.expressID) && Number.isFinite(candidate.modelID);
}

/**
 * Information about a picked IFC element
 */
export interface ElementPickData {
  mesh: AbstractMesh;
  expressID: number;
  modelID: number;
  typeName: string;
  elementName: string;
  element: IfcElement;
}

/**
 * Options for picking configuration
 */
export interface PickingOptions {
  highlightColor?: Color3;
  highlightAlpha?: number;
  onElementPicked?: (data: ElementPickData) => void;
  onClear?: () => void;
}

/**
 * Class to manage picking and highlighting of IFC elements
 */
export class PickingManager {
  private scene: Scene;
  private ifcAPI: WebIFC.IfcAPI;
  private currentHighlightedMesh: AbstractMesh | null = null;
  private options: PickingOptions;
  private pointerObserver: Observer<PointerInfo> | null = null;

  constructor(scene: Scene, ifcAPI: WebIFC.IfcAPI, options?: PickingOptions) {
    this.scene = scene;
    this.ifcAPI = ifcAPI;
    this.options = {
      highlightColor: Color3.Teal(),
      highlightAlpha: 0.3,
      ...options,
    };

    this.setupPointerEvents();
  }

  /**
   * Setup pointer event handling
   */
  private setupPointerEvents(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      const evt = pointerInfo.event;
      const pickResult = pointerInfo.pickInfo;

      // Only handle left click
      if (evt.button !== 0) return;

      if (pickResult?.hit && pickResult.pickedMesh) {
        this.handleMeshClick(pickResult.pickedMesh);
      } else {
        this.clearHighlight();
      }
    }, PointerEventTypes.POINTERDOWN);
  }

  /**
   * Handle mesh click event
   */
  private handleMeshClick(mesh: AbstractMesh): void {
    const metadata = mesh.metadata as unknown;

    if (isIfcMeshMetadata(metadata)) {
      const expressID = metadata.expressID;
      const modelID = metadata.modelID;

      try {
        // Fetch full element data
        const element = this.ifcAPI.GetLine(modelID, expressID, true) as IfcElement;
        const typeName =
          typeof element.type === "number" ? this.ifcAPI.GetNameFromTypeCode(element.type) : "Unknown";
        const elementName = element.Name?.value || "Unnamed";

        // Remove previous highlight
        this.clearHighlight();

        // Add overlay to picked mesh
        mesh.renderOverlay = true;
        mesh.overlayColor = this.options.highlightColor!;
        mesh.overlayAlpha = this.options.highlightAlpha!;
        this.currentHighlightedMesh = mesh;

        // Trigger callback if provided
        if (this.options.onElementPicked) {
          this.options.onElementPicked({
            mesh,
            expressID,
            modelID,
            typeName,
            elementName,
            element,
          });
        }
      } catch (error) {
        console.error("Failed to get element data:", error);
        this.clearHighlight();
      }
    } else {
      // Clicked on mesh without IFC metadata
      this.clearHighlight();
    }
  }

  /**
   * Highlight a specific mesh
   */
  highlightMesh(mesh: AbstractMesh, options?: PickingOptions): void {
    // Clear current highlight
    this.clearHighlight();

    const metadata = mesh.metadata as unknown;

    if (isIfcMeshMetadata(metadata)) {
      // Apply highlight
      mesh.renderOverlay = true;
      mesh.overlayColor = options?.highlightColor || this.options.highlightColor!;
      mesh.overlayAlpha = options?.highlightAlpha || this.options.highlightAlpha!;
      this.currentHighlightedMesh = mesh;
    }
  }

  /**
   * Clear current highlight
   */
  clearHighlight(): void {
    if (this.currentHighlightedMesh) {
      this.currentHighlightedMesh.renderOverlay = false;
      this.currentHighlightedMesh = null;

      // Trigger callback if provided
      if (this.options.onClear) {
        this.options.onClear();
      }
    }
  }

  /**
   * Set highlight options
   */
  setHighlightOptions(options: PickingOptions): void {
    this.options = { ...this.options, ...options };

    // Update current highlight if exists
    if (this.currentHighlightedMesh) {
      this.currentHighlightedMesh.overlayColor = this.options.highlightColor!;
      this.currentHighlightedMesh.overlayAlpha = this.options.highlightAlpha!;
    }
  }

  /**
   * Get current highlighted mesh
   */
  getCurrentHighlightedMesh(): AbstractMesh | null {
    return this.currentHighlightedMesh;
  }

  /**
   * Dispose pointer observer and clear active highlight
   */
  dispose(): void {
    this.clearHighlight();
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
  }
}

/**
 * Setup picking handler for IFC elements
 */
export function setupPickingHandler(scene: Scene, ifcAPI: WebIFC.IfcAPI, options?: PickingOptions): PickingManager {
  return new PickingManager(scene, ifcAPI, options);
}
