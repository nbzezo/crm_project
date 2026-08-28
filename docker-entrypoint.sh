#!/bin/sh
# Copy client build ra volume chia sẻ với nginx (volume mount /public), rồi chạy app.
set -e
mkdir -p /public
cp -r /app/client/dist/. /public/ 2>/dev/null || true
exec "$@"
