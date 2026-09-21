#####!/bin/bash

ROOT="/storage/emulated/0/Documents/dev/dw"
SHARED_SRC="$ROOT/packages/shared/src"

echo "Creating symlinks for shared sources..."

# ----- Server -----
SERVER_LINK="$ROOT/packages/server/src/shared"
if [ -L "$SERVER_LINK" ] || [ -d "$SERVER_LINK" ]; then
    rm -f "$SERVER_LINK"
fi
ln -sf "$SHARED_SRC" "$SERVER_LINK"
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to create symlink for server"
    exit 1
fi
echo "[OK] Server symlink created"

# ----- Client (если существует) -----
if [ -d "$ROOT/packages/client/src" ]; then
    CLIENT_LINK="$ROOT/packages/client/src/shared"
    if [ -L "$CLIENT_LINK" ] || [ -d "$CLIENT_LINK" ]; then
        rm -f "$CLIENT_LINK"
    fi
    ln -sf "$SHARED_SRC" "$CLIENT_LINK"
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to create symlink for client"
        exit 1
    fi
    echo "[OK] Client symlink created"
else
    echo "[SKIP] Client folder not found, skipping client symlink"
fi

echo "All symlinks created successfully."
exit 0
