#!/usr/bin/env pwsh
# MedMap AI - One-click Setup and Launch Script
# Run this from the Hackaton folder: .\setup_and_run.ps1

$ErrorActionPreference = "Stop"
$rootDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($rootDir)) { $rootDir = Get-Location }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   MedMap AI - Setup and Launch Script   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------
# 1. Check / Install Python
# -----------------------------------------
Write-Host "[1/5] Checking Python..." -ForegroundColor Yellow

$python = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3") {
            $python = $cmd
            Write-Host "  ✅ Found: $ver (using '$cmd')" -ForegroundColor Green
            break
        }
    } catch {}
}

if (-not $python) {
    Write-Host "  ⚠️  Python not found. Downloading Python 3.12 installer..." -ForegroundColor Red
    $pyInstaller = "$env:TEMP\python_installer.exe"
    Invoke-WebRequest "https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe" -OutFile $pyInstaller
    Write-Host "  Installing Python (this takes ~1 minute)..." -ForegroundColor Yellow
    Start-Process -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1" -Wait
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","User") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","Machine")
    $python = "python"
    Write-Host "  ✅ Python installed successfully!" -ForegroundColor Green
}

# ─────────────────────────────────────────
# 2. Check / Install Node.js
# ─────────────────────────────────────────
Write-Host ""
Write-Host "[2/5] Checking Node.js..." -ForegroundColor Yellow

$nodeOk = $false
try {
    $nodeVer = & node --version 2>&1
    if ($nodeVer -match "v\d+") {
        $nodeOk = $true
        Write-Host "  ✅ Found: Node.js $nodeVer" -ForegroundColor Green
    }
} catch {}

if (-not $nodeOk) {
    Write-Host "  ⚠️  Node.js not found. Downloading Node.js 20 LTS installer..." -ForegroundColor Red
    $nodeInstaller = "$env:TEMP\node_installer.msi"
    Invoke-WebRequest "https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi" -OutFile $nodeInstaller
    Write-Host "  Installing Node.js (this takes ~1-2 minutes)..." -ForegroundColor Yellow
    Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart" -Wait
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","User") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","Machine")
    Write-Host "  ✅ Node.js installed successfully!" -ForegroundColor Green
    Write-Host "  ⚠️  NOTE: You may need to restart this script once after Node.js installs." -ForegroundColor Magenta
}

# ─────────────────────────────────────────
# 3. Setup Backend
# ─────────────────────────────────────────
Write-Host ""
Write-Host "[3/5] Setting up Python backend..." -ForegroundColor Yellow

$backendDir = Join-Path $rootDir "backend"
$venvDir    = Join-Path $rootDir "venv"

if (-not (Test-Path $venvDir)) {
    Write-Host "  Creating virtual environment..." -ForegroundColor Gray
    & $python -m venv $venvDir
}

$pip    = Join-Path $venvDir "Scripts\pip.exe"
$pyExe  = Join-Path $venvDir "Scripts\python.exe"

Write-Host "  Installing Python dependencies..." -ForegroundColor Gray
& $pip install -r (Join-Path $rootDir "backend\requirements.txt") --quiet

Write-Host "  Seeding database with doctors..." -ForegroundColor Gray
Set-Location $rootDir
& $pyExe -m backend.seed

Write-Host "  ✅ Backend ready!" -ForegroundColor Green

# ─────────────────────────────────────────
# 4. Setup Frontend
# ─────────────────────────────────────────
Write-Host ""
Write-Host "[4/5] Setting up React frontend..." -ForegroundColor Yellow

$frontendDir = Join-Path $rootDir "frontend"
Set-Location $frontendDir

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "  Running npm install (this may take a minute)..." -ForegroundColor Gray
    & npm install --prefer-offline --loglevel=error
} else {
    Write-Host "  node_modules already installed, skipping." -ForegroundColor Gray
}

Write-Host "  ✅ Frontend ready!" -ForegroundColor Green

# ─────────────────────────────────────────
# 5. Launch Both Servers
# ─────────────────────────────────────────
Write-Host ""
Write-Host "[5/5] Launching servers..." -ForegroundColor Yellow
Set-Location $rootDir

$uvicorn = Join-Path $venvDir "Scripts\uvicorn.exe"

Write-Host ""
Write-Host "  🚀 Starting FastAPI backend on http://localhost:8000" -ForegroundColor Green
$backendJob = Start-Process -FilePath $uvicorn `
    -ArgumentList "backend.main:app --reload --port 8000" `
    -WorkingDirectory $rootDir `
    -PassThru -NoNewWindow

Start-Sleep -Seconds 3

Write-Host "  🚀 Starting React frontend on http://localhost:5173" -ForegroundColor Green
Set-Location $frontendDir

Start-Sleep -Seconds 1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ✅ MedMap AI is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor White
Write-Host "  API docs : http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Open browser
Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"

# Run frontend in foreground (blocks until Ctrl+C)
& npm run dev
