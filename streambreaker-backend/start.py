import asyncio
import threading
import uvicorn
from bot1_receptionist import application

def run_api():
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=int(__import__("os").environ.get("PORT", 8000)),
        log_level="info"
    )

async def run_bot():
    await application.initialize()
    await application.start()
    await application.updater.start_polling(drop_pending_updates=True)
    print("✅ Telegram Bot is running!")
    while True:
        await asyncio.sleep(3600)

def start_bot_in_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run_bot())

if __name__ == "__main__":
    print("🚀 Starting StreamBreaker (API + Bot)...")
    bot_thread = threading.Thread(target=start_bot_in_thread, daemon=True)
    bot_thread.start()
    run_api()
