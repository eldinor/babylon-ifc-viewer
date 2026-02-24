import { useState } from "react";
import type { ProjectInfoResult } from "babylon-ifc-loader";
import type { StoreyInfo, SiteInfo } from "../utils/ifcUtils";
import { BuildingIcon, ProjectTreeIcon, InfoIcon } from "./Icons";
import StoreyPanel from "./StoreyPanel";
import ProjectTreePanel from "./ProjectTreePanel";
import InfoPanel from "./InfoPanel";

type TabType = "storey" | "project" | "info";

interface SidebarProps {
  projectInfo: ProjectInfoResult | null;
  storeys: StoreyInfo[];
  siteInfo: SiteInfo | null;
  visibleStoreyIds: Set<number> | null;
  isSiteVisible: boolean;
  onVisibleStoreyIdsChange: (ids: Set<number> | null) => void;
  onSiteVisibleChange: (visible: boolean) => void;
  activeTab: TabType;
  onActiveTabChange: (tab: TabType) => void;
}

export default function Sidebar({
  projectInfo,
  storeys,
  siteInfo,
  visibleStoreyIds,
  isSiteVisible,
  onVisibleStoreyIdsChange,
  onSiteVisibleChange,
  activeTab,
  onActiveTabChange,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-header-tabs">
          <button
            className={`sidebar-tab ${activeTab === "storey" ? "active" : ""}`}
            onClick={() => onActiveTabChange("storey")}
            title="Storey Navigation"
          >
            <BuildingIcon />
          </button>
          <button
            className={`sidebar-tab ${activeTab === "project" ? "active" : ""}`}
            onClick={() => onActiveTabChange("project")}
            title="Project Tree"
          >
            <ProjectTreeIcon />
          </button>
          <button
            className={`sidebar-tab ${activeTab === "info" ? "active" : ""}`}
            onClick={() => onActiveTabChange("info")}
            title="Info"
          >
            <InfoIcon />
          </button>
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "\u25B6" : "\u25C0"}
        </button>
      </div>
      <div className="sidebar-content">
        {activeTab === "storey" ? (
          <StoreyPanel
            storeys={storeys}
            siteInfo={siteInfo}
            visibleStoreyIds={visibleStoreyIds}
            isSiteVisible={isSiteVisible}
            onVisibleStoreyIdsChange={onVisibleStoreyIdsChange}
            onSiteVisibleChange={onSiteVisibleChange}
          />
        ) : activeTab === "project" ? (
          <ProjectTreePanel />
        ) : activeTab === "info" ? (
          <InfoPanel projectInfo={projectInfo} />
        ) : null}
      </div>
      <div className="sidebar-footer">
        {storeys.length > 0
          ? `${storeys.length} storeys`
          : "No model loaded"}
      </div>
    </aside>
  );
}
