import type { ChangeEvent, RefObject } from "react";
import { FolderOpenIcon, HelpIcon, SettingsIcon } from "./Icons";

interface HeaderBreadcrumbItem {
  expressID: number;
  name: string;
}

interface AppHeaderProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onOpenIfc: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenHelp: () => void;
  breadcrumbs: HeaderBreadcrumbItem[];
  onBreadcrumbClick: (expressID: number) => void;
}

function AppHeader({
  fileInputRef,
  onOpenIfc,
  onFileChange,
  onOpenHelp,
  breadcrumbs,
  onBreadcrumbClick,
}: AppHeaderProps) {
  return (
    <header className="header">
      <span className="header-title">Babylon.js IFC Viewer</span>
      <span className="header-breadcrumbs">
        {breadcrumbs.length === 0 ? (
          <span className="header-breadcrumb-placeholder">No selection</span>
        ) : (
          breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={crumb.expressID} className="header-breadcrumb-item">
                <button
                  type="button"
                  className={`header-crumb-btn ${isLast ? "current" : ""}`}
                  title={crumb.name}
                  onClick={() => onBreadcrumbClick(crumb.expressID)}
                >
                  {crumb.name}
                </button>
                {!isLast && <span className="header-crumb-sep">/</span>}
              </span>
            );
          })
        )}
      </span>
      <div className="header-icons">
        <button className="open-ifc-btn" onClick={onOpenIfc} title="Open IFC File">
          <FolderOpenIcon />
          <span>Open IFC</span>
        </button>
        <button className="header-icon-btn" title="Settings">
          <SettingsIcon />
        </button>
        <button className="header-icon-btn" title="Help" onClick={onOpenHelp}>
          <HelpIcon />
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept=".ifc" onChange={onFileChange} style={{ display: "none" }} />
    </header>
  );
}

export default AppHeader;
