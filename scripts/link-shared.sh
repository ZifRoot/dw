#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHARED_SRC="$ROOT/packages/shared/src"

echo "Creating symlinks for shared sources..."

if [ ! -d "$SHARED_SRC" ]; then
    echo "[ERROR] Shared source folder not found: $SHARED_SRC"
    exit 1
fi

create_symlink() {
    local link_path="$1"
    local link_name="$2"

    if [ -e "$link_path" ] || [ -L "$link_path" ]; then
        if [ ! -L "$link_path" ]; then
            echo "[ERROR] Refusing to replace non-symlink path: $link_path"
            exit 1
        fi

        rm "$link_path"
    fi

    ln -s "$SHARED_SRC" "$link_path"

    if [ ! -L "$link_path" ]; then
        echo "[ERROR] Failed to create symlink for $link_name"
        exit 1
    fi

    echo "[OK] $link_name symlink created"
}

create_symlink "$ROOT/packages/server/src/shared" "Server"
create_symlink "$ROOT/packages/client/src/shared" "Client"

echo "All symlinks created successfully."
