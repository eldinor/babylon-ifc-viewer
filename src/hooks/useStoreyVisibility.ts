import { useCallback, useState } from "react";
import type { MouseEvent } from "react";
import type { StoreyInfo } from "../utils/ifcUtils";

interface UseStoreyVisibilityResult {
  visibleStoreyIds: Set<number> | null;
  isSiteVisible: boolean;
  resetVisibility: () => void;
  handleStoreyClick: (storeyId: number) => void;
  handleSiteClick: () => void;
  handleAllStoreysClick: () => void;
  toggleStoreyVisibility: (storeyId: number, event: MouseEvent) => void;
  toggleSiteVisibility: (event: MouseEvent) => void;
}

export function useStoreyVisibility(storeys: StoreyInfo[]): UseStoreyVisibilityResult {
  const [visibleStoreyIds, setVisibleStoreyIds] = useState<Set<number> | null>(null);
  const [isSiteVisible, setIsSiteVisible] = useState(true);

  const resetVisibility = useCallback(() => {
    setVisibleStoreyIds(null);
    setIsSiteVisible(true);
  }, []);

  const handleStoreyClick = useCallback((storeyId: number) => {
    setVisibleStoreyIds(new Set([storeyId]));
  }, []);

  const handleSiteClick = useCallback(() => {
    setVisibleStoreyIds(new Set());
    setIsSiteVisible(true);
  }, []);

  const handleAllStoreysClick = useCallback(() => {
    setVisibleStoreyIds(null);
    setIsSiteVisible(true);
  }, []);

  const toggleStoreyVisibility = useCallback(
    (storeyId: number, event: MouseEvent) => {
      event.stopPropagation();

      if (visibleStoreyIds === null) {
        const allStoreyIds = new Set(storeys.map((s) => s.expressID));
        allStoreyIds.delete(storeyId);
        setVisibleStoreyIds(allStoreyIds);
      } else if (visibleStoreyIds.has(storeyId)) {
        const newSet = new Set(visibleStoreyIds);
        newSet.delete(storeyId);
        setVisibleStoreyIds(newSet.size === 0 ? null : newSet);
      } else {
        const newSet = new Set(visibleStoreyIds);
        newSet.add(storeyId);
        setVisibleStoreyIds(newSet);
      }
    },
    [storeys, visibleStoreyIds],
  );

  const toggleSiteVisibility = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      if (!isSiteVisible) {
        setVisibleStoreyIds(new Set());
        setIsSiteVisible(true);
      } else {
        setIsSiteVisible(false);
      }
    },
    [isSiteVisible],
  );

  return {
    visibleStoreyIds,
    isSiteVisible,
    resetVisibility,
    handleStoreyClick,
    handleSiteClick,
    handleAllStoreysClick,
    toggleStoreyVisibility,
    toggleSiteVisibility,
  };
}
