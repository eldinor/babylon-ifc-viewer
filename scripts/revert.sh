#!/bin/bash
# Show the original files from the base branch
git diff --name-only origin/further HEAD
echo "---"
git show origin/further:src/App.tsx
echo "===FILE_SEPARATOR==="
git show origin/further:src/components/BabylonScene.tsx
echo "===FILE_SEPARATOR==="
git show origin/further:src/utils/pickingUtils.ts
