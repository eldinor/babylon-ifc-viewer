import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import "./App.css";
import BabylonScene, { type IfcModelData } from "./components/BabylonScene";
import AppHeader from "./components/AppHeader";
import ElementInfoPanel from "./components/ElementInfoPanel";
import Sidebar from "./components/Sidebar";
import { useModelData } from "./hooks/useModelData";
import type { ElementPickData } from "./utils/pickingUtils";
import type { TabType } from "./types/app";
import { collectSubtreeExpressIDs, type IfcProjectTreeIndex, type IfcProjectTreeNode } from "./utils/projectTreeUtils";
import type { ElementInfoData } from "./types/elementInfo";
import { buildElementInfoFromPick, buildElementInfoFromProjectNode } from "./utils/elementInfoUtils";

const STORAGE_KEYS = {
  sceneBackgroundColor: "viewer.sceneBackgroundColor",
  highlightColor: "viewer.highlightColor",
} as const;

const DEFAULT_SCENE_BACKGROUND = "#18003d";
const DEFAULT_HIGHLIGHT = "#008080";

function isHexColor(value: string | null): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectTreeIndexRef = useRef<IfcProjectTreeIndex | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("project");
  const [elementInfo, setElementInfo] = useState<ElementInfoData | null>(null);
  const [selectedProjectExpressID, setSelectedProjectExpressID] = useState<number | null>(null);
  const [visibleExpressIDs, setVisibleExpressIDs] = useState<Set<number> | null>(null);
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

  useLayoutEffect(() => {
    projectTreeIndexRef.current = projectTreeIndex;
  }, [projectTreeIndex]);

  const handleOpenIfc = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleOpenHelp = useCallback(() => {
    window.open("/user-guide.html", "_blank", "noopener,noreferrer");
  }, []);

  const handleSceneBackgroundColorChange = useCallback((color: string) => {
    if (!isHexColor(color)) return;
    setSceneBackgroundColor(color);
  }, []);

  const handleHighlightColorChange = useCallback((color: string) => {
    if (!isHexColor(color)) return;
    setHighlightColor(color);
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
  }, [clearProjectTreeSelection, modelData, projectTreeIndex]);

  const handleBreadcrumbClick = useCallback((expressID: number) => {
    if (!projectTreeIndex) return;
    const node = projectTreeIndex.nodes.get(expressID);
    if (!node) return;
    setActiveTab("project");
    handleSelectProjectNode(node);
  }, [handleSelectProjectNode, projectTreeIndex]);

  const handleElementPicked = useCallback((data: ElementPickData | null) => {
    if (!data) {
      setElementInfo(null);
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
        return;
      }
    }

    setElementInfo(buildElementInfoFromPick(data, { unitSymbol: modelData.lengthUnitSymbol }));
  }, [modelData, projectTreeIndex]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sceneBackgroundColor, sceneBackgroundColor);
  }, [sceneBackgroundColor]);

  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEYS.highlightColor, highlightColor);
  }, [highlightColor]);

  return (
    <div className="app">
      <AppHeader
        fileInputRef={fileInputRef}
        onOpenIfc={handleOpenIfc}
        onFileChange={handleFileChange}
        onOpenHelp={handleOpenHelp}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={handleBreadcrumbClick}
        sceneBackgroundColor={sceneBackgroundColor}
        highlightColor={highlightColor}
        onSceneBackgroundColorChange={handleSceneBackgroundColorChange}
        onHighlightColorChange={handleHighlightColorChange}
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
          onResetVisibility={handleResetVisibility}
        />

        <main className="canvas-container">
          <BabylonScene
            onModelLoaded={handleModelLoaded}
            visibleExpressIDs={visibleExpressIDs}
            onElementPicked={handleElementPicked}
            sceneBackgroundColor={sceneBackgroundColor}
            highlightColor={highlightColor}
          />
        </main>
      </div>

      <footer className="footer">(c) 2026 Babylon.js IFC Viewer</footer>
    </div>
  );
}

export default App;
