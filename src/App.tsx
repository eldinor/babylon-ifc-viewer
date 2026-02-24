import { useState, useRef, useCallback } from "react";
import "./App.css";
import BabylonScene, { type IfcModelData, type BabylonSceneHandle } from "./components/BabylonScene";
import { getBuildingStoreys, type StoreyInfo, getSite, type SiteInfo } from "./utils/ifcUtils";
import type { ProjectInfoResult } from "babylon-ifc-loader";
import type { ElementPickData } from "./utils/pickingUtils";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ElementInfoPanel from "./components/ElementInfoPanel";

type TabType = "storey" | "project" | "info";

function App() {
  const [activeTab, setActiveTab] = useState<TabType>("storey");
  const [projectInfo, setProjectInfo] = useState<ProjectInfoResult | null>(null);
  const [storeys, setStoreys] = useState<StoreyInfo[]>([]);
  const [modelData, setModelData] = useState<IfcModelData | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [visibleStoreyIds, setVisibleStoreyIds] = useState<Set<number> | null>(null);
  const [isSiteVisible, setIsSiteVisible] = useState(true);
  const [pickedElement, setPickedElement] = useState<ElementPickData | null>(null);
  const sceneHandleRef = useRef<BabylonSceneHandle>(null);

  const handleFileSelected = useCallback((file: File) => {
    sceneHandleRef.current?.loadIfcFile(file);
  }, []);

  const handleModelLoaded = useCallback((data: IfcModelData | null) => {
    if (data) {
      setModelData(data);
      setProjectInfo(data.projectInfo);

      const storeyList = getBuildingStoreys(data.ifcAPI, data.modelID, data.storeyMap);
      setStoreys(storeyList);

      const site = getSite(data.ifcAPI, data.modelID);
      setSiteInfo(site);

      setVisibleStoreyIds(null);
      setIsSiteVisible(true);
      setActiveTab("storey");
    } else {
      setModelData(null);
      setProjectInfo(null);
      setStoreys([]);
      setSiteInfo(null);
      setVisibleStoreyIds(null);
      setIsSiteVisible(true);
      setPickedElement(null);
    }
  }, []);

  const handleElementPicked = useCallback((data: ElementPickData | null) => {
    setPickedElement(data);
  }, []);

  return (
    <div className="app">
      <Header onFileSelected={handleFileSelected} />
      {pickedElement && (
        <ElementInfoPanel
          pickedElement={pickedElement}
          onClose={() => handleElementPicked(null)}
        />
      )}
      <div className="main-container">
        <Sidebar
          projectInfo={projectInfo}
          storeys={storeys}
          siteInfo={siteInfo}
          visibleStoreyIds={visibleStoreyIds}
          isSiteVisible={isSiteVisible}
          onVisibleStoreyIdsChange={setVisibleStoreyIds}
          onSiteVisibleChange={setIsSiteVisible}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
        />
        <main className="canvas-container">
          <BabylonScene
            ref={sceneHandleRef}
            onModelLoaded={handleModelLoaded}
            storeyMap={modelData?.storeyMap}
            siteExpressId={siteInfo?.expressID ?? null}
            visibleStoreyIds={visibleStoreyIds}
            isSiteVisible={isSiteVisible}
            onElementPicked={handleElementPicked}
          />
        </main>
      </div>
      <footer className="footer">
        {'© 2026 Babylon.js IFC Viewer'}
      </footer>
    </div>
  );
}

export default App;
