import { useState } from "react";
import type { MouseEvent } from "react";
import type { IfcMaterialInfo } from "../BabylonScene";
import { EyeOpenIcon } from "../Icons";

interface MaterialInfoTabProps {
  ifcMaterials: IfcMaterialInfo[] | null;
  showElementsMode: boolean;
  selectedMaterialExpressIDs: Set<number>;
  onToggleShowElementsMode: (enabled: boolean) => void;
  onSelectMaterial: (
    material: IfcMaterialInfo | null,
    options?: { append?: boolean; replaceExpressIDs?: number[] },
  ) => void;
}

function MaterialInfoTab({
  ifcMaterials,
  showElementsMode,
  selectedMaterialExpressIDs,
  onToggleShowElementsMode,
  onSelectMaterial,
}: MaterialInfoTabProps) {
  const [selectionAnchorExpressID, setSelectionAnchorExpressID] = useState<number | null>(null);

  const handleRowClick = (event: MouseEvent<HTMLDivElement>, material: IfcMaterialInfo) => {
    if (!showElementsMode) return;

    if (!ifcMaterials) return;
    const orderedIDs = ifcMaterials.map((item) => item.expressID);

    if (event.shiftKey) {
      const anchor = selectionAnchorExpressID ?? Array.from(selectedMaterialExpressIDs)[0] ?? material.expressID;
      const startIndex = orderedIDs.indexOf(anchor);
      const endIndex = orderedIDs.indexOf(material.expressID);
      if (startIndex === -1 || endIndex === -1) {
        onSelectMaterial(material);
        setSelectionAnchorExpressID(material.expressID);
        return;
      }
      const from = Math.min(startIndex, endIndex);
      const to = Math.max(startIndex, endIndex);
      const rangeIDs = orderedIDs.slice(from, to + 1);
      onSelectMaterial(material, { replaceExpressIDs: rangeIDs });
      if (selectionAnchorExpressID === null) {
        setSelectionAnchorExpressID(anchor);
      }
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (selectedMaterialExpressIDs.has(material.expressID) && selectedMaterialExpressIDs.size === 1) {
        onSelectMaterial(null);
        setSelectionAnchorExpressID(null);
        return;
      }
      onSelectMaterial(material, { append: true });
      if (selectionAnchorExpressID === null) {
        setSelectionAnchorExpressID(material.expressID);
      }
      return;
    }

    if (selectedMaterialExpressIDs.has(material.expressID) && selectedMaterialExpressIDs.size === 1) {
      onSelectMaterial(null);
      setSelectionAnchorExpressID(null);
      return;
    }

    onSelectMaterial(material);
    setSelectionAnchorExpressID(material.expressID);
  };

  if (!ifcMaterials) {
    return (
      <div className="tab-panel">
        <div className="tab-title-row">
          <h3>Material Info</h3>
          <button
            type="button"
            className={`material-show-elements-btn ${showElementsMode ? "active" : ""}`}
            title={showElementsMode ? "Show Elements mode enabled" : "Show Elements mode disabled"}
            onClick={() => onToggleShowElementsMode(!showElementsMode)}
          >
            <EyeOpenIcon />
            <span>Show Elements</span>
          </button>
        </div>
        <div className="material-info-empty">No IFC model loaded. Click "Open IFC" to load a file.</div>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="tab-title-row">
        <h3>{`Material Info (${ifcMaterials.length})`}</h3>
        <button
          type="button"
          className={`material-show-elements-btn ${showElementsMode ? "active" : ""}`}
          title={showElementsMode ? "Show Elements mode enabled" : "Show Elements mode disabled"}
          onClick={() => onToggleShowElementsMode(!showElementsMode)}
        >
          <EyeOpenIcon />
          <span>Show Elements</span>
        </button>
      </div>
      <div className="material-info-list" role="table" aria-label="IFC materials list">
        <div className="material-info-row material-info-head" role="row">
          <span role="columnheader">Name</span>
          <span role="columnheader">Qty</span>
          <span role="columnheader">Color</span>
          <span role="columnheader">ID</span>
        </div>
        {ifcMaterials.length > 0 ? (
          ifcMaterials.map((material) => (
            <div
              className={`material-info-row material-info-data ${showElementsMode ? "show-elements-mode" : ""} ${
                selectedMaterialExpressIDs.has(material.expressID) ? "selected" : ""
              }`}
              role="row"
              key={material.expressID}
              onClick={(event) => handleRowClick(event, material)}
            >
              <span role="cell" title={material.name}>{material.name}</span>
              <span role="cell">{material.relatedElementExpressIDs.length}</span>
              <span role="cell" className="material-info-color-cell" title={material.colorHex ?? "No color"}>
                <span
                  className={`material-info-swatch ${material.colorHex ? "" : "empty"}`.trim()}
                  style={{ backgroundColor: material.colorHex ?? "transparent" }}
                  aria-hidden="true"
                />
              </span>
              <span role="cell">{material.expressID}</span>
            </div>
          ))
        ) : (
          <div className="material-info-empty">No IFC materials found in this file.</div>
        )}
      </div>
    </div>
  );
}

export default MaterialInfoTab;
