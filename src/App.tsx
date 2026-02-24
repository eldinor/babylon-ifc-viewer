import { useState, useRef, useCallback } from "react";
import "./App.css";
import BabylonScene, { type IfcModelData } from "./components/BabylonScene";
import { getBuildingStoreys, formatElevation, type StoreyInfo, getSite, type SiteInfo } from "./utils/ifcUtils";
import type { ProjectInfoResult } from "babylon-ifc-loader";
import type { ElementPickData } from "./utils/pickingUtils";
import { 
  FolderOpenIcon, 
  SettingsIcon, 
  HelpIcon, 
  BuildingIcon, 
  ProjectTreeIcon, 
  InfoIcon, 
  EyeOpenIcon, 
  EyeClosedIcon 
} from "./components/Icons";

type TabType = 'storey' | 'project' | 'info'

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("storey");
  const [projectInfo, setProjectInfo] = useState<ProjectInfoResult | null>(null);
  const [storeys, setStoreys] = useState<StoreyInfo[]>([]);
  const [modelData, setModelData] = useState<IfcModelData | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  // null means all visible, Set with IDs means only those storeys are visible
  const [visibleStoreyIds, setVisibleStoreyIds] = useState<Set<number> | null>(null);
  const [isSiteVisible, setIsSiteVisible] = useState(true);
  const [pickedElement, setPickedElement] = useState<ElementPickData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenIfc = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const win = window as unknown as { loadIfcFile?: (file: File | string) => Promise<void> };
      if (win.loadIfcFile) {
        win.loadIfcFile(file);
      }
    }
    // Reset input so same file can be selected again
    if (event.target) {
      event.target.value = "";
    }
  }, []);

const handleModelLoaded = useCallback((data: IfcModelData | null) => {
    if (data) {
      setModelData(data);
      setProjectInfo(data.projectInfo);

      // Get storeys from the model using persistentID
      const storeyList = getBuildingStoreys(
        data.ifcAPI,
        data.modelID,
        data.storeyMap,
      );
      setStoreys(storeyList);

      // Get site info using persistentID
      const site = getSite(data.ifcAPI, data.modelID);
      setSiteInfo(site);

      // Reset visible storeys when loading a new model (null = all visible)
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

  // Handle storey row click - select single storey
  const handleStoreyClick = useCallback((storeyId: number) => {
    setVisibleStoreyIds(new Set([storeyId]));
    // Keep site visible when clicking storey - allow site + storey visibility
    // setIsSiteVisible(false); // Commented out to keep site visible
  }, []);

  // Handle site row click - select site (hide all storeys)
  const handleSiteClick = useCallback(() => {
    setVisibleStoreyIds(new Set()); // Hide all storeys
    setIsSiteVisible(true); // Show site
  }, []);

  // Handle "All Storeys" click
  const handleAllStoreysClick = useCallback(() => {
    setVisibleStoreyIds(null); // null = all visible
    setIsSiteVisible(true);
  }, []);

  // Toggle storey visibility via eye icon
  const toggleStoreyVisibility = useCallback((storeyId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (visibleStoreyIds === null) {
      // All visible mode: clicking eye hides this storey
      const allStoreyIds = new Set(storeys.map(s => s.expressID));
      allStoreyIds.delete(storeyId);
      setVisibleStoreyIds(allStoreyIds);
    } else if (visibleStoreyIds.has(storeyId)) {
      // This storey is visible: hide it
      const newSet = new Set(visibleStoreyIds);
      newSet.delete(storeyId);
      if (newSet.size === 0) {
        // If no storeys visible, go back to all visible
        setVisibleStoreyIds(null);
      } else {
        setVisibleStoreyIds(newSet);
      }
    } else {
      // This storey is hidden: show it (add to visible set)
      const newSet = new Set(visibleStoreyIds);
      newSet.add(storeyId);
      setVisibleStoreyIds(newSet);
    }
  }, [visibleStoreyIds, storeys]);

// Toggle site visibility via eye icon
  const toggleSiteVisibility = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    
    // If site is currently hidden, make it visible AND select it (hide all storeys)
    if (!isSiteVisible) {
      setVisibleStoreyIds(new Set()); // Hide all storeys
      setIsSiteVisible(true); // Show site
    } else {
      // If site is currently visible, hide it (but maintain current storey selection state)
      setIsSiteVisible(false);
    }
  }, [isSiteVisible]);

// Handle picked element
  const handleElementPicked = useCallback((data: ElementPickData | null) => {
    setPickedElement(data);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">Babylon.js IFC Viewer</span>
        <div className="header-icons">
          <button className="open-ifc-btn" onClick={handleOpenIfc} title="Open IFC File">
            <FolderOpenIcon />
            <span>Open IFC</span>
          </button>
          <button className="header-icon-btn" title="Settings">
            <SettingsIcon />
          </button>
          <button className="header-icon-btn" title="Help">
            <HelpIcon />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ifc"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </header>
      {/* Hidden Element Info Div - shows when element is picked */}
      {pickedElement && (
        <div className="element-info-panel">
          <div className="element-info-header">
            <h3>Element Info</h3>
            <button 
              className="close-info-btn"
              onClick={() => handleElementPicked(null)}
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="element-info-content">
            <div className="picked-element-item">
              <span className="picked-element-label">Type:</span>
              <span className="picked-element-value">{pickedElement.typeName}</span>
            </div>
            <div className="picked-element-item">
              <span className="picked-element-label">Name:</span>
              <span className="picked-element-value" title={pickedElement.elementName}>{pickedElement.elementName}</span>
            </div>
            <div className="picked-element-item">
              <span className="picked-element-label">Express ID:</span>
              <span className="picked-element-value">{pickedElement.expressID}</span>
            </div>
          </div>
        </div>
      )}
      <div className="main-container">
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-header-tabs">
              <button 
                className={`sidebar-tab ${activeTab === 'storey' ? 'active' : ''}`}
                onClick={() => setActiveTab('storey')}
                title="Storey Navigation"
              >
                <BuildingIcon />
              </button>
              <button 
                className={`sidebar-tab ${activeTab === 'project' ? 'active' : ''}`}
                onClick={() => setActiveTab('project')}
                title="Project Tree"
              >
                <ProjectTreeIcon />
              </button>
              <button 
                className={`sidebar-tab ${activeTab === 'info' ? 'active' : ''}`}
                onClick={() => setActiveTab('info')}
                title="Info"
              >
                <InfoIcon />
              </button>
            </div>
            <button 
              className="sidebar-toggle" 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? '▶' : '◀'}
            </button>
          </div>
          <div className="sidebar-content">
{activeTab === "storey" ? (
              <div className="tab-panel">
                <h3>Storey Navigation</h3>
                <div className="storey-list">
                  {storeys.length > 0 ? (
                    <>
                      {/* "All Storeys" item */}
                      <div
                        className={`storey-item ${visibleStoreyIds === null ? "active" : ""}`}
                        onClick={handleAllStoreysClick}
                        title="Show all elements"
                      >
                        <span className="storey-name">All Storeys</span>
                      </div>
                      {/* Individual storeys */}
                      {storeys.map((storey) => {
                        // Eye is open if: all visible (null) or this storey is in visible set
                        const isEyeOpen = visibleStoreyIds === null || visibleStoreyIds.has(storey.expressID);
                        // Active if: this storey is the only one selected, OR if multiple are selected and this one is visible
                        const isActive = visibleStoreyIds !== null && (
                          (visibleStoreyIds.size === 1 && visibleStoreyIds.has(storey.expressID)) ||
                          (visibleStoreyIds.size > 1 && visibleStoreyIds.has(storey.expressID))
                        );
                        return (
                          <div
                            key={storey.expressID}
                            className={`storey-item ${isActive ? "active" : ""} ${!isEyeOpen ? "hidden" : ""}`}
                            onClick={() => handleStoreyClick(storey.expressID)}
                            title={`${storey.elementCount} elements`}
                          >
                            <button
                              className="visibility-btn"
                              onClick={(e) => toggleStoreyVisibility(storey.expressID, e)}
                              title={isEyeOpen ? "Hide storey" : "Show storey"}
                            >
                              {isEyeOpen ? <EyeOpenIcon /> : <EyeClosedIcon />}
                            </button>
                            <span className="storey-name">{storey.name}</span>
                            {storey.elevation !== null && (
                              <span className="storey-elevation">{formatElevation(storey.elevation)}</span>
                            )}
                            <span className="storey-count">({storey.elementCount})</span>
                          </div>
                        );
                      })}
                      {/* Site item */}
                      {siteInfo && (
                        <div
                          className={`storey-item site-item ${visibleStoreyIds === null && isSiteVisible ? "" : (isSiteVisible ? "" : "hidden")} ${visibleStoreyIds !== null && visibleStoreyIds.size === 0 ? "active" : ""} ${isSiteVisible ? "site-visible" : ""}`}
                          onClick={handleSiteClick}
                          title="Site elements"
                        >
                          <button
                            className="visibility-btn"
                            onClick={toggleSiteVisibility}
                            title={isSiteVisible ? "Hide site" : "Show site"}
                          >
                            {isSiteVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
                          </button>
                          <span className="storey-name">{siteInfo.name}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="storey-empty">
                      No storeys found in IFC model.
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'project' ? (
              <div className="tab-panel">
                <h3>Project Tree</h3>
                <div className="project-tree">
                  <div className="tree-item">
                    <span className="tree-expand">▼</span>
                    <span className="tree-name">Sample Building</span>
                  </div>
                  <div className="tree-children">
                    <div className="tree-item">
                      <span className="tree-expand">▼</span>
                      <span className="tree-name">Site</span>
                    </div>
                    <div className="tree-children">
                      <div className="tree-item">
                        <span className="tree-expand">▼</span>
                        <span className="tree-name">Building</span>
                      </div>
                      <div className="tree-children">
                        <div className="tree-item">
                          <span className="tree-expand">▶</span>
                          <span className="tree-name">Ground Floor</span>
                        </div>
                        <div className="tree-item">
                          <span className="tree-expand">▶</span>
                          <span className="tree-name">First Floor</span>
                        </div>
                        <div className="tree-item">
                          <span className="tree-expand">▶</span>
                          <span className="tree-name">Roof</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'info' ? (
              <div className="tab-panel">
                <h3>Info</h3>
                <div className="project-info">
                  {projectInfo ? (
                    <>
                      {projectInfo.projectName && (
                        <div className="project-item">
                          <span className="project-label">Project Name:</span>
                          <span className="project-value">{projectInfo.projectName}</span>
                        </div>
                      )}
                      {projectInfo.projectDescription && (
                        <div className="project-item">
                          <span className="project-label">Description:</span>
                          <span className="project-value">{projectInfo.projectDescription}</span>
                        </div>
                      )}
                      {projectInfo.application && (
                        <div className="project-item">
                          <span className="project-label">Application:</span>
                          <span className="project-value">{projectInfo.application}</span>
                        </div>
                      )}
                      {projectInfo.author && (
                        <div className="project-item">
                          <span className="project-label">Author:</span>
                          <span className="project-value">{projectInfo.author}</span>
                        </div>
                      )}
                      {projectInfo.organization && (
                        <div className="project-item">
                          <span className="project-label">Organization:</span>
                          <span className="project-value">{projectInfo.organization}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="project-item">
                      <span className="project-value">No IFC model loaded. Click "Open IFC" to load a file.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <div className="sidebar-footer">
            Footer
          </div>
        </aside>
        <main className="canvas-container">
<BabylonScene 
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
        © 2026 Babylon.js IFC Viewer
      </footer>
    </div>
  )
}

export default App