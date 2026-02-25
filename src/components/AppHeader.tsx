import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import type { PickMode, SectionAxis } from "../types/app";
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
  pickMode: PickMode;
  onPickModeChange: (mode: PickMode) => void;
  sectionEnabled: boolean;
  sectionAxis: SectionAxis;
  sectionPercent: number;
  sectionSliderDisabled: boolean;
  onSectionEnabledChange: (enabled: boolean) => void;
  onSectionAxisChange: (axis: SectionAxis) => void;
  onSectionPercentChange: (percent: number) => void;
  onSectionReset: () => void;
  breadcrumbs: HeaderBreadcrumbItem[];
  onBreadcrumbClick: (expressID: number) => void;
  onBreadcrumbFit: (expressID: number) => void;
  sceneBackgroundColor: string;
  highlightColor: string;
  onSceneBackgroundColorChange: (color: string) => void;
  onHighlightColorChange: (color: string) => void;
  onClearUserSettings: () => void;
}

function AppHeader({
  fileInputRef,
  onOpenIfc,
  onFileChange,
  onOpenHelp,
  pickMode,
  onPickModeChange,
  sectionEnabled,
  sectionAxis,
  sectionPercent,
  sectionSliderDisabled,
  onSectionEnabledChange,
  onSectionAxisChange,
  onSectionPercentChange,
  onSectionReset,
  breadcrumbs,
  onBreadcrumbClick,
  onBreadcrumbFit,
  sceneBackgroundColor,
  highlightColor,
  onSceneBackgroundColorChange,
  onHighlightColorChange,
  onClearUserSettings,
}: AppHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clipOpen, setClipOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen && !clipOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsRef.current?.contains(target)) return;
      if (clipRef.current?.contains(target)) return;
      setSettingsOpen(false);
      setClipOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [clipOpen, settingsOpen]);

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
                  onDoubleClick={() => onBreadcrumbFit(crumb.expressID)}
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
        <div className="pick-mode-toggle" title="Scene pick mode">
          <button
            type="button"
            className={`pick-mode-btn ${pickMode === "select" ? "active" : ""}`}
            onClick={() => onPickModeChange("select")}
          >
            Select
          </button>
          <button
            type="button"
            className={`pick-mode-btn ${pickMode === "isolate" ? "active" : ""}`}
            onClick={() => onPickModeChange("isolate")}
          >
            Isolate
          </button>
          <button
            type="button"
            className={`pick-mode-btn ${pickMode === "measure" ? "active" : ""}`}
            onClick={() => onPickModeChange("measure")}
          >
            Measure
          </button>
          <button
            type="button"
            className={`pick-mode-btn ${pickMode === "inspect" ? "active" : ""}`}
            onClick={() => onPickModeChange("inspect")}
          >
            Inspect
          </button>
          <div className="clip-control-group">
            <div className="clip-popover-wrap" ref={clipRef}>
              <button
                type="button"
                className={`pick-mode-btn ${clipOpen ? "active" : ""}`}
              onClick={() => {
                setClipOpen((prev) => !prev);
                setSettingsOpen(false);
              }}
              title="Clip settings"
              >
                Clip
              </button>
              <button
                type="button"
                className="clip-inline-indicator"
                title={sectionEnabled ? "Disable clip" : "Enable clip"}
                onClick={() => onSectionEnabledChange(!sectionEnabled)}
              >
                <span className={`clip-status-dot ${sectionEnabled ? "on" : "off"}`} />
                {sectionEnabled ? `${sectionAxis.toUpperCase()} ${sectionPercent}%` : "Off"}
              </button>
              {clipOpen && (
                <div className="clip-popover">
                <div className="settings-section-head">
                  <span>Section</span>
                  <label className="settings-switch">
                    <input
                      type="checkbox"
                      checked={sectionEnabled}
                      onChange={(event) => onSectionEnabledChange(event.target.checked)}
                    />
                    <span>{sectionEnabled ? "On" : "Off"}</span>
                  </label>
                </div>
                <div className="settings-section-axis">
                  <button
                    type="button"
                    className={`settings-axis-btn ${sectionAxis === "x" ? "active" : ""}`}
                    onClick={() => onSectionAxisChange("x")}
                  >
                    X
                  </button>
                  <button
                    type="button"
                    className={`settings-axis-btn ${sectionAxis === "y" ? "active" : ""}`}
                    onClick={() => onSectionAxisChange("y")}
                  >
                    Y
                  </button>
                  <button
                    type="button"
                    className={`settings-axis-btn ${sectionAxis === "z" ? "active" : ""}`}
                    onClick={() => onSectionAxisChange("z")}
                  >
                    Z
                  </button>
                </div>
                <input
                  className="settings-section-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={sectionPercent}
                  disabled={sectionSliderDisabled}
                  onChange={(event) => onSectionPercentChange(Number(event.target.value))}
                />
                <button type="button" className="settings-section-reset" onClick={onSectionReset}>
                  Reset section
                </button>
              </div>
              )}
            </div>
          </div>
        </div>
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
              <button
                type="button"
                className="settings-clear-btn"
                onClick={() => {
                  onClearUserSettings();
                  setSettingsOpen(false);
                }}
              >
                Clear all
              </button>
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
