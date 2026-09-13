#!/bin/sh
set -eu

echo "Running internal-site schema sync..."
pnpm db:push

if [ "${MAGIC_COMPARE_HIDE_DEMO:-true}" != "true" ] &&
  [ -n "${MAGIC_COMPARE_S3_BUCKET:-}" ] &&
  [ -n "${MAGIC_COMPARE_S3_PUBLIC_BASE_URL:-}" ] &&
  [ -n "${MAGIC_COMPARE_S3_ACCESS_KEY_ID:-}" ] &&
  [ -n "${MAGIC_COMPARE_S3_SECRET_ACCESS_KEY:-}" ]; then
  echo "Running internal-site demo seed..."
  pnpm db:seed
else
  echo "Skipping demo seed because demo is hidden or external storage is not configured."
fi

echo "internal-site init complete."
