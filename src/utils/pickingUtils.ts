/**
 * Picking Utility Functions
 *
 * Helper functions for mesh picking and highlighting in Babylon.js scenes.
 * Supports both generic mesh highlighting and IFC element picking.
 */

import { Scene, AbstractMesh, Color3 } from "@babylonjs/core";
import type { IfcAPI } from "web-ifc";
import { getElementInfo, type ElementInfo } from "./ifcUtils";

/**
 * Data passed to onElementPicked callback when an IFC element is picked
 */
export interface ElementPickData extends ElementInfo {
  /** The mesh that was picked */
  mesh: AbstractMesh;
  /** Model ID in web-ifc */
  modelID: number;
}

/**
 * Options for configuring the picking handler
 */
export interface PickingOptions {
  /** Color for highlight overlay (default: teal) */
  highlightColor?: Color3;
  /** Alpha for highlight overlay (default: 0.3) */
  highlightAlpha?: number;
  /** Callback when an IFC element is picked */
  onElementPicked?: (data: ElementPickData) => void;
  /** Callback when highlight is cleared */
  onClear?: () => void;
}

/**
 * Manager for mesh picking and highlighting
 *
 * Encapsulates state and behavior for picking meshes in a Babylon.js scene.
 * Supports highlighting picked meshes and retrieving IFC element data.
 */
export class PickingManager {
  private scene: Scene;
  private ifcAPI: IfcAPI | null;
  private currentHighlightedMesh: AbstractMesh | null = null;
  private options: Required<PickingOptions>;

  /**
   * Create a new PickingManager
   *
   * @param scene - Babylon.js scene
   * @param ifcAPI - web-ifc API instance (can be null for non-IFC picking)
   * @param options - Configuration options
   */
  constructor(scene: Scene, ifcAPI: IfcAPI | null, options: PickingOptions = {}) {
    this.scene = scene;
    this.ifcAPI = ifcAPI;
    this.options = {
      highlightColor: options.highlightColor ?? Color3.Teal(),
      highlightAlpha: options.highlightAlpha ?? 0.3,
      onElementPicked: options.onElementPicked ?? (() => {}),
      onClear: options.onClear ?? (() => {}),
    };
  }

  /**
   * Setup the pointer handler for picking
   * Call this once when the scene is ready
   */
  setupHandler(): void {
    this.scene.onPointerDown = (evt, pickResult) => {
      // Only handle left click
      if (evt.button !== 0) return;

      if (pickResult.hit && pickResult.pickedMesh) {
        this.handleMeshPick(pickResult.pickedMesh);
      } else {
        // Clicked outside the model - clear highlight
        this.clearHighlight();
      }
    };
  }

  /**
   * Handle picking a specific mesh
   *
   * @param mesh - The mesh that was picked
   */
  private handleMeshPick(mesh: AbstractMesh): void {
    const metadata = mesh.metadata;

    if (metadata && metadata.expressID !== undefined && metadata.modelID !== undefined) {
      // IFC element picked
      this.handleIfcElementPick(mesh, metadata.expressID, metadata.modelID);
    } else {
      // Non-IFC mesh picked - clear any existing highlight
      this.clearHighlight();
    }
  }

  /**
   * Handle picking an IFC element
   *
   * @param mesh - The mesh that was picked
   * @param expressID - Express ID of the IFC element
   * @param modelID - Model ID in web-ifc
   */
  private handleIfcElementPick(mesh: AbstractMesh, expressID: number, modelID: number): void {
    console.log(`\n🎯 Picked IFC Element:`);
    console.log(`  Mesh: ${mesh.name}`);
    console.log(`  Express ID: ${expressID}`);
    console.log(`  Model ID: ${modelID}`);

    if (this.ifcAPI) {
      try {
        // Get extended element info using ifcUtils
        const elementInfo = getElementInfo(this.ifcAPI, modelID, expressID);

        if (elementInfo) {
          console.log(`  Element type:`, elementInfo.typeName);
          console.log(`  Element name:`, elementInfo.elementName);
          console.log(`  Global ID:`, elementInfo.globalId);
          console.log(`  Material:`, elementInfo.materialName);
          console.log(`  Storey:`, elementInfo.storeyName);
          console.log(`  Space:`, elementInfo.spaceName);
          console.log(`  Element data:`, elementInfo.element);

          // Highlight the picked mesh
          this.highlightMesh(mesh);

          // Call the callback with element data
          this.options.onElementPicked({
            mesh,
            modelID,
            ...elementInfo,
          });
        } else {
          console.warn(`  Could not get element info for expressID ${expressID}`);
          this.highlightMesh(mesh);
        }
      } catch (error) {
        console.error(`  Failed to get element data:`, error);
        this.highlightMesh(mesh);
      }
    } else {
      // No IFC API - just highlight the mesh
      this.highlightMesh(mesh);
    }
  }

  /**
   * Highlight a specific mesh
   *
   * @param mesh - Mesh to highlight
   * @param color - Optional color override
   * @param alpha - Optional alpha override
   */
  highlightMesh(mesh: AbstractMesh, color?: Color3, alpha?: number): void {
    // Remove previous highlight
    if (this.currentHighlightedMesh && this.currentHighlightedMesh !== mesh) {
      this.currentHighlightedMesh.renderOverlay = false;
    }

    // Add overlay to picked mesh
    mesh.renderOverlay = true;
    mesh.overlayColor = color ?? this.options.highlightColor;
    mesh.overlayAlpha = alpha ?? this.options.highlightAlpha;
    this.currentHighlightedMesh = mesh;
  }

  /**
   * Clear the current highlight
   */
  clearHighlight(): void {
    if (this.currentHighlightedMesh) {
      this.currentHighlightedMesh.renderOverlay = false;
      this.currentHighlightedMesh = null;
      this.options.onClear();
    }
  }

  /**
   * Get the currently highlighted mesh
   *
   * @returns The currently highlighted mesh or null
   */
  getHighlightedMesh(): AbstractMesh | null {
    return this.currentHighlightedMesh;
  }

  /**
   * Update highlight options
   *
   * @param options - New options to apply
   */
  setOptions(options: Partial<PickingOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  /**
   * Update the IFC API reference
   *
   * @param ifcAPI - New web-ifc API instance
   */
  setIfcAPI(ifcAPI: IfcAPI | null): void {
    this.ifcAPI = ifcAPI;
  }

  /**
   * Dispose the picking manager
   * Call this when cleaning up the scene
   */
  dispose(): void {
    this.clearHighlight();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.scene.onPointerObservable.clear();
  }
}

/**
 * Setup picking handler for IFC elements (convenience function)
 *
 * Creates a PickingManager and sets up the handler in one call.
 * For more control, create a PickingManager instance directly.
 *
 * @param scene - Babylon.js scene
 * @param ifcAPI - web-ifc API instance
 * @param options - Configuration options
 * @returns The created PickingManager instance
 */
export function setupPickingHandler(scene: Scene, ifcAPI: IfcAPI | null, options: PickingOptions = {}): PickingManager {
  const manager = new PickingManager(scene, ifcAPI, options);
  manager.setupHandler();
  return manager;
}

/**
 * Highlight a mesh with the default teal color
 *
 * @param mesh - Mesh to highlight
 * @param color - Color for the highlight (default: teal)
 * @param alpha - Alpha for the highlight (default: 0.3)
 */
export function highlightMesh(mesh: AbstractMesh, color: Color3 = Color3.Teal(), alpha: number = 0.3): void {
  mesh.renderOverlay = true;
  mesh.overlayColor = color;
  mesh.overlayAlpha = alpha;
}

/**
 * Clear highlight from a mesh
 *
 * @param mesh - Mesh to clear highlight from
 */
export function clearMeshHighlight(mesh: AbstractMesh): void {
  mesh.renderOverlay = false;
}
