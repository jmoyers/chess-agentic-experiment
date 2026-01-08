#!/bin/bash
# Build Stockfish from source for local development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$SERVER_DIR/bin"
BUILD_DIR="$SERVER_DIR/.stockfish-build"

# Detect architecture
if [[ "$(uname -m)" == "arm64" ]]; then
    ARCH="apple-silicon"
elif [[ "$(uname -m)" == "x86_64" ]]; then
    ARCH="x86-64-modern"
else
    echo "Unsupported architecture: $(uname -m)"
    exit 1
fi

echo "=== Stockfish Build Script ==="
echo "Architecture: $ARCH"
echo "Build dir: $BUILD_DIR"
echo "Output: $BIN_DIR/stockfish"
echo ""

# Check if already built
if [[ -f "$BIN_DIR/stockfish" ]]; then
    echo "Stockfish binary already exists at $BIN_DIR/stockfish"
    echo "Version: $("$BIN_DIR/stockfish" <<< "quit" 2>/dev/null | head -1 || echo "unknown")"
    echo ""
    read -p "Rebuild? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping build."
        exit 0
    fi
fi

# Clone or update Stockfish
if [[ -d "$BUILD_DIR/Stockfish" ]]; then
    echo "Updating existing Stockfish repo..."
    cd "$BUILD_DIR/Stockfish"
    git fetch origin
    git checkout master
    git pull origin master
else
    echo "Cloning Stockfish repository..."
    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git
fi

# Build
echo ""
echo "Building Stockfish with ARCH=$ARCH..."
cd "$BUILD_DIR/Stockfish/src"

# Clean previous build
make clean || true

# Build with optimal settings
# -j uses all available cores
make -j build ARCH="$ARCH"

# Copy binary
echo ""
echo "Copying binary to $BIN_DIR..."
mkdir -p "$BIN_DIR"
cp stockfish "$BIN_DIR/stockfish"
chmod +x "$BIN_DIR/stockfish"

# Verify
echo ""
echo "=== Build Complete ==="
echo "Binary: $BIN_DIR/stockfish"
echo ""
echo "Testing engine..."
"$BIN_DIR/stockfish" << 'EOF'
uci
quit
EOF

echo ""
echo "Stockfish is ready to use!"
echo "Set STOCKFISH_PATH=$BIN_DIR/stockfish in your environment, or it will auto-detect."


