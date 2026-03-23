# Install Node.js on Windows
# Run with: powershell -ExecutionPolicy Bypass -File scripts\install-node.ps1

$NODE_VERSION = "25.8.0"

function Test-NodeInstalled {
    try {
        $nodeVersion = node --version 2>$null
        $npmVersion = npm --version 2>$null
        if ($nodeVersion) {
            Write-Host "Node.js is already installed: $nodeVersion" -ForegroundColor Green
            Write-Host "npm version: $npmVersion" -ForegroundColor Green
            return $true
        }
    } catch {
        return $false
    }
    return $false
}

function Install-NodeWindows {
    Write-Host "Installing Node.js v$NODE_VERSION on Windows..." -ForegroundColor Cyan
    
    # Check if winget is available (Windows 10/11)
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    
    if ($winget) {
        Write-Host "Using winget to install Node.js..." -ForegroundColor Yellow
        winget install OpenJS.NodeJS.LTS
    } else {
        # Download and install manually
        Write-Host "Downloading Node.js installer..." -ForegroundColor Yellow
        
        $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
        $installerUrl = "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$arch.msi"
        $installerPath = "$env:TEMP\node-installer.msi"
        
        try {
            Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
            Write-Host "Running installer..." -ForegroundColor Yellow
            Start-Process msiexec.exe -ArgumentList "/i", "$installerPath", "/quiet", "/norestart" -Wait
            Remove-Item $installerPath -Force
            Write-Host "Installation complete!" -ForegroundColor Green
        } catch {
            Write-Host "Failed to download or install Node.js automatically." -ForegroundColor Red
            Write-Host "Please download and install manually from: https://nodejs.org/" -ForegroundColor Yellow
            exit 1
        }
    }
}

# Main
Write-Host "Node.js Installer for Windows" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host ""

if (Test-NodeInstalled) {
    Write-Host ""
    Write-Host "You're all set!" -ForegroundColor Green
    exit 0
}

Install-NodeWindows

# Refresh environment variables
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# Verify installation
try {
    $nodeVersion = node --version 2>$null
    $npmVersion = npm --version 2>$null
    Write-Host ""
    Write-Host "Node.js $nodeVersion installed successfully!" -ForegroundColor Green
    Write-Host "npm $npmVersion installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You are all set!" -ForegroundColor Cyan
} catch {
    Write-Host ""
    Write-Host "Installation may have succeeded, but Node is not in your PATH." -ForegroundColor Yellow
    Write-Host "Please restart your terminal and try again, or install manually from https://nodejs.org/" -ForegroundColor Yellow
}
