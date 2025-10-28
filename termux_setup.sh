#!/bin/bash
# Termux Setup Script for Comprehensive Movie Downloader
# Run this in Termux to install all dependencies

echo "🚀 Setting up Comprehensive Movie Downloader for Termux..."

# Update packages
echo "📦 Updating packages..."
pkg update -y
pkg upgrade -y

# Install Python and pip
echo "🐍 Installing Python..."
pkg install python -y
pkg install python-pip -y

# Install system dependencies
echo "🔧 Installing system dependencies..."
pkg install ffmpeg -y
pkg install git -y
pkg install wget -y
pkg install curl -y

# Install Python dependencies
echo "📚 Installing Python packages..."
pip install --upgrade pip
pip install playwright
pip install aiohttp
pip install yt-dlp
pip install beautifulsoup4
pip install cloudscraper
pip install python-telegram-bot
pip install fastapi
pip install uvicorn
pip install python-dotenv
pip install fuzzywuzzy
pip install asyncio

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
playwright install chromium
playwright install-deps

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p downloads/movies
mkdir -p downloads/torrents
mkdir -p logs

# Set permissions
echo "🔐 Setting permissions..."
chmod +x comprehensive_movie_downloader.py
chmod +x run_both_bots.py

echo "✅ Setup complete!"
echo ""
echo "🎬 To test the downloader:"
echo "python comprehensive_movie_downloader.py"
echo ""
echo "🤖 To run the full bot system:"
echo "python run_both_bots.py"
echo ""
echo "📱 Make sure to:"
echo "1. Enable VPN if needed"
echo "2. Set up your .env file with bot tokens"
echo "3. Test with a movie name"

