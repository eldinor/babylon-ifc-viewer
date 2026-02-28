/// <reference lib="webworker" />
import * as WebIFC from "web-ifc";
import { closeIfcModel, getIfcModelMetadata, getProjectInfo, initializeWebIFC, loadIfcModel } from "./ifcInit";
import type { IfcInitOptions } from "./ifcInit";
import { prepareIfcModelGeometry } from "./ifcModelPreparation";
import type { GeometryPreparationOptions, PreparedIfcModel } from "./ifcModelPreparation";

type WorkerLoadSource =
  | { kind: "url"; url: string }
  | { kind: "file"; name: string; data: ArrayBuffer };

type WorkerRequest =
  | {
      type: "init";
      id: number;
      wasmPath?: string;
      logLevel: WebIFC.LogLevel;
    }
  | {
      type: "load";
      id: number;
      source: WorkerLoadSource;
      options: Omit<IfcInitOptions, "signal">;
    }
  | {
      type: "loadPrepared";
      id: number;
      source: WorkerLoadSource;
      options: Omit<IfcInitOptions, "signal">;
      prepareOptions: Omit<GeometryPreparationOptions, "signal">;
      keepModelOpen: boolean;
    }
  | {
      type: "cancel";
      id: number;
      requestID: number;
    }
  | {
      type: "closeModel";
      id: number;
      modelID: number;
    }
  | {
      type: "getProjectInfo";
      id: number;
      modelID: number;
    }
  | {
      type: "getElementData";
      id: number;
      modelID: number;
      expressID: number;
    }
  | {
      type: "getModelMetadata";
      id: number;
      modelID: number;
    }
  | {
      type: "dispose";
      id: number;
    };

interface WorkerSuccess {
  type: "result";
  id: number;
  ok: true;
  data: unknown;
}

interface WorkerError {
  type: "result";
  id: number;
  ok: false;
  error: string;
}

type WorkerProgressPhase = "load-start" | "load-done" | "prepare-start" | "prepare-done";

interface WorkerProgress {
  type: "progress";
  id: number;
  phase: WorkerProgressPhase;
  elapsedMs: number;
  details?: Record<string, unknown>;
}

let ifcAPI: WebIFC.IfcAPI | null = null;
const activeRequests = new Map<number, AbortController>();
const WORKER_LOG_PREFIX = "[ifc.worker]";

function workerLog(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`${WORKER_LOG_PREFIX} ${message}`, details);
  } else {
    console.log(`${WORKER_LOG_PREFIX} ${message}`);
  }
}

function ensureIfcAPI(): WebIFC.IfcAPI {
  if (!ifcAPI) {
    throw new Error("web-ifc worker is not initialized. Call init() first.");
  }
  return ifcAPI;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function postSuccess(id: number, data: unknown, transferables: Transferable[] = []): void {
  const message: WorkerSuccess = {
    type: "result",
    id,
    ok: true,
    data,
  };
  self.postMessage(message, transferables);
}

function postError(id: number, error: unknown): void {
  const message: WorkerError = {
    type: "result",
    id,
    ok: false,
    error: getErrorMessage(error),
  };
  self.postMessage(message);
}

function postProgress(
  id: number,
  phase: WorkerProgressPhase,
  requestStart: number,
  details?: Record<string, unknown>,
): void {
  const message: WorkerProgress = {
    type: "progress",
    id,
    phase,
    elapsedMs: performance.now() - requestStart,
    details,
  };
  self.postMessage(message);
}

function collectModelTransferables(model: Awaited<ReturnType<typeof loadIfcModel>>): Transferable[] {
  const transferables: Transferable[] = [];
  const visited = new Set<ArrayBuffer>();

  for (const part of model.parts) {
    const buffers = [part.positions.buffer, part.normals.buffer, part.indices.buffer];
    for (const buffer of buffers) {
      if (buffer instanceof ArrayBuffer && !visited.has(buffer)) {
        visited.add(buffer);
        transferables.push(buffer);
      }
    }
  }

  return transferables;
}

function collectPreparedTransferables(model: PreparedIfcModel): { transferables: Transferable[]; bytes: number } {
  const transferables: Transferable[] = [];
  const visited = new Set<ArrayBuffer>();
  let bytes = 0;
  for (const mesh of model.meshes) {
    const buffers = [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer];
    for (const buffer of buffers) {
      if (buffer instanceof ArrayBuffer && !visited.has(buffer)) {
        visited.add(buffer);
        bytes += buffer.byteLength;
        transferables.push(buffer);
      }
    }
  }
  return { transferables, bytes };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    const controller = activeRequests.get(message.requestID);
    if (controller && !controller.signal.aborted) {
      controller.abort();
      workerLog("cancel request received", {
        requestID: message.requestID,
      });
    }
    return;
  }

  const requestStart = performance.now();
  const abortController = new AbortController();
  activeRequests.set(message.id, abortController);
  workerLog(`received '${message.type}'`, { id: message.id });

  try {
    switch (message.type) {
      case "init": {
        ifcAPI = await initializeWebIFC(message.wasmPath, message.logLevel);
        workerLog("web-ifc initialized", {
          id: message.id,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
          wasmPath: message.wasmPath ?? "(default)",
        });
        postSuccess(message.id, null);
        return;
      }
      case "load": {
        const api = ensureIfcAPI();
        const source = message.source.kind === "url" ? message.source.url : message.source.data;
        postProgress(message.id, "load-start", requestStart, {
          sourceKind: message.source.kind,
        });
        workerLog("loading raw IFC model", {
          id: message.id,
          sourceKind: message.source.kind,
        });
        const model = await loadIfcModel(api, source, { ...message.options, signal: abortController.signal });
        postProgress(message.id, "load-done", requestStart, {
          modelID: model.modelID,
          partCount: model.parts.length,
        });
        workerLog("raw IFC model loaded", {
          id: message.id,
          modelID: model.modelID,
          partCount: model.parts.length,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, model, collectModelTransferables(model));
        return;
      }
      case "loadPrepared": {
        const api = ensureIfcAPI();
        const source = message.source.kind === "url" ? message.source.url : message.source.data;
        postProgress(message.id, "load-start", requestStart, {
          sourceKind: message.source.kind,
        });
        workerLog("loading IFC model for preparation", {
          id: message.id,
          sourceKind: message.source.kind,
        });
        const model = await loadIfcModel(api, source, { ...message.options, signal: abortController.signal });
        postProgress(message.id, "load-done", requestStart, {
          modelID: model.modelID,
          partCount: model.parts.length,
        });
        const preparationStart = performance.now();
        postProgress(message.id, "prepare-start", requestStart, {
          modelID: model.modelID,
          sourcePartCount: model.parts.length,
        });
        workerLog("preparing geometry", {
          id: message.id,
          modelID: model.modelID,
          sourcePartCount: model.parts.length,
        });
        let prepared = prepareIfcModelGeometry(model, {
          ...message.prepareOptions,
          signal: abortController.signal,
        });
        postProgress(message.id, "prepare-done", requestStart, {
          modelID: prepared.modelID,
          preparedMeshCount: prepared.meshes.length,
          mergeMode: prepared.mergeMode,
          tier: prepared.telemetry.tier,
        });
        if (!message.keepModelOpen) {
          closeIfcModel(api, model.modelID);
          prepared = {
            ...prepared,
            modelID: -1,
          };
          workerLog("prepared model closed by option", {
            id: message.id,
            closedModelID: model.modelID,
          });
        }
        const transferStats = collectPreparedTransferables(prepared);
        prepared = {
          ...prepared,
          telemetry: {
            ...prepared.telemetry,
            transferBytes: transferStats.bytes + prepared.telemetry.elementMapBytes,
          },
        };
        workerLog("geometry prepared", {
          id: message.id,
          modelID: prepared.modelID,
          preparedMeshCount: prepared.meshes.length,
          mergedGroupCount: prepared.mergedGroupCount,
          invalidPartCount: prepared.invalidPartCount,
          mergeMode: prepared.mergeMode,
          tier: prepared.telemetry.tier,
          opaqueMeshCount: prepared.telemetry.opaqueMeshCount,
          transparentMeshCount: prepared.telemetry.transparentMeshCount,
          elementRangeCount: prepared.telemetry.elementRangeCount,
          transferBytes: prepared.telemetry.transferBytes,
          preparationMs: (performance.now() - preparationStart).toFixed(2),
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, prepared, transferStats.transferables);
        return;
      }
      case "closeModel": {
        const api = ensureIfcAPI();
        closeIfcModel(api, message.modelID);
        workerLog("model closed", {
          id: message.id,
          modelID: message.modelID,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, null);
        return;
      }
      case "getProjectInfo": {
        const api = ensureIfcAPI();
        const info = getProjectInfo(api, message.modelID);
        workerLog("project info extracted", {
          id: message.id,
          modelID: message.modelID,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, info);
        return;
      }
      case "getElementData": {
        const api = ensureIfcAPI();
        const element = api.GetLine(message.modelID, message.expressID, true) as {
          type: number;
          Name?: { value?: string };
        };
        const typeName = api.GetNameFromTypeCode(element.type);
        workerLog("element data extracted", {
          id: message.id,
          modelID: message.modelID,
          expressID: message.expressID,
          typeName,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, {
          typeName,
          element,
        });
        return;
      }
      case "getModelMetadata": {
        const api = ensureIfcAPI();
        const metadata = getIfcModelMetadata(api, message.modelID);
        workerLog("model metadata extracted", {
          id: message.id,
          modelID: message.modelID,
          rootCount: metadata.projectTreeIndex.roots.length,
          materialCount: metadata.ifcMaterials.length,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, metadata);
        return;
      }
      case "dispose": {
        ifcAPI = null;
        workerLog("worker IFC API disposed", {
          id: message.id,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, null);
        return;
      }
      default: {
        const exhaustiveCheck: never = message;
        throw new Error(`Unknown worker message: ${String(exhaustiveCheck)}`);
      }
    }
  } catch (error) {
    workerLog("request failed", {
      id: message.id,
      type: message.type,
      elapsedMs: (performance.now() - requestStart).toFixed(2),
      error: getErrorMessage(error),
    });
    postError(message.id, error);
  } finally {
    activeRequests.delete(message.id);
  }
};
