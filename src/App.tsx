import { useCallback, useLayoutEffect, useRef, useState } from "react";
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

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectTreeIndexRef = useRef<IfcProjectTreeIndex | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("project");
  const [elementInfo, setElementInfo] = useState<ElementInfoData | null>(null);
  const [selectedProjectExpressID, setSelectedProjectExpressID] = useState<number | null>(null);
  const [visibleExpressIDs, setVisibleExpressIDs] = useState<Set<number> | null>(null);

  const handleModelCleared = useCallback(() => {
    setElementInfo(null);
  }, []);

  const { modelData, projectInfo, projectTreeIndex, handleModelLoaded: setModelData } = useModelData(
    handleModelCleared,
  );

  useLayoutEffect(() => {
    projectTreeIndexRef.current = projectTreeIndex;
  }, [projectTreeIndex]);

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
          projectTreeIndex={projectTreeIndex}
          selectedProjectExpressID={selectedProjectExpressID}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          onSetTab={setActiveTab}
          onSelectProjectNode={handleSelectProjectNode}
        />

        <main className="canvas-container">
          <BabylonScene
            onModelLoaded={handleModelLoaded}
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
