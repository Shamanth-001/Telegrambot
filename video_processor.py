#!/usr/bin/env python3
"""
Video Processor for Movie Downloads
Handles video compression, format conversion, and optimization
"""
import os
import logging
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

class VideoProcessor:
    """Video processing utilities for movie downloads"""
    
    def __init__(self):
        self.max_file_size_gb = int(os.getenv('MAX_FILE_SIZE_GB', '2'))
        self.min_quality = os.getenv('MIN_QUALITY', '720p')
        self.prefer_quality = os.getenv('PREFER_QUALITY', '1080p')
        
    async def process_video(self, input_path: str, movie_name: str) -> str:
        """Process video file - compress if needed"""
        try:
            input_file = Path(input_path)
            if not input_file.exists():
                logger.error(f"Input file not found: {input_path}")
                return input_path
            
            # Check file size
            file_size_gb = input_file.stat().st_size / (1024 * 1024 * 1024)
            logger.info(f"Video file size: {file_size_gb:.2f} GB")
            
            if file_size_gb <= self.max_file_size_gb:
                logger.info("File size is acceptable, no compression needed")
                return input_path
            
            # Compress video
            logger.info(f"File too large ({file_size_gb:.2f} GB), compressing...")
            compressed_path = await self._compress_video(input_path, movie_name)
            
            if compressed_path and os.path.exists(compressed_path):
                # Remove original file
                os.remove(input_path)
                logger.info(f"Compression completed: {compressed_path}")
                return compressed_path
            else:
                logger.warning("Compression failed, returning original file")
                return input_path
                
        except Exception as e:
            logger.error(f"Error processing video: {e}")
            return input_path
    
    async def _compress_video(self, input_path: str, movie_name: str) -> Optional[str]:
        """Compress video using FFmpeg"""
        try:
            input_file = Path(input_path)
            output_path = input_file.parent / f"{movie_name}_compressed{input_file.suffix}"
            
            # FFmpeg compression command
            cmd = [
                'ffmpeg',
                '-i', str(input_file),
                '-c:v', 'libx264',
                '-crf', '23',  # Good quality compression
                '-preset', 'medium',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                '-y',  # Overwrite output file
                str(output_path)
            ]
            
            logger.info(f"Compressing video: {input_file.name}")
            
            # Run FFmpeg
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                # Check if compression was successful
                if output_path.exists():
                    original_size = input_file.stat().st_size
                    compressed_size = output_path.stat().st_size
                    compression_ratio = (1 - compressed_size / original_size) * 100
                    
                    logger.info(f"Compression successful: {compression_ratio:.1f}% size reduction")
                    return str(output_path)
                else:
                    logger.error("Compressed file not created")
                    return None
            else:
                logger.error(f"FFmpeg error: {stderr.decode()}")
                return None
                
        except Exception as e:
            logger.error(f"Error compressing video: {e}")
            return None
    
    async def _get_video_duration(self, video_path: str) -> Optional[float]:
        """Get video duration in seconds"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-show_entries', 'format=duration',
                '-of', 'csv=p=0',
                video_path
            ]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                duration = float(stdout.decode().strip())
                logger.info(f"Video duration: {duration:.2f} seconds")
                return duration
            else:
                logger.error(f"Could not get video duration: {stderr.decode()}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting video duration: {e}")
            return None
    
    def get_video_info(self, video_path: str) -> dict:
        """Get video file information"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                video_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                import json
                info = json.loads(result.stdout)
                
                # Extract relevant information
                format_info = info.get('format', {})
                video_stream = next((s for s in info.get('streams', []) if s.get('codec_type') == 'video'), {})
                audio_stream = next((s for s in info.get('streams', []) if s.get('codec_type') == 'audio'), {})
                
                return {
                    'duration': float(format_info.get('duration', 0)),
                    'size': int(format_info.get('size', 0)),
                    'bitrate': int(format_info.get('bit_rate', 0)),
                    'video_codec': video_stream.get('codec_name', 'unknown'),
                    'video_resolution': f"{video_stream.get('width', 0)}x{video_stream.get('height', 0)}",
                    'audio_codec': audio_stream.get('codec_name', 'unknown'),
                    'audio_bitrate': int(audio_stream.get('bit_rate', 0))
                }
            else:
                logger.error(f"FFprobe error: {result.stderr}")
                return {}
                
        except Exception as e:
            logger.error(f"Error getting video info: {e}")
            return {}
    
    def is_video_file(self, file_path: str) -> bool:
        """Check if file is a video file"""
        video_extensions = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'}
        return Path(file_path).suffix.lower() in video_extensions
    
    def get_optimal_quality(self, available_qualities: list) -> str:
        """Get optimal quality from available options"""
        quality_preference = ['1080p', '720p', '480p', '360p']
        
        for quality in quality_preference:
            if quality in available_qualities:
                return quality
        
        # Return highest available quality if preference not found
        return available_qualities[0] if available_qualities else '720p'