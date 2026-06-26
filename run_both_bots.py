#!/usr/bin/env python3
"""
Run both BOT1 (User Interface) and BOT2 (Downloader) simultaneously
"""
import asyncio
import logging
import os
import sys
import threading
from pathlib import Path
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('bots.log')
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables from .env if it exists (for local development)
# In production (Replit), environment variables are set via Secrets
ROOT_DIR = Path(__file__).parent
env_file = ROOT_DIR / '.env'
if env_file.exists():
    load_dotenv(env_file)

def run_bot1():
    """Run BOT1 - User Interface Bot"""
    try:
        logger.info("🤖 Starting BOT1 (User Interface Bot)...")
        from bot1_ai_enhanced import main as bot1_main
        bot1_main()
    except Exception as e:
        logger.error(f"BOT1 error: {e}", exc_info=True)
        sys.exit(1)

def run_bot2():
    """Run BOT2 - Downloader Bot (FastAPI server)"""
    try:
        logger.info("📥 Starting BOT2 (Downloader Bot)...")
        import uvicorn
        from bot2_ai_enhanced import app
        
        # Run FastAPI server
        uvicorn.run(app, host='0.0.0.0', port=8002, log_level='info')
    except Exception as e:
        logger.error(f"BOT2 error: {e}", exc_info=True)
        sys.exit(1)

def main():
    """Run both bots concurrently"""
    logger.info("=" * 70)
    logger.info("🚀 STARTING TWO-TIER TELEGRAM BOT SYSTEM")
    logger.info("=" * 70)
    logger.info("")
    logger.info("📋 Architecture:")
    logger.info("  • BOT1 (User Interface) - Receives requests & checks cache")
    logger.info("  • BOT2 (Downloader) - Downloads movies from streaming sites")
    logger.info("")
    logger.info("🔧 Configuration:")
    
    # Verify environment variables
    required_vars = ['BOT1_TOKEN', 'BOT2_TOKEN', 'CHANNEL_ID', 'ADMIN_USER_ID']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.error(f"❌ Missing environment variables: {', '.join(missing_vars)}")
        logger.error("Please set these in Replit Secrets")
        sys.exit(1)
    
    logger.info(f"  ✅ BOT1_TOKEN: ...{os.getenv('BOT1_TOKEN')[-10:]}")
    logger.info(f"  ✅ BOT2_TOKEN: ...{os.getenv('BOT2_TOKEN')[-10:]}")
    logger.info(f"  ✅ CHANNEL_ID: {os.getenv('CHANNEL_ID')}")
    logger.info(f"  ✅ ADMIN_USER_ID: {os.getenv('ADMIN_USER_ID')}")
    logger.info("")
    logger.info("=" * 70)
    logger.info("")
    
    # Run BOT2 in a separate thread (FastAPI server)
    bot2_thread = threading.Thread(target=run_bot2, daemon=True, name="BOT2-Thread")
    bot2_thread.start()
    
    # Give BOT2 time to start
    import time
    time.sleep(2)
    logger.info("✅ BOT2 API server started on port 8002")
    logger.info("")
    
    # Run BOT1 in main thread (Telegram polling bot)
    run_bot1()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\n\n👋 Shutting down bots gracefully...")
        logger.info("Goodbye!")
    except Exception as e:
        logger.error(f"💥 Fatal error: {e}", exc_info=True)
        sys.exit(1)
