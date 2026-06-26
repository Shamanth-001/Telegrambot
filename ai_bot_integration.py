#!/usr/bin/env python3
"""
AI Bot Integration with LangChain and OpenAI
Provides intelligent search enhancement and recommendations
"""
import os
import logging
from typing import List, Dict, Any
import asyncio

logger = logging.getLogger(__name__)

class AIBotIntegration:
    """AI-powered bot integration for enhanced search and recommendations"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv('OPENAI_API_KEY', 'your-openai-api-key-here')
        self.ai_enabled = self.api_key and self.api_key != 'your-openai-api-key-here'
        
        if self.ai_enabled:
            try:
                from langchain_openai import ChatOpenAI
                from langchain.prompts import ChatPromptTemplate
                self.llm = ChatOpenAI(
                    api_key=self.api_key,
                    model="gpt-3.5-turbo",
                    temperature=0.7
                )
                logger.info("AI integration initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize AI: {e}")
                self.ai_enabled = False
                # Fallback to basic mode
                logger.info("Continuing with basic AI features (no OpenAI)")
        else:
            logger.warning("AI integration disabled - no valid API key")
    
    async def enhance_search_request(self, movie_name: str, user_id: int, username: str) -> Dict[str, Any]:
        """Enhance search request with AI-powered query variations"""
        
        # Default enhancement (works without AI)
        enhanced_queries = [
            movie_name,
            movie_name.lower(),
            movie_name.title(),
            movie_name.replace(" ", ""),
            movie_name.replace(" ", "-"),
            movie_name.replace(" ", "."),
        ]
        
        result = {
            'original_query': movie_name,
            'enhanced_queries': enhanced_queries,
            'intent_analysis': 'direct_search',
            'ai_enabled': self.ai_enabled,
            'user_id': user_id,
            'username': username
        }
        
        # If AI enabled, add sophisticated enhancements
        if self.ai_enabled:
            try:
                ai_variations = await self._get_ai_query_variations(movie_name)
                enhanced_queries.extend(ai_variations)
                
                intent = await self._analyze_intent(movie_name)
                result['intent_analysis'] = intent
                
                logger.info(f"AI enhanced search for '{movie_name}' with {len(ai_variations)} variations")
                
            except Exception as e:
                logger.error(f"AI enhancement failed: {e}")
                result['ai_enabled'] = False
        
        return result
    
    async def _get_ai_query_variations(self, movie_name: str) -> List[str]:
        """Get AI-generated query variations"""
        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system", "You are a movie search assistant. Generate 5 alternative search queries for finding a movie. Include variations with year, alternative titles, and common misspellings."),
                ("human", f"Movie: {movie_name}")
            ])
            
            chain = prompt | self.llm
            response = await chain.ainvoke({"movie_name": movie_name})
            
            # Parse response and extract variations
            variations = []
            if hasattr(response, 'content'):
                content = response.content
                lines = content.split('\n')
                for line in lines:
                    line = line.strip()
                    if line and not line.startswith('#') and len(line) > 3:
                        # Clean up the line
                        line = line.replace('- ', '').replace('* ', '').replace('1. ', '').replace('2. ', '').replace('3. ', '').replace('4. ', '').replace('5. ', '')
                        if line:
                            variations.append(line)
            
            return variations[:5]  # Limit to 5 variations
            
        except Exception as e:
            logger.error(f"Error getting AI variations: {e}")
            return []
    
    async def _analyze_intent(self, query: str) -> str:
        """Analyze user intent from query"""
        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system", "Analyze the user's intent for this movie query. Respond with one word: 'direct_search', 'recommendation', 'trending', or 'similar'."),
                ("human", f"Query: {query}")
            ])
            
            chain = prompt | self.llm
            response = await chain.ainvoke({"query": query})
            
            if hasattr(response, 'content'):
                intent = response.content.strip().lower()
                if intent in ['direct_search', 'recommendation', 'trending', 'similar']:
                    return intent
            
            return 'direct_search'
            
        except Exception as e:
            logger.error(f"Error analyzing intent: {e}")
            return 'direct_search'
    
    async def get_movie_recommendations(self, user_preferences: str) -> List[str]:
        """Get AI-powered movie recommendations"""
        if not self.ai_enabled:
            return self._get_default_recommendations()
        
        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system", "You are a movie recommendation expert. Suggest 5 popular movies based on the user's preferences. Return only movie titles, one per line."),
                ("human", f"User preferences: {user_preferences}")
            ])
            
            chain = prompt | self.llm
            response = await chain.ainvoke({"user_preferences": user_preferences})
            
            if hasattr(response, 'content'):
                recommendations = []
                lines = response.content.split('\n')
                for line in lines:
                    line = line.strip()
                    if line and not line.startswith('#') and len(line) > 3:
                        line = line.replace('- ', '').replace('* ', '').replace('1. ', '').replace('2. ', '').replace('3. ', '').replace('4. ', '').replace('5. ', '')
                        if line:
                            recommendations.append(line)
                
                return recommendations[:5]
            
            return self._get_default_recommendations()
            
        except Exception as e:
            logger.error(f"Error getting recommendations: {e}")
            return self._get_default_recommendations()
    
    def _get_default_recommendations(self) -> List[str]:
        """Get default recommendations when AI is not available"""
        return [
            "Inception",
            "The Dark Knight",
            "Interstellar",
            "Avatar",
            "Avengers: Endgame"
        ]
    
    async def enhance_movie_metadata(self, movie_name: str) -> Dict[str, Any]:
        """Enhance movie metadata with AI"""
        if not self.ai_enabled:
            return {
                'title': movie_name,
                'year': None,
                'genre': 'Unknown',
                'rating': 'N/A',
                'description': 'No description available'
            }
        
        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system", "You are a movie database expert. Provide movie information in this format: Title|Year|Genre|Rating|Brief Description"),
                ("human", f"Movie: {movie_name}")
            ])
            
            chain = prompt | self.llm
            response = await chain.ainvoke({"movie_name": movie_name})
            
            if hasattr(response, 'content'):
                content = response.content.strip()
                parts = content.split('|')
                if len(parts) >= 5:
                    return {
                        'title': parts[0].strip(),
                        'year': parts[1].strip(),
                        'genre': parts[2].strip(),
                        'rating': parts[3].strip(),
                        'description': parts[4].strip()
                    }
            
            return {
                'title': movie_name,
                'year': None,
                'genre': 'Unknown',
                'rating': 'N/A',
                'description': 'No description available'
            }
            
        except Exception as e:
            logger.error(f"Error enhancing metadata: {e}")
            return {
                'title': movie_name,
                'year': None,
                'genre': 'Unknown',
                'rating': 'N/A',
                'description': 'No description available'
            }
