import { useCallback, useState } from "react";
import type { ProjectInfoResult } from "../loader";
import type { IfcModelData } from "../components/BabylonScene";
import type { IfcProjectTreeIndex } from "../utils/projectTreeUtils";

interface UseModelDataResult {
  modelData: IfcModelData | null;
  projectInfo: ProjectInfoResult | null;
  projectTreeIndex: IfcProjectTreeIndex | null;
  handleModelLoaded: (data: IfcModelData | null) => void;
}

export function useModelData(onModelCleared?: () => void): UseModelDataResult {
  const [modelData, setModelData] = useState<IfcModelData | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfoResult | null>(null);
  const [projectTreeIndex, setProjectTreeIndex] = useState<IfcProjectTreeIndex | null>(null);

  const handleModelLoaded = useCallback(
    (data: IfcModelData | null) => {
      if (data) {
        setModelData(data);
        setProjectInfo(data.projectInfo);
        setProjectTreeIndex(data.projectTreeIndex);
      } else {
        setModelData(null);
        setProjectInfo(null);
        setProjectTreeIndex(null);
        onModelCleared?.();
      }
    },
    [onModelCleared],
  );

  return {
    modelData,
    projectInfo,
    projectTreeIndex,
    handleModelLoaded,
  };
}
