#!/usr/bin/env python3
"""
Test script for AI-Enhanced Telegram Movie Bot System
Tests the LangChain AI integration with existing bot functionality
"""

import asyncio
import aiohttp
import logging
import json
from pathlib import Path
import sys

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from ai_movie_enhancer import AIMovieEnhancer
from ai_bot_integration import AIBotIntegration

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_ai_movie_enhancer():
    """Test the AI Movie Enhancer functionality"""
    print("\n" + "="*70)
    print("🤖 TESTING AI MOVIE ENHANCER")
    print("="*70 + "\n")
    
    # Initialize the enhancer
    enhancer = AIMovieEnhancer(openai_api_key="your-openai-api-key-here")
    
    # Test queries
    test_queries = [
        "I want to watch a good action movie",
        "Find me something like Inception",
        "What's trending right now?",
        "Recommend a comedy for tonight",
        "Search for The Dark Knight",
        "I'm in the mood for something scary",
        "Show me the best movies from 2023"
    ]
    
    print(f"🧪 Testing {len(test_queries)} queries...")
    print("-" * 50)
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n{i}. User: {query}")
        try:
            response = await enhancer.process_user_message(query)
            print(f"   AI: {response[:100]}...")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        print("-" * 30)
    
    print(f"\n✅ AI Movie Enhancer testing complete!")

async def test_ai_bot_integration():
    """Test the AI Bot Integration functionality"""
    print("\n" + "="*70)
    print("🔗 TESTING AI BOT INTEGRATION")
    print("="*70 + "\n")
    
    # Initialize the integration
    integration = AIBotIntegration(openai_api_key="your-openai-api-key-here")
    
    # Test enhanced search request
    print("1️⃣  Testing enhanced search request...")
    try:
        result = await integration.enhance_search_request("Inception", 123456789, "test_user")
        print(f"   ✅ Enhanced search result: {result['ai_enhanced']}")
        print(f"   📝 Enhanced queries: {result['enhanced_queries'][:3]}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test natural language processing
    print("\n2️⃣  Testing natural language processing...")
    try:
        response = await integration.process_natural_language_query("I want a good action movie", 123456789)
        print(f"   ✅ Natural language response: {response[:100]}...")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test recommendations
    print("\n3️⃣  Testing AI recommendations...")
    try:
        recommendations = await integration.get_ai_recommendations("action movies", 123456789)
        print(f"   ✅ Recommendations: {recommendations[:100]}...")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test download selection
    print("\n4️⃣  Testing download selection...")
    try:
        sources = ["fmovies", "cataz", "einthusan"]
        selection = await integration.enhance_download_selection("Inception", sources)
        print(f"   ✅ Best source: {selection['best_source']}")
        print(f"   📊 Analysis: {selection['analysis'][:100]}...")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print(f"\n✅ AI Bot Integration testing complete!")

async def test_bot2_health():
    """Test if AI-Enhanced Bot 2 is running"""
    print("\n" + "="*70)
    print("🏥 TESTING BOT 2 HEALTH")
    print("="*70 + "\n")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('http://localhost:8002/health') as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"✅ Bot 2 Health Check: {data['status']}")
                    print(f"📊 Active Downloads: {data['active_downloads']}")
                    print(f"🤖 AI Enhanced: {data.get('ai_enhanced', False)}")
                    if data.get('ai_features'):
                        print(f"🧠 AI Features: {data['ai_features']}")
                    return True
                else:
                    print(f"❌ Bot 2 not responding: {resp.status}")
                    return False
    except Exception as e:
        print(f"❌ Bot 2 connection failed: {e}")
        return False

async def test_ai_enhanced_download():
    """Test AI-enhanced download request"""
    print("\n" + "="*70)
    print("📥 TESTING AI-ENHANCED DOWNLOAD")
    print("="*70 + "\n")
    
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "movie_name": "Inception 2010",
                "user_id": 123456789,
                "username": "test_user",
                "request_time": 0,
                "ai_enhanced": True,
                "enhanced_queries": ["Inception 2010", "Inception movie", "Inception 2023"],
                "intent_analysis": "User wants to watch Inception movie"
            }
            
            async with session.post('http://localhost:8002/download', json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"✅ AI-Enhanced Download Queued: {data['task_id']}")
                    print(f"🤖 AI Enhanced: {data.get('ai_enhanced', False)}")
                    print(f"📝 Message: {data['message']}")
                    
                    # Check status
                    await asyncio.sleep(2)
                    async with session.get(f'http://localhost:8002/status/{data["task_id"]}') as status_resp:
                        if status_resp.status == 200:
                            status_data = await status_resp.json()
                            print(f"📊 Status: {status_data.get('status', 'unknown')}")
                            print(f"🤖 AI Enhanced: {status_data.get('ai_enhanced', False)}")
                            if status_data.get('ai_features'):
                                print(f"🧠 AI Features: {status_data['ai_features']}")
                    
                    return data.get('task_id')
                else:
                    print(f"❌ Download request failed: {resp.status}")
                    return None
    except Exception as e:
        print(f"❌ Download request error: {e}")
        return None

async def test_ai_stats():
    """Test AI statistics endpoint"""
    print("\n" + "="*70)
    print("📊 TESTING AI STATISTICS")
    print("="*70 + "\n")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('http://localhost:8002/ai_stats') as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"✅ AI Statistics:")
                    print(f"   📥 Total Downloads: {data['total_downloads']}")
                    print(f"   🤖 AI Enhanced Downloads: {data['ai_enhanced_downloads']}")
                    print(f"   📈 AI Enhancement Rate: {data['ai_enhancement_rate']}")
                    print(f"   🧠 AI Features: {data['ai_features']}")
                else:
                    print(f"❌ AI stats request failed: {resp.status}")
    except Exception as e:
        print(f"❌ AI stats error: {e}")

async def main():
    """Run all AI integration tests"""
    print("\n" + "="*70)
    print("🚀 AI-ENHANCED TELEGRAM MOVIE BOT - INTEGRATION TEST")
    print("="*70 + "\n")
    
    # Test 1: AI Movie Enhancer
    await test_ai_movie_enhancer()
    
    # Test 2: AI Bot Integration
    await test_ai_bot_integration()
    
    # Test 3: Bot 2 Health
    health_ok = await test_bot2_health()
    
    if health_ok:
        # Test 4: AI-Enhanced Download
        task_id = await test_ai_enhanced_download()
        
        # Test 5: AI Statistics
        await test_ai_stats()
    
    print("\n" + "="*70)
    print("🎉 AI INTEGRATION TEST COMPLETED")
    print("="*70 + "\n")
    
    print("📝 How to use the AI-Enhanced Bot:")
    print("1. Open Telegram and search for your bot")
    print("2. Send /start to begin")
    print("3. Try natural language queries:")
    print("   • 'I want a good action movie'")
    print("   • 'Find me something like Inception'")
    print("   • 'What's trending right now?'")
    print("   • 'Recommend a comedy for tonight'")
    print("4. Bot will use AI to enhance your experience")
    print("\n🤖 AI Features:")
    print("   • Natural language processing")
    print("   • Smart search enhancement")
    print("   • Personalized recommendations")
    print("   • Intelligent source selection")
    print("   • AI-powered metadata generation")
    print("\n📊 Check AI Stats:")
    print("   curl http://localhost:8002/ai_stats")
    print("   curl http://localhost:8002/health")

if __name__ == '__main__':
    asyncio.run(main())

