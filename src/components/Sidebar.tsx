import type { MouseEvent } from "react";
import { BuildingIcon, InfoIcon, ProjectTreeIcon } from "./Icons";
import StoreyTab from "./sidebar/StoreyTab";
import ProjectTab from "./sidebar/ProjectTab";
import InfoTab from "./sidebar/InfoTab";
import type { TabType } from "../types/app";
import type { StoreyInfo, SiteInfo } from "../utils/ifcUtils";
import type { ProjectInfoResult } from "babylon-ifc-loader";
import type { IfcProjectTreeIndex, IfcProjectTreeNode } from "../utils/projectTreeUtils";

interface SidebarProps {
  sidebarCollapsed: boolean;
  activeTab: TabType;
  projectInfo: ProjectInfoResult | null;
  storeys: StoreyInfo[];
  siteInfo: SiteInfo | null;
  projectTreeIndex: IfcProjectTreeIndex | null;
  visibleStoreyIds: Set<number> | null;
  isSiteVisible: boolean;
  selectedProjectExpressID: number | null;
  onToggleSidebar: () => void;
  onSetTab: (tab: TabType) => void;
  onSelectProjectNode: (node: IfcProjectTreeNode | null) => void;
  onStoreyClick: (storeyId: number) => void;
  onSiteClick: () => void;
  onAllStoreysClick: () => void;
  onToggleStoreyVisibility: (storeyId: number, event: MouseEvent) => void;
  onToggleSiteVisibility: (event: MouseEvent) => void;
}

function Sidebar({
  sidebarCollapsed,
  activeTab,
  projectInfo,
  storeys,
  siteInfo,
  projectTreeIndex,
  visibleStoreyIds,
  isSiteVisible,
  selectedProjectExpressID,
  onToggleSidebar,
  onSetTab,
  onSelectProjectNode,
  onStoreyClick,
  onSiteClick,
  onAllStoreysClick,
  onToggleStoreyVisibility,
  onToggleSiteVisibility,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-header-tabs">
          <button
            className={`sidebar-tab ${activeTab === "project" ? "active" : ""}`}
            onClick={() => onSetTab("project")}
            title="Project Tree"
          >
            <ProjectTreeIcon />
          </button>
          <button
            className={`sidebar-tab ${activeTab === "storey" ? "active" : ""}`}
            onClick={() => onSetTab("storey")}
            title="Storey Navigation"
          >
            <BuildingIcon />
          </button>
          <button className={`sidebar-tab ${activeTab === "info" ? "active" : ""}`} onClick={() => onSetTab("info")} title="Info">
            <InfoIcon />
          </button>
        </div>
        <button className="sidebar-toggle" onClick={onToggleSidebar}>
          {sidebarCollapsed ? ">" : "<"}
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === "storey" && (
          <StoreyTab
            storeys={storeys}
            siteInfo={siteInfo}
            visibleStoreyIds={visibleStoreyIds}
            isSiteVisible={isSiteVisible}
            onStoreyClick={onStoreyClick}
            onSiteClick={onSiteClick}
            onAllStoreysClick={onAllStoreysClick}
            onToggleStoreyVisibility={onToggleStoreyVisibility}
            onToggleSiteVisibility={onToggleSiteVisibility}
          />
        )}
        {activeTab === "project" && (
          <ProjectTab
            key={projectTreeIndex ? `project-tree-${projectTreeIndex.nodes.size}-${projectTreeIndex.roots.join("-")}` : "project-tree-empty"}
            treeIndex={projectTreeIndex}
            selectedExpressID={selectedProjectExpressID}
            onSelectNode={onSelectProjectNode}
          />
        )}
        {activeTab === "info" && <InfoTab projectInfo={projectInfo} />}
      </div>

      <div className="sidebar-footer">Footer</div>
    </aside>
  );
}

export default Sidebar;
