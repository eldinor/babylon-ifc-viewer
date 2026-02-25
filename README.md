# Babylon IFC Viewer

Lightweight IFC viewer built with `React + TypeScript + Vite + Babylon.js + web-ifc`.

## Features
- Load IFC files (auto-loads `./sample.ifc` on startup).
- Interactive IFC Project Tree (expand/collapse, keyboard navigation, subtree isolation).
- Mesh picking in scene synced with Project Tree selection.
- Element Info panel with:
  - per-field copy
  - `Copy All` in `Text | JSON | Markdown table` formats.

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```
