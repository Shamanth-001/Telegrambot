# Complete Auto-Run System for Ulidavaru Kandanthe
# Checks ByeDPI, fixes issues, and auto-tests until successful

Write-Host "AUTO-RUN COMPLETE SYSTEM STARTING..." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

function Check-ByeDPIStatus {
    Write-Host "Checking ByeDPI status..." -ForegroundColor Yellow
    
    $bydpiProcess = Get-Process -Name "goodbyedpi" -ErrorAction SilentlyContinue
    if ($bydpiProcess) {
        Write-Host "ByeDPI is RUNNING (PID: $($bydpiProcess.Id))" -ForegroundColor Green
        return $true
    } else {
        Write-Host "ByeDPI is NOT RUNNING" -ForegroundColor Red
        return $false
    }
}

function Start-ByeDPI {
    Write-Host "Starting ByeDPI with DPI bypass..." -ForegroundColor Yellow
    
    $goodbyedpiExe = "C:\GoodbyeDPI\goodbyedpi-0.2.2\x86_64\goodbyedpi.exe"
    
    if (Test-Path $goodbyedpiExe) {
        # Kill any existing processes
        Get-Process -Name "goodbyedpi" -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 2
        
        # Start with optimal settings
        $arguments = "--http --https --udp --host-mixed-case --split-tls-record"
        Write-Host "Starting: $goodbyedpiExe $arguments" -ForegroundColor Cyan
        
        Start-Process -FilePath $goodbyedpiExe -ArgumentList $arguments -WindowStyle Hidden -Verb RunAs
        Start-Sleep -Seconds 5
        
        # Verify it started
        $bydpiProcess = Get-Process -Name "goodbyedpi" -ErrorAction SilentlyContinue
        if ($bydpiProcess) {
            Write-Host "ByeDPI started successfully!" -ForegroundColor Green
            return $true
        } else {
            Write-Host "Failed to start ByeDPI" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "ByeDPI executable not found at: $goodbyedpiExe" -ForegroundColor Red
        return $false
    }
}

function Test-EinthusanAccess {
    Write-Host "Testing Einthusan.tv access..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri "https://einthusan.tv" -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "Einthusan.tv is accessible (Status: $($response.StatusCode))" -ForegroundColor Green
            return $true
        } else {
            Write-Host "Einthusan.tv returned status: $($response.StatusCode)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "Einthusan.tv access failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Start-BotAndTest {
    Write-Host "Starting bot and testing Ulidavaru Kandanthe..." -ForegroundColor Yellow
    
    # Set environment and start bot
    $env:BOT_TOKEN = "8475299170:AAHcf-x7S8XPP6TkMXbW8HL9xYHGrPLQ48k"
    
    Write-Host "Bot will start now - search for 'Ulidavaru Kandanthe' in Telegram" -ForegroundColor Cyan
    Write-Host "The bot will auto-convert to MKV if successful" -ForegroundColor Cyan
    
    # Start the bot
    & node bot.js
}

function Main {
    Write-Host "AUTO-RUN COMPLETE SYSTEM" -ForegroundColor Green
    Write-Host "===========================" -ForegroundColor Green
    
    $attempt = 1
    $maxAttempts = 3
    
    do {
        Write-Host "ATTEMPT $attempt of $maxAttempts" -ForegroundColor Cyan
        Write-Host "================================" -ForegroundColor Cyan
        
        # Step 1: Check ByeDPI
        if (-not (Check-ByeDPIStatus)) {
            Write-Host "ByeDPI not running - starting it..." -ForegroundColor Yellow
            if (-not (Start-ByeDPI)) {
                Write-Host "Failed to start ByeDPI - aborting" -ForegroundColor Red
                return
            }
        }
        
        # Step 2: Test Einthusan access
        $einthusanAccess = Test-EinthusanAccess
        
        # Step 3: Start bot and test
        Write-Host "Starting bot test..." -ForegroundColor Yellow
        Start-BotAndTest
        
        $attempt++
        
        if ($attempt -le $maxAttempts) {
            Write-Host "Retrying in 10 seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds 10
        }
        
    } while ($attempt -le $maxAttempts)
    
    Write-Host "All attempts completed" -ForegroundColor Yellow
    Write-Host "Try alternative sources (PirateBay, YTS, Movierulz)" -ForegroundColor Yellow
}

# Run the main function
Main