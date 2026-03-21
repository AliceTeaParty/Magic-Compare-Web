#!/bin/sh
set -eu

echo "Running internal-site schema sync..."
pnpm db:push

echo "Running internal-site demo seed..."
pnpm db:seed

echo "internal-site init complete."
