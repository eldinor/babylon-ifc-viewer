import { useMemo, useState } from "react";
import type { ElementInfoData } from "../types/elementInfo";
import { CopyIcon } from "./Icons";

interface ElementInfoPanelProps {
  elementInfo: ElementInfoData | null;
  onClose: () => void;
  sidebarCollapsed: boolean;
}

function ElementInfoPanel({ elementInfo, onClose, sidebarCollapsed }: ElementInfoPanelProps) {
  const [copiedFieldLabel, setCopiedFieldLabel] = useState<string | null>(null);
  const [copyAllFormat, setCopyAllFormat] = useState<"text" | "json" | "markdown">("text");
  const [isAllCopied, setIsAllCopied] = useState(false);
  const canCopy = (value: string): boolean => value.trim().length > 0 && value.trim() !== "-";
  const meaningfulFields = useMemo(
    () => (elementInfo ? elementInfo.fields.filter((field) => canCopy(field.value)) : []),
    [elementInfo],
  );

  const fallbackCopy = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  };

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

  const buildCopyAllPayload = (): string => {
    if (copyAllFormat === "json") {
      return JSON.stringify(
        {
          source: elementInfo.source,
          expressID: elementInfo.expressID,
          fields: meaningfulFields.map((field) => ({
            label: field.label,
            value: field.value,
          })),
        },
        null,
        2,
      );
    }

    if (copyAllFormat === "markdown") {
      const lines = ["| Field | Value |", "| --- | --- |"];
      meaningfulFields.forEach((field) => {
        const safeLabel = field.label.replaceAll("|", "\\|");
        const safeValue = field.value.replaceAll("|", "\\|");
        lines.push(`| ${safeLabel} | ${safeValue} |`);
      });
      return lines.join("\n");
    }

    return meaningfulFields.map((field) => `${field.label}: ${field.value}`).join("\n");
  };

  const handleCopyAll = async () => {
    const payload = buildCopyAllPayload();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      fallbackCopy(payload);
    }
    setIsAllCopied(true);
    window.setTimeout(() => setIsAllCopied(false), 1000);
  };

  if (!elementInfo) return null;

  return (
    <div className={`element-info-panel ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <div className="element-info-header">
        <h3>Element Info</h3>
        <div className="element-info-actions">
          <select
            className="copy-format-select"
            value={copyAllFormat}
            onChange={(event) => setCopyAllFormat(event.target.value as "text" | "json" | "markdown")}
            title="Copy format"
          >
            <option value="text">Text</option>
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
          </select>
          <button className="copy-all-btn" onClick={handleCopyAll} title={isAllCopied ? "Copied" : "Copy all fields"}>
            {isAllCopied ? "Copied" : "Copy All"}
          </button>
          <button className="close-info-btn" onClick={onClose} title="Close">
            x
          </button>
        </div>
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
