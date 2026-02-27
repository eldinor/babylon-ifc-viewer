# Babylon IFC Viewer

Lightweight IFC viewer built with `React + TypeScript + Vite + Babylon.js + web-ifc`.

## Features
- Load IFC files (auto-loads `./sample.ifc` on startup).
- Recent IFC list near `Open IFC` (filename labels, full path in tooltip).
- Interactive IFC Project Tree (expand/collapse, keyboard navigation, subtree isolation).
- Multi-selection in Project Tree:
  - `Ctrl+Click` / `Ctrl+Enter`: toggle item in selection.
  - `Shift+Click` / `Shift+Enter`: range selection from anchor.
- Mesh picking in scene synced with Project Tree selection.
- Element Info panel with:
  - per-field copy
  - `Copy All` in `Text | JSON | Markdown table` formats.
- Dedicated `Related Elements` panel on the right (below header), with clickable related items.
- Related Elements selection supports:
  - click on selected item to deselect
  - `Ctrl+Click` to toggle
  - `Shift+Click` to select range.
- User setting: `Show related elements` (enabled by default).
- Material Info tab:
  - lists IFC materials from the IFC file (`IFCMATERIAL`)
  - compact columns: `Name | Qty | Color | ID`
  - scrollable list with sticky header
  - name tooltips for long values.
- Material `Show Elements` mode:
  - toggle in Material Info header
  - clicking material rows isolates scene to elements using selected material(s)
  - supports `Ctrl/Cmd+Click` toggle and `Shift+Click` range selection.
- Camera action `Zoom Parent` (`R`) to fit the parent scope of current element without changing Project Tree selection.
- App title shows build version from `package.json`.
- Keyboard shortcuts dialog closes on `Esc` and on outside click.
- Footer status/utility:
  - IFC schema + file info
  - model stats (`Parts`, `Meshes`)
  - live scene stats (`FPS`, `Draw Calls`, `Memory`)
  - `Export GLB` button for current visible selection.
- Built-in user guide: `/user-guide.html` (also available from the header Help icon).

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
