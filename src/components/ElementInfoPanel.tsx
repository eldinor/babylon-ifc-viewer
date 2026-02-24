import type { ElementPickData } from "../utils/pickingUtils";

interface ElementInfoPanelProps {
  pickedElement: ElementPickData;
  onClose: () => void;
}

export default function ElementInfoPanel({ pickedElement, onClose }: ElementInfoPanelProps) {
  return (
    <div className="element-info-panel">
      <div className="element-info-header">
        <h3>Element Info</h3>
        <button
          className="close-info-btn"
          onClick={onClose}
          title="Close"
        >
          {'×'}
        </button>
      </div>
      <div className="element-info-content">
        <div className="picked-element-item">
          <span className="picked-element-label">Type:</span>
          <span className="picked-element-value">{pickedElement.typeName}</span>
        </div>
        <div className="picked-element-item">
          <span className="picked-element-label">Name:</span>
          <span className="picked-element-value" title={pickedElement.elementName}>{pickedElement.elementName}</span>
        </div>
        <div className="picked-element-item">
          <span className="picked-element-label">Express ID:</span>
          <span className="picked-element-value">{pickedElement.expressID}</span>
        </div>
      </div>
    </div>
  );
}
