// Packable local package surface.
export { initializeWebIFC, loadIfcModel, closeIfcModel, getProjectInfo, getIfcModelMetadata } from "./ifcInit";
export { IfcWorkerClient } from "./ifcWorkerClient";
export { createIfcLoader } from "./ifcLoader";

export type {
  RawIfcModel,
  RawGeometryPart,
  IfcInitOptions,
  ProjectInfoResult,
  IfcLengthUnitInfo,
  IfcProjectTreeNodeKind,
  IfcProjectTreeNode,
  IfcProjectTreeIndex,
  IfcMaterialInfoResult,
  IfcModelMetadataResult,
} from "./ifcInit";
export type { IfcLoader } from "./ifcLoader";
export type {
  ElementDataResult,
  IfcWorkerProgressEvent,
  IfcWorkerLoadOptions,
  LoadPreparedIfcModelOptions,
} from "./ifcWorkerClient";
export { prepareIfcModelGeometry } from "./ifcModelPreparation";
export type {
  AutoMergeStrategy,
  PreparedIfcElementBounds,
  GeometryMergeMode,
  GeometryPreparationTier,
  GeometryPreparationOptions,
  PreparedIfcElementRange,
  PreparedIfcModel,
  PreparedIfcMeshData,
  PreparedIfcTelemetry,
} from "./ifcModelPreparation";

export {
  buildIfcModel,
  disposeIfcModel,
  getModelBounds,
  centerModelAtOrigin,
  resolveExpressIDFromMeshPick,
  createElementOverlayMesh,
} from "./ifcModel";
export type { IfcPreparedMeshMetadata, SceneBuildOptions, SceneBuildResult, BuildStats, BoundsInfo } from "./ifcModel";
