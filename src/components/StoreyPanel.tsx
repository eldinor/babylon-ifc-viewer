import { useCallback } from "react";
import { formatElevation, type StoreyInfo, type SiteInfo } from "../utils/ifcUtils";
import { EyeOpenIcon, EyeClosedIcon } from "./Icons";

interface StoreyPanelProps {
  storeys: StoreyInfo[];
  siteInfo: SiteInfo | null;
  visibleStoreyIds: Set<number> | null;
  isSiteVisible: boolean;
  onVisibleStoreyIdsChange: (ids: Set<number> | null) => void;
  onSiteVisibleChange: (visible: boolean) => void;
}

export default function StoreyPanel({
  storeys,
  siteInfo,
  visibleStoreyIds,
  isSiteVisible,
  onVisibleStoreyIdsChange,
  onSiteVisibleChange,
}: StoreyPanelProps) {
  // Handle storey row click - select single storey
  const handleStoreyClick = useCallback((storeyId: number) => {
    onVisibleStoreyIdsChange(new Set([storeyId]));
  }, [onVisibleStoreyIdsChange]);

  // Handle site row click - select site (hide all storeys)
  const handleSiteClick = useCallback(() => {
    onVisibleStoreyIdsChange(new Set());
    onSiteVisibleChange(true);
  }, [onVisibleStoreyIdsChange, onSiteVisibleChange]);

  // Handle "All Storeys" click
  const handleAllStoreysClick = useCallback(() => {
    onVisibleStoreyIdsChange(null);
    onSiteVisibleChange(true);
  }, [onVisibleStoreyIdsChange, onSiteVisibleChange]);

  // Toggle storey visibility via eye icon
  const toggleStoreyVisibility = useCallback((storeyId: number, event: React.MouseEvent) => {
    event.stopPropagation();

    if (visibleStoreyIds === null) {
      const allStoreyIds = new Set(storeys.map(s => s.expressID));
      allStoreyIds.delete(storeyId);
      onVisibleStoreyIdsChange(allStoreyIds);
    } else if (visibleStoreyIds.has(storeyId)) {
      const newSet = new Set(visibleStoreyIds);
      newSet.delete(storeyId);
      if (newSet.size === 0) {
        onVisibleStoreyIdsChange(null);
      } else {
        onVisibleStoreyIdsChange(newSet);
      }
    } else {
      const newSet = new Set(visibleStoreyIds);
      newSet.add(storeyId);
      onVisibleStoreyIdsChange(newSet);
    }
  }, [visibleStoreyIds, storeys, onVisibleStoreyIdsChange]);

  // Toggle site visibility via eye icon
  const toggleSiteVisibility = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();

    if (!isSiteVisible) {
      onVisibleStoreyIdsChange(new Set());
      onSiteVisibleChange(true);
    } else {
      onSiteVisibleChange(false);
    }
  }, [isSiteVisible, onVisibleStoreyIdsChange, onSiteVisibleChange]);

  return (
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
              const isEyeOpen = visibleStoreyIds === null || visibleStoreyIds.has(storey.expressID);
              const isActive = visibleStoreyIds !== null && visibleStoreyIds.has(storey.expressID);
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
  );
}
