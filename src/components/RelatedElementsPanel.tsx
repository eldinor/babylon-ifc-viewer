import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import type { RelatedElementItem } from "../types/elementInfo";

interface RelatedElementsPanelProps {
  relatedElements: RelatedElementItem[];
  selectedExpressIDs: Set<number>;
  onSelectRelatedExpressID: (expressID: number, options?: { toggle?: boolean; rangeExpressIDs?: number[] }) => void;
  onClose: () => void;
}

function RelatedElementsPanel({
  relatedElements,
  selectedExpressIDs,
  onSelectRelatedExpressID,
  onClose,
}: RelatedElementsPanelProps) {
  const [selectionAnchorExpressID, setSelectionAnchorExpressID] = useState<number | null>(null);
  const relatedOrder = useMemo(() => (relatedElements ?? []).map((item) => item.expressID), [relatedElements]);
  const effectiveAnchorExpressID =
    selectionAnchorExpressID !== null && relatedOrder.includes(selectionAnchorExpressID) ? selectionAnchorExpressID : null;
  const firstSelectedRelatedExpressID = useMemo(
    () => relatedOrder.find((id) => selectedExpressIDs.has(id)) ?? null,
    [relatedOrder, selectedExpressIDs],
  );

  if (!relatedElements || relatedElements.length === 0) return null;

  const handleRelatedClick = (event: MouseEvent<HTMLButtonElement>, expressID: number) => {
    if (event.shiftKey) {
      const anchor = effectiveAnchorExpressID ?? firstSelectedRelatedExpressID ?? expressID;
      const startIndex = relatedOrder.indexOf(anchor);
      const endIndex = relatedOrder.indexOf(expressID);
      if (startIndex === -1 || endIndex === -1) {
        onSelectRelatedExpressID(expressID);
        setSelectionAnchorExpressID(expressID);
        return;
      }
      const from = Math.min(startIndex, endIndex);
      const to = Math.max(startIndex, endIndex);
      const rangeExpressIDs = relatedOrder.slice(from, to + 1);
      onSelectRelatedExpressID(expressID, { rangeExpressIDs });
      if (effectiveAnchorExpressID === null) {
        setSelectionAnchorExpressID(anchor);
      }
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      onSelectRelatedExpressID(expressID, { toggle: true });
      if (effectiveAnchorExpressID === null) {
        setSelectionAnchorExpressID(expressID);
      }
      return;
    }

    if (selectedExpressIDs.has(expressID)) {
      onSelectRelatedExpressID(expressID, { toggle: true });
    } else {
      onSelectRelatedExpressID(expressID);
    }
    setSelectionAnchorExpressID(expressID);
  };

  return (
    <aside className="related-elements-panel">
      <div className="related-elements-header">
        <div className="related-elements-title-wrap">
          <h3>Related Elements</h3>
          <span className="related-elements-count">{relatedElements.length}</span>
        </div>
        <button type="button" className="related-elements-close-btn" onClick={onClose} aria-label="Close related elements">
          x
        </button>
      </div>
      <div className="related-elements-content">
        {relatedElements.map((item) => (
          <button
            key={`${item.relation}-${item.expressID}`}
            type="button"
            className={`related-elements-item ${selectedExpressIDs.has(item.expressID) ? "selected" : ""}`}
            onClick={(event) => handleRelatedClick(event, item.expressID)}
            title={`${item.relation} | ${item.name} (${item.typeName}) #${item.expressID}`}
          >
            <span className="related-elements-relation">{item.relation}</span>
            <span className="related-elements-name">{item.name}</span>
            <span className="related-elements-meta">{item.typeName}</span>
            <span className="related-elements-id">#{item.expressID}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export default RelatedElementsPanel;
