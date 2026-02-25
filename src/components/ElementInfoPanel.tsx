import { useState } from "react";
import type { ElementInfoData } from "../types/elementInfo";
import { CopyIcon } from "./Icons";

interface ElementInfoPanelProps {
  elementInfo: ElementInfoData | null;
  onClose: () => void;
}

function ElementInfoPanel({ elementInfo, onClose }: ElementInfoPanelProps) {
  const [copiedFieldLabel, setCopiedFieldLabel] = useState<string | null>(null);
  if (!elementInfo) return null;

  const canCopy = (value: string): boolean => value.trim().length > 0 && value.trim() !== "-";

  const handleCopy = async (label: string, value: string) => {
    if (!canCopy(value)) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedFieldLabel(label);
      window.setTimeout(() => {
        setCopiedFieldLabel((prev) => (prev === label ? null : prev));
      }, 900);
    } catch (error) {
      console.warn("Failed to copy value:", error);
    }
  };

  return (
    <div className="element-info-panel">
      <div className="element-info-header">
        <h3>Element Info</h3>
        <button className="close-info-btn" onClick={onClose} title="Close">
          x
        </button>
      </div>
      <div className="element-info-content">
        {elementInfo.fields.map((field) => (
          <div key={field.label} className="picked-element-item">
            <span className="picked-element-label">{field.label}:</span>
            <span className="picked-element-value" title={field.value}>
              {field.value}
            </span>
            {canCopy(field.value) && (
              <button
                className="copy-field-btn"
                onClick={() => handleCopy(field.label, field.value)}
                title={copiedFieldLabel === field.label ? "Copied" : "Copy value"}
              >
                <CopyIcon />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ElementInfoPanel;
