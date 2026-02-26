import type { RelatedElementItem } from "../types/elementInfo";

interface RelatedElementsPanelProps {
  relatedElements: RelatedElementItem[];
  onSelectRelatedExpressID: (expressID: number) => void;
}

function RelatedElementsPanel({ relatedElements, onSelectRelatedExpressID }: RelatedElementsPanelProps) {
  if (!relatedElements || relatedElements.length === 0) return null;

  return (
    <aside className="related-elements-panel">
      <div className="related-elements-header">
        <h3>Related Elements</h3>
        <span className="related-elements-count">{relatedElements.length}</span>
      </div>
      <div className="related-elements-content">
        {relatedElements.map((item) => (
          <button
            key={`${item.relation}-${item.expressID}`}
            type="button"
            className="related-elements-item"
            onClick={() => onSelectRelatedExpressID(item.expressID)}
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
