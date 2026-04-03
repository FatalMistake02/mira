#!/bin/bash
# Install Node.js on macOS and Linux

set -e

NODE_VERSION="25.8.0"

# Detect OS
OS=$(uname -s)
ARCH=$(uname -m)

echo "Detected OS: $OS, Architecture: $ARCH"

install_macos() {
    echo "Installing Node.js on macOS..."
    
    if command -v brew &> /dev/null; then
        echo "Using Homebrew..."
        brew install node@20
    else
        echo "Homebrew not found. Downloading Node.js directly..."
        curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz" -o node.tar.gz
        sudo tar -xzf node.tar.gz -C /usr/local --strip-components=1
        rm node.tar.gz
    fi
}

install_linux() {
    echo "Installing Node.js on Linux..."
    
    # Try different package managers
    if command -v apt-get &> /dev/null; then
        echo "Using apt..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf &> /dev/null; then
        echo "Using dnf..."
        sudo dnf install -y nodejs20
    elif command -v yum &> /dev/null; then
        echo "Using yum..."
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    elif command -v pacman &> /dev/null; then
        echo "Using pacman..."
        sudo pacman -S nodejs npm
    else
        echo "Package manager not found. Downloading Node.js directly..."
        curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o node.tar.xz
        sudo tar -xf node.tar.xz -C /usr/local --strip-components=1
        rm node.tar.xz
    fi
}

# Check if Node is already installed
if command -v node &> /dev/null; then
    echo "Node.js is already installed: $(node --version)"
    echo "npm version: $(npm --version)"
    exit 0
fi

# Install based on OS
case "$OS" in
    Darwin)
        install_macos
        ;;
    Linux)
        install_linux
        ;;
    *)
        echo "Unsupported operating system: $OS"
        echo "Please install Node.js manually from https://nodejs.org/"
        exit 1
        ;;
esac

echo ""
echo "Node.js $(node --version) installed successfully!"
echo "npm $(npm --version) installed successfully!"
echo ""
