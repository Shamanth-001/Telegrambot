$ErrorActionPreference = 'SilentlyContinue'

# 1) Set bot token and clear webhook
$token = '8475299170:AAHcf-x7S8XPP6TkMXbW8HL9xYHGrPLQ48k'
try {
    Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/deleteWebhook" -UseBasicParsing | Out-Null
} catch {}

# 2) Stop any running node/npm processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process npm  -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# 3) Start the bot
Set-Location 'C:\telegram bot'
$env:BOT_TOKEN = $token
Write-Host ("Starting bot with token suffix " + $token.Substring($token.Length-4)) -ForegroundColor Cyan
npm start


