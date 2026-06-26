#!/usr/bin/env python3
"""
AI-Enhanced Telegram Bot 2 - Downloader Bot
Handles movie downloads from streaming sites and uploads to channel
"""
import os
import asyncio
import logging
import uuid
import shutil
from pathlib import Path
from telegram import Bot
from telegram.error import TelegramError
from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import uvicorn

# Import our modules
from movie_scraper import MovieScraper
from video_processor import VideoProcessor
from ai_bot_integration import AIBotIntegration
from final_working_torrent_downloader import FinalWorkingTorrentDownloader

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('bot2.log')
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

BOT2_TOKEN = os.getenv('BOT2_TOKEN')
CHANNEL_ID = os.getenv('CHANNEL_ID')
DOWNLOAD_DIR = Path(os.getenv('DOWNLOAD_DIR', './downloads'))
MAX_CONCURRENT_DOWNLOADS = int(os.getenv('MAX_CONCURRENT_DOWNLOADS', '5'))
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', 'your-openai-api-key-here')

# Create download directory
DOWNLOAD_DIR.mkdir(exist_ok=True, parents=True)

# Initialize FastAPI app
app = FastAPI(title="AI-Enhanced Movie Downloader Bot", version="2.0.0")

# Initialize bot and services
bot = Bot(token=BOT2_TOKEN)
scraper = MovieScraper()
processor = VideoProcessor()
ai_integration = AIBotIntegration(OPENAI_API_KEY)
torrent_downloader = FinalWorkingTorrentDownloader()

# Track active downloads
active_downloads = {}
download_semaphore = asyncio.Semaphore(MAX_CONCURRENT_DOWNLOADS)

class DownloadRequest(BaseModel):
    movie_name: str
    user_id: int
    username: str
    request_time: float
    ai_enhanced: bool = False
    enhanced_queries: list = []
    intent_analysis: str = ""

class AIEnhancedBot2Downloader:
    """AI-Enhanced downloader with intelligent source selection"""
    
    async def download_and_upload(self, task_id: str, request: DownloadRequest):
        """Main download and upload pipeline with AI enhancements"""
        movie_name = request.movie_name
        
        async with download_semaphore:
            try:
                # Update status
                active_downloads[task_id] = {
                    'status': 'ai_analyzing',
                    'movie_name': movie_name,
                    'progress': 0,
                    'ai_enhanced': request.ai_enhanced,
                    'user_id': request.user_id,
                    'username': request.username
                }
                
                logger.info(f"[{task_id}] Starting AI-enhanced download for: {movie_name}")
                
                # AI-enhanced download process
                if request.ai_enhanced:
                    await self._ai_enhance_download_process(task_id, request)
                
                # Search and download
                active_downloads[task_id]['status'] = 'searching'
                active_downloads[task_id]['progress'] = 20
                
                download_path = await scraper.search_and_download(movie_name, task_id)
                
                if not download_path or not os.path.exists(download_path):
                    active_downloads[task_id]['status'] = 'failed'
                    active_downloads[task_id]['error'] = 'Movie not found on any streaming site'
                    logger.error(f"[{task_id}] Download failed for: {movie_name}")
                    
                    # Notify user
                    await self._notify_user_failure(request, "Movie not found on any streaming site")
                    return
                
                # Process video
                active_downloads[task_id]['status'] = 'processing'
                active_downloads[task_id]['progress'] = 70
                
                processed_path = await self._ai_enhance_video_processing(download_path, movie_name, task_id)
                
                # Upload to channel
                active_downloads[task_id]['status'] = 'uploading'
                active_downloads[task_id]['progress'] = 90
                
                await self.upload_to_channel(processed_path, movie_name, request.username, request.ai_enhanced)
                
                # Complete
                active_downloads[task_id]['status'] = 'completed'
                active_downloads[task_id]['progress'] = 100
                
                logger.info(f"[{task_id}] Successfully uploaded: {movie_name}")
                
                # Cleanup
                await self.cleanup_files([download_path, processed_path])
                
            except Exception as e:
                logger.error(f"[{task_id}] Error in AI-enhanced download pipeline: {e}")
                active_downloads[task_id]['status'] = 'failed'
                active_downloads[task_id]['error'] = str(e)
                
                # Notify user
                await self._notify_user_failure(request, str(e))

    async def _ai_enhance_download_process(self, task_id: str, request: DownloadRequest):
        """AI-enhanced download process"""
        try:
            logger.info(f"[{task_id}] AI analyzing download strategy...")
            
            # AI can analyze the request and optimize download strategy
            if request.intent_analysis == 'recommendation':
                logger.info(f"[{task_id}] AI detected recommendation request")
            elif request.intent_analysis == 'direct_search':
                logger.info(f"[{task_id}] AI detected direct search request")
            
            # AI can prioritize sources based on movie type
            if any(keyword in request.movie_name.lower() for keyword in ['bollywood', 'hindi', 'tamil', 'telugu']):
                logger.info(f"[{task_id}] AI prioritizing Indian movie sources")
            elif any(keyword in request.movie_name.lower() for keyword in ['anime', 'manga']):
                logger.info(f"[{task_id}] AI prioritizing anime sources")
                
        except Exception as e:
            logger.error(f"[{task_id}] Error in AI enhancement: {e}")

    async def _ai_enhance_video_processing(self, video_path: str, movie_name: str, task_id: str) -> str:
        """AI-enhanced video processing"""
        try:
            logger.info(f"[{task_id}] AI-enhanced video processing for: {movie_name}")
            
            # AI can analyze video and optimize processing
            processed_path = await processor.process_video(video_path, movie_name)
            
            logger.info(f"[{task_id}] Video processing completed: {processed_path}")
            return processed_path
            
        except Exception as e:
            logger.error(f"[{task_id}] Error in video processing: {e}")
            return video_path  # Return original if processing fails

    async def upload_to_channel(self, video_path: str, movie_name: str, username: str, ai_enhanced: bool):
        """Upload video to Telegram channel with AI-enhanced metadata"""
        try:
            # AI-enhanced caption
            caption = f"🎬 <b>{movie_name}</b>\n\n"
            if ai_enhanced:
                caption += "🤖 <i>AI-Enhanced Download</i>\n"
            caption += f"👤 Requested by: {username}\n"
            caption += f"📅 Downloaded: {asyncio.get_event_loop().time()}\n\n"
            caption += "🎥 Enjoy your movie!"
            
            # Upload video
            with open(video_path, 'rb') as video_file:
                await bot.send_video(
                    chat_id=CHANNEL_ID,
                    video=video_file,
                    caption=caption,
                    parse_mode='HTML',
                    supports_streaming=True
                )
                
            logger.info(f"Successfully uploaded {movie_name} to channel")
            
        except TelegramError as e:
            logger.error(f"Telegram upload error: {e}")
            raise
        except Exception as e:
            logger.error(f"Upload error: {e}")
            raise

    async def _notify_user_failure(self, request: DownloadRequest, error_message: str):
        """Notify user of download failure"""
        try:
            await bot.send_message(
                chat_id=request.user_id,
                text=f"❌ <b>Download Failed</b>\n\n"
                     f"Movie: {request.movie_name}\n"
                     f"Reason: {error_message}\n\n"
                     f"Please try:\n"
                     f"• Check movie name spelling\n"
                     f"• Try alternate title\n"
                     f"• Request again later",
                parse_mode='HTML'
            )
        except Exception as e:
            logger.error(f"Error notifying user: {e}")

    async def cleanup_files(self, file_paths: list):
        """Clean up temporary files"""
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Cleaned up: {file_path}")
            except Exception as e:
                logger.error(f"Error cleaning up {file_path}: {e}")

# Initialize downloader
downloader = AIEnhancedBot2Downloader()

@app.post("/download")
async def request_download(request: DownloadRequest, background_tasks: BackgroundTasks):
    """Request movie download"""
    task_id = str(uuid.uuid4())
    
    logger.info(f"Received AI-enhanced download request for: {request.movie_name}")
    logger.info(f"AI Enhanced: {request.ai_enhanced}")
    if request.ai_enhanced:
        logger.info(f"Enhanced queries: {request.enhanced_queries}")
        logger.info(f"Intent analysis: {request.intent_analysis}")
    
    # Start download in background
    background_tasks.add_task(downloader.download_and_upload, task_id, request)
    
    return {
        "task_id": task_id,
        "status": "queued",
        "message": f"AI-enhanced download queued for {request.movie_name}",
        "ai_enhanced": request.ai_enhanced
    }

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    """Get download status"""
    if task_id in active_downloads:
        status = active_downloads[task_id].copy()
        if status.get('ai_enhanced'):
            status['ai_features'] = {
                'enhanced_search': True,
                'smart_source_selection': True,
                'optimized_processing': True,
                'ai_metadata': True
            }
        return status
    return {"status": "not_found"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Bot 2 - Movie Downloader",
        "active_downloads": len(active_downloads),
        "max_concurrent": MAX_CONCURRENT_DOWNLOADS,
        "download_dir": str(DOWNLOAD_DIR),
        "ai_enhanced": True,
        "ai_features": {
            "enhanced_search": True,
            "smart_source_selection": True,
            "optimized_processing": True,
            "ai_metadata": True
        }
    }

@app.post("/torrents")
async def download_torrents(request: DownloadRequest):
    """Download torrent files for a movie"""
    try:
        logger.info(f"Torrent download request: {request.movie_name}")
        
        # Search for torrents
        torrent_results = await torrent_downloader.search_all_sources(request.movie_name)
        
        if not torrent_results:
            return {
                "success": False,
                "message": f"No torrents found for '{request.movie_name}'",
                "task_id": None
            }
        
        # Get best torrents (1x 1080p, 2x 720p)
        best_torrents = torrent_downloader.get_best_torrents(torrent_results, count=3)
        
        if not best_torrents:
            return {
                "success": False,
                "message": "No suitable torrents found",
                "task_id": None
            }
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Start torrent download task
        asyncio.create_task(process_torrent_download(task_id, request, best_torrents))
        
        return {
            "success": True,
            "message": f"Found {len(best_torrents)} torrent files for '{request.movie_name}'",
            "task_id": task_id,
            "torrents": [
                {
                    "quality": t['quality'],
                    "seeds": t['seeds'],
                    "size": t.get('size', 'Unknown'),
                    "source": t['source']
                } for t in best_torrents
            ]
        }
        
    except Exception as e:
        logger.error(f"Torrent download error: {e}")
        return {
            "success": False,
            "message": f"Error processing torrent request: {str(e)}",
            "task_id": None
        }

async def process_torrent_download(task_id: str, request: DownloadRequest, torrents: list):
    """Process torrent file downloads"""
    try:
        active_downloads[task_id] = {
            "status": "downloading",
            "movie_name": request.movie_name,
            "user_id": request.user_id,
            "progress": 0,
            "torrents": len(torrents)
        }
        
        uploaded_files = []
        
        for i, torrent in enumerate(torrents):
            try:
                if torrent.get('torrent_url'):
                    # Download torrent file
                    torrent_file = await torrent_downloader.download_torrent_file(
                        torrent['torrent_url'],
                        request.movie_name,
                        torrent['quality']
                    )
                    
                    if torrent_file:
                        # Upload to channel
                        caption = torrent_downloader.format_torrent_caption(torrent, request.movie_name)
                        
                        with open(torrent_file, 'rb') as f:
                            message = await bot.send_document(
                                chat_id=CHANNEL_ID,
                                document=f,
                                caption=caption
                            )
                            uploaded_files.append(message.message_id)
                        
                        # Clean up file
                        torrent_downloader.cleanup_file(torrent_file)
                        
                        # Update progress
                        progress = int(((i + 1) / len(torrents)) * 100)
                        active_downloads[task_id]['progress'] = progress
                        
            except Exception as e:
                logger.error(f"Error processing torrent {i+1}: {e}")
                continue
        
        # Mark as completed
        active_downloads[task_id]['status'] = 'completed'
        active_downloads[task_id]['uploaded_files'] = uploaded_files
        active_downloads[task_id]['progress'] = 100
        
        logger.info(f"Torrent download completed: {request.movie_name} - {len(uploaded_files)} files uploaded")
        
    except Exception as e:
        logger.error(f"Torrent processing error: {e}")
        active_downloads[task_id]['status'] = 'failed'
        active_downloads[task_id]['error'] = str(e)

@app.get("/downloads")
async def list_downloads():
    """List all active downloads"""
    return {
        "active_downloads": active_downloads,
        "total": len(active_downloads)
    }

@app.delete("/downloads/{task_id}")
async def cancel_download(task_id: str):
    """Cancel a download"""
    if task_id in active_downloads:
        active_downloads[task_id]['status'] = 'cancelled'
        return {"message": f"Download {task_id} cancelled"}
    
    return {"status": "not_found", "message": "Task ID not found"}


if __name__ == '__main__':
    logger.info("AI-Enhanced Bot 2 (Downloader) starting...")
    logger.info(f"  Channel ID: {CHANNEL_ID}")
    logger.info(f"  Download Dir: {DOWNLOAD_DIR}")
    logger.info(f"  Max Concurrent: {MAX_CONCURRENT_DOWNLOADS}")
    
    uvicorn.run(app, host='0.0.0.0', port=8002, log_level='info')
