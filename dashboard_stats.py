"""
Dashboard Statistics Calculator

This module provides the DashboardStatsCalculator class for computing
collection analytics for the Home Dashboard view.
"""

import database
from datetime import datetime, timedelta
import random


class DashboardStatsCalculator:
    """
    Handles calculation and formatting of collection statistics for the Home Dashboard.
    
    This class provides methods to calculate various statistics about the user's
    media collection including totals, averages, most common types, and featured entries.
    """
    
    def __init__(self):
        """Initialize the calculator."""
        self._cached_stats = None
        self._cache_timestamp = None
        self._cache_duration = timedelta(minutes=5)  # Cache for 5 minutes
    
    def get_collection_statistics(self, force_refresh=False):
        """
        Get comprehensive collection statistics.
        
        Args:
            force_refresh (bool): If True, bypass cache and recalculate stats
            
        Returns:
            dict: Dictionary containing all collection statistics
        """
        # Check if we have valid cached data
        if (not force_refresh and 
            self._cached_stats is not None and 
            self._cache_timestamp is not None and 
            datetime.now() - self._cache_timestamp < self._cache_duration):
            return self._cached_stats
        
        # Calculate fresh statistics
        stats = database.get_collection_stats_db()
        
        # Enhance stats with additional calculations
        enhanced_stats = self._enhance_statistics(stats)
        
        # Cache the results
        self._cached_stats = enhanced_stats
        self._cache_timestamp = datetime.now()
        
        return enhanced_stats
    
    def _enhance_statistics(self, base_stats):
        """
        Enhance basic statistics with additional calculated fields.
        
        Args:
            base_stats (dict): Basic statistics from database
            
        Returns:
            dict: Enhanced statistics with additional fields
        """
        enhanced = base_stats.copy()
        
        # Format average rating for display
        if enhanced["average_rating"] > 0:
            enhanced["average_rating_display"] = f"{enhanced['average_rating']}/10"
        else:
            enhanced["average_rating_display"] = "No ratings yet"
        
        # Calculate completion rate (entries with completion dates vs total)
        total_entries = enhanced["total_entries"]
        if total_entries > 0:
            completed_entries = self._get_completed_entries_count()
            enhanced["completion_rate"] = round((completed_entries / total_entries) * 100, 1)
            enhanced["completion_rate_display"] = f"{enhanced['completion_rate']}%"
        else:
            enhanced["completion_rate"] = 0
            enhanced["completion_rate_display"] = "0%"
        
        # Add productivity insights
        enhanced["productivity_insight"] = self._get_productivity_insight(enhanced)
        
        # Format most productive year display
        if enhanced["most_productive_year"]:
            year_count = self._get_year_entry_count(enhanced["most_productive_year"])
            enhanced["most_productive_year_display"] = f"{enhanced['most_productive_year']} ({year_count} entries)"
        else:
            enhanced["most_productive_year_display"] = "No completed entries"
        
        # Add collection diversity metric
        enhanced["collection_diversity"] = self._calculate_collection_diversity()
        
        return enhanced
    
    def get_recent_entries(self, limit=6):
        """
        Get the most recently completed entries.
        
        Args:
            limit (int): Maximum number of entries to return
            
        Returns:
            list: List of recent entry dictionaries
        """
        return database.get_recent_entries_db(limit)
    
    def get_featured_entry(self):
        """
        Get a featured entry for the dashboard.
        
        Returns:
            dict or None: Featured entry data or None if no entries exist
        """
        stats = self.get_collection_statistics()
        return stats.get("featured_entry")
    
    def get_quick_stats_summary(self):
        """
        Get a condensed summary of key statistics for quick display.
        
        Returns:
            dict: Summary statistics for dashboard cards
        """
        stats = self.get_collection_statistics()
        
        return {
            "total_entries": stats["total_entries"],
            "average_rating": stats["average_rating_display"],
            "most_common_type": stats["most_common_type"],
            "most_productive_year": stats["most_productive_year_display"],
            "completion_rate": stats["completion_rate_display"]
        }
    
    def _get_completed_entries_count(self):
        """
        Get count of entries with completion dates.
        
        Returns:
            int: Number of completed entries
        """
        try:
            import sqlite3
            import config
            
            conn = sqlite3.connect(config.DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM javs WHERE completion_date IS NOT NULL")
            result = cursor.fetchone()
            conn.close()
            
            return result[0] if result else 0
        except Exception as e:
            print(f"Error getting completed entries count: {e}")
            return 0
    
    def _get_year_entry_count(self, year):
        """
        Get the number of entries for a specific year.
        
        Args:
            year (int): Year to count entries for
            
        Returns:
            int: Number of entries for the year
        """
        try:
            import sqlite3
            import config
            
            conn = sqlite3.connect(config.DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM javs WHERE year_completed = ?", (year,))
            result = cursor.fetchone()
            conn.close()
            
            return result[0] if result else 0
        except Exception as e:
            print(f"Error getting year entry count: {e}")
            return 0
    
    def _calculate_collection_diversity(self):
        """
        Calculate a diversity score based on entry type distribution.
        
        Returns:
            dict: Diversity metrics
        """
        try:
            import sqlite3
            import config
            
            conn = sqlite3.connect(config.DB_FILE)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get entry type distribution
            cursor.execute("""
                SELECT entry_type, COUNT(*) as count 
                FROM javs 
                WHERE entry_type IS NOT NULL 
                GROUP BY entry_type
            """)
            
            type_counts = [dict(row) for row in cursor.fetchall()]
            conn.close()
            
            if not type_counts:
                return {"score": 0, "unique_types": 0, "description": "No entries"}
            
            unique_types = len(type_counts)
            total_entries = sum(item["count"] for item in type_counts)
            
            # Calculate diversity score (0-100)
            # Higher score means more even distribution across types
            if unique_types <= 1:
                diversity_score = 0
            else:
                # Use Shannon diversity index concept
                import math
                proportions = [item["count"] / total_entries for item in type_counts]
                shannon_index = -sum(p * math.log(p) if p > 0 else 0 for p in proportions)
                max_shannon = math.log(unique_types)  # Maximum possible Shannon index
                diversity_score = round((shannon_index / max_shannon) * 100, 1) if max_shannon > 0 else 0
            
            # Create description
            if diversity_score >= 80:
                description = "Highly diverse collection"
            elif diversity_score >= 60:
                description = "Well-balanced collection"
            elif diversity_score >= 40:
                description = "Moderately diverse collection"
            elif diversity_score >= 20:
                description = "Somewhat focused collection"
            else:
                description = "Specialized collection"
            
            return {
                "score": diversity_score,
                "unique_types": unique_types,
                "description": description,
                "type_distribution": type_counts
            }
            
        except Exception as e:
            print(f"Error calculating collection diversity: {e}")
            return {"score": 0, "unique_types": 0, "description": "Error calculating"}
    
    def _get_productivity_insight(self, stats):
        """
        Generate a productivity insight message.
        
        Args:
            stats (dict): Collection statistics
            
        Returns:
            str: Productivity insight message
        """
        total_entries = stats["total_entries"]
        most_productive_year = stats["most_productive_year"]
        
        if total_entries == 0:
            return "Start building your collection!"
        elif total_entries < 10:
            return "Great start! Keep adding to your collection."
        elif total_entries < 50:
            return "Your collection is growing nicely!"
        elif total_entries < 100:
            return "Impressive collection! You're quite the enthusiast."
        elif total_entries < 250:
            return "Wow! You have a substantial collection."
        else:
            return "Amazing! You're a true collector with an extensive library."
    
    def get_year_comparison_stats(self):
        """
        Get statistics comparing different years.
        
        Returns:
            dict: Year comparison statistics
        """
        try:
            import sqlite3
            import config
            
            conn = sqlite3.connect(config.DB_FILE)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get entries per year
            cursor.execute("""
                SELECT year_completed, COUNT(*) as count, AVG(review_score) as avg_rating
                FROM javs 
                WHERE year_completed IS NOT NULL 
                GROUP BY year_completed 
                ORDER BY year_completed DESC
            """)
            
            year_stats = [dict(row) for row in cursor.fetchall()]
            conn.close()
            
            # Calculate trends
            if len(year_stats) >= 2:
                current_year = year_stats[0]
                previous_year = year_stats[1]
                
                count_trend = current_year["count"] - previous_year["count"]
                trend_direction = "up" if count_trend > 0 else "down" if count_trend < 0 else "stable"
                
                return {
                    "year_stats": year_stats,
                    "trend_direction": trend_direction,
                    "trend_amount": abs(count_trend),
                    "has_trend_data": True
                }
            else:
                return {
                    "year_stats": year_stats,
                    "has_trend_data": False
                }
                
        except Exception as e:
            print(f"Error getting year comparison stats: {e}")
            return {"year_stats": [], "has_trend_data": False}
    
    def clear_cache(self):
        """Clear the statistics cache to force fresh calculation."""
        self._cached_stats = None
        self._cache_timestamp = None