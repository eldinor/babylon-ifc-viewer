import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import "./App.css";
import BabylonScene, { type IfcModelData } from "./components/BabylonScene";
import AppHeader from "./components/AppHeader";
import ElementInfoPanel from "./components/ElementInfoPanel";
import Sidebar from "./components/Sidebar";
import { useModelData } from "./hooks/useModelData";
import type { ElementPickData } from "./utils/pickingUtils";
import type { PickMode, SectionAxis, TabType } from "./types/app";
import { collectSubtreeExpressIDs, type IfcProjectTreeIndex, type IfcProjectTreeNode } from "./utils/projectTreeUtils";
import type { ElementInfoData } from "./types/elementInfo";
import { buildElementInfoFromPick, buildElementInfoFromProjectNode } from "./utils/elementInfoUtils";

const STORAGE_KEYS = {
  sceneBackgroundColor: "viewer.sceneBackgroundColor",
  highlightColor: "viewer.highlightColor",
} as const;

const SESSION_KEYS = {
  sectionEnabled: "viewer.session.section.enabled",
  sectionAxis: "viewer.session.section.axis",
  sectionPercent: "viewer.session.section.percent",
} as const;

const DEFAULT_SCENE_BACKGROUND = "#18003d";
const DEFAULT_HIGHLIGHT = "#008080";

function isHexColor(value: string | null): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isSectionAxis(value: string | null): value is SectionAxis {
  return value === "x" || value === "y" || value === "z";
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

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectTreeIndexRef = useRef<IfcProjectTreeIndex | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("project");
  const [pickMode, setPickMode] = useState<PickMode>("select");
  const [sectionEnabled, setSectionEnabled] = useState<boolean>(() => readSessionBool(SESSION_KEYS.sectionEnabled, false));
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>(() => {
    const stored = sessionStorage.getItem(SESSION_KEYS.sectionAxis);
    return isSectionAxis(stored) ? stored : "y";
  });
  const [sectionPercent, setSectionPercent] = useState<number>(() => readSessionPercent(SESSION_KEYS.sectionPercent, 50));
  const [elementInfo, setElementInfo] = useState<ElementInfoData | null>(null);
  const [selectedProjectExpressID, setSelectedProjectExpressID] = useState<number | null>(null);
  const [visibleExpressIDs, setVisibleExpressIDs] = useState<Set<number> | null>(null);
  const [alwaysFitEnabled, setAlwaysFitEnabled] = useState(false);
  const [canRestoreView, setCanRestoreView] = useState(false);
  const [measureStart, setMeasureStart] = useState<{ expressID: number; center: { x: number; y: number; z: number } } | null>(null);
  const [sceneBackgroundColor, setSceneBackgroundColor] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.sceneBackgroundColor);
    return isHexColor(stored) ? stored : DEFAULT_SCENE_BACKGROUND;
  });
  const [highlightColor, setHighlightColor] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.highlightColor);
    return isHexColor(stored) ? stored : DEFAULT_HIGHLIGHT;
  });

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
    localStorage.removeItem(STORAGE_KEYS.sceneBackgroundColor);
    localStorage.removeItem(STORAGE_KEYS.highlightColor);
    setSectionEnabled(false);
    setSectionAxis("y");
    setSectionPercent(50);
    sessionStorage.removeItem(SESSION_KEYS.sectionEnabled);
    sessionStorage.removeItem(SESSION_KEYS.sectionAxis);
    sessionStorage.removeItem(SESSION_KEYS.sectionPercent);
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && window.loadIfcFile) {
      window.loadIfcFile(file);
    }
    event.target.value = "";
  }, []);

  const handleModelLoaded = useCallback(
    (data: IfcModelData | null) => {
      setModelData(data);
      setSelectedProjectExpressID(null);
      setVisibleExpressIDs(null);
      setElementInfo(null);
      setMeasureStart(null);
      setActiveTab("project");
    },
    [setModelData],
  );

  const clearProjectTreeSelection = useCallback(() => {
    setSelectedProjectExpressID(null);
    setVisibleExpressIDs(null);
    setElementInfo((prev) => (prev?.source === "projectTree" ? null : prev));
  }, []);

  const handleResetVisibility = useCallback(() => {
    setVisibleExpressIDs(null);
  }, []);

  const handleSelectProjectNode = useCallback((node: IfcProjectTreeNode | null) => {
    if (!node) {
      clearProjectTreeSelection();
      return;
    }

    if (!projectTreeIndex) return;
    const subtreeIDs = collectSubtreeExpressIDs(node.expressID, projectTreeIndex);
    setSelectedProjectExpressID(node.expressID);
    setVisibleExpressIDs(new Set(subtreeIDs));
    if (modelData) {
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
    }
    if (alwaysFitEnabled && window.fitToExpressIDs) {
      window.fitToExpressIDs(subtreeIDs);
    }
  }, [alwaysFitEnabled, clearProjectTreeSelection, modelData, projectTreeIndex]);

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
    const saved = window.saveCurrentView?.() ?? false;
    if (saved) {
      setCanRestoreView(true);
    }
    handleFitProjectNode(node);
  }, [handleFitProjectNode]);

  const handleRestoreView = useCallback(() => {
    const restored = window.restoreSavedView?.() ?? false;
    if (!restored) {
      setCanRestoreView(false);
    }
  }, []);

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

    if (pickMode === "measure") {
      const center = getPickedCenter(data);
      if (!center) return;
      const unitSymbol = modelData?.lengthUnitSymbol ?? "m";

      if (!measureStart) {
        setMeasureStart({ expressID: data.expressID, center });
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
      setMeasureStart(null);
      return;
    }

    if (pickMode === "inspect") {
      setElementInfo(buildElementInfoFromPick(data, { unitSymbol: modelData?.lengthUnitSymbol }));
      return;
    }

    if (pickMode === "isolate") {
      if (!modelData || !projectTreeIndex) {
        setVisibleExpressIDs(new Set([data.expressID]));
        if (alwaysFitEnabled && window.fitToExpressIDs) {
          window.fitToExpressIDs([data.expressID]);
        }
        setElementInfo(buildElementInfoFromPick(data, { unitSymbol: modelData?.lengthUnitSymbol }));
        return;
      }

      const node = projectTreeIndex.nodes.get(data.expressID) ?? null;
      if (node) {
        handleSelectProjectNode(node);
        return;
      }

      setSelectedProjectExpressID(null);
      setVisibleExpressIDs(new Set([data.expressID]));
      if (alwaysFitEnabled && window.fitToExpressIDs) {
        window.fitToExpressIDs([data.expressID]);
      }
      setElementInfo(buildElementInfoFromPick(data, { unitSymbol: modelData.lengthUnitSymbol }));
      return;
    }

    if (!modelData || !projectTreeIndex) {
      setElementInfo(buildElementInfoFromPick(data, { unitSymbol: modelData?.lengthUnitSymbol }));
      return;
    }

    const treeIndex = projectTreeIndexRef.current;
    if (!treeIndex) return;

    if (treeIndex.nodes.has(data.expressID)) {
      setSelectedProjectExpressID(data.expressID);
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
    setElementInfo(buildElementInfoFromPick(data, { unitSymbol: modelData.lengthUnitSymbol }));
  }, [alwaysFitEnabled, handleFitProjectNode, handleSelectProjectNode, measureStart, modelData, pickMode, projectTreeIndex]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sceneBackgroundColor, sceneBackgroundColor);
  }, [sceneBackgroundColor]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.highlightColor, highlightColor);
  }, [highlightColor]);

  useLayoutEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.sectionEnabled, sectionEnabled ? "1" : "0");
  }, [sectionEnabled]);

  useLayoutEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.sectionAxis, sectionAxis);
  }, [sectionAxis]);

  useLayoutEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.sectionPercent, String(sectionPercent));
  }, [sectionPercent]);

  return (
    <div className="app">
      <AppHeader
        fileInputRef={fileInputRef}
        onOpenIfc={handleOpenIfc}
        onFileChange={handleFileChange}
        onOpenHelp={handleOpenHelp}
        pickMode={pickMode}
        onPickModeChange={handlePickModeChange}
        sectionEnabled={sectionEnabled}
        sectionAxis={sectionAxis}
        sectionPercent={sectionPercent}
        sectionSliderDisabled={!modelData}
        onSectionEnabledChange={setSectionEnabled}
        onSectionAxisChange={setSectionAxis}
        onSectionPercentChange={setSectionPercent}
        onSectionReset={() => {
          setSectionEnabled(false);
          setSectionAxis("y");
          setSectionPercent(50);
        }}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={handleBreadcrumbClick}
        onBreadcrumbFit={handleBreadcrumbFit}
        sceneBackgroundColor={sceneBackgroundColor}
        highlightColor={highlightColor}
        onSceneBackgroundColorChange={handleSceneBackgroundColorChange}
        onHighlightColorChange={handleHighlightColorChange}
        onClearUserSettings={handleClearUserSettings}
      />

      <ElementInfoPanel
        elementInfo={elementInfo}
        onClose={() => setElementInfo(null)}
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
          isVisibilityFiltered={visibleExpressIDs !== null}
          visibleCount={visibleExpressIDs?.size ?? null}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          onSetTab={setActiveTab}
          onSelectProjectNode={handleSelectProjectNode}
          onFitProjectNode={handleFitProjectNode}
          onManualFitProjectNode={handleManualFitProjectNode}
          onRestoreView={handleRestoreView}
          canRestoreView={canRestoreView}
          alwaysFitEnabled={alwaysFitEnabled}
          onToggleAlwaysFit={() => setAlwaysFitEnabled((prev) => !prev)}
          onResetVisibility={handleResetVisibility}
        />

        <main className="canvas-container">
          <BabylonScene
            onModelLoaded={handleModelLoaded}
            visibleExpressIDs={visibleExpressIDs}
            onElementPicked={handleElementPicked}
            sceneBackgroundColor={sceneBackgroundColor}
            highlightColor={highlightColor}
            sectionState={{ enabled: sectionEnabled, axis: sectionAxis, position: sectionPosition }}
          />
        </main>
      </div>

      <footer className="footer">
        {footerFileInfo ? (
          <>
            <span>{footerFileInfo.name}</span>
            <span className="footer-file-size">{footerFileInfo.sizeMb}</span>
          </>
        ) : (
          "No model loaded"
        )}
      </footer>
    </div>
  );
}

export default App;
