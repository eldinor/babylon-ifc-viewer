import { useState, useRef, useCallback } from "react";
import "./App.css";
import BabylonScene, { type IfcModelData } from "./components/BabylonScene";
import { getBuildingStoreys, formatElevation, type StoreyInfo, getSite, type SiteInfo } from "./utils/ifcUtils";
import type { ProjectInfoResult } from "babylon-ifc-loader";
import type { ElementPickData } from "./utils/pickingUtils";

// Folder Open Icon
const FolderOpenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    <line x1="12" y1="11" x2="12" y2="17"></line>
    <line x1="9" y1="14" x2="15" y2="14"></line>
  </svg>
)

// SVG Icons as components
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
)

const HelpIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
)

const BuildingIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
    <line x1="9" y1="22" x2="9" y2="18"></line>
    <line x1="15" y1="22" x2="15" y2="18"></line>
    <line x1="8" y1="6" x2="8" y2="6.01"></line>
    <line x1="16" y1="6" x2="16" y2="6.01"></line>
    <line x1="8" y1="10" x2="8" y2="10.01"></line>
    <line x1="16" y1="10" x2="16" y2="10.01"></line>
    <line x1="8" y1="14" x2="8" y2="14.01"></line>
    <line x1="16" y1="14" x2="16" y2="14.01"></line>
  </svg>
)

const ProjectTreeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="3" x2="12" y2="7"></line>
    <line x1="6" y1="7" x2="6" y2="11"></line>
    <line x1="18" y1="7" x2="18" y2="11"></line>
    <line x1="12" y1="7" x2="12" y2="21"></line>
    <line x1="6" y1="11" x2="6" y2="15"></line>
    <line x1="18" y1="11" x2="18" y2="15"></line>
    <circle cx="12" cy="3" r="2"></circle>
    <circle cx="6" cy="7" r="2"></circle>
    <circle cx="18" cy="7" r="2"></circle>
    <circle cx="6" cy="15" r="2"></circle>
    <circle cx="18" cy="15" r="2"></circle>
  </svg>
)

const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
)

// Eye Icon (visible state)
const EyeOpenIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
)

// Eye Off Icon (hidden state)
const EyeClosedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
)

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

      // Get storeys from the model
      const storeyList = getBuildingStoreys(
        data.ifcAPI,
        data.modelID,
        data.storeyMap,
      );
      setStoreys(storeyList);

      // Get site info
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
    setIsSiteVisible(false); // Hide site when a storey is selected
  }, []);

  // Handle site row click - select site
  const handleSiteClick = useCallback(() => {
    setIsSiteVisible(true);
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
    setIsSiteVisible(prev => !prev);
  }, []);

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
              <span className="picked-element-value">{pickedElement.elementName}</span>
            </div>
            <div className="picked-element-item">
              <span className="picked-element-label">Express ID:</span>
              <span className="picked-element-value">{pickedElement.expressID}</span>
            </div>
            <div className="picked-element-item">
              <span className="picked-element-label">Model ID:</span>
              <span className="picked-element-value">{pickedElement.modelID}</span>
            </div>
            {pickedElement.materialName && (
              <div className="picked-element-item">
                <span className="picked-element-label">Element Material:</span>
                <span className="picked-element-value">{pickedElement.materialName}</span>
              </div>
            )}
            {pickedElement.colorId !== undefined && (
              <div className="picked-element-item">
                <span className="picked-element-label">Element ColorID:</span>
                <span className="picked-element-value">{pickedElement.colorId}</span>
              </div>
            )}
            {pickedElement.color && (
              <div className="picked-element-item">
                <span className="picked-element-label">Element Color:</span>
                <div className="color-display">
                  <div 
                    className="color-swatch"
                    style={{
                      backgroundColor: `rgba(${Math.round(pickedElement.color.r * 255)}, ${Math.round(pickedElement.color.g * 255)}, ${Math.round(pickedElement.color.b * 255)}, ${pickedElement.color.a})`,
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      marginRight: '8px'
                    }}
                  ></div>
                  <span className="picked-element-value">
                    RGB({Math.round(pickedElement.color.r * 255)}, {Math.round(pickedElement.color.g * 255)}, {Math.round(pickedElement.color.b * 255)})
                    {pickedElement.color.a !== 1 && `, A(${pickedElement.color.a.toFixed(2)})`}
                  </span>
                </div>
              </div>
            )}
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
                        const isActive = visibleStoreyIds !== null && visibleStoreyIds.size === 1 && visibleStoreyIds.has(storey.expressID);
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
                          className={`storey-item site-item ${visibleStoreyIds === null && isSiteVisible ? "" : (isSiteVisible ? "" : "hidden")}`}
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
                      No IFC model loaded. Click "Open IFC" to load a file.
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