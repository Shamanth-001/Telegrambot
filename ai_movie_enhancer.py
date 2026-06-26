#!/usr/bin/env python3
"""
AI Movie Enhancer for Telegram Bot System
Integrates LangChain AI capabilities with existing bot architecture
"""

import os
import asyncio
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import json

# LangChain imports
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate

# Set up environment variables
os.environ["LANGSMITH_TRACING"] = "true"
os.environ["LANGSMITH_ENDPOINT"] = "https://api.smith.langchain.com"
os.environ["LANGSMITH_API_KEY"] = "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"
os.environ["LANGSMITH_PROJECT"] = "pr-crushing-authenticity-100"

@dataclass
class MovieSearchResult:
    title: str
    year: Optional[int] = None
    genre: Optional[str] = None
    rating: Optional[float] = None
    description: Optional[str] = None
    source: Optional[str] = None
    confidence: float = 0.0

class AIMovieEnhancer:
    def __init__(self, openai_api_key: str):
        """Initialize the AI Movie Enhancer"""
        os.environ["OPENAI_API_KEY"] = openai_api_key
        
        # Initialize the LLM
        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.7,
            max_tokens=1000
        )
        
        # Create the agent with movie-specific tools
        self.agent = create_agent(
            model=self.llm,
            tools=[
                self.enhance_search_query,
                self.get_movie_recommendations,
                self.analyze_user_intent,
                self.suggest_alternative_titles,
                self.get_trending_movies,
                self.analyze_movie_quality
            ],
            system_prompt="""You are an intelligent movie assistant for a Telegram bot system. 
            You help users find movies, get recommendations, and understand their movie preferences.
            
            Key capabilities:
            - Enhance search queries with natural language processing
            - Provide personalized movie recommendations
            - Analyze user intent and preferences
            - Suggest alternative movie titles
            - Identify trending movies
            - Analyze movie quality and metadata
            
            Always be helpful, friendly, and provide accurate movie information.
            When suggesting movies, consider user preferences and provide context."""
        )
        
        # Movie database for recommendations
        self.movie_database = self._load_movie_database()
        self.user_preferences = {}  # Store user preferences
        
    def _load_movie_database(self) -> Dict[str, Any]:
        """Load a comprehensive movie database for recommendations"""
        return {
            "genres": {
                "action": ["The Dark Knight", "Mad Max: Fury Road", "John Wick", "Mission: Impossible", "Fast & Furious", "Inception", "The Matrix"],
                "comedy": ["The Hangover", "Superbad", "Anchorman", "Step Brothers", "Dumb and Dumber", "Deadpool", "Guardians of the Galaxy"],
                "drama": ["The Shawshank Redemption", "Forrest Gump", "The Godfather", "Schindler's List", "Pulp Fiction", "Titanic", "The Green Mile"],
                "horror": ["The Exorcist", "Halloween", "A Nightmare on Elm Street", "The Conjuring", "Hereditary", "Get Out", "It"],
                "sci-fi": ["Blade Runner", "The Matrix", "Inception", "Interstellar", "Avatar", "Star Wars", "Dune"],
                "romance": ["Titanic", "The Notebook", "Casablanca", "When Harry Met Sally", "Pretty Woman", "La La Land", "The Shape of Water"],
                "thriller": ["Inception", "The Silence of the Lambs", "Se7en", "Gone Girl", "Zodiac", "Prisoners", "No Country for Old Men"],
                "adventure": ["Indiana Jones", "Pirates of the Caribbean", "The Lord of the Rings", "Avatar", "Jurassic Park", "Star Wars"]
            },
            "trending": [
                "Oppenheimer", "Barbie", "Spider-Man: Across the Spider-Verse", 
                "Guardians of the Galaxy Vol. 3", "Fast X", "John Wick: Chapter 4",
                "Avatar: The Way of Water", "Top Gun: Maverick", "Black Panther: Wakanda Forever"
            ],
            "classics": [
                "The Godfather", "Casablanca", "Citizen Kane", "Gone with the Wind", 
                "Lawrence of Arabia", "The Wizard of Oz", "Psycho", "The Graduate",
                "Pulp Fiction", "The Shawshank Redemption", "Forrest Gump"
            ],
            "bollywood": [
                "Dangal", "3 Idiots", "Lagaan", "Taare Zameen Par", "PK", "Bajrangi Bhaijaan",
                "Bahubali", "KGF", "Pushpa", "RRR", "Gangubai Kathiawadi"
            ],
            "south_indian": [
                "Baahubali", "KGF", "Pushpa", "RRR", "Vikram", "Master", "Beast", "Valimai"
            ]
        }

    @tool
    def enhance_search_query(self, query: str) -> str:
        """Enhance search query with AI-powered suggestions"""
        try:
            # Analyze the query for better search terms
            enhanced_queries = []
            
            # Original query
            enhanced_queries.append(query)
            
            # Add year if not specified
            if not any(char.isdigit() for char in query):
                enhanced_queries.append(f"{query} 2023")
                enhanced_queries.append(f"{query} 2024")
            
            # Add "movie" if not present
            if "movie" not in query.lower():
                enhanced_queries.append(f"{query} movie")
            
            # Add common variations
            if "film" not in query.lower():
                enhanced_queries.append(f"{query} film")
            
            return f"Enhanced search queries: {', '.join(enhanced_queries[:5])}"
            
        except Exception as e:
            return f"Error enhancing search query: {str(e)}"

    @tool
    def get_movie_recommendations(self, user_preferences: str) -> str:
        """Get AI-powered movie recommendations based on user preferences"""
        try:
            preferences = user_preferences.lower()
            recommendations = []
            
            # Analyze preferences and suggest movies
            if "action" in preferences:
                recommendations.extend(self.movie_database["genres"]["action"][:3])
            if "comedy" in preferences:
                recommendations.extend(self.movie_database["genres"]["comedy"][:3])
            if "drama" in preferences:
                recommendations.extend(self.movie_database["genres"]["drama"][:3])
            if "horror" in preferences:
                recommendations.extend(self.movie_database["genres"]["horror"][:3])
            if "sci-fi" in preferences or "science fiction" in preferences:
                recommendations.extend(self.movie_database["genres"]["sci-fi"][:3])
            if "romance" in preferences:
                recommendations.extend(self.movie_database["genres"]["romance"][:3])
            if "thriller" in preferences:
                recommendations.extend(self.movie_database["genres"]["thriller"][:3])
            if "bollywood" in preferences or "hindi" in preferences:
                recommendations.extend(self.movie_database["bollywood"][:3])
            if "south" in preferences or "tamil" in preferences or "telugu" in preferences:
                recommendations.extend(self.movie_database["south_indian"][:3])
            
            # If no specific genre mentioned, suggest trending movies
            if not recommendations:
                recommendations = self.movie_database["trending"][:5]
            
            return f"Based on your preferences, I recommend:\n" + "\n".join([f"• {movie}" for movie in recommendations[:5]])
            
        except Exception as e:
            return f"Error getting recommendations: {str(e)}"

    @tool
    def analyze_user_intent(self, query: str) -> str:
        """Analyze user intent to understand what they're looking for"""
        try:
            analysis = {
                "intent": "search",
                "movie_title": query,
                "confidence": 0.8,
                "suggestions": []
            }
            
            # Simple keyword analysis
            if "recommend" in query.lower() or "suggest" in query.lower():
                analysis["intent"] = "recommendation"
            elif "similar" in query.lower() or "like" in query.lower():
                analysis["intent"] = "similar_movies"
            elif "new" in query.lower() or "latest" in query.lower():
                analysis["intent"] = "new_releases"
            elif "trending" in query.lower() or "popular" in query.lower():
                analysis["intent"] = "trending"
            elif "good" in query.lower() or "best" in query.lower():
                analysis["intent"] = "quality_movies"
            
            return f"Query analysis: {json.dumps(analysis, indent=2)}"
            
        except Exception as e:
            return f"Error analyzing user intent: {str(e)}"

    @tool
    def suggest_alternative_titles(self, movie_title: str) -> str:
        """Suggest alternative titles for better search results"""
        try:
            alternatives = [movie_title]
            
            # Common title variations
            if "the" in movie_title.lower():
                alternatives.append(movie_title.replace("The ", "").replace("the ", ""))
            
            # Add year variations
            if not any(char.isdigit() for char in movie_title):
                alternatives.append(f"{movie_title} 2023")
                alternatives.append(f"{movie_title} 2024")
            
            # Add common suffixes
            if not movie_title.lower().endswith("movie"):
                alternatives.append(f"{movie_title} movie")
            
            return f"Alternative search titles: {', '.join(alternatives[:5])}"
            
        except Exception as e:
            return f"Error suggesting alternatives: {str(e)}"

    @tool
    def get_trending_movies(self) -> str:
        """Get currently trending movies"""
        try:
            trending = self.movie_database["trending"]
            return f"Currently trending movies:\n" + "\n".join([f"• {movie}" for movie in trending])
            
        except Exception as e:
            return f"Error getting trending movies: {str(e)}"

    @tool
    def analyze_movie_quality(self, movie_title: str) -> str:
        """Analyze movie quality and provide metadata"""
        try:
            # This would integrate with your existing movie database
            # For now, return basic analysis
            return f"Movie analysis for '{movie_title}':\n\n" \
                   f"• Title: {movie_title}\n" \
                   f"• Quality: High (based on user ratings)\n" \
                   f"• Genre: Action/Thriller\n" \
                   f"• Rating: 8.5/10\n" \
                   f"• Year: 2023\n" \
                   f"• Director: Christopher Nolan\n" \
                   f"• Cast: Leonardo DiCaprio, Marion Cotillard\n" \
                   f"• Plot: A mind-bending thriller about dreams within dreams."
            
        except Exception as e:
            return f"Error analyzing movie quality: {str(e)}"

    async def process_user_message(self, message: str, user_id: str = None) -> str:
        """Process user message and return AI response"""
        try:
            # Create the conversation context
            messages = [
                SystemMessage(content="You are a helpful movie assistant. Help users find movies, get recommendations, and understand their preferences."),
                HumanMessage(content=message)
            ]
            
            # Get response from the agent
            response = await self.agent.ainvoke({"messages": messages})
            
            return response.get("messages", [{}])[-1].get("content", "Sorry, I couldn't process your request.")
            
        except Exception as e:
            return f"Error processing message: {str(e)}"

    def get_smart_search_suggestions(self, query: str) -> List[str]:
        """Generate smart search suggestions based on user query"""
        suggestions = []
        
        # Add the original query
        suggestions.append(query)
        
        # Add common variations
        if "movie" not in query.lower():
            suggestions.append(f"{query} movie")
        
        # Add year variations if not specified
        if not any(char.isdigit() for char in query):
            suggestions.append(f"{query} 2023")
            suggestions.append(f"{query} 2024")
        
        return suggestions[:5]  # Limit to 5 suggestions

    def update_user_preferences(self, user_id: str, preferences: Dict[str, Any]):
        """Update user preferences for better recommendations"""
        self.user_preferences[user_id] = preferences

    def get_user_preferences(self, user_id: str) -> Dict[str, Any]:
        """Get user preferences for personalized recommendations"""
        return self.user_preferences.get(user_id, {})

# Example usage and testing
async def main():
    """Test the AI Movie Enhancer"""
    # You'll need to provide your OpenAI API key
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
    
    for query in test_queries:
        print(f"\nUser: {query}")
        response = await enhancer.process_user_message(query)
        print(f"AI: {response}")
        print("-" * 50)

if __name__ == "__main__":
    asyncio.run(main())

