import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { MouseEvent } from "react";
import "./App.css";
import BabylonScene, { type IfcModelData } from "./components/BabylonScene";
import AppHeader from "./components/AppHeader";
import ElementInfoPanel from "./components/ElementInfoPanel";
import Sidebar from "./components/Sidebar";
import { useModelData } from "./hooks/useModelData";
import { useStoreyVisibility } from "./hooks/useStoreyVisibility";
import type { ElementPickData } from "./utils/pickingUtils";
import type { TabType } from "./types/app";
import { collectSubtreeExpressIDs, type IfcProjectTreeIndex, type IfcProjectTreeNode } from "./utils/projectTreeUtils";
import type { ElementInfoData } from "./types/elementInfo";
import { buildElementInfoFromPick, buildElementInfoFromProjectNode } from "./utils/elementInfoUtils";

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectTreeIndexRef = useRef<IfcProjectTreeIndex | null>(null);
  const storeyMapRef = useRef<Map<number, number> | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("project");
  const [elementInfo, setElementInfo] = useState<ElementInfoData | null>(null);
  const [selectedProjectExpressID, setSelectedProjectExpressID] = useState<number | null>(null);
  const [visibleExpressIDs, setVisibleExpressIDs] = useState<Set<number> | null>(null);

  const handleModelCleared = useCallback(() => {
    setElementInfo(null);
  }, []);

  const { modelData, projectInfo, storeys, siteInfo, projectTreeIndex, handleModelLoaded: setModelData } = useModelData(
    handleModelCleared,
  );

  useLayoutEffect(() => {
    projectTreeIndexRef.current = projectTreeIndex;
  }, [projectTreeIndex]);

  useLayoutEffect(() => {
    storeyMapRef.current = modelData?.storeyMap;
  }, [modelData]);

  const {
    visibleStoreyIds,
    isSiteVisible,
    resetVisibility,
    handleStoreyClick,
    handleSiteClick,
    handleAllStoreysClick,
    toggleStoreyVisibility,
    toggleSiteVisibility,
  } = useStoreyVisibility(storeys);

  const handleOpenIfc = useCallback(() => {
    fileInputRef.current?.click();
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
      resetVisibility();
      setSelectedProjectExpressID(null);
      setVisibleExpressIDs(null);
      setElementInfo(null);
      setActiveTab("project");
    },
    [resetVisibility, setModelData],
  );

  const clearProjectTreeSelection = useCallback(() => {
    setSelectedProjectExpressID(null);
    setVisibleExpressIDs(null);
    setElementInfo((prev) => (prev?.source === "projectTree" ? null : prev));
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
      setElementInfo(buildElementInfoFromProjectNode(modelData.ifcAPI, modelData.modelID, node, projectTreeIndex));
    }
  }, [clearProjectTreeSelection, modelData, projectTreeIndex]);

  const handleStoreyClickWithReset = useCallback(
    (storeyId: number) => {
      clearProjectTreeSelection();
      handleStoreyClick(storeyId);
    },
    [clearProjectTreeSelection, handleStoreyClick],
  );

  const handleSiteClickWithReset = useCallback(() => {
    clearProjectTreeSelection();
    handleSiteClick();
  }, [clearProjectTreeSelection, handleSiteClick]);

  const handleAllStoreysClickWithReset = useCallback(() => {
    clearProjectTreeSelection();
    handleAllStoreysClick();
  }, [clearProjectTreeSelection, handleAllStoreysClick]);

  const toggleStoreyVisibilityWithReset = useCallback(
    (storeyId: number, event: MouseEvent) => {
      clearProjectTreeSelection();
      toggleStoreyVisibility(storeyId, event);
    },
    [clearProjectTreeSelection, toggleStoreyVisibility],
  );

  const toggleSiteVisibilityWithReset = useCallback(
    (event: MouseEvent) => {
      clearProjectTreeSelection();
      toggleSiteVisibility(event);
    },
    [clearProjectTreeSelection, toggleSiteVisibility],
  );

  const handleElementPicked = useCallback((data: ElementPickData | null) => {
    if (!data) {
      setElementInfo(null);
      return;
    }
    setElementInfo(buildElementInfoFromPick(data));
    const treeIndex = projectTreeIndexRef.current;
    if (!treeIndex) return;

    if (treeIndex.nodes.has(data.expressID)) {
      setSelectedProjectExpressID(data.expressID);
      return;
    }

    const fallbackStoreyID = storeyMapRef.current?.get(data.expressID);
    if (fallbackStoreyID !== undefined && treeIndex.nodes.has(fallbackStoreyID)) {
      setSelectedProjectExpressID(fallbackStoreyID);
    }
  }, []);

  return (
    <div className="app">
      <AppHeader fileInputRef={fileInputRef} onOpenIfc={handleOpenIfc} onFileChange={handleFileChange} />

      <ElementInfoPanel elementInfo={elementInfo} onClose={() => setElementInfo(null)} />

      <div className="main-container">
        <Sidebar
          sidebarCollapsed={sidebarCollapsed}
          activeTab={activeTab}
          projectInfo={projectInfo}
          storeys={storeys}
          siteInfo={siteInfo}
          projectTreeIndex={projectTreeIndex}
          visibleStoreyIds={visibleStoreyIds}
          isSiteVisible={isSiteVisible}
          selectedProjectExpressID={selectedProjectExpressID}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          onSetTab={setActiveTab}
          onSelectProjectNode={handleSelectProjectNode}
          onStoreyClick={handleStoreyClickWithReset}
          onSiteClick={handleSiteClickWithReset}
          onAllStoreysClick={handleAllStoreysClickWithReset}
          onToggleStoreyVisibility={toggleStoreyVisibilityWithReset}
          onToggleSiteVisibility={toggleSiteVisibilityWithReset}
        />

        <main className="canvas-container">
          <BabylonScene
            onModelLoaded={handleModelLoaded}
            storeyMap={modelData?.storeyMap}
            siteExpressId={siteInfo?.expressID ?? null}
            visibleStoreyIds={visibleStoreyIds}
            isSiteVisible={isSiteVisible}
            visibleExpressIDs={visibleExpressIDs}
            onElementPicked={handleElementPicked}
          />
        </main>
      </div>

      <footer className="footer">(c) 2026 Babylon.js IFC Viewer</footer>
    </div>
  );
}

export default App;
