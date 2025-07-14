"""
PaginationManager class for handling paginated data loading and caching.

This module provides the PaginationManager class which manages page state,
caching logic, and provides methods for loading next pages and resetting pagination.
It's designed to work with the media logger application's database functions.
"""

import sys
from typing import Callable, List, Dict, Any, Tuple, Optional


class PaginationManager:
    """
    Manages pagination state, loading, and caching for large datasets.
    
    This class handles:
    - Page state management (current page, has more pages, loading state)
    - Caching of loaded pages to improve performance
    - Memory management for cached pages
    - Loading next page functionality
    - Resetting pagination state
    """
    
    def __init__(self, page_size: int = 50, max_cached_pages: int = 10):
        """
        Initialize the PaginationManager.
        
        Args:
            page_size: Number of items per page (default: 50)
            max_cached_pages: Maximum number of pages to keep in cache (default: 10)
        """
        self.page_size = page_size
        self.max_cached_pages = max_cached_pages
        self.current_page = 0
        self.cache: Dict[int, List[Dict[str, Any]]] = {}  # Page cache: page_number -> entries
        self.has_more = True
        self.loading = False
        self.total_loaded = 0
        
        # Memory management tracking
        self._cache_access_order: List[int] = []  # Track page access order for LRU eviction
        
    def load_next_page(self, loader_func: Callable, *args, **kwargs) -> List[Dict[str, Any]]:
        """
        Load the next page of data using the provided loader function.
        
        Args:
            loader_func: Function that loads paginated data. Should return (entries, has_more)
            *args: Arguments to pass to the loader function
            **kwargs: Keyword arguments to pass to the loader function
            
        Returns:
            List of entries for the loaded page
            
        Raises:
            RuntimeError: If already loading or no more pages available
        """
        if self.loading:
            raise RuntimeError("Already loading a page")
            
        if not self.has_more:
            return []
            
        # Check if page is already cached
        if self.current_page in self.cache:
            self._update_cache_access(self.current_page)
            entries = self.cache[self.current_page]
            self.current_page += 1
            return entries
            
        self.loading = True
        
        try:
            # Call the loader function with pagination parameters
            entries, has_more = loader_func(*args, page=self.current_page, page_size=self.page_size, **kwargs)
            
            # Update state
            self.has_more = has_more
            self.total_loaded += len(entries)
            
            # Cache the loaded page
            self._cache_page(self.current_page, entries)
            
            # Move to next page
            self.current_page += 1
            
            return entries
            
        except Exception as e:
            print(f"Error loading page {self.current_page}: {e}")
            raise
        finally:
            self.loading = False
    
    def reset(self):
        """
        Reset pagination state to initial values.
        Clears cache and resets all counters.
        """
        self.current_page = 0
        self.cache.clear()
        self._cache_access_order.clear()
        self.has_more = True
        self.loading = False
        self.total_loaded = 0
        
    def get_cached_entries(self) -> List[Dict[str, Any]]:
        """
        Get all cached entries in order.
        
        Returns:
            List of all cached entries from page 0 to current page
        """
        all_entries = []
        
        # Get entries from cache in page order
        for page_num in range(self.current_page):
            if page_num in self.cache:
                all_entries.extend(self.cache[page_num])
                
        return all_entries
    
    def get_page_info(self) -> Dict[str, Any]:
        """
        Get current pagination information.
        
        Returns:
            Dictionary containing pagination state information
        """
        return {
            "current_page": self.current_page,
            "page_size": self.page_size,
            "total_loaded": self.total_loaded,
            "has_more": self.has_more,
            "loading": self.loading,
            "cached_pages": len(self.cache),
            "cache_size_mb": self._estimate_cache_size_mb()
        }
    
    def _cache_page(self, page_num: int, entries: List[Dict[str, Any]]):
        """
        Cache a page of entries with memory management.
        
        Args:
            page_num: Page number to cache
            entries: List of entries to cache
        """
        # Add to cache
        self.cache[page_num] = entries.copy()  # Make a copy to avoid reference issues
        self._update_cache_access(page_num)
        
        # Manage cache size
        self._manage_cache_size()
    
    def _update_cache_access(self, page_num: int):
        """
        Update cache access order for LRU management.
        
        Args:
            page_num: Page number that was accessed
        """
        # Remove from current position if exists
        if page_num in self._cache_access_order:
            self._cache_access_order.remove(page_num)
            
        # Add to end (most recently used)
        self._cache_access_order.append(page_num)
    
    def _manage_cache_size(self):
        """
        Manage cache size by removing least recently used pages if needed.
        """
        while len(self.cache) > self.max_cached_pages:
            if not self._cache_access_order:
                break
                
            # Remove least recently used page
            lru_page = self._cache_access_order.pop(0)
            if lru_page in self.cache:
                del self.cache[lru_page]
                print(f"Evicted page {lru_page} from cache (LRU)")
    
    def _estimate_cache_size_mb(self) -> float:
        """
        Estimate the memory usage of the cache in MB.
        
        Returns:
            Estimated cache size in megabytes
        """
        try:
            total_size = 0
            for entries in self.cache.values():
                # Rough estimation: each entry dict + strings
                for entry in entries:
                    total_size += sys.getsizeof(entry)
                    for key, value in entry.items():
                        total_size += sys.getsizeof(key) + sys.getsizeof(value)
            
            return total_size / (1024 * 1024)  # Convert to MB
        except Exception:
            return 0.0
    
    def clear_cache(self):
        """
        Clear all cached pages while preserving pagination state.
        Useful for freeing memory without resetting pagination progress.
        """
        self.cache.clear()
        self._cache_access_order.clear()
        print("Pagination cache cleared")
    
    def preload_next_page(self, loader_func: Callable, *args, **kwargs) -> bool:
        """
        Preload the next page in the background without advancing current_page.
        
        Args:
            loader_func: Function that loads paginated data
            *args: Arguments to pass to the loader function
            **kwargs: Keyword arguments to pass to the loader function
            
        Returns:
            True if preload was successful, False otherwise
        """
        if self.loading or not self.has_more:
            return False
            
        next_page = self.current_page
        
        # Check if next page is already cached
        if next_page in self.cache:
            return True
            
        try:
            self.loading = True
            entries, has_more = loader_func(*args, page=next_page, page_size=self.page_size, **kwargs)
            
            # Cache the preloaded page
            self._cache_page(next_page, entries)
            
            return True
            
        except Exception as e:
            print(f"Error preloading page {next_page}: {e}")
            return False
        finally:
            self.loading = False
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get detailed cache statistics for debugging and monitoring.
        
        Returns:
            Dictionary with cache statistics
        """
        return {
            "cached_pages": list(self.cache.keys()),
            "cache_access_order": self._cache_access_order.copy(),
            "cache_size_mb": self._estimate_cache_size_mb(),
            "max_cached_pages": self.max_cached_pages,
            "entries_per_cached_page": {page: len(entries) for page, entries in self.cache.items()}
        }