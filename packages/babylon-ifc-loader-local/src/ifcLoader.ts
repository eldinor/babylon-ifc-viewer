import { IfcWorkerClient } from "./ifcWorkerClient";
import type { IfcModelMetadataResult, ProjectInfoResult, RawIfcModel } from "./ifcInit";
import type {
  ElementDataResult,
  IfcWorkerLoadOptions,
  LoadPreparedIfcModelOptions,
} from "./ifcWorkerClient";
import type { GeometryPreparationOptions, PreparedIfcModel } from "./ifcModelPreparation";

export interface IfcLoader {
  init(wasmPath?: string, logLevel?: number): Promise<void>;
  loadIfcModel(source: string | File, options?: IfcWorkerLoadOptions): Promise<RawIfcModel>;
  loadPreparedIfcModel(
    source: string | File,
    options?: LoadPreparedIfcModelOptions,
    prepareOptions?: GeometryPreparationOptions,
  ): Promise<PreparedIfcModel>;
  closeIfcModel(modelID: number): Promise<void>;
  getProjectInfo(modelID: number): Promise<ProjectInfoResult>;
  getElementData(modelID: number, expressID: number): Promise<ElementDataResult>;
  getModelMetadata(modelID: number): Promise<IfcModelMetadataResult>;
  dispose(): Promise<void>;
}

export function createIfcLoader(): IfcLoader {
  return new IfcWorkerClient();
}
