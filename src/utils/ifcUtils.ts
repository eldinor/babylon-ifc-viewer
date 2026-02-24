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
