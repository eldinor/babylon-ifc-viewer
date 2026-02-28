import { Scene, AbstractMesh, Color3, PointerEventTypes, Plane, Vector3 } from "@babylonjs/core";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { IfcLoader } from "../loader";
import { resolveExpressIDFromMeshPick } from "../loader";

interface IfcElement {
  type?: number;
  Name?: { value?: string };
  [key: string]: unknown;
}

interface IfcMeshMetadata {
  expressID: number;
  modelID: number;
  elementRanges?: Array<{ expressID: number }>;
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
  clickCount: number;
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
  private loader: IfcLoader;
  private currentHighlightedMesh: AbstractMesh | null = null;
  private currentHighlightedExpressID: number | null = null;
  private persistentHighlightedMesh: AbstractMesh | null = null;
  private options: PickingOptions;
  private pointerObserver: Observer<PointerInfo> | null = null;
  private pointerDoubleObserver: Observer<PointerInfo> | null = null;
  private enabled = true;

  constructor(scene: Scene, loader: IfcLoader, options?: PickingOptions) {
    this.scene = scene;
    this.loader = loader;
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
      if (!this.enabled) return;
      const evt = pointerInfo.event;

      // Only handle left click
      if (evt.button !== 0) return;

      const resolvedPick = this.resolveVisiblePick(pointerInfo);
      if (resolvedPick) {
        this.handleMeshClick(resolvedPick.mesh, resolvedPick.faceId, 1);
      } else {
        this.clearHighlight();
      }
    }, PointerEventTypes.POINTERDOWN);

    this.pointerDoubleObserver = this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      if (!this.enabled) return;
      const evt = pointerInfo.event;
      if (evt.button !== 0) return;

      const resolvedPick = this.resolveVisiblePick(pointerInfo);
      if (resolvedPick) {
        this.handleMeshClick(resolvedPick.mesh, resolvedPick.faceId, 2);
      }
    }, PointerEventTypes.POINTERDOUBLETAP);
  }

  private getActiveClipPlanes(): Plane[] {
    const planes = [
      this.scene.clipPlane,
      this.scene.clipPlane2,
      this.scene.clipPlane3,
      this.scene.clipPlane4,
      this.scene.clipPlane5,
      this.scene.clipPlane6,
    ];
    return planes.filter((plane): plane is Plane => !!plane);
  }

  private isPointClipped(point: Vector3): boolean {
    const clipPlanes = this.getActiveClipPlanes();
    if (clipPlanes.length === 0) return false;
    // Babylon clip planes discard fragments where signed distance is positive.
    return clipPlanes.some((plane) => plane.dotCoordinate(point) > 0);
  }

  private resolveVisiblePick(pointerInfo: PointerInfo): { mesh: AbstractMesh; faceId: number | null | undefined } | null {
    const firstPick = pointerInfo.pickInfo;
    if (firstPick?.hit && firstPick.pickedMesh && firstPick.pickedPoint && !this.isPointClipped(firstPick.pickedPoint)) {
      return { mesh: firstPick.pickedMesh, faceId: firstPick.faceId };
    }

    const allHits = this.scene.multiPick(this.scene.pointerX, this.scene.pointerY);
    if (!allHits || allHits.length === 0) return null;

    for (const hit of allHits) {
      if (!hit.hit || !hit.pickedMesh || !hit.pickedPoint) continue;
      if (this.isPointClipped(hit.pickedPoint)) continue;
      return { mesh: hit.pickedMesh, faceId: hit.faceId };
    }

    return null;
  }

  /**
   * Handle mesh click event
   */
  private handleMeshClick(mesh: AbstractMesh, faceId: number | null | undefined, clickCount: number): void {
    const metadata = mesh.metadata as unknown;

    if (isIfcMeshMetadata(metadata)) {
      const modelID = metadata.modelID;
      const expressID = resolveExpressIDFromMeshPick(mesh, faceId) ?? (metadata.expressID >= 0 ? metadata.expressID : null);

      if (expressID === null || modelID < 0) {
        this.clearHighlight();
        return;
      }

      void this.loadElementAndHighlight(mesh, expressID, modelID, clickCount);
    } else {
      // Clicked on mesh without IFC metadata
      this.clearHighlight();
    }
  }

  private async loadElementAndHighlight(
    mesh: AbstractMesh,
    expressID: number,
    modelID: number,
    clickCount: number,
  ): Promise<void> {
    try {
      const { element, typeName } = await this.loader.getElementData(modelID, expressID);
      const elementName = element.Name?.value || "Unnamed";

      // Remove previous primary highlight
      this.clearPrimaryHighlight();

      // Add overlay to picked mesh
      mesh.renderOverlay = true;
      mesh.overlayColor = this.options.highlightColor!;
      mesh.overlayAlpha = this.options.highlightAlpha!;
      this.currentHighlightedMesh = mesh;
      this.currentHighlightedExpressID = expressID;

      // Trigger callback if provided
      if (this.options.onElementPicked) {
        this.options.onElementPicked({
          mesh,
          expressID,
          modelID,
          typeName,
          elementName,
          element: element as IfcElement,
          clickCount,
        });
      }
    } catch (error) {
      console.error("Failed to get element data:", error);
      this.clearHighlight();
    }
  }

  /**
   * Highlight a specific mesh
   */
  highlightMesh(mesh: AbstractMesh, options?: PickingOptions): void {
    // Clear current primary highlight
    this.clearPrimaryHighlight();

    const metadata = mesh.metadata as unknown;

    if (isIfcMeshMetadata(metadata)) {
      // Apply highlight
      mesh.renderOverlay = true;
      mesh.overlayColor = options?.highlightColor || this.options.highlightColor!;
      mesh.overlayAlpha = options?.highlightAlpha || this.options.highlightAlpha!;
      this.currentHighlightedMesh = mesh;
      this.currentHighlightedExpressID = metadata.expressID >= 0 ? metadata.expressID : null;
    }
  }

  /**
   * Clear current highlight
   */
  clearHighlight(): void {
    this.clearPrimaryHighlight();
    this.clearPersistentHighlight();
  }

  private clearPrimaryHighlight(): void {
    if (this.currentHighlightedMesh) {
      this.currentHighlightedMesh.renderOverlay = false;
      this.currentHighlightedMesh = null;
      this.currentHighlightedExpressID = null;

      // Trigger callback if provided
      if (this.options.onClear) {
        this.options.onClear();
      }
    }
  }

  private clearPersistentHighlight(): void {
    if (this.persistentHighlightedMesh) {
      this.persistentHighlightedMesh.renderOverlay = false;
      this.persistentHighlightedMesh = null;
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

  getCurrentHighlightedExpressID(): number | null {
    return this.currentHighlightedExpressID;
  }

  setPersistentHighlight(mesh: AbstractMesh | null, options?: PickingOptions): void {
    this.clearPersistentHighlight();
    if (!mesh || mesh === this.currentHighlightedMesh) return;

    const metadata = mesh.metadata as unknown;
    if (!isIfcMeshMetadata(metadata)) return;

    mesh.renderOverlay = true;
    mesh.overlayColor = options?.highlightColor || this.options.highlightColor!;
    mesh.overlayAlpha = options?.highlightAlpha || this.options.highlightAlpha!;
    this.persistentHighlightedMesh = mesh;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearHighlight();
    }
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
    if (this.pointerDoubleObserver) {
      this.scene.onPointerObservable.remove(this.pointerDoubleObserver);
      this.pointerDoubleObserver = null;
    }
  }
}

export function setupPickingHandler(scene: Scene, loader: IfcLoader, options?: PickingOptions): PickingManager {
  return new PickingManager(scene, loader, options);
}
