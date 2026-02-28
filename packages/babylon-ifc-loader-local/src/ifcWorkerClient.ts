import type { IfcInitOptions, IfcModelMetadataResult, ProjectInfoResult, RawIfcModel } from "./ifcInit";
import type { GeometryPreparationOptions, PreparedIfcModel } from "./ifcModelPreparation";

type WorkerLoadSource =
  | { kind: "url"; url: string }
  | { kind: "file"; name: string; data: ArrayBuffer };

function toAbsoluteSourceUrl(source: string): string {
  try {
    return new URL(source, window.location.href).toString();
  } catch {
    return source;
  }
}

type WorkerRequest =
  | {
      type: "init";
      id: number;
      wasmPath?: string;
      logLevel?: number;
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

type WorkerResultMessage =
  | {
      type: "result";
      id: number;
      ok: true;
      data: unknown;
    }
  | {
      type: "result";
      id: number;
      ok: false;
      error: string;
    };

type WorkerProgressPhase = "load-start" | "load-done" | "prepare-start" | "prepare-done";

type WorkerProgressMessage = {
  type: "progress";
  id: number;
  phase: WorkerProgressPhase;
  elapsedMs: number;
  details?: Record<string, unknown>;
};

type WorkerMessage = WorkerResultMessage | WorkerProgressMessage;

export interface IfcWorkerProgressEvent {
  phase: WorkerProgressPhase;
  elapsedMs: number;
  details?: Record<string, unknown>;
}

export interface IfcWorkerLoadOptions extends Omit<IfcInitOptions, "signal"> {
  signal?: AbortSignal;
  onProgress?: (event: IfcWorkerProgressEvent) => void;
}

export interface LoadPreparedIfcModelOptions extends IfcWorkerLoadOptions {
  keepModelOpen?: boolean;
  renderOnly?: boolean;
}

export interface ElementDataResult {
  typeName: string;
  element: {
    type: number;
    Name?: { value?: string };
  };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  abortHandler?: () => void;
  onProgress?: (event: IfcWorkerProgressEvent) => void;
}

interface RequestOptions {
  signal?: AbortSignal;
  onProgress?: (event: IfcWorkerProgressEvent) => void;
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Operation was aborted", "AbortError");
  }
  const error = new Error("Operation was aborted");
  error.name = "AbortError";
  return error;
}

export class IfcWorkerClient {
  private worker: Worker;
  private requestID = 1;
  private pending = new Map<number, PendingRequest>();

  constructor() {
    this.worker = new Worker(new URL("./ifc.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        const pending = this.pending.get(message.id);
        pending?.onProgress?.({
          phase: message.phase,
          elapsedMs: message.elapsedMs,
          details: message.details,
        });
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (pending.signal && pending.abortHandler) {
        pending.signal.removeEventListener("abort", pending.abortHandler);
      }

      if (message.ok) {
        pending.resolve(message.data);
      } else {
        pending.reject(new Error(message.error));
      }
    };
  }

  async init(wasmPath?: string, logLevel?: number): Promise<void> {
    await this.request<void>({
      type: "init",
      id: 0,
      wasmPath,
      logLevel,
    });
  }

  async loadIfcModel(source: string | File, options: IfcWorkerLoadOptions = {}): Promise<RawIfcModel> {
    const workerSource: WorkerLoadSource =
      typeof source === "string"
        ? { kind: "url", url: toAbsoluteSourceUrl(source) }
        : { kind: "file", name: source.name, data: await source.arrayBuffer() };
    const { signal, onProgress, ...workerOptions } = options;

    const transferables: Transferable[] = [];
    if (workerSource.kind === "file") {
      transferables.push(workerSource.data);
    }

    return this.request<RawIfcModel>(
      {
        type: "load",
        id: 0,
        source: workerSource,
        options: workerOptions,
      },
      transferables,
      { signal, onProgress },
    );
  }

  async loadPreparedIfcModel(
    source: string | File,
    options: LoadPreparedIfcModelOptions = {},
    prepareOptions: GeometryPreparationOptions = {},
  ): Promise<PreparedIfcModel> {
    const workerSource: WorkerLoadSource =
      typeof source === "string"
        ? { kind: "url", url: toAbsoluteSourceUrl(source) }
        : { kind: "file", name: source.name, data: await source.arrayBuffer() };
    const { signal, onProgress, keepModelOpen = true, renderOnly = false, ...workerOptions } = options;
    const basePrepareOptions = { ...prepareOptions } as Partial<GeometryPreparationOptions>;
    delete basePrepareOptions.signal;
    const workerPrepareOptions = renderOnly
      ? {
          ...basePrepareOptions,
          mergeMode: "two-material" as const,
          includeElementMap: false,
          profile: "renderOnly" as const,
        }
      : basePrepareOptions;
    const effectiveKeepModelOpen = renderOnly ? false : keepModelOpen;

    const transferables: Transferable[] = [];
    if (workerSource.kind === "file") {
      transferables.push(workerSource.data);
    }

    return this.request<PreparedIfcModel>(
      {
        type: "loadPrepared",
        id: 0,
        source: workerSource,
        options: workerOptions,
        prepareOptions: workerPrepareOptions,
        keepModelOpen: effectiveKeepModelOpen,
      },
      transferables,
      { signal, onProgress },
    );
  }

  async closeIfcModel(modelID: number): Promise<void> {
    await this.request<void>({
      type: "closeModel",
      id: 0,
      modelID,
    });
  }

  async getProjectInfo(modelID: number): Promise<ProjectInfoResult> {
    return this.request<ProjectInfoResult>({
      type: "getProjectInfo",
      id: 0,
      modelID,
    });
  }

  async getElementData(modelID: number, expressID: number): Promise<ElementDataResult> {
    return this.request<ElementDataResult>({
      type: "getElementData",
      id: 0,
      modelID,
      expressID,
    });
  }

  async getModelMetadata(modelID: number): Promise<IfcModelMetadataResult> {
    return this.request<IfcModelMetadataResult>({
      type: "getModelMetadata",
      id: 0,
      modelID,
    });
  }

  async dispose(): Promise<void> {
    try {
      await this.request<void>({
        type: "dispose",
        id: 0,
      });
    } finally {
      this.worker.terminate();
    }
  }

  private request<T>(
    message: WorkerRequest,
    transferables: Transferable[] = [],
    options: RequestOptions = {},
  ): Promise<T> {
    const id = this.requestID++;
    const payload = { ...message, id };

    return new Promise<T>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(createAbortError());
        return;
      }

      const abortHandler = () => {
        this.pending.delete(id);
        reject(createAbortError());
        const cancelMessage: WorkerRequest = {
          type: "cancel",
          id: 0,
          requestID: id,
        };
        this.worker.postMessage(cancelMessage);
      };

      if (options.signal) {
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        signal: options.signal,
        abortHandler,
        onProgress: options.onProgress,
      });
      this.worker.postMessage(payload, transferables);
    });
  }
}
