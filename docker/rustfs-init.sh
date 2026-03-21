#!/bin/sh
set -eu

endpoint="${MAGIC_COMPARE_DOCKER_S3_ENDPOINT:-http://rustfs:9000}"
bucket="${MAGIC_COMPARE_S3_BUCKET:-magic-compare-assets}"
access_key="${MAGIC_COMPARE_S3_ACCESS_KEY_ID:-rustfsadmin}"
secret_key="${MAGIC_COMPARE_S3_SECRET_ACCESS_KEY:-rustfsadmin}"

echo "Waiting for RustFS at ${endpoint}..."
until mc alias set rustfs "$endpoint" "$access_key" "$secret_key" --api S3v4 --path on >/dev/null 2>&1 &&
  mc ls rustfs >/dev/null 2>&1; do
  sleep 2
done

echo "Ensuring bucket ${bucket} exists..."
mc mb "rustfs/${bucket}" --ignore-existing >/dev/null

echo "RustFS bucket ${bucket} is ready."
