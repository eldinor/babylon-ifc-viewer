import { Scene, AbstractMesh, Color3, PointerEventTypes, PointerInfo } from "@babylonjs/core";
import * as WebIFC from "web-ifc";

/**
 * Information about a picked IFC element
 */
export interface ElementPickData {
  mesh: AbstractMesh;
  expressID: number;
  modelID: number;
  typeName: string;
  elementName: string;
  element: typeof WebIFC.IFCLINE;
  materialName?: string;
  colorId?: number;
  color?: { r: number; g: number; b: number; a: number };
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
    this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
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
  private async handleMeshClick(mesh: AbstractMesh): Promise<void> {
    const metadata = mesh.metadata;

    if (metadata && metadata.expressID !== undefined && metadata.modelID !== undefined) {
      const expressID = metadata.expressID;
      const modelID = metadata.modelID;

      try {
        // Fetch full element data
        const element = this.ifcAPI.GetLine(modelID, expressID, true);
        const typeName = this.ifcAPI.GetNameFromTypeCode(element.type);
        const elementName = element.Name?.value || "Unnamed";

        // Get material and color information from WebIFC
        console.log(`Getting material and color info for element ${expressID}`);
        const materialInfo = await this.getMaterialInfo(modelID, expressID);
        const colorInfo = await this.getColorInfo(modelID, expressID);
        console.log(`Material info:`, materialInfo);
        console.log(`Color info:`, colorInfo);
        console.log(`Material info details:`, JSON.stringify(materialInfo, null, 2));
        console.log(`Color info details:`, JSON.stringify(colorInfo, null, 2));

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
            materialName: materialInfo.materialName,
            colorId: colorInfo.colorId,
            color: colorInfo.color,
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
   * Extract material information from WebIFC element
   */
  private async getMaterialInfo(modelID: number, expressID: number): Promise<{ materialName?: string }> {
    try {
      // Get material properties for this element using the properties helper
      console.log(`Getting materials for element ${expressID}...`);
      const materials = await this.ifcAPI.properties.getMaterialsProperties(modelID, expressID, false, true);
      console.log(`Materials returned:`, materials);

      if (materials && materials.length > 0) {
        console.log(`Found ${materials.length} materials, processing first one...`);
        // Extract material name from the first material
        const material = materials[0];
        console.log(`Material object:`, material);

        // Handle different material types
        if (material && material.Name && material.Name.value) {
          console.log(`Found material name via material.Name.value: ${material.Name.value}`);
          return { materialName: material.Name.value };
        } else if (material && material.Material && material.Material.Name && material.Material.Name.value) {
          console.log(`Found material name via material.Material.Name.value: ${material.Material.Name.value}`);
          return { materialName: material.Material.Name.value };
        } else if (material && material.Material && typeof material.Material === "string") {
          console.log(`Found material name via material.Material string: ${material.Material}`);
          return { materialName: material.Material };
        } else {
          console.log(`Material structure doesn't match expected patterns`);
          console.log(`material.Name:`, material.Name);
          console.log(`material.Material:`, material.Material);
        }
      } else {
        console.log(`No materials found for element ${expressID}`);
      }
    } catch (error) {
      console.warn(`Failed to get material info for element ${expressID}:`, error);
    }

    return {};
  }

  /**
   * Extract color information from WebIFC element
   */
  private async getColorInfo(
    modelID: number,
    expressID: number,
  ): Promise<{ colorId?: number; color?: { r: number; g: number; b: number; a: number } }> {
    try {
      console.log(`Getting color info for element ${expressID}...`);

      // Get the element with flattened relationships
      const element = this.ifcAPI.GetLine(modelID, expressID, true);

      // Method 1: Check for direct IfcStyledItem on representation
      console.log(`Checking representation for styled items...`);
      if (element.Representation?.Representations) {
        for (const rep of element.Representation.Representations) {
          if (rep.Items) {
            for (const item of rep.Items) {
              const color = this.extractColorFromStyledItem(item);
              if (color) {
                console.log(`Found color from styled item:`, color);
                return { color };
              }
            }
          }
        }
      }

      // Method 2: Check material associations
      console.log(`Checking material associations...`);
      if (element.HasAssociations) {
        for (const assoc of element.HasAssociations) {
          if (assoc.type === WebIFC.IFCRELASSOCIATESMATERIAL) {
            const material = assoc.RelatingMaterial?.value;
            if (material) {
              const color = this.extractColorFromMaterial(material);
              if (color) {
                console.log(`Found color from material:`, color);
                return { color };
              }
            }
          }
        }
      }

      // Method 3: Try to get material properties (fallback)
      console.log(`Trying material properties fallback...`);
      const materials = await this.ifcAPI.properties.getMaterialsProperties(modelID, expressID, false, true);
      if (materials && materials.length > 0) {
        for (let i = 0; i < materials.length; i++) {
          const material = materials[i];
          const color = this.extractColorFromMaterial(material);
          if (color) {
            console.log(`Found color from material properties:`, color);
            return { color };
          }
        }
      }

      console.log(`No color found for element ${expressID}`);
      return {};
    } catch (error) {
      console.warn(`Failed to get color info for element ${expressID}:`, error);
      return {};
    }
  }

  /**
   * Extract color from styled item
   */
  private extractColorFromStyledItem(styledItem: any): { r: number; g: number; b: number; a: number } | null {
    if (!styledItem || styledItem.type !== this.ifcAPI.GetTypeCode("IfcStyledItem")) {
      return null;
    }

    // Traverse Styles array
    const styles = styledItem.Styles;
    if (!Array.isArray(styles)) return null;

    for (const styleRef of styles) {
      const style = typeof styleRef === "object" ? styleRef : this.ifcAPI.GetLine(styleRef.value, true);

      if (style.SurfaceStyle) {
        const surfaceStyle =
          typeof style.SurfaceStyle === "object"
            ? style.SurfaceStyle
            : this.ifcAPI.GetLine(style.SurfaceStyle.value, true);

        // Check IfcSurfaceStyleRendering or IfcSurfaceStyleShading
        const colorData = surfaceStyle.SurfaceColour;
        if (colorData?.Red && colorData?.Green && colorData?.Blue) {
          return {
            r: colorData.Red.value,
            g: colorData.Green.value,
            b: colorData.Blue.value,
            a: 1 - (surfaceStyle.Transparency?.value ?? 0), // IFC: 1=transparent, 0=opaque
          };
        }
      }
    }
    return null;
  }

  /**
   * Extract color from material
   */
  private extractColorFromMaterial(material: any): { r: number; g: number; b: number; a: number } | null {
    // Handle IfcMaterial with HasRepresentation → IfcMaterialDefinitionRepresentation
    if (material.HasRepresentation) {
      for (const rep of material.HasRepresentation) {
        if (rep.Representations) {
          for (const r of rep.Representations) {
            if (r.Items) {
              for (const item of r.Items) {
                const color = this.extractColorFromStyledItem(item);
                if (color) return color;
              }
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Extract color directly from element properties
   */
  private extractColorFromElement(element: unknown): { r: number; g: number; b: number; a: number } | undefined {
    try {
      if (!element || typeof element !== "object") return undefined;

      // Look for color properties in various formats
      const elementObj = element as Record<string, unknown>;

      // Check for direct color properties
      if ("Color" in elementObj) {
        const color = elementObj.Color;
        if (color && typeof color === "object") {
          // RGB color object
          if ("Red" in color && "Green" in color && "Blue" in color) {
            return {
              r: this.normalizeColorValue((color as { Red: unknown }).Red),
              g: this.normalizeColorValue((color as { Green: unknown }).Green),
              b: this.normalizeColorValue((color as { Blue: unknown }).Blue),
              a: "Alpha" in color ? this.normalizeColorValue((color as { Alpha: unknown }).Alpha) : 1,
            };
          }
          // RGBA color object
          if ("r" in color && "g" in color && "b" in color) {
            return {
              r: this.normalizeColorValue((color as { r: unknown }).r),
              g: this.normalizeColorValue((color as { g: unknown }).g),
              b: this.normalizeColorValue((color as { b: unknown }).b),
              a: "a" in color ? this.normalizeColorValue((color as { a: unknown }).a) : 1,
            };
          }
        }
      }

      // Check for presentation style properties
      if ("StyledByItem" in elementObj) {
        const styledByItem = elementObj.StyledByItem;
        if (Array.isArray(styledByItem) && styledByItem[0]) {
          const style = styledByItem[0];
          if (style && typeof style === "object" && "Styles" in style) {
            const styles = (style as { Styles: unknown[] }).Styles;
            if (Array.isArray(styles)) {
              for (const styleItem of styles) {
                if (
                  styleItem &&
                  typeof styleItem === "object" &&
                  "SurfaceStyle" in styleItem &&
                  Array.isArray((styleItem as { SurfaceStyle: unknown[] }).SurfaceStyle) &&
                  (styleItem as { SurfaceStyle: unknown[] }).SurfaceStyle[0]
                ) {
                  const surfaceStyle = (styleItem as { SurfaceStyle: unknown[] }).SurfaceStyle[0];
                  if (surfaceStyle && typeof surfaceStyle === "object" && "SurfaceColour" in surfaceStyle) {
                    const color = (surfaceStyle as { SurfaceColour: unknown }).SurfaceColour;
                    if (color && typeof color === "object" && "Red" in color && "Green" in color && "Blue" in color) {
                      return {
                        r: this.normalizeColorValue((color as { Red: unknown }).Red),
                        g: this.normalizeColorValue((color as { Green: unknown }).Green),
                        b: this.normalizeColorValue((color as { Blue: unknown }).Blue),
                        a: 1,
                      };
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to extract color from element:", error);
    }
    return undefined;
  }

  /**
   * Extract color ID from material object
   */
  private extractColorId(material: unknown): number | undefined {
    // Look for color-related properties
    if (
      material &&
      typeof material === "object" &&
      "Color" in material &&
      typeof (material as { Color: unknown }).Color === "number"
    ) {
      return (material as { Color: number }).Color;
    }
    if (
      material &&
      typeof material === "object" &&
      "ColorId" in material &&
      typeof (material as { ColorId: unknown }).ColorId === "number"
    ) {
      return (material as { ColorId: number }).ColorId;
    }
    if (
      material &&
      typeof material === "object" &&
      "id" in material &&
      typeof (material as { id: unknown }).id === "number"
    ) {
      return (material as { id: number }).id;
    }
    return undefined;
  }

  /**
   * Extract color values from material object
   */
  private extractColorFromMaterial(material: unknown): { r: number; g: number; b: number; a: number } | undefined {
    // Look for color properties in various formats
    if (material && typeof material === "object" && "Color" in material) {
      const color = (material as { Color: unknown }).Color;

      // Handle different color formats
      if (color && typeof color === "object") {
        // RGB color object
        if ("Red" in color && "Green" in color && "Blue" in color) {
          return {
            r: this.normalizeColorValue((color as { Red: unknown }).Red),
            g: this.normalizeColorValue((color as { Green: unknown }).Green),
            b: this.normalizeColorValue((color as { Blue: unknown }).Blue),
            a: "Alpha" in color ? this.normalizeColorValue((color as { Alpha: unknown }).Alpha) : 1,
          };
        }
        // RGBA color object
        if ("r" in color && "g" in color && "b" in color) {
          return {
            r: this.normalizeColorValue((color as { r: unknown }).r),
            g: this.normalizeColorValue((color as { g: unknown }).g),
            b: this.normalizeColorValue((color as { b: unknown }).b),
            a: "a" in color ? this.normalizeColorValue((color as { a: unknown }).a) : 1,
          };
        }
      }
    }
    return undefined;
  }

  /**
   * Extract color from representation object
   */
  private extractColorFromRepresentation(
    representation: unknown,
  ): { r: number; g: number; b: number; a: number } | undefined {
    try {
      // This is a simplified approach - in a real implementation,
      // you might need to traverse the representation structure more deeply
      if (representation && typeof representation === "object" && "Items" in representation) {
        const items = (representation as { Items: unknown[] }).Items;
        if (Array.isArray(items)) {
          for (const item of items) {
            if (
              item &&
              typeof item === "object" &&
              "StyledByItem" in item &&
              Array.isArray(item.StyledByItem) &&
              item.StyledByItem[0]
            ) {
              const style = item.StyledByItem[0];
              if (style && typeof style === "object" && "Styles" in style) {
                const styles = style.Styles;
                if (Array.isArray(styles)) {
                  for (const styleItem of styles) {
                    if (
                      styleItem &&
                      typeof styleItem === "object" &&
                      "SurfaceStyle" in styleItem &&
                      Array.isArray(styleItem.SurfaceStyle) &&
                      styleItem.SurfaceStyle[0]
                    ) {
                      const surfaceStyle = styleItem.SurfaceStyle[0];
                      if (surfaceStyle && typeof surfaceStyle === "object" && "SurfaceColour" in surfaceStyle) {
                        const color = surfaceStyle.SurfaceColour;
                        if (
                          color &&
                          typeof color === "object" &&
                          "Red" in color &&
                          "Green" in color &&
                          "Blue" in color
                        ) {
                          return {
                            r: this.normalizeColorValue(color.Red),
                            g: this.normalizeColorValue(color.Green),
                            b: this.normalizeColorValue(color.Blue),
                            a: 1,
                          };
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to extract color from representation:", error);
    }
    return undefined;
  }

  /**
   * Normalize color values to 0-1 range
   */
  private normalizeColorValue(value: unknown): number {
    if (typeof value === "number") {
      // If value is already in 0-1 range
      if (value >= 0 && value <= 1) {
        return value;
      }
      // If value is in 0-255 range, normalize to 0-1
      if (value >= 0 && value <= 255) {
        return value / 255;
      }
      // Clamp values outside expected ranges
      return Math.max(0, Math.min(1, value));
    }
    return 1;
  }

  /**
   * Highlight a specific mesh
   */
  highlightMesh(mesh: AbstractMesh, options?: PickingOptions): void {
    // Clear current highlight
    this.clearHighlight();

    const metadata = mesh.metadata;

    if (metadata && metadata.expressID !== undefined && metadata.modelID !== undefined) {
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
   * Extract color information from mesh metadata (created by babylon-ifc-loader)
   */
  private getMeshColorInfo(mesh: AbstractMesh): {
    colorId?: number;
    color?: { r: number; g: number; b: number; a: number };
  } {
    try {
      const metadata = mesh.metadata;
      console.log(`Mesh metadata:`, metadata);

      if (metadata) {
        // Check for color information in metadata
        if (metadata.color) {
          const color = metadata.color;
          console.log(`Found color in metadata:`, color);

          // Extract color values
          const colorObj = {
            r: this.normalizeColorValue(color.x || color.r || 0),
            g: this.normalizeColorValue(color.y || color.g || 0),
            b: this.normalizeColorValue(color.z || color.b || 0),
            a: this.normalizeColorValue(color.w || color.a || 1),
          };

          // Calculate colorId using the same formula as babylon-ifc-loader
          const colorId =
            Math.floor(colorObj.r * 255) +
            Math.floor(colorObj.g * 255) * 256 +
            Math.floor(colorObj.b * 255) * 256 * 256 +
            Math.floor(colorObj.a * 255) * 256 * 256 * 256;

          console.log(`Extracted color:`, colorObj);
          console.log(`Calculated colorId:`, colorId);

          return { colorId, color: colorObj };
        } else {
          console.log(`No color found in mesh metadata`);
        }
      }
    } catch (error) {
      console.warn(`Failed to extract color from mesh metadata:`, error);
    }

    return {};
  }
}

/**
 * Setup picking handler for IFC elements
 */
export function setupPickingHandler(scene: Scene, ifcAPI: WebIFC.IfcAPI, options?: PickingOptions): PickingManager {
  return new PickingManager(scene, ifcAPI, options);
}

/**
 * Clear current highlight
 */
export function clearHighlight(): void {
  console.warn(
    "clearHighlight function requires a PickingManager instance. Use the method on the PickingManager class instead.",
  );
}

/**
 * Set highlight options
 */
export function setHighlightOptions(): void {
  console.warn(
    "setHighlightOptions function requires a PickingManager instance. Use the method on the PickingManager class instead.",
  );
}
