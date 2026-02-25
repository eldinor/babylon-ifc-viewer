import { useCallback, useState } from "react";
import type { ProjectInfoResult } from "babylon-ifc-loader";
import type { IfcModelData } from "../components/BabylonScene";
import { buildIfcProjectTreeIndex, type IfcProjectTreeIndex } from "../utils/projectTreeUtils";

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
        setProjectTreeIndex(buildIfcProjectTreeIndex(data.ifcAPI, data.modelID));
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
