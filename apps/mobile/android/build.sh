#!/bin/bash

# Mira Android App Build Script
# This script automates the build process for Android APK

set -e

echo "🚀 Mira Android Build Script"
echo "================================"

# Check prerequisites
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js not found. Please install Node.js v16+"
        exit 1
    fi
    
    if ! command -v java &> /dev/null; then
        echo "❌ Java not found. Please install Java 11+"
        exit 1
    fi
    
    if [ -z "$ANDROID_HOME" ]; then
        echo "❌ ANDROID_HOME not set. Please set up Android SDK"
        exit 1
    fi
    
    echo "✅ All prerequisites found"
}

# Install dependencies
install_deps() {
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
}

# Build debug APK
build_debug() {
    echo "🔨 Building debug APK..."
    npm run android:build:debug
    echo "✅ Debug APK built successfully"
    echo "📂 Location: android/app/build/outputs/apk/debug/app-debug.apk"
}

# Build release APK
build_release() {
    echo "🔨 Building release APK..."
    npm run android:build
    echo "✅ Release APK built successfully"
    echo "📂 Location: android/app/build/outputs/apk/release/app-release.apk"
}

# Main script
case "${1:-debug}" in
    debug)
        check_prerequisites
        install_deps
        build_debug
        ;;
    release)
        check_prerequisites
        install_deps
        build_release
        ;;
    *)
        echo "Usage: $0 [debug|release]"
        echo "  debug   - Build debug APK (default)"
        echo "  release - Build release APK"
        exit 1
        ;;
esac

echo ""
echo "🎉 Build completed successfully!"
