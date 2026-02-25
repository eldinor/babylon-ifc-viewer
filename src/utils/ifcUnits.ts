import * as WebIFC from "web-ifc";

export interface IfcLengthUnitInfo {
  symbol: string;
  name: string;
}

interface IfcLineLike {
  type?: number;
  UnitsInContext?: unknown;
  Units?: unknown;
  UnitType?: unknown;
  Prefix?: unknown;
  Name?: unknown;
  [key: string]: unknown;
}

const SI_PREFIX_TO_SYMBOL: Record<string, string> = {
  EXA: "E",
  PETA: "P",
  TERA: "T",
  GIGA: "G",
  MEGA: "M",
  KILO: "k",
  HECTO: "h",
  DECA: "da",
  DECI: "d",
  CENTI: "c",
  MILLI: "m",
  MICRO: "u",
  NANO: "n",
  PICO: "p",
  FEMTO: "f",
  ATTO: "a",
};

function readText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    const nested = (value as { value?: unknown }).value;
    if (typeof nested === "string") return nested;
  }
  return null;
}

function asLine(value: unknown): IfcLineLike | null {
  if (!value || typeof value !== "object") return null;
  return value as IfcLineLike;
}

function normalizeUnitType(unitType: unknown): string {
  return (readText(unitType) ?? "").toUpperCase();
}

function normalizePrefix(prefix: unknown): string {
  return (readText(prefix) ?? "").toUpperCase();
}

function normalizeName(name: unknown): string {
  return (readText(name) ?? "").toUpperCase();
}

function parseLengthUnitSymbol(unit: IfcLineLike): IfcLengthUnitInfo | null {
  const unitType = normalizeUnitType(unit.UnitType);
  if (unitType && unitType !== "LENGTHUNIT") return null;

  const name = normalizeName(unit.Name);
  const prefix = normalizePrefix(unit.Prefix);

  // IFC SI length unit.
  if (name === "METRE" || name === "METER") {
    const symbolPrefix = SI_PREFIX_TO_SYMBOL[prefix] ?? "";
    return {
      symbol: `${symbolPrefix}m`,
      name: `${prefix ? `${prefix.toLowerCase()} ` : ""}metre`.trim(),
    };
  }

  // Conversion-based or non-SI units (FOOT, INCH, etc.).
  if (name) {
    return { symbol: name.toLowerCase(), name: name.toLowerCase() };
  }

  return null;
}

function getUnitsArray(unitsInContext: unknown): unknown[] {
  const ctx = asLine(unitsInContext);
  if (!ctx) return [];
  if (Array.isArray(ctx.Units)) return ctx.Units;
  return [];
}

export function getIfcLengthUnitInfo(ifcAPI: WebIFC.IfcAPI, modelID: number): IfcLengthUnitInfo {
  try {
    const projectIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (projectIDs.size() === 0) return { symbol: "m", name: "metre" };

    const projectLine = asLine(ifcAPI.GetLine(modelID, projectIDs.get(0), true));
    if (!projectLine) return { symbol: "m", name: "metre" };

    const units = getUnitsArray(projectLine.UnitsInContext);
    for (const unitRef of units) {
      const unitLine = asLine(unitRef);
      if (!unitLine) continue;
      const parsed = parseLengthUnitSymbol(unitLine);
      if (parsed) return parsed;
    }
  } catch (error) {
    console.warn("Failed to read IFC length unit:", error);
  }

  return { symbol: "m", name: "metre" };
}
