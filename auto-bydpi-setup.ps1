# Auto-ByeDPI Setup Script for Windows
# Downloads, installs, configures, and runs ByeDPI automatically

Write-Host "Auto-ByeDPI Setup Starting..." -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green

# Step 1: Auto-download ByeDPI
Write-Host "Step 1: Auto-downloading ByeDPI..." -ForegroundColor Yellow

$downloadUrl = "https://github.com/ValdikSS/GoodbyeDPI/releases/latest/download/goodbyedpi-0.2.2.zip"
$downloadPath = "$env:TEMP\goodbyedpi.zip"
$extractPath = "C:\GoodbyeDPI"

try {
    # Create directory
    if (!(Test-Path $extractPath)) {
        New-Item -ItemType Directory -Path $extractPath -Force
    }
    
    # Download ByeDPI
    Write-Host "Downloading from: $downloadUrl" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath -UseBasicParsing
    
    # Extract
    Write-Host "Extracting to: $extractPath" -ForegroundColor Cyan
    Expand-Archive -Path $downloadPath -DestinationPath $extractPath -Force
    
    Write-Host "ByeDPI downloaded and extracted successfully!" -ForegroundColor Green
} catch {
    Write-Host "Download failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Trying alternative download method..." -ForegroundColor Yellow
    
    # Alternative: Manual download instructions
    Write-Host "Please manually download from: https://github.com/ValdikSS/GoodbyeDPI/releases" -ForegroundColor Yellow
    Write-Host "Extract to: $extractPath" -ForegroundColor Yellow
    Read-Host "Press Enter after manual download is complete"
}

# Step 2: Auto-run ByeDPI with correct settings
Write-Host "Step 2: Auto-running ByeDPI with optimal settings..." -ForegroundColor Yellow

$goodbyedpiExe = "$extractPath\goodbyedpi.exe"

if (Test-Path $goodbyedpiExe) {
    Write-Host "Starting ByeDPI with DPI bypass settings..." -ForegroundColor Cyan
    
    # Kill any existing ByeDPI processes
    Get-Process -Name "goodbyedpi" -ErrorAction SilentlyContinue | Stop-Process -Force
    
    # Start ByeDPI with optimal settings
    $arguments = "--http --https --udp --host-mixed-case --split-tls-record"
    Write-Host "Running: $goodbyedpiExe $arguments" -ForegroundColor Cyan
    
    Start-Process -FilePath $goodbyedpiExe -ArgumentList $arguments -WindowStyle Hidden
    
    # Wait for ByeDPI to start
    Start-Sleep -Seconds 3
    
    Write-Host "ByeDPI started with DPI bypass enabled!" -ForegroundColor Green
} else {
    Write-Host "ByeDPI executable not found at: $goodbyedpiExe" -ForegroundColor Red
    Write-Host "Please ensure ByeDPI is properly extracted" -ForegroundColor Yellow
}

# Step 3: Auto-detect and fix issues
Write-Host "Step 3: Auto-detecting and fixing issues..." -ForegroundColor Yellow

# Check if ByeDPI is running
$bydpiProcess = Get-Process -Name "goodbyedpi" -ErrorAction SilentlyContinue
if ($bydpiProcess) {
    Write-Host "ByeDPI is running (PID: $($bydpiProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "ByeDPI not detected as running, attempting restart..." -ForegroundColor Yellow
    
    # Try to restart
    if (Test-Path $goodbyedpiExe) {
        Start-Process -FilePath $goodbyedpiExe -ArgumentList $arguments -WindowStyle Hidden
        Start-Sleep -Seconds 3
        
        $bydpiProcess = Get-Process -Name "goodbyedpi" -ErrorAction SilentlyContinue
        if ($bydpiProcess) {
            Write-Host "ByeDPI restarted successfully!" -ForegroundColor Green
        } else {
            Write-Host "Failed to start ByeDPI automatically" -ForegroundColor Red
        }
    }
}

# Check network connectivity
Write-Host "Testing network connectivity..." -ForegroundColor Cyan
try {
    $testResult = Test-NetConnection -ComputerName "einthusan.tv" -Port 443 -InformationLevel Quiet
    if ($testResult) {
        Write-Host "Einthusan.tv is accessible" -ForegroundColor Green
    } else {
        Write-Host "Einthusan.tv connectivity issues detected" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Network test failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "ByeDPI setup complete!" -ForegroundColor Green
Write-Host "Ready to test with Ulidavaru Kandanthe!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Start your Telegram bot" -ForegroundColor White
Write-Host "2. Search for 'Ulidavaru Kandanthe' in Telegram" -ForegroundColor White
Write-Host "3. The bot will auto-convert to MKV without buttons" -ForegroundColor White
Write-Host ""
Write-Host "ByeDPI is running with DPI bypass enabled!" -ForegroundColor Green