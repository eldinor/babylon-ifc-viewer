// App shim over the local loader package source.
export { createIfcLoader } from "../../packages/babylon-ifc-loader-local/src/ifcLoader";
export type {
  ProjectInfoResult,
  IfcMaterialInfoResult,
} from "../../packages/babylon-ifc-loader-local/src/ifcInit";
export type { IfcLoader } from "../../packages/babylon-ifc-loader-local/src/ifcLoader";
export type { ElementDataResult } from "../../packages/babylon-ifc-loader-local/src/ifcWorkerClient";
export type { PreparedIfcElementBounds, PreparedIfcModel } from "../../packages/babylon-ifc-loader-local/src/ifcModelPreparation";

export {
  buildIfcModel,
  disposeIfcModel,
  getModelBounds,
  resolveExpressIDFromMeshPick,
  createElementOverlayMesh,
} from "../../packages/babylon-ifc-loader-local/src/ifcModel";
