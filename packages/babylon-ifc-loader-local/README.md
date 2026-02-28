# babylon-ifc-loader-local

Local source package for the IFC loader used by this viewer.

Notes:

- This package is source-first and exports `src/index.ts` directly.
- It is intended for bundlers that understand TypeScript source (for example Vite).
- The worker path is resolved from `ifcWorkerClient.ts`, so consumers must support `new Worker(new URL(..., import.meta.url))`.
- The host app must serve `web-ifc.wasm` and pass the correct path to `loader.init(...)`.
