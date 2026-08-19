#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

version_type="patch"
use_existing_version=false
skip_publish=false
skip_changelog_commit=false

usage() {
    cat <<'EOF'
Usage: ./release_extension.sh [options]

Options:
  --version-type major|minor|patch  Version bump type (default: patch)
  --use-existing-version           Build and publish the current version
  --skip-publish                    Build and push, but do not publish
  --skip-changelog-commit          Do not commit a changed changelog separately
  -h, --help                       Show this help
EOF
}

while (($# > 0)); do
    case "$1" in
        --version-type)
            [[ $# -ge 2 ]] || { echo "Missing value for --version-type" >&2; exit 2; }
            version_type="$2"
            shift 2
            ;;
        --use-existing-version)
            use_existing_version=true
            shift
            ;;
        --skip-publish)
            skip_publish=true
            shift
            ;;
        --skip-changelog-commit)
            skip_changelog_commit=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

case "${version_type}" in
    major|minor|patch) ;;
    *) echo "Invalid version type: ${version_type}" >&2; exit 2 ;;
esac

step() {
    printf '\n==> %s\n' "$1"
}

require_clean_git_tree() {
    local status
    status="$(git status --short)"
    if [[ -n "${status}" ]]; then
        printf 'Working tree is not clean:\n%s\n' "${status}" >&2
        exit 1
    fi
}

import_release_env() {
    local env_file="${script_dir}/.release.env"
    [[ -f "${env_file}" ]] || return 0

    local line name value
    while IFS= read -r line || [[ -n "${line}" ]]; do
        line="${line%$'\r'}"
        [[ -z "${line}" || "${line}" == \#* ]] && continue
        [[ "${line}" == *=* ]] || continue
        name="${line%%=*}"
        value="${line#*=}"
        if [[ "${name}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            export "${name}=${value}"
        fi
    done < "${env_file}"
}

next_version() {
    local current="$1" kind="$2" major minor patch extra
    IFS=. read -r major minor patch extra <<< "${current}"
    if [[ -n "${extra:-}" || ! "${major}" =~ ^[0-9]+$ || ! "${minor}" =~ ^[0-9]+$ || ! "${patch}" =~ ^[0-9]+$ ]]; then
        echo "Unexpected package version format: ${current}" >&2
        exit 1
    fi

    case "${kind}" in
        major) printf '%d.0.0\n' "$((major + 1))" ;;
        minor) printf '%d.%d.0\n' "${major}" "$((minor + 1))" ;;
        patch) printf '%d.%d.%d\n' "${major}" "${minor}" "$((patch + 1))" ;;
    esac
}

update_changelog_version() {
    local version="$1"
    python3 - "${version}" <<'PY'
from pathlib import Path
import re
import sys

path = Path("CHANGELOG.md")
content = path.read_text(encoding="utf-8")
updated, count = re.subn(r"## \[\s*upcoming\s*\]", f"## [{sys.argv[1]}]", content)
if count:
    path.write_text(updated, encoding="utf-8")
sys.exit(0 if count else 3)
PY
}

import_release_env

step "Checking git state"
require_clean_git_tree

current_version="$(node -p "require('./package.json').version")"

if ${use_existing_version}; then
    version="${current_version}"
    step "Using existing version ${version}"
else
    version="$(next_version "${current_version}" "${version_type}")"
    step "Preparing changelog for ${version}"
    if update_changelog_version "${version}"; then
        if ! ${skip_changelog_commit}; then
            git add CHANGELOG.md
            git commit -m "chore: prepare ${version} changelog"
            git push origin "$(git branch --show-current)"
        fi
    else
        status=$?
        if [[ ${status} -ne 3 ]]; then
            exit "${status}"
        fi
        echo "No [ upcoming ] changelog header found; leaving CHANGELOG.md unchanged."
    fi

    step "Bumping npm version (${version_type})"
    npm version "${version_type}"
    version="$(node -p "require('./package.json').version")"
fi

step "Building VSIX"
"${script_dir}/build_extension.sh"

vsix="${script_dir}/firebird-vscode-${version}.vsix"
if [[ ! -f "${vsix}" ]]; then
    echo "Expected VSIX not found: ${vsix}" >&2
    exit 1
fi

step "Pushing git commits and tags"
git push --follow-tags

if ${skip_publish}; then
    echo "Publishing skipped; VSIX is available at ${vsix}"
    exit 0
fi

: "${OVSX_PAT:?OVSX_PAT is missing. Set it in the environment or .release.env.}"
: "${VSCE_PAT:?VSCE_PAT is missing. Set it in the environment or .release.env.}"

step "Publishing to Open VSX"
npx ovsx publish "${vsix}" -p "${OVSX_PAT}"

step "Publishing to VS Code Marketplace"
npx vsce publish -p "${VSCE_PAT}"

step "Release ${version} complete"
