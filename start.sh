#!/bin/bash
# Local download worker only. The Telegram bot (@StreamBreakerBot) runs on the hub (Render) —
# starting it here too would make two copies fight over the same bot token.
echo "Starting StreamBreaker worker..."
exec python request_processor.py
