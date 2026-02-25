import { useEffect, useRef, useState } from "react";
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
  sceneBackgroundColor: string;
  highlightColor: string;
  onSceneBackgroundColorChange: (color: string) => void;
  onHighlightColorChange: (color: string) => void;
}

function AppHeader({
  fileInputRef,
  onOpenIfc,
  onFileChange,
  onOpenHelp,
  breadcrumbs,
  onBreadcrumbClick,
  sceneBackgroundColor,
  highlightColor,
  onSceneBackgroundColorChange,
  onHighlightColorChange,
}: AppHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && settingsRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [settingsOpen]);

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
        <div className="header-settings-wrap" ref={settingsRef}>
          <button
            className={`header-icon-btn ${settingsOpen ? "active" : ""}`}
            title="Settings"
            onClick={() => setSettingsOpen((prev) => !prev)}
          >
            <SettingsIcon />
          </button>
          {settingsOpen && (
            <div className="settings-popover">
              <label className="settings-row">
                <span>Scene Background</span>
                <input
                  type="color"
                  value={sceneBackgroundColor}
                  onChange={(event) => onSceneBackgroundColorChange(event.target.value)}
                />
              </label>
              <label className="settings-row">
                <span>Highlight</span>
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(event) => onHighlightColorChange(event.target.value)}
                />
              </label>
            </div>
          )}
        </div>
        <button className="header-icon-btn" title="Help" onClick={onOpenHelp}>
          <HelpIcon />
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept=".ifc" onChange={onFileChange} style={{ display: "none" }} />
    </header>
  );
}

export default AppHeader;
