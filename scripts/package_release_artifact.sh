#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -n "${CODEGPT_RELEASE_VERSION:-}" ]; then
    VERSION="$CODEGPT_RELEASE_VERSION"
else
    VERSION="$(node -e "process.stdout.write(require('$ROOT/npm/codegpt/package.json').version)")"
fi
PLATFORM="${CODEGPT_RELEASE_PLATFORM:-linux-x64}"
BIN_DIR="${CODEGPT_RELEASE_BIN_DIR:-$ROOT/target/release}"
OUT_DIR="${1:-$ROOT/dist}"
ARCHIVE="$OUT_DIR/codegpt-v$VERSION-$PLATFORM.tar.gz"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

mkdir -p "$OUT_DIR" "$TMP/package"
for name in codegpt codegpt-server codegpt-runner; do
    source="$BIN_DIR/$name"
    if [ ! -f "$source" ] || [ ! -x "$source" ]; then
        echo "missing executable release binary: $source" >&2
        exit 1
    fi
    install -m 0755 "$source" "$TMP/package/$name"
done

identity=""
for name in codegpt codegpt-server codegpt-runner; do
    output="$($TMP/package/$name --version)"
    case "$output" in
        "$name $VERSION "*|"$name $VERSION") ;;
        *) echo "unexpected $name version output: $output" >&2; exit 1 ;;
    esac
    current="${output#"$name "}"
    if [ -z "$identity" ]; then identity="$current"; elif [ "$current" != "$identity" ]; then
        echo "release binaries do not share one build identity" >&2
        exit 1
    fi
done

tar -czf "$ARCHIVE.tmp" -C "$TMP/package" codegpt codegpt-server codegpt-runner
mv -f "$ARCHIVE.tmp" "$ARCHIVE"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$ARCHIVE"
else
    shasum -a 256 "$ARCHIVE"
fi
printf '%s\n' "$ARCHIVE"
