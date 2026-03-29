#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT_DIR}"

ASSET_PORT="9000"
PUBLIC_PORT="${MAGIC_COMPARE_DEBUG_PUBLIC_PORT:-3000}"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/magic-compare-demo-assets.XXXXXX")"
EXPORT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/magic-compare-public-export.XXXXXX")"

cleanup() {
  if [[ -n "${ASSET_SERVER_PID:-}" ]]; then
    kill "${ASSET_SERVER_PID}" >/dev/null 2>&1 || true
  fi

  rm -rf "${TMP_ROOT}"
  rm -rf "${EXPORT_ROOT}"
}

find_python() {
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' python3
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    printf '%s\n' python
    return 0
  fi

  echo "python3 or python is required to serve demo assets locally." >&2
  exit 1
}

has_published_groups() {
  local candidate="$1"
  compgen -G "${candidate}/groups/*/manifest.json" >/dev/null 2>&1
}

find_published_root() {
  if [[ -n "${MAGIC_COMPARE_DEBUG_PUBLISHED_ROOT:-}" ]]; then
    if has_published_groups "${MAGIC_COMPARE_DEBUG_PUBLISHED_ROOT}"; then
      printf '%s\n' "${MAGIC_COMPARE_DEBUG_PUBLISHED_ROOT}"
      return 0
    fi

    echo "MAGIC_COMPARE_DEBUG_PUBLISHED_ROOT does not contain any published group manifests." >&2
    exit 1
  fi

  if has_published_groups "${ROOT_DIR}/content/published"; then
    printf '%s\n' "${ROOT_DIR}/content/published"
    return 0
  fi

  if has_published_groups "${ROOT_DIR}/apps/public-site/public/published"; then
    printf '%s\n' "${ROOT_DIR}/apps/public-site/public/published"
    return 0
  fi

  echo "No published demo bundle was found in the current project directory. Set MAGIC_COMPARE_DEBUG_PUBLISHED_ROOT to a directory that contains groups/*/manifest.json." >&2
  exit 1
}

ensure_port_available() {
  local port="$1"
  local label="$2"
  local hint="$3"

  if command -v lsof >/dev/null 2>&1 && lsof -tiTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "${label} port ${port} is already in use. Resolve it with ${hint} before rerunning." >&2
    exit 1
  fi
}

link_demo_asset() {
  local source_name="$1"
  local target_rel="$2"

  mkdir -p "$(dirname "${TMP_ROOT}/${target_rel}")"
  ln -sf "${ROOT_DIR}/apps/internal-site/prisma/demo-assets/${source_name}" \
    "${TMP_ROOT}/${target_rel}"
}

trap cleanup EXIT INT TERM

# The checked-in public demo manifest already points at 127.0.0.1:9000, so the debug environment
# only needs a throwaway static directory that mimics the expected object-storage key layout.
if [[ -n "${MAGIC_COMPARE_DEBUG_ASSET_PORT:-}" && "${MAGIC_COMPARE_DEBUG_ASSET_PORT}" != "${ASSET_PORT}" ]]; then
  echo "The committed demo manifest is pinned to http://127.0.0.1:9000 asset URLs. Use port 9000 for demo assets." >&2
  exit 1
fi

ensure_port_available "${ASSET_PORT}" "Demo asset server" "freeing port 9000"
ensure_port_available "${PUBLIC_PORT}" "Public viewer" "MAGIC_COMPARE_DEBUG_PUBLIC_PORT"

link_demo_asset "001-before.svg" "magic-compare-assets/internal-assets/demo-grain-study/banding-check/001/before.svg"
link_demo_asset "001-after.svg" "magic-compare-assets/internal-assets/demo-grain-study/banding-check/001/after.svg"
link_demo_asset "001-heatmap.svg" "magic-compare-assets/internal-assets/demo-grain-study/banding-check/001/heatmap.svg"
link_demo_asset "002-before.svg" "magic-compare-assets/internal-assets/demo-grain-study/banding-check/002/before.svg"
link_demo_asset "002-after.svg" "magic-compare-assets/internal-assets/demo-grain-study/banding-check/002/after.svg"

PYTHON_BIN="$(find_python)"
PUBLISHED_ROOT="$(find_published_root)"
"${PYTHON_BIN}" -m http.server "${ASSET_PORT}" --bind 127.0.0.1 --directory "${TMP_ROOT}" \
  >/tmp/magic-compare-demo-assets.log 2>&1 &
ASSET_SERVER_PID=$!

echo "Demo asset server: http://127.0.0.1:${ASSET_PORT}"
echo "Building static public viewer..."

export MAGIC_COMPARE_HIDE_DEMO=false
# Point public:export at whichever published root already contains the demo manifest. Detached
# worktrees often do not carry untracked published bundles, so fall back to another local worktree
# when one already has the seeded demo content.
export MAGIC_COMPARE_PUBLISHED_ROOT="${PUBLISHED_ROOT}"
export MAGIC_COMPARE_PUBLIC_EXPORT_DIR="${EXPORT_ROOT}"
export MAGIC_COMPARE_FOOTER_YEAR_START="${MAGIC_COMPARE_FOOTER_YEAR_START:-2026}"
export MAGIC_COMPARE_FOOTER_AUTHOR="${MAGIC_COMPARE_FOOTER_AUTHOR:-Magic Compare}"
# Codex/IDE shells can inherit inspector flags into child Node processes, which turns a simple
# export into noisy "Debugger attached" output and delayed shutdowns. Clear them for this script.
unset NODE_OPTIONS
unset VSCODE_INSPECTOR_OPTIONS
unset npm_config_node_options

pnpm public:export

echo "Viewer URL: http://127.0.0.1:${PUBLIC_PORT}/g/demo-grain-study--banding-check.html"
echo "Press Ctrl+C to stop both servers."

"${PYTHON_BIN}" -m http.server "${PUBLIC_PORT}" --bind 127.0.0.1 --directory "${EXPORT_ROOT}" \
  >/tmp/magic-compare-demo-public.log 2>&1 &
PUBLIC_SERVER_PID=$!

wait "${PUBLIC_SERVER_PID}"
