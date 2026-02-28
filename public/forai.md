# Migration Runbook For Apps Using `babylon-ifc-loader`

## 1. Upgrade package

```bash
npm install babylon-ifc-loader@latest
npm ls babylon-ifc-loader
```

## 2. Switch to unified loader API

```ts
import { createIfcLoader, buildIfcModel, disposeIfcModel, resolveExpressIDFromMeshPick } from "babylon-ifc-loader";

const loader = createIfcLoader({ useWorker: true });
await loader.init("/"); // or your app wasm path
```

## 3. Replace raw load flow with prepared load flow

```ts
const prepared = await loader.loadPreparedIfcModel(
  source,
  { coordinateToOrigin: true, verbose: true },
  {
    generateNormals: false,
    maxTrianglesPerMesh: 200000,
    maxVerticesPerMesh: 300000,
    autoMergeStrategy: {
      lowMaxParts: 1500,
      mediumMaxParts: 5000,
      lowMode: "by-express-color",
      mediumMode: "by-color",
      highMode: "two-material",
    },
  },
);

const { meshes, rootNode, stats } = buildIfcModel(prepared, scene, {
  autoCenter: true,
  mergeMeshes: true,
  doubleSided: true,
  generateNormals: false,
  freezeAfterBuild: true,
  usePBRMaterials: true,
});
```

## 4. Picking tips (important)

1. Always resolve ID with `resolveExpressIDFromMeshPick(pickedMesh, pickResult.faceId)`.
2. Do not trust `mesh.metadata.expressID` directly in merged modes (`by-color`, `two-material` can be `-1`).
3. Ensure `includeElementMap` is enabled if you need precise picking in merged modes.
4. If `renderOnly: true`, picking/query is limited: model is closed and element map is disabled.
5. Before calling `getElementData`, check `modelID >= 0`.

## 5. Lifecycle rules

1. Keep one long-lived loader instance (do not recreate per file).
2. On model replace:

```ts
disposeIfcModel(scene);
if (prevModelID >= 0) await loader.closeIfcModel(prevModelID);
```

3. On app shutdown:

```ts
await loader.dispose();
```

## 6. Optional profiles

1. View-only mode:

```ts
await loader.loadPreparedIfcModel(source, { renderOnly: true });
```

2. Interactive inspection mode: keep default `includeElementMap: true`, keep model open if you need `getElementData` or `getProjectInfo`.
