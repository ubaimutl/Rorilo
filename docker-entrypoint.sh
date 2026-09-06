#!/bin/sh
set -e

mkdir -p /data
npx prisma db push --skip-generate

exec "$@"
