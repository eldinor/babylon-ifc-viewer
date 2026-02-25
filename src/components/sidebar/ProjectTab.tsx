import { useEffect, useMemo, useRef, useState } from "react";
import type { IfcProjectTreeIndex, IfcProjectTreeNode } from "../../utils/projectTreeUtils";

interface ProjectTabProps {
  treeIndex: IfcProjectTreeIndex | null;
  selectedExpressID: number | null;
  onSelectNode: (node: IfcProjectTreeNode | null) => void;
}

interface VisibleNode {
  expressID: number;
  depth: number;
}

function ProjectTab({ treeIndex, selectedExpressID, onSelectNode }: ProjectTabProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set(treeIndex?.roots ?? []));
  const [activeExpressID, setActiveExpressID] = useState<number | null>(() => treeIndex?.roots[0] ?? null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const effectiveExpandedIds = useMemo(() => {
    if (!treeIndex || selectedExpressID === null) return expandedIds;
    const next = new Set(expandedIds);
    let current = treeIndex.parentByExpressID.get(selectedExpressID);
    while (current !== undefined) {
      next.add(current);
      current = treeIndex.parentByExpressID.get(current);
    }
    return next;
  }, [expandedIds, selectedExpressID, treeIndex]);

  const effectiveActiveExpressID = activeExpressID ?? selectedExpressID ?? treeIndex?.roots[0] ?? null;

  const visibleNodes = useMemo(() => {
    if (!treeIndex) return [] as VisibleNode[];
    const list: VisibleNode[] = [];

    const walk = (expressID: number, depth: number) => {
      list.push({ expressID, depth });
      if (!effectiveExpandedIds.has(expressID)) return;
      const node = treeIndex.nodes.get(expressID);
      if (!node || node.childExpressIDs.length === 0) return;
      node.childExpressIDs.forEach((childID) => walk(childID, depth + 1));
    };

    treeIndex.roots.forEach((rootID) => walk(rootID, 0));
    return list;
  }, [effectiveExpandedIds, treeIndex]);

  const activeIndex = useMemo(
    () => visibleNodes.findIndex((item) => item.expressID === effectiveActiveExpressID),
    [effectiveActiveExpressID, visibleNodes],
  );

  useEffect(() => {
    if (selectedExpressID === null) return;
    const row = rowRefs.current.get(selectedExpressID);
    if (!row) return;
    row.scrollIntoView({ block: "nearest" });
  }, [selectedExpressID, visibleNodes.length]);

  const toggleExpand = (expressID: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(expressID)) {
        next.delete(expressID);
      } else {
        next.add(expressID);
      }
      return next;
    });
  };

  const selectByExpressID = (expressID: number | null) => {
    if (!treeIndex || expressID === null) {
      onSelectNode(null);
      return;
    }
    const node = treeIndex.nodes.get(expressID) ?? null;
    onSelectNode(node);
  };

  const handleNodeClick = (expressID: number) => {
    setActiveExpressID(expressID);
    if (selectedExpressID === expressID) {
      onSelectNode(null);
    } else {
      selectByExpressID(expressID);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!treeIndex || visibleNodes.length === 0) return;

    const currentExpressID = effectiveActiveExpressID ?? visibleNodes[0].expressID;
    const currentNode = treeIndex.nodes.get(currentExpressID);
    if (!currentNode) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.min(activeIndex + 1, visibleNodes.length - 1);
      setActiveExpressID(visibleNodes[nextIndex].expressID);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = Math.max(activeIndex - 1, 0);
      setActiveExpressID(visibleNodes[prevIndex].expressID);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (currentNode.childExpressIDs.length > 0 && !effectiveExpandedIds.has(currentExpressID)) {
        toggleExpand(currentExpressID);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (effectiveExpandedIds.has(currentExpressID)) {
        toggleExpand(currentExpressID);
        return;
      }
      const parentID = treeIndex.parentByExpressID.get(currentExpressID);
      if (parentID !== undefined) setActiveExpressID(parentID);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (selectedExpressID === currentExpressID) {
        onSelectNode(null);
      } else {
        selectByExpressID(currentExpressID);
      }
    }
  };

  if (!treeIndex || treeIndex.roots.length === 0) {
    return (
      <div className="tab-panel">
        <h3>Project Tree</h3>
        <div className="project-tree">
          <div className="storey-empty">No IFC model loaded. Click "Open IFC" to load a file.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <h3>Project Tree</h3>
      <div className="project-tree" tabIndex={0} onKeyDown={handleKeyDown}>
        {visibleNodes.map(({ expressID, depth }) => {
          const node = treeIndex.nodes.get(expressID);
          if (!node) return null;
          const hasChildren = node.childExpressIDs.length > 0;
          const isExpanded = effectiveExpandedIds.has(expressID);
          const isSelected = selectedExpressID === expressID;
          const isActive = effectiveActiveExpressID === expressID;

          return (
            <div key={node.id} className="tree-row" style={{ paddingLeft: `${depth * 8}px` }}>
              <div
                className={`tree-item ${isSelected ? "selected" : ""} ${isActive ? "active" : ""}`}
                onClick={() => handleNodeClick(expressID)}
                ref={(el) => {
                  if (el) {
                    rowRefs.current.set(expressID, el);
                  } else {
                    rowRefs.current.delete(expressID);
                  }
                }}
              >
                <button
                  className="tree-expand"
                  disabled={!hasChildren}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (hasChildren) toggleExpand(expressID);
                  }}
                  title={hasChildren ? (isExpanded ? "Collapse" : "Expand") : "Leaf"}
                >
                  {hasChildren ? (isExpanded ? "v" : ">") : " "}
                </button>
                <span className="tree-name" title={`${node.typeName} (${node.expressID})`}>
                  {node.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProjectTab;
