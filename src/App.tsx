import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import "./App.css";
import BabylonScene, { type IfcModelData } from "./components/BabylonScene";
import AppHeader from "./components/AppHeader";
import ElementInfoPanel from "./components/ElementInfoPanel";
import RelatedElementsPanel from "./components/RelatedElementsPanel";
import Sidebar from "./components/Sidebar";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import { useModelData } from "./hooks/useModelData";
import type { ElementPickData } from "./utils/pickingUtils";
import type { PickMode, SectionAxis, TabType } from "./types/app";
import { collectSubtreeExpressIDs, type IfcProjectTreeIndex, type IfcProjectTreeNode } from "./utils/projectTreeUtils";
import type { ElementInfoData } from "./types/elementInfo";
import { buildElementInfoFromPick, buildElementInfoFromProjectNode } from "./utils/elementInfoUtils";

const STORAGE_KEYS = {
  sceneBackgroundColor: "viewer.sceneBackgroundColor",
  highlightColor: "viewer.highlightColor",
  pickMode: "viewer.pickMode",
  alwaysFitEnabled: "viewer.alwaysFitEnabled",
  sidebarCollapsed: "viewer.sidebarCollapsed",
  recentIfcFiles: "viewer.recentIfcFiles",
  showRelatedElements: "viewer.showRelatedElements",
} as const;

const SESSION_KEYS = {
  sectionEnabled: "viewer.session.section.enabled",
  sectionAxis: "viewer.session.section.axis",
  sectionPercent: "viewer.session.section.percent",
  sectionInverted: "viewer.session.section.inverted",
} as const;

const DEFAULT_SCENE_BACKGROUND = "#18003d";
const DEFAULT_HIGHLIGHT = "#008080";
const MAX_RECENT_IFC_FILES = 8;
const PUBLIC_IFC_SAMPLES = ["sample.ifc", "Ifc4_SampleHouse.ifc", "institute.ifc", "test.ifc"] as const;

interface RecentIfcFile {
  name: string;
  path: string;
}

function isHexColor(value: string | null): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isSectionAxis(value: string | null): value is SectionAxis {
  return value === "x" || value === "y" || value === "z";
}

function isPickMode(value: string | null): value is PickMode {
  return value === "select" || value === "isolate" || value === "measure" || value === "inspect" || value === "explore";
}

function readStorageBool(key: string, fallback: boolean): boolean {
  const value = localStorage.getItem(key);
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

function readSessionBool(key: string, fallback: boolean): boolean {
  const value = sessionStorage.getItem(key);
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

function readSessionPercent(key: string, fallback: number): number {
  const value = sessionStorage.getItem(key);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function formatFileSizeMb(sizeBytes: number | null): string {
  if (sizeBytes === null) return "-";
  const mb = sizeBytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function formatLength(value: number, unitSymbol: string): string {
  const rounded = Math.round(value * 1000) / 1000;
  const raw = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/\.?0+$/, "");
  return `${raw} ${unitSymbol}`;
}

function getPickedCenter(data: ElementPickData): { x: number; y: number; z: number } | null {
  const center = data.mesh.getBoundingInfo()?.boundingBox.centerWorld;
  if (!center) return null;
  if (![center.x, center.y, center.z].every(Number.isFinite)) return null;
  return { x: center.x, y: center.y, z: center.z };
}

function readRecentIfcFiles(): RecentIfcFile[] {
  const raw = localStorage.getItem(STORAGE_KEYS.recentIfcFiles);
  const defaultSamples: RecentIfcFile[] = PUBLIC_IFC_SAMPLES.map((name) => ({ name, path: `./${name}` }));
  if (!raw) return defaultSamples.slice(0, MAX_RECENT_IFC_FILES);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultSamples.slice(0, MAX_RECENT_IFC_FILES);
    const persisted = parsed
      .filter(
        (item): item is RecentIfcFile =>
          !!item &&
          typeof item === "object" &&
          typeof (item as { name?: unknown }).name === "string" &&
          typeof (item as { path?: unknown }).path === "string" &&
          (item as { path: string }).path.trim().length > 0,
      )
      .filter((item) => !item.path.startsWith("blob:"))
      .slice(0, MAX_RECENT_IFC_FILES);

    const merged = [...persisted];
    defaultSamples.forEach((sample) => {
      if (!merged.some((entry) => entry.path === sample.path)) {
        merged.push(sample);
      }
    });
    return merged.slice(0, MAX_RECENT_IFC_FILES);
  } catch {
    return defaultSamples.slice(0, MAX_RECENT_IFC_FILES);
  }
}

function fileNameFromPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "Unknown.ifc";
  const normalized = trimmed.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const last = parts[parts.length - 1]?.trim();
  return last && last.length > 0 ? last : trimmed;
}

function addRecentFile(
  previous: RecentIfcFile[],
  nextEntry: RecentIfcFile,
): RecentIfcFile[] {
  const next: RecentIfcFile[] = [nextEntry];
  previous.forEach((entry) => {
    if (entry.path !== nextEntry.path) next.push(entry);
  });
  return next.slice(0, MAX_RECENT_IFC_FILES);
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectTreeIndexRef = useRef<IfcProjectTreeIndex | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    readStorageBool(STORAGE_KEYS.sidebarCollapsed, false),
  );
  const [activeTab, setActiveTab] = useState<TabType>("project");
  const [pickMode, setPickMode] = useState<PickMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.pickMode);
    return isPickMode(stored) ? stored : "select";
  });
  const [sectionEnabled, setSectionEnabled] = useState<boolean>(() => readSessionBool(SESSION_KEYS.sectionEnabled, false));
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>(() => {
    const stored = sessionStorage.getItem(SESSION_KEYS.sectionAxis);
    return isSectionAxis(stored) ? stored : "y";
  });
  const [sectionPercent, setSectionPercent] = useState<number>(() => readSessionPercent(SESSION_KEYS.sectionPercent, 50));
  const [sectionInverted, setSectionInverted] = useState<boolean>(() =>
    readSessionBool(SESSION_KEYS.sectionInverted, false),
  );
  const [elementInfo, setElementInfo] = useState<ElementInfoData | null>(null);
  const [selectedProjectExpressID, setSelectedProjectExpressID] = useState<number | null>(null);
  const [selectedProjectExpressIDs, setSelectedProjectExpressIDs] = useState<Set<number>>(new Set());
  const [visibleExpressIDs, setVisibleExpressIDs] = useState<Set<number> | null>(null);
  const [hiddenExpressIDs, setHiddenExpressIDs] = useState<Set<number>>(new Set());
  const [alwaysFitEnabled, setAlwaysFitEnabled] = useState<boolean>(() =>
    readStorageBool(STORAGE_KEYS.alwaysFitEnabled, false),
  );
  const [measureStart, setMeasureStart] = useState<{ expressID: number; center: { x: number; y: number; z: number } } | null>(null);
  const [measurePinnedFirstExpressID, setMeasurePinnedFirstExpressID] = useState<number | null>(null);
  const [sceneBackgroundColor, setSceneBackgroundColor] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.sceneBackgroundColor);
    return isHexColor(stored) ? stored : DEFAULT_SCENE_BACKGROUND;
  });
  const [highlightColor, setHighlightColor] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.highlightColor);
    return isHexColor(stored) ? stored : DEFAULT_HIGHLIGHT;
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [relatedPanelDismissed, setRelatedPanelDismissed] = useState(false);
  const [showRelatedElements, setShowRelatedElements] = useState<boolean>(() =>
    readStorageBool(STORAGE_KEYS.showRelatedElements, true),
  );
  const [recentIfcFiles, setRecentIfcFiles] = useState<RecentIfcFile[]>(() => readRecentIfcFiles());

  const handleModelCleared = useCallback(() => {
    setElementInfo(null);
  }, []);

  const { modelData, projectInfo, projectTreeIndex, handleModelLoaded: setModelData } = useModelData(
    handleModelCleared,
  );

  const breadcrumbs = useMemo(() => {
    if (!projectTreeIndex || selectedProjectExpressID === null) return [] as Array<{ expressID: number; name: string }>;
    const chain: Array<{ expressID: number; name: string }> = [];
    let currentID: number | undefined = selectedProjectExpressID;
    while (currentID !== undefined) {
      const node = projectTreeIndex.nodes.get(currentID);
      if (!node) break;
      chain.unshift({ expressID: node.expressID, name: node.name });
      currentID = projectTreeIndex.parentByExpressID.get(currentID);
    }
    return chain;
  }, [projectTreeIndex, selectedProjectExpressID]);

  const footerFileInfo = useMemo(() => {
    if (!modelData) return null;
    return {
      name: modelData.sourceFileName,
      sizeMb: formatFileSizeMb(modelData.sourceFileSizeBytes),
    };
  }, [modelData]);

  const effectiveVisibleCount = useMemo(() => {
    if (!modelData) return null;
    const total = modelData.dimensionsByExpressID.size;
    if (visibleExpressIDs === null && hiddenExpressIDs.size === 0) return null;
    if (visibleExpressIDs === null) return Math.max(0, total - hiddenExpressIDs.size);
    let count = 0;
    visibleExpressIDs.forEach((id) => {
      if (!hiddenExpressIDs.has(id)) count++;
    });
    return count;
  }, [hiddenExpressIDs, modelData, visibleExpressIDs]);

  const sectionPosition = useMemo(() => {
    if (!modelData) return null;
    const range = modelData.axisRanges[sectionAxis];
    const span = range.max - range.min;
    if (!Number.isFinite(span) || span <= 0) return range.min;
    return range.min + (span * sectionPercent) / 100;
  }, [modelData, sectionAxis, sectionPercent]);

  useLayoutEffect(() => {
    projectTreeIndexRef.current = projectTreeIndex;
  }, [projectTreeIndex]);

  const handleOpenIfc = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleOpenHelp = useCallback(() => {
    window.open("/user-guide.html", "_blank", "noopener,noreferrer");
  }, []);

  const handlePickModeChange = useCallback((mode: PickMode) => {
    setPickMode(mode);
    if (mode !== "measure") {
      setMeasureStart(null);
      setMeasurePinnedFirstExpressID(null);
    }
  }, []);

  const handleSceneBackgroundColorChange = useCallback((color: string) => {
    if (!isHexColor(color)) return;
    setSceneBackgroundColor(color);
  }, []);

  const handleHighlightColorChange = useCallback((color: string) => {
    if (!isHexColor(color)) return;
    setHighlightColor(color);
  }, []);

  const handleClearUserSettings = useCallback(() => {
    setSceneBackgroundColor(DEFAULT_SCENE_BACKGROUND);
    setHighlightColor(DEFAULT_HIGHLIGHT);
    setPickMode("select");
    setAlwaysFitEnabled(false);
    setShowRelatedElements(true);
    setSidebarCollapsed(false);
    localStorage.removeItem(STORAGE_KEYS.sceneBackgroundColor);
    localStorage.removeItem(STORAGE_KEYS.highlightColor);
    localStorage.removeItem(STORAGE_KEYS.pickMode);
    localStorage.removeItem(STORAGE_KEYS.alwaysFitEnabled);
    localStorage.removeItem(STORAGE_KEYS.showRelatedElements);
    localStorage.removeItem(STORAGE_KEYS.sidebarCollapsed);
    setSectionEnabled(false);
    setSectionAxis("y");
    setSectionPercent(50);
    setSectionInverted(false);
    sessionStorage.removeItem(SESSION_KEYS.sectionEnabled);
    sessionStorage.removeItem(SESSION_KEYS.sectionAxis);
    sessionStorage.removeItem(SESSION_KEYS.sectionPercent);
    sessionStorage.removeItem(SESSION_KEYS.sectionInverted);
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && window.loadIfcFile) {
      window.loadIfcFile(file);
      const maybePath = (file as File & { path?: unknown }).path;
      const recentPath =
        typeof maybePath === "string" && maybePath.trim().length > 0 ? maybePath : URL.createObjectURL(file);
      const recentName = file.name?.trim().length ? file.name : fileNameFromPath(recentPath);
      setRecentIfcFiles((prev) => addRecentFile(prev, { name: recentName, path: recentPath }));
    }
    event.target.value = "";
  }, []);

  const handleOpenRecentIfc = useCallback((path: string, name?: string) => {
    if (!path || !window.loadIfcFile) return;
    window.loadIfcFile(path);
    const nextName = typeof name === "string" && name.trim().length > 0 ? name : fileNameFromPath(path);
    setRecentIfcFiles((prev) => addRecentFile(prev, { name: nextName, path }));
  }, []);

  const handleModelLoaded = useCallback(
    (data: IfcModelData | null) => {
      setModelData(data);
      setSelectedProjectExpressID(null);
      setSelectedProjectExpressIDs(new Set());
      setVisibleExpressIDs(null);
      setHiddenExpressIDs(new Set());
      setElementInfo(null);
      setMeasureStart(null);
      setMeasurePinnedFirstExpressID(null);
      setActiveTab("project");
    },
    [setModelData],
  );

  const clearProjectTreeSelection = useCallback(() => {
    setSelectedProjectExpressID(null);
    setSelectedProjectExpressIDs(new Set());
    setVisibleExpressIDs(null);
    setElementInfo((prev) => (prev?.source === "projectTree" ? null : prev));
  }, []);

  const handleResetVisibility = useCallback(() => {
    setVisibleExpressIDs(null);
    setHiddenExpressIDs(new Set());
  }, []);

  const handleDisplaySearchResults = useCallback((expressIDs: number[]) => {
    if (expressIDs.length === 0) return;
    setVisibleExpressIDs(new Set(expressIDs));
    setSelectedProjectExpressID(null);
    setSelectedProjectExpressIDs(new Set());
  }, []);

  const handleSetNodeVisibility = useCallback((expressID: number, visible: boolean) => {
    if (!projectTreeIndex) return;
    const subtreeIDs = collectSubtreeExpressIDs(expressID, projectTreeIndex);
    setHiddenExpressIDs((prev) => {
      const next = new Set(prev);
      if (visible) {
        subtreeIDs.forEach((id) => next.delete(id));
      } else {
        subtreeIDs.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [projectTreeIndex]);

  const handleSelectProjectNode = useCallback((
    node: IfcProjectTreeNode | null,
    options?: { append?: boolean; replaceExpressIDs?: number[] },
  ) => {
    if (!node) {
      clearProjectTreeSelection();
      return;
    }

    if (!projectTreeIndex) return;

    let nextSelected: Set<number>;
    if (options?.replaceExpressIDs) {
      nextSelected = new Set(options.replaceExpressIDs);
    } else {
      const append = options?.append === true;
      nextSelected = append ? new Set(selectedProjectExpressIDs) : new Set<number>();
      if (append && nextSelected.has(node.expressID)) {
        nextSelected.delete(node.expressID);
      } else {
        nextSelected.add(node.expressID);
      }
    }

    if (nextSelected.size === 0) {
      clearProjectTreeSelection();
      return;
    }

    let primaryExpressID = node.expressID;
    if (!nextSelected.has(primaryExpressID)) {
      const firstRemaining = nextSelected.values().next().value;
      if (typeof firstRemaining === "number") {
        primaryExpressID = firstRemaining;
      }
    }

    const subtreeIDs = new Set<number>();
    nextSelected.forEach((selectedID) => {
      collectSubtreeExpressIDs(selectedID, projectTreeIndex).forEach((id) => subtreeIDs.add(id));
    });

    setSelectedProjectExpressIDs(nextSelected);
    setSelectedProjectExpressID(primaryExpressID);
    setVisibleExpressIDs(subtreeIDs);
    if (modelData) {
      const primaryNode = projectTreeIndex.nodes.get(primaryExpressID) ?? node;
      const fallbackDimensions = modelData.dimensionsByExpressID.get(primaryNode.expressID);
      setElementInfo(
        buildElementInfoFromProjectNode(
          modelData.ifcAPI,
          modelData.modelID,
          primaryNode,
          projectTreeIndex,
          fallbackDimensions,
          { unitSymbol: modelData.lengthUnitSymbol },
        ),
      );
    }
    if (alwaysFitEnabled && window.fitToExpressIDs) {
      window.fitToExpressIDs(Array.from(subtreeIDs));
    }
  }, [alwaysFitEnabled, clearProjectTreeSelection, modelData, projectTreeIndex, selectedProjectExpressIDs]);

  const handleSelectRelatedExpressID = useCallback((
    expressID: number,
    options?: { toggle?: boolean; rangeExpressIDs?: number[] },
  ) => {
    if (!projectTreeIndex) return;
    setActiveTab("project");

    const nextSelected = new Set(selectedProjectExpressIDs);
    if (nextSelected.size === 0 && selectedProjectExpressID !== null) {
      nextSelected.add(selectedProjectExpressID);
    }

    if (options?.rangeExpressIDs && options.rangeExpressIDs.length > 0) {
      options.rangeExpressIDs.forEach((id) => nextSelected.add(id));
    } else if (options?.toggle) {
      if (nextSelected.has(expressID)) {
        nextSelected.delete(expressID);
      } else {
        nextSelected.add(expressID);
      }
    } else {
      nextSelected.add(expressID);
    }

    if (nextSelected.size === 0) {
      clearProjectTreeSelection();
      return;
    }

    const visibleFromSelection = new Set<number>();
    nextSelected.forEach((selectedID) => {
      const ids = projectTreeIndex.nodes.has(selectedID)
        ? collectSubtreeExpressIDs(selectedID, projectTreeIndex)
        : [selectedID];
      ids.forEach((id) => visibleFromSelection.add(id));
    });

    let nextPrimaryExpressID: number;
    if (selectedProjectExpressID !== null && nextSelected.has(selectedProjectExpressID)) {
      nextPrimaryExpressID = selectedProjectExpressID;
    } else if (nextSelected.has(expressID)) {
      nextPrimaryExpressID = expressID;
    } else {
      nextPrimaryExpressID = nextSelected.values().next().value as number;
    }

    setSelectedProjectExpressIDs(nextSelected);
    setSelectedProjectExpressID(nextPrimaryExpressID);

    setVisibleExpressIDs((prev) => {
      if (prev === null) {
        // Keep unfiltered scene unfiltered; related selections should not force filtering.
        return null;
      }
      return new Set(visibleFromSelection);
    });

    setHiddenExpressIDs((prev) => {
      const next = new Set(prev);
      visibleFromSelection.forEach((id) => next.delete(id));
      return next;
    });
  }, [clearProjectTreeSelection, projectTreeIndex, selectedProjectExpressID, selectedProjectExpressIDs]);

  const handleIsolateExpandToParentScope = useCallback((expressID: number) => {
    if (!projectTreeIndex) return;

    const parentID = projectTreeIndex.parentByExpressID.get(expressID);
    const scopeRootID = parentID ?? expressID;
    const scopeIDs = collectSubtreeExpressIDs(scopeRootID, projectTreeIndex);
    setVisibleExpressIDs(new Set(scopeIDs));
    setSelectedProjectExpressID(expressID);
    setSelectedProjectExpressIDs(new Set([expressID]));

    if (alwaysFitEnabled && window.fitToExpressIDs) {
      window.fitToExpressIDs(scopeIDs);
    }
  }, [alwaysFitEnabled, projectTreeIndex]);

  const handleIsolateButtonDoubleClick = useCallback(() => {
    const sourceExpressID = selectedProjectExpressID ?? elementInfo?.expressID ?? window.getHighlightedExpressID?.() ?? null;
    if (sourceExpressID === null) return;
    handleIsolateExpandToParentScope(sourceExpressID);
  }, [elementInfo?.expressID, handleIsolateExpandToParentScope, selectedProjectExpressID]);

  const handleBreadcrumbClick = useCallback((expressID: number) => {
    if (!projectTreeIndex) return;
    const node = projectTreeIndex.nodes.get(expressID);
    if (!node) return;
    setActiveTab("project");
    handleSelectProjectNode(node);
  }, [handleSelectProjectNode, projectTreeIndex]);

  const handleFitProjectNode = useCallback((node: IfcProjectTreeNode | null) => {
    if (!node || !projectTreeIndex || !window.fitToExpressIDs) return;
    const subtreeIDs = collectSubtreeExpressIDs(node.expressID, projectTreeIndex);
    window.fitToExpressIDs(subtreeIDs);
  }, [projectTreeIndex]);

  const handleManualFitProjectNode = useCallback((node: IfcProjectTreeNode | null) => {
    if (!node) return;
    handleFitProjectNode(node);
  }, [handleFitProjectNode]);

  const getCurrentSourceExpressID = useCallback((): number | null => {
    return selectedProjectExpressID ?? elementInfo?.expressID ?? window.getHighlightedExpressID?.() ?? null;
  }, [elementInfo?.expressID, selectedProjectExpressID]);

  const handleZoomParent = useCallback(() => {
    if (!projectTreeIndex) return;
    const sourceExpressID = getCurrentSourceExpressID();
    if (sourceExpressID === null) return;
    const parentExpressID = projectTreeIndex.parentByExpressID.get(sourceExpressID);
    if (parentExpressID === undefined) return;
    const parentNode = projectTreeIndex.nodes.get(parentExpressID);
    if (!parentNode) return;
    setActiveTab("project");
    handleFitProjectNode(parentNode);
  }, [getCurrentSourceExpressID, handleFitProjectNode, projectTreeIndex]);

  const canZoomParent = useMemo(() => {
    if (!projectTreeIndex) return false;
    const sourceExpressID = selectedProjectExpressID ?? elementInfo?.expressID ?? null;
    if (sourceExpressID === null) return false;
    return projectTreeIndex.parentByExpressID.has(sourceExpressID);
  }, [elementInfo?.expressID, projectTreeIndex, selectedProjectExpressID]);

  const handleBreadcrumbFit = useCallback((expressID: number) => {
    if (!projectTreeIndex) return;
    const node = projectTreeIndex.nodes.get(expressID);
    if (!node) return;
    handleFitProjectNode(node);
  }, [handleFitProjectNode, projectTreeIndex]);

  const handleElementPicked = useCallback((data: ElementPickData | null) => {
    if (!data) {
      setElementInfo(null);
      return;
    }

    // Double-click on mesh expands isolate scope to parent, same behavior as Isolate button double-click.
    if (data.clickCount >= 2 && projectTreeIndex) {
      handleIsolateExpandToParentScope(data.expressID);
      return;
    }

    if (pickMode === "measure") {
      const center = getPickedCenter(data);
      if (!center) return;
      const unitSymbol = modelData?.lengthUnitSymbol ?? "m";

      if (!measureStart) {
        setMeasureStart({ expressID: data.expressID, center });
        setMeasurePinnedFirstExpressID(null);
        setElementInfo({
          source: "scene",
          expressID: data.expressID,
          fields: [
            { label: "Mode", value: "Measure" },
            { label: "Start Express ID", value: String(data.expressID) },
            { label: "Status", value: "Pick second element" },
          ],
        });
        return;
      }

      const dx = center.x - measureStart.center.x;
      const dy = center.y - measureStart.center.y;
      const dz = center.z - measureStart.center.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      setElementInfo({
        source: "scene",
        expressID: data.expressID,
        fields: [
          { label: "Mode", value: "Measure" },
          { label: "Start Express ID", value: String(measureStart.expressID) },
          { label: "End Express ID", value: String(data.expressID) },
          { label: "Distance", value: formatLength(distance, unitSymbol) },
          { label: "dX", value: formatLength(dx, unitSymbol) },
          { label: "dY", value: formatLength(dy, unitSymbol) },
          { label: "dZ", value: formatLength(dz, unitSymbol) },
        ],
      });
      setMeasurePinnedFirstExpressID(measureStart.expressID === data.expressID ? null : measureStart.expressID);
      setMeasureStart(null);
      return;
    }

    if (pickMode === "inspect") {
      setElementInfo(
        buildElementInfoFromPick(data, {
          unitSymbol: modelData?.lengthUnitSymbol,
          projectTreeIndex,
        }),
      );
      return;
    }

    if (pickMode === "isolate") {
      if (!modelData || !projectTreeIndex) {
        setVisibleExpressIDs(new Set([data.expressID]));
        if (alwaysFitEnabled && window.fitToExpressIDs) {
          window.fitToExpressIDs([data.expressID]);
        }
        setElementInfo(
          buildElementInfoFromPick(data, {
            unitSymbol: modelData?.lengthUnitSymbol,
            projectTreeIndex,
          }),
        );
        return;
      }

      const node = projectTreeIndex.nodes.get(data.expressID) ?? null;
      if (node) {
        handleSelectProjectNode(node);
        return;
      }

      setSelectedProjectExpressID(null);
      setSelectedProjectExpressIDs(new Set());
      setVisibleExpressIDs(new Set([data.expressID]));
      if (alwaysFitEnabled && window.fitToExpressIDs) {
        window.fitToExpressIDs([data.expressID]);
      }
      setElementInfo(
        buildElementInfoFromPick(data, {
          unitSymbol: modelData.lengthUnitSymbol,
          projectTreeIndex,
        }),
      );
      return;
    }

    if (!modelData || !projectTreeIndex) {
      setElementInfo(
        buildElementInfoFromPick(data, {
          unitSymbol: modelData?.lengthUnitSymbol,
          projectTreeIndex,
        }),
      );
      return;
    }

    const treeIndex = projectTreeIndexRef.current;
    if (!treeIndex) return;

    if (treeIndex.nodes.has(data.expressID)) {
      setSelectedProjectExpressID(data.expressID);
      setSelectedProjectExpressIDs(new Set([data.expressID]));
      const node = projectTreeIndex.nodes.get(data.expressID);
      if (node) {
        const fallbackDimensions = modelData.dimensionsByExpressID.get(node.expressID);
        setElementInfo(
          buildElementInfoFromProjectNode(
            modelData.ifcAPI,
            modelData.modelID,
            node,
            projectTreeIndex,
            fallbackDimensions,
            { unitSymbol: modelData.lengthUnitSymbol },
          ),
        );
        if (alwaysFitEnabled) {
          handleFitProjectNode(node);
        }
        return;
      }
    }

    if (alwaysFitEnabled && window.fitToExpressIDs) {
      window.fitToExpressIDs([data.expressID]);
    }
    setElementInfo(
      buildElementInfoFromPick(data, {
        unitSymbol: modelData.lengthUnitSymbol,
        projectTreeIndex,
      }),
    );
  }, [
    alwaysFitEnabled,
    handleFitProjectNode,
    handleIsolateExpandToParentScope,
    handleSelectProjectNode,
    measureStart,
    modelData,
    pickMode,
    projectTreeIndex,
  ]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sceneBackgroundColor, sceneBackgroundColor);
  }, [sceneBackgroundColor]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.highlightColor, highlightColor);
  }, [highlightColor]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.pickMode, pickMode);
  }, [pickMode]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.alwaysFitEnabled, alwaysFitEnabled ? "1" : "0");
  }, [alwaysFitEnabled]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.showRelatedElements, showRelatedElements ? "1" : "0");
  }, [showRelatedElements]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useLayoutEffect(() => {
    const persistentEntries = recentIfcFiles.filter((entry) => !entry.path.startsWith("blob:"));
    localStorage.setItem(STORAGE_KEYS.recentIfcFiles, JSON.stringify(persistentEntries));
  }, [recentIfcFiles]);

  useLayoutEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.sectionEnabled, sectionEnabled ? "1" : "0");
  }, [sectionEnabled]);

  useLayoutEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.sectionAxis, sectionAxis);
  }, [sectionAxis]);

  useLayoutEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.sectionPercent, String(sectionPercent));
  }, [sectionPercent]);

  useLayoutEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.sectionInverted, sectionInverted ? "1" : "0");
  }, [sectionInverted]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingTarget =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable === true;
      const isQuestionMark = event.key === "?" || (event.code === "Slash" && event.shiftKey);

      if (event.key === "Escape" && shortcutsOpen) {
        event.preventDefault();
        setShortcutsOpen(false);
        return;
      }

      if (isQuestionMark && !isTypingTarget) {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (isTypingTarget) return;

      if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.repeat && event.code === "KeyR") {
        event.preventDefault();
        handleZoomParent();
        return;
      }

      if (!event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;

      if (event.code === "KeyS") {
        event.preventDefault();
        handlePickModeChange("select");
        return;
      }
      if (event.code === "KeyI") {
        event.preventDefault();
        handlePickModeChange("isolate");
        return;
      }
      if (event.code === "KeyM") {
        event.preventDefault();
        handlePickModeChange("measure");
        return;
      }
      if (event.code === "KeyN") {
        event.preventDefault();
        handlePickModeChange("inspect");
        return;
      }
      if (event.code === "KeyC") {
        event.preventDefault();
        setSectionEnabled((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePickModeChange, handleZoomParent, shortcutsOpen]);

  useEffect(() => {
    setRelatedPanelDismissed(false);
  }, [elementInfo?.expressID]);

  return (
    <div className="app">
      <AppHeader
        fileInputRef={fileInputRef}
        onOpenIfc={handleOpenIfc}
        onFileChange={handleFileChange}
        recentIfcFiles={recentIfcFiles}
        onOpenRecentIfc={handleOpenRecentIfc}
        onOpenHelp={handleOpenHelp}
        pickMode={pickMode}
        onPickModeChange={handlePickModeChange}
        onIsolateModeDoubleClick={handleIsolateButtonDoubleClick}
        sectionEnabled={sectionEnabled}
        sectionAxis={sectionAxis}
        sectionPercent={sectionPercent}
        sectionInverted={sectionInverted}
        sectionSliderDisabled={!modelData}
        onSectionEnabledChange={setSectionEnabled}
        onSectionAxisChange={setSectionAxis}
        onSectionPercentChange={setSectionPercent}
        onSectionInvertedChange={setSectionInverted}
        onSectionReset={() => {
          setSectionEnabled(false);
          setSectionAxis("y");
          setSectionPercent(50);
          setSectionInverted(false);
        }}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={handleBreadcrumbClick}
        onBreadcrumbFit={handleBreadcrumbFit}
        sceneBackgroundColor={sceneBackgroundColor}
        highlightColor={highlightColor}
        onSceneBackgroundColorChange={handleSceneBackgroundColorChange}
        onHighlightColorChange={handleHighlightColorChange}
        showRelatedElements={showRelatedElements}
        onShowRelatedElementsChange={setShowRelatedElements}
        onClearUserSettings={handleClearUserSettings}
      />

      <ElementInfoPanel
        elementInfo={elementInfo}
        onClose={() => setElementInfo(null)}
        sidebarCollapsed={sidebarCollapsed}
      />
      {showRelatedElements && !relatedPanelDismissed && (
        <RelatedElementsPanel
          relatedElements={elementInfo?.relatedElements ?? []}
          selectedExpressIDs={selectedProjectExpressIDs}
          onSelectRelatedExpressID={handleSelectRelatedExpressID}
          onClose={() => setRelatedPanelDismissed(true)}
        />
      )}
      <KeyboardShortcuts
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        sidebarCollapsed={sidebarCollapsed}
      />

      <div className="main-container">
        <Sidebar
          sidebarCollapsed={sidebarCollapsed}
          activeTab={activeTab}
          projectInfo={projectInfo}
          projectTreeIndex={projectTreeIndex}
          lengthUnitSymbol={modelData?.lengthUnitSymbol ?? "m"}
          selectedProjectExpressID={selectedProjectExpressID}
          selectedProjectExpressIDs={selectedProjectExpressIDs}
          isVisibilityFiltered={visibleExpressIDs !== null || hiddenExpressIDs.size > 0}
          visibleCount={effectiveVisibleCount}
          hiddenExpressIDs={hiddenExpressIDs}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          onSetTab={setActiveTab}
          onSelectProjectNode={handleSelectProjectNode}
          onSetNodeVisibility={handleSetNodeVisibility}
          onDisplaySearchResults={handleDisplaySearchResults}
          onFitProjectNode={handleFitProjectNode}
          onManualFitProjectNode={handleManualFitProjectNode}
          onZoomParent={handleZoomParent}
          canZoomParent={canZoomParent}
          alwaysFitEnabled={alwaysFitEnabled}
          onToggleAlwaysFit={() => setAlwaysFitEnabled((prev) => !prev)}
          onResetVisibility={handleResetVisibility}
        />

        <main className="canvas-container">
          <BabylonScene
            onModelLoaded={handleModelLoaded}
            visibleExpressIDs={visibleExpressIDs}
            hiddenExpressIDs={hiddenExpressIDs}
            onElementPicked={handleElementPicked}
            sceneBackgroundColor={sceneBackgroundColor}
            highlightColor={highlightColor}
            sectionState={{ enabled: sectionEnabled, axis: sectionAxis, position: sectionPosition, inverted: sectionInverted }}
            pickMode={pickMode}
            pickingEnabled={pickMode !== "explore"}
            measurePinnedFirstExpressID={measurePinnedFirstExpressID}
          />
        </main>
      </div>

      <footer className="footer">
        <div className="footer-file-info">
          {footerFileInfo ? (
            <>
              <span>{footerFileInfo.name}</span>
              <span className="footer-file-size">{footerFileInfo.sizeMb}</span>
            </>
          ) : (
            "No model loaded"
          )}
        </div>
        <button
          type="button"
          className={`footer-shortcuts-link ${sidebarCollapsed ? "sidebar-collapsed" : "sidebar-open"}`}
          onClick={() => setShortcutsOpen(true)}
        >
          Keyboard Shortcuts: Shift+?
        </button>
      </footer>
    </div>
  );
}

export default App;
