import { InfoIcon, ProjectTreeIcon } from "./Icons";
import ProjectTab from "./sidebar/ProjectTab";
import InfoTab from "./sidebar/InfoTab";
import type { TabType } from "../types/app";
import type { ProjectInfoResult } from "babylon-ifc-loader";
import type { IfcProjectTreeIndex, IfcProjectTreeNode } from "../utils/projectTreeUtils";

interface SidebarProps {
  sidebarCollapsed: boolean;
  activeTab: TabType;
  projectInfo: ProjectInfoResult | null;
  projectTreeIndex: IfcProjectTreeIndex | null;
  lengthUnitSymbol: string;
  selectedProjectExpressID: number | null;
  selectedProjectExpressIDs: Set<number>;
  hiddenExpressIDs: Set<number>;
  isVisibilityFiltered: boolean;
  visibleCount: number | null;
  onToggleSidebar: () => void;
  onSetTab: (tab: TabType) => void;
  onSelectProjectNode: (
    node: IfcProjectTreeNode | null,
    options?: { append?: boolean; replaceExpressIDs?: number[] },
  ) => void;
  onSetNodeVisibility: (expressID: number, visible: boolean) => void;
  onDisplaySearchResults: (expressIDs: number[]) => void;
  onFitProjectNode: (node: IfcProjectTreeNode | null) => void;
  onManualFitProjectNode: (node: IfcProjectTreeNode | null) => void;
  onZoomParent: () => void;
  canZoomParent: boolean;
  alwaysFitEnabled: boolean;
  onToggleAlwaysFit: () => void;
  onResetVisibility: () => void;
}

function Sidebar({
  sidebarCollapsed,
  activeTab,
  projectInfo,
  projectTreeIndex,
  lengthUnitSymbol,
  selectedProjectExpressID,
  selectedProjectExpressIDs,
  hiddenExpressIDs,
  isVisibilityFiltered,
  visibleCount,
  onToggleSidebar,
  onSetTab,
  onSelectProjectNode,
  onSetNodeVisibility,
  onDisplaySearchResults,
  onFitProjectNode,
  onManualFitProjectNode,
  onZoomParent,
  canZoomParent,
  alwaysFitEnabled,
  onToggleAlwaysFit,
  onResetVisibility,
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
          <button className={`sidebar-tab ${activeTab === "info" ? "active" : ""}`} onClick={() => onSetTab("info")} title="Info">
            <InfoIcon />
          </button>
        </div>
        <button className="sidebar-toggle" onClick={onToggleSidebar}>
          {sidebarCollapsed ? ">" : "<"}
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === "project" && (
          <ProjectTab
            key={projectTreeIndex ? `project-tree-${projectTreeIndex.nodes.size}-${projectTreeIndex.roots.join("-")}` : "project-tree-empty"}
            treeIndex={projectTreeIndex}
            selectedExpressID={selectedProjectExpressID}
            selectedExpressIDs={selectedProjectExpressIDs}
            hiddenExpressIDs={hiddenExpressIDs}
            lengthUnitSymbol={lengthUnitSymbol}
            onSelectNode={onSelectProjectNode}
            onSetNodeVisibility={onSetNodeVisibility}
            onDisplaySearchResults={onDisplaySearchResults}
            onFitNode={onFitProjectNode}
            onManualFitNode={onManualFitProjectNode}
            onZoomParent={onZoomParent}
            canZoomParent={canZoomParent}
            alwaysFitEnabled={alwaysFitEnabled}
            onToggleAlwaysFit={onToggleAlwaysFit}
          />
        )}
        {activeTab === "info" && <InfoTab projectInfo={projectInfo} />}
      </div>

      <div className="sidebar-footer">
        {activeTab === "project" ? (
          <div className={`sidebar-visibility ${isVisibilityFiltered ? "filtered" : "all-visible"}`}>
            <span className="sidebar-visibility-text">
              {isVisibilityFiltered
                ? `Visibility filtered${visibleCount !== null ? ` (${visibleCount})` : ""}`
                : "All visible"}
            </span>
            {isVisibilityFiltered && (
              <button type="button" className="sidebar-visibility-reset" onClick={onResetVisibility}>
                Show All
              </button>
            )}
          </div>
        ) : (
          "Footer"
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
