import { useCallback, useState } from "react";
import type { ProjectInfoResult } from "babylon-ifc-loader";
import { getBuildingStoreys, getSite, type SiteInfo, type StoreyInfo } from "../utils/ifcUtils";
import type { IfcModelData } from "../components/BabylonScene";
import { buildIfcProjectTreeIndex, type IfcProjectTreeIndex } from "../utils/projectTreeUtils";

interface UseModelDataResult {
  modelData: IfcModelData | null;
  projectInfo: ProjectInfoResult | null;
  storeys: StoreyInfo[];
  siteInfo: SiteInfo | null;
  projectTreeIndex: IfcProjectTreeIndex | null;
  handleModelLoaded: (data: IfcModelData | null) => void;
}

export function useModelData(onModelCleared?: () => void): UseModelDataResult {
  const [modelData, setModelData] = useState<IfcModelData | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfoResult | null>(null);
  const [storeys, setStoreys] = useState<StoreyInfo[]>([]);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [projectTreeIndex, setProjectTreeIndex] = useState<IfcProjectTreeIndex | null>(null);

  const handleModelLoaded = useCallback(
    (data: IfcModelData | null) => {
      if (data) {
        setModelData(data);
        setProjectInfo(data.projectInfo);
        setStoreys(getBuildingStoreys(data.ifcAPI, data.modelID, data.storeyMap));
        setSiteInfo(getSite(data.ifcAPI, data.modelID));
        setProjectTreeIndex(buildIfcProjectTreeIndex(data.ifcAPI, data.modelID));
      } else {
        setModelData(null);
        setProjectInfo(null);
        setStoreys([]);
        setSiteInfo(null);
        setProjectTreeIndex(null);
        onModelCleared?.();
      }
    },
    [onModelCleared],
  );

  return {
    modelData,
    projectInfo,
    storeys,
    siteInfo,
    projectTreeIndex,
    handleModelLoaded,
  };
}
