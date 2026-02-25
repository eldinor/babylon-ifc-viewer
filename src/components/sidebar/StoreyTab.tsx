import type { MouseEvent } from "react";
import { EyeClosedIcon, EyeOpenIcon } from "../Icons";
import { formatElevation, type SiteInfo, type StoreyInfo } from "../../utils/ifcUtils";

interface StoreyTabProps {
  storeys: StoreyInfo[];
  siteInfo: SiteInfo | null;
  visibleStoreyIds: Set<number> | null;
  isSiteVisible: boolean;
  onStoreyClick: (storeyId: number) => void;
  onSiteClick: () => void;
  onAllStoreysClick: () => void;
  onToggleStoreyVisibility: (storeyId: number, event: MouseEvent) => void;
  onToggleSiteVisibility: (event: MouseEvent) => void;
}

function StoreyTab({
  storeys,
  siteInfo,
  visibleStoreyIds,
  isSiteVisible,
  onStoreyClick,
  onSiteClick,
  onAllStoreysClick,
  onToggleStoreyVisibility,
  onToggleSiteVisibility,
}: StoreyTabProps) {
  return (
    <div className="tab-panel">
      <h3>Storey Navigation</h3>
      <div className="storey-list">
        {storeys.length > 0 ? (
          <>
            <div
              className={`storey-item ${visibleStoreyIds === null ? "active" : ""}`}
              onClick={onAllStoreysClick}
              title="Show all elements"
            >
              <span className="storey-name">All Storeys</span>
            </div>

            {storeys.map((storey) => {
              const isEyeOpen = visibleStoreyIds === null || visibleStoreyIds.has(storey.expressID);
              const isActive = visibleStoreyIds !== null && visibleStoreyIds.has(storey.expressID);

              return (
                <div
                  key={storey.expressID}
                  className={`storey-item ${isActive ? "active" : ""} ${!isEyeOpen ? "hidden" : ""}`}
                  onClick={() => onStoreyClick(storey.expressID)}
                  title={`${storey.elementCount} elements`}
                >
                  <button
                    className="visibility-btn"
                    onClick={(event) => onToggleStoreyVisibility(storey.expressID, event)}
                    title={isEyeOpen ? "Hide storey" : "Show storey"}
                  >
                    {isEyeOpen ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </button>
                  <span className="storey-name">{storey.name}</span>
                  {storey.elevation !== null && <span className="storey-elevation">{formatElevation(storey.elevation)}</span>}
                  <span className="storey-count">({storey.elementCount})</span>
                </div>
              );
            })}

            {siteInfo && (
              <div
                className={`storey-item site-item ${visibleStoreyIds !== null && visibleStoreyIds.size === 0 ? "active" : ""} ${isSiteVisible ? "site-visible" : "hidden"}`}
                onClick={onSiteClick}
                title="Site elements"
              >
                <button
                  className="visibility-btn"
                  onClick={onToggleSiteVisibility}
                  title={isSiteVisible ? "Hide site" : "Show site"}
                >
                  {isSiteVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </button>
                <span className="storey-name">{siteInfo.name}</span>
              </div>
            )}
          </>
        ) : (
          <div className="storey-empty">No IFC model loaded. Click "Open IFC" to load a file.</div>
        )}
      </div>
    </div>
  );
}

export default StoreyTab;
