import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IfcProjectTreeIndex, IfcProjectTreeNode } from "../../utils/projectTreeUtils";
import { AlwaysFitIcon, EyeClosedIcon, EyeOpenIcon, FitViewIcon, RestoreViewIcon } from "../Icons";

interface ProjectTabProps {
  treeIndex: IfcProjectTreeIndex | null;
  selectedExpressID: number | null;
  hiddenExpressIDs: Set<number>;
  lengthUnitSymbol: string;
  onSelectNode: (node: IfcProjectTreeNode | null) => void;
  onSetNodeVisibility: (expressID: number, visible: boolean) => void;
  onDisplaySearchResults: (expressIDs: number[]) => void;
  onFitNode: (node: IfcProjectTreeNode | null) => void;
  onManualFitNode: (node: IfcProjectTreeNode | null) => void;
  onRestoreView: () => void;
  canRestoreView: boolean;
  alwaysFitEnabled: boolean;
  onToggleAlwaysFit: () => void;
}

interface VisibleNode {
  expressID: number;
  depth: number;
}

function ProjectTab({
  treeIndex,
  selectedExpressID,
  hiddenExpressIDs,
  lengthUnitSymbol,
  onSelectNode,
  onSetNodeVisibility,
  onDisplaySearchResults,
  onFitNode,
  onManualFitNode,
  onRestoreView,
  canRestoreView,
  alwaysFitEnabled,
  onToggleAlwaysFit,
}: ProjectTabProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set(treeIndex?.roots ?? []));
  const [activeExpressID, setActiveExpressID] = useState<number | null>(() => treeIndex?.roots[0] ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const treeContainerRef = useRef<HTMLDivElement>(null);

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

  const allNodesInTreeOrder = useMemo(() => {
    if (!treeIndex) return [] as number[];
    const list: number[] = [];
    const walk = (expressID: number) => {
      list.push(expressID);
      const node = treeIndex.nodes.get(expressID);
      if (!node) return;
      node.childExpressIDs.forEach(walk);
    };
    treeIndex.roots.forEach(walk);
    return list;
  }, [treeIndex]);

  const matchedExpressIDs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !treeIndex) return [] as number[];
    return allNodesInTreeOrder.filter((expressID) => {
      const node = treeIndex.nodes.get(expressID);
      if (!node) return false;
      return (
        node.name.toLowerCase().includes(query) ||
        node.typeName.toLowerCase().includes(query) ||
        String(node.expressID).includes(query)
      );
    });
  }, [allNodesInTreeOrder, searchQuery, treeIndex]);

  const subtreeHiddenByExpressID = useMemo(() => {
    const map = new Map<number, boolean>();
    if (!treeIndex) return map;
    const postOrder = [...allNodesInTreeOrder].reverse();
    postOrder.forEach((expressID) => {
      const node = treeIndex.nodes.get(expressID);
      if (!node) return;
      if (node.childExpressIDs.length === 0) {
        map.set(expressID, hiddenExpressIDs.has(expressID));
        return;
      }
      const ownHidden = hiddenExpressIDs.has(expressID);
      const allChildrenHidden = node.childExpressIDs.every((childID) => map.get(childID) === true);
      map.set(expressID, ownHidden && allChildrenHidden);
    });
    return map;
  }, [allNodesInTreeOrder, hiddenExpressIDs, treeIndex]);

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

  const ensureAncestorsExpanded = (expressID: number) => {
    if (!treeIndex) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let current = treeIndex.parentByExpressID.get(expressID);
      while (current !== undefined) {
        next.add(current);
        current = treeIndex.parentByExpressID.get(current);
      }
      return next;
    });
  };

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

  const jumpToMatch = (direction: 1 | -1) => {
    if (!treeIndex || matchedExpressIDs.length === 0) return;
    const nextIndex = (matchIndex + direction + matchedExpressIDs.length) % matchedExpressIDs.length;
    const targetExpressID = matchedExpressIDs[nextIndex];
    ensureAncestorsExpanded(targetExpressID);
    setMatchIndex(nextIndex);
    setActiveExpressID(targetExpressID);
    const node = treeIndex.nodes.get(targetExpressID);
    if (node) onSelectNode(node);
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

  const triggerManualFitCurrent = useCallback(() => {
    if (!treeIndex) return;
    const targetID = selectedExpressID ?? effectiveActiveExpressID ?? treeIndex.roots[0];
    if (targetID === null || targetID === undefined) return;
    const node = treeIndex.nodes.get(targetID) ?? null;
    onManualFitNode(node);
  }, [effectiveActiveExpressID, onManualFitNode, selectedExpressID, treeIndex]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyF" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      triggerManualFitCurrent();
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [triggerManualFitCurrent]);

  const formatElevation = (value: number): string => {
    const rounded = Math.round(value * 1000) / 1000;
    const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/\.?0+$/, "");
    return `${formatted} ${lengthUnitSymbol}`;
  };

  if (!treeIndex || treeIndex.roots.length === 0) {
    return (
      <div className="tab-panel">
        <div className="tab-title-row">
          <h3>Project Tree</h3>
        </div>
        <div className="project-tree">
          <div className="storey-empty">No IFC model loaded. Click "Open IFC" to load a file.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="tab-title-row">
        <h3>Project Tree</h3>
        <div className="tree-title-actions">
          <button
            type="button"
            className="tree-restore-btn"
            title="Restore view before manual fit"
            onClick={onRestoreView}
            disabled={!canRestoreView}
          >
            <RestoreViewIcon />
          </button>
          <button
            type="button"
            className="tree-fit-btn"
            title="Fit selected (F)"
            onClick={triggerManualFitCurrent}
          >
            <FitViewIcon />
          </button>
          <button
            type="button"
            className={`tree-always-fit-btn ${alwaysFitEnabled ? "enabled" : "disabled"}`}
            title={alwaysFitEnabled ? "Always fit enabled" : "Always fit disabled"}
            onClick={onToggleAlwaysFit}
          >
            <AlwaysFitIcon />
          </button>
          <button
            type="button"
            className="tree-to-top-btn"
            title="Scroll to top"
            onClick={() => treeContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          >
            ^
          </button>
        </div>
      </div>
      <div className="project-tree" tabIndex={0} onKeyDown={handleKeyDown} ref={treeContainerRef}>
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
                onDoubleClick={() => onFitNode(node)}
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
                <button
                  type="button"
                  className={`tree-visibility-btn ${subtreeHiddenByExpressID.get(expressID) ? "hidden" : "visible"}`}
                  title={subtreeHiddenByExpressID.get(expressID) ? "Show subtree" : "Hide subtree"}
                  onClick={(event) => {
                    event.stopPropagation();
                    const subtreeHidden = subtreeHiddenByExpressID.get(expressID) ?? false;
                    onSetNodeVisibility(expressID, subtreeHidden);
                  }}
                >
                  {subtreeHiddenByExpressID.get(expressID) ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>
                {(node.kind === "site" || node.kind === "building" || node.kind === "storey") &&
                  node.elevation !== undefined && (
                    <span className="tree-elevation" title={`Elevation: ${formatElevation(node.elevation)}`}>
                      {formatElevation(node.elevation)}
                    </span>
                  )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="project-tree-controls">
        <input
          className="tree-search-input"
          type="text"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setMatchIndex(0);
          }}
          placeholder="Search name, type, or Express ID"
          aria-label="Search project tree"
        />
        <div className="tree-search-actions">
          <button
            type="button"
            className="tree-search-btn tree-search-nav-btn"
            onClick={() => jumpToMatch(-1)}
            disabled={matchedExpressIDs.length === 0}
            title="Previous match"
          >
            Prev
          </button>
          <button
            type="button"
            className="tree-search-btn tree-search-nav-btn"
            onClick={() => jumpToMatch(1)}
            disabled={matchedExpressIDs.length === 0}
            title="Next match"
          >
            Next
          </button>
          <button
            type="button"
            className="tree-search-btn tree-search-nav-btn"
            onClick={() => onDisplaySearchResults(matchedExpressIDs)}
            disabled={matchedExpressIDs.length === 0}
            title="Show all found meshes"
          >
            Display all
          </button>
          <span className="tree-search-count">
            {matchedExpressIDs.length > 0 ? `${matchIndex + 1}/${matchedExpressIDs.length}` : "0/0"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default ProjectTab;
