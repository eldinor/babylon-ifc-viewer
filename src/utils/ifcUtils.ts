/**
 * IFC Utility Functions
 *
 * Helper functions for working with web-ifc API to extract
 * building storey information and element relationships.
 */

import * as WebIFC from "web-ifc";

/**
 * Information about a single building storey
 */
export interface StoreyInfo {
  /** Express ID of the IFCBUILDINGSTOREY element */
  expressID: number;
  /** Name of the storey (e.g., "Ground Floor", "Level 1") */
  name: string;
  /** Elevation of the storey in model units */
  elevation: number | null;
  /** Number of elements belonging to this storey */
  elementCount: number;
}

/**
 * Get all building storeys from an IFC model
 *
 * @param ifcAPI - Initialized web-ifc API instance
 * @param modelID - Model ID from loadIfcModel
 * @param storeyMap - Element to storey mapping from RawIfcModel
 * @returns Array of StoreyInfo objects sorted by elevation (descending)
 */
export function getBuildingStoreys(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  storeyMap: Map<number, number>,
): StoreyInfo[] {
  // Get all IFCBUILDINGSTOREY elements
  const storeyIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);

  // Count elements per storey
  const elementCounts = new Map<number, number>();
  storeyMap.forEach((storeyID) => {
    elementCounts.set(storeyID, (elementCounts.get(storeyID) || 0) + 1);
  });

  const storeys: StoreyInfo[] = [];

  for (let i = 0; i < storeyIDs.size(); i++) {
    const expressID = storeyIDs.get(i);

    try {
      // Get full storey data
      const storeyData = ifcAPI.GetLine(modelID, expressID, true);

      // Extract name
      const name = storeyData.Name?.value || storeyData.LongName?.value || `Storey ${expressID}`;

      // Extract elevation
      const elevation = storeyData.Elevation?.value ?? null;

      // Get element count
      const elementCount = elementCounts.get(expressID) || 0;

      storeys.push({
        expressID,
        name,
        elevation,
        elementCount,
      });
    } catch (error) {
      console.warn(`Failed to get storey data for expressID ${expressID}:`, error);
    }
  }

  // Sort by elevation (descending - highest first)
  storeys.sort((a, b) => {
    if (a.elevation === null && b.elevation === null) return 0;
    if (a.elevation === null) return 1;
    if (b.elevation === null) return -1;
    return b.elevation - a.elevation;
  });

  return storeys;
}

/**
 * Get all element express IDs belonging to a specific storey
 *
 * @param storeyMap - Element to storey mapping from RawIfcModel
 * @param storeyID - Express ID of the storey
 * @returns Array of element express IDs belonging to the storey
 */
export function getStoreyElements(storeyMap: Map<number, number>, storeyID: number): number[] {
  const elements: number[] = [];
  storeyMap.forEach((sID, elementID) => {
    if (sID === storeyID) {
      elements.push(elementID);
    }
  });
  return elements;
}

/**
 * Get the storey ID for a specific element
 *
 * @param storeyMap - Element to storey mapping from RawIfcModel
 * @param elementID - Express ID of the element
 * @returns Storey express ID or undefined if not found
 */
export function getElementStorey(storeyMap: Map<number, number>, elementID: number): number | undefined {
  return storeyMap.get(elementID);
}

/**
 * Format elevation value for display
 *
 * @param elevation - Elevation value in model units
 * @returns Formatted string (e.g., "+2.70 m" or "-1.50 m")
 */
export function formatElevation(elevation: number | null): string {
  if (elevation === null) return "";
  const sign = elevation >= 0 ? "+" : "";
  return `${sign}${elevation.toFixed(2)} m`;
}

/**
 * Information about the IFC Site
 */
export interface SiteInfo {
  /** Express ID of the IFCSITE element */
  expressID: number;
  /** Name of the site */
  name: string;
}

/**
 * Information about the IFC Building
 */
export interface BuildingInfo {
  /** Express ID of the IFCBUILDING element */
  expressID: number;
  /** Name of the building */
  name: string;
}

/**
 * Get the IFC Building from the model
 *
 * @param ifcAPI - Initialized web-ifc API instance
 * @param modelID - Model ID from loadIfcModel
 * @returns BuildingInfo or null if no building found
 */
export function getBuilding(ifcAPI: WebIFC.IfcAPI, modelID: number): BuildingInfo | null {
  // Get all IFCBUILDING elements
  const buildingIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING);

  if (buildingIDs.size() === 0) {
    return null;
  }

  // Get the first (and typically only) building
  const expressID = buildingIDs.get(0);

  try {
    const buildingData = ifcAPI.GetLine(modelID, expressID, true);
    const name = buildingData.Name?.value || buildingData.LongName?.value || `Building ${expressID}`;

    return {
      expressID,
      name,
    };
  } catch (error) {
    console.warn(`Failed to get building data for expressID ${expressID}:`, error);
    return null;
  }
}

/**
 * Get the IFC Site from the model
 *
 * @param ifcAPI - Initialized web-ifc API instance
 * @param modelID - Model ID from loadIfcModel
 * @returns SiteInfo or null if no site found
 */
export function getSite(ifcAPI: WebIFC.IfcAPI, modelID: number): SiteInfo | null {
  // Get all IFCSITE elements
  const siteIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCSITE);

  if (siteIDs.size() === 0) {
    return null;
  }

  // Get the first (and typically only) site
  const expressID = siteIDs.get(0);

  try {
    const siteData = ifcAPI.GetLine(modelID, expressID, true);
    const name = siteData.Name?.value || siteData.LongName?.value || `Site ${expressID}`;

    return {
      expressID,
      name,
    };
  } catch (error) {
    console.warn(`Failed to get site data for expressID ${expressID}:`, error);
    return null;
  }
}

// ============================================================================
// Element Information Extraction
// ============================================================================

/**
 * Extended information about an IFC element
 */
export interface ElementInfo {
  /** Express ID of the IFC element */
  expressID: number;
  /** IFC type name (e.g., "IFCWALL", "IFCDOOR") */
  typeName: string;
  /** Element name from IFC properties */
  elementName: string;
  /** Global unique identifier (GUID) */
  globalId: string | null;
  /** Material name(s) associated with the element */
  materialName: string | null;
  /** Name of the containing building storey */
  storeyName: string | null;
  /** Express ID of the containing building storey */
  storeyExpressID: number | null;
  /** Name of the containing space (if any) */
  spaceName: string | null;
  /** Full element data from web-ifc */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: any;
}

/**
 * Get material name(s) for an IFC element
 *
 * @param ifcAPI - Initialized web-ifc API instance
 * @param modelID - Model ID from loadIfcModel
 * @param expressID - Express ID of the element
 * @returns Material name string or null if not found
 */
export function getElementMaterial(ifcAPI: WebIFC.IfcAPI, modelID: number, expressID: number): string | null {
  try {
    // Get all IFCRELASSOCIATESMATERIAL relationships
    const materialRelIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);

    for (let i = 0; i < materialRelIDs.size(); i++) {
      const relID = materialRelIDs.get(i);
      const relData = ifcAPI.GetLine(modelID, relID, true);

      // Check if this relationship relates to our element
      const relatedObjects = relData.RelatedObjects;
      if (relatedObjects && Array.isArray(relatedObjects)) {
        const isRelated = relatedObjects.some((obj: { value: number }) => obj.value === expressID);
        if (isRelated && relData.RelatingMaterial) {
          const materialRef = relData.RelatingMaterial;
          const materialData = ifcAPI.GetLine(modelID, materialRef.value, true);

          // Handle different material types
          if (materialData.Name?.value) {
            return materialData.Name.value;
          }
          // Handle material constituent set
          if (materialData.MaterialConstituents) {
            const constituents = materialData.MaterialConstituents;
            const names: string[] = [];
            for (const constituent of constituents) {
              const constituentData = ifcAPI.GetLine(modelID, constituent.value, true);
              if (constituentData.Material) {
                const matData = ifcAPI.GetLine(modelID, constituentData.Material.value, true);
                if (matData.Name?.value) {
                  names.push(matData.Name.value);
                }
              }
            }
            if (names.length > 0) return names.join(", ");
          }
          // Handle material layer set
          if (materialData.MaterialLayers) {
            const layers = materialData.MaterialLayers;
            const names: string[] = [];
            for (const layer of layers) {
              const layerData = ifcAPI.GetLine(modelID, layer.value, true);
              if (layerData.Material) {
                const matData = ifcAPI.GetLine(modelID, layerData.Material.value, true);
                if (matData.Name?.value) {
                  names.push(matData.Name.value);
                }
              }
            }
            if (names.length > 0) return names.join(", ");
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to get material for element ${expressID}:`, error);
  }
  return null;
}

/**
 * Get spatial containment (storey/space) for an IFC element
 *
 * @param ifcAPI - Initialized web-ifc API instance
 * @param modelID - Model ID from loadIfcModel
 * @param expressID - Express ID of the element
 * @returns Object containing storey and space information
 */
export function getElementSpatialContainer(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  expressID: number,
): { storeyName: string | null; storeyExpressID: number | null; spaceName: string | null } {
  const result = {
    storeyName: null as string | null,
    storeyExpressID: null as number | null,
    spaceName: null as string | null,
  };

  try {
    // Get all IFCRELCONTAINEDINSPATIALSTRUCTURE relationships
    const containmentRelIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);

    for (let i = 0; i < containmentRelIDs.size(); i++) {
      const relID = containmentRelIDs.get(i);
      const relData = ifcAPI.GetLine(modelID, relID, true);

      // Check if this relationship relates to our element
      const relatedElements = relData.RelatedElements;
      if (relatedElements && Array.isArray(relatedElements)) {
        const isRelated = relatedElements.some((el: { value: number }) => el.value === expressID);
        if (isRelated && relData.RelatingStructure) {
          const structureRef = relData.RelatingStructure;
          const structureData = ifcAPI.GetLine(modelID, structureRef.value, true);

          // Check if it's a building storey
          if (structureData.type === WebIFC.IFCBUILDINGSTOREY) {
            result.storeyName =
              structureData.Name?.value || structureData.LongName?.value || `Storey ${structureRef.value}`;
            result.storeyExpressID = structureRef.value;
          }
          // Check if it's a space
          else if (structureData.type === WebIFC.IFCSPACE) {
            result.spaceName =
              structureData.Name?.value || structureData.LongName?.value || `Space ${structureRef.value}`;
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to get spatial container for element ${expressID}:`, error);
  }

  return result;
}

/**
 * Get extended information about an IFC element
 *
 * @param ifcAPI - Initialized web-ifc API instance
 * @param modelID - Model ID from loadIfcModel
 * @param expressID - Express ID of the element
 * @returns ElementInfo object or null if not found
 */
export function getElementInfo(ifcAPI: WebIFC.IfcAPI, modelID: number, expressID: number): ElementInfo | null {
  try {
    // Get full element data
    const element = ifcAPI.GetLine(modelID, expressID, true);

    // Get type name
    const typeName = ifcAPI.GetNameFromTypeCode(element.type);

    // Get element name
    const elementName = element.Name?.value || "Unnamed";

    // Get GlobalId
    const globalId = element.GlobalId?.value || null;

    // Get material
    const materialName = getElementMaterial(ifcAPI, modelID, expressID);

    // Get spatial containment
    const spatialContainer = getElementSpatialContainer(ifcAPI, modelID, expressID);

    return {
      expressID,
      typeName,
      elementName,
      globalId,
      materialName,
      storeyName: spatialContainer.storeyName,
      storeyExpressID: spatialContainer.storeyExpressID,
      spaceName: spatialContainer.spaceName,
      element,
    };
  } catch (error) {
    console.error(`Failed to get element info for expressID ${expressID}:`, error);
    return null;
  }
}
