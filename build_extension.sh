#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

echo "Starting build process..."

echo "Installing dependencies..."
npm ci

echo "Compiling extension..."
npm run compile

echo "Packaging VSIX..."
npm run package

echo "Build complete!"
