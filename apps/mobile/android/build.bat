@echo off
REM Mira Android App Build Script for Windows
REM This script automates the build process for Android APK

setlocal enabledelayedexpansion

echo.
echo 🚀 Mira Android Build Script
echo ================================
echo.

REM Check prerequisites
echo 📋 Checking prerequisites...

where node >nul 2>nul
if errorlevel 1 (
    echo ❌ Node.js not found. Please install Node.js v16+
    exit /b 1
)

where java >nul 2>nul
if errorlevel 1 (
    echo ❌ Java not found. Please install Java 11+
    exit /b 1
)

if "%ANDROID_HOME%"=="" (
    echo ❌ ANDROID_HOME not set. Please set up Android SDK
    exit /b 1
)

echo ✅ All prerequisites found

REM Install dependencies
echo.
echo 📦 Installing dependencies...
call npm install
echo ✅ Dependencies installed

REM Build based on argument
if "%1%"=="release" (
    echo.
    echo 🔨 Building release APK...
    call npm run android:build
    echo ✅ Release APK built successfully
    echo 📂 Location: android\app\build\outputs\apk\release\app-release.apk
) else (
    echo.
    echo 🔨 Building debug APK...
    call npm run android:build:debug
    echo ✅ Debug APK built successfully
    echo 📂 Location: android\app\build\outputs\apk\debug\app-debug.apk
)

echo.
echo 🎉 Build completed successfully!
