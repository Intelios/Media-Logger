# Design Document

## Overview

This design implements pagination for the Year View and Search View to improve performance when displaying large collections, and introduces a Home Dashboard as the default landing page. The solution focuses on lazy loading, efficient database queries, and a welcoming user experience.

## Architecture

### Current Architecture Analysis
- **Navigation**: NavigationRail with year-based destinations (2023, 2024, 2025), plus Backlog, Stats, and Search
- **Data Layer**: SQLite database with `javs` table containing media entries
- **UI Layer**: Flet-based Python GUI with `create_gallery_card` function for entry display
- **Current Issue**: `get_javs_by_year_db()` and `search_javs_db()` return all matching entries at once

### New Architecture Components

#### 1. Pagination System
- **PaginationManager**: Handles page state, loading, and caching
- **Database Layer**: New paginated query functions with LIMIT/OFFSET
- **UI Layer**: Infinite scroll with loading indicators

#### 2. Home Dashboard
- **DashboardStatsCalculator**: Computes collection statistics
- **Home View**: New navigation destination with overview and quick access

#### 3. Performance Optimizations
- **Page Caching**: Store loaded pages in memory
- **Lazy Loading**: Load content only when needed
- **Progressive Rendering**: Show content as it loads

## Components and Interfaces

### 1. Database Layer Extensions

#### New Functions
```python
def get_javs_by_year_paginated_db(year: int, page: int = 0, page_size: int = 50) -> tuple[list[dict], bool]
def search_javs_paginated_db(search_term: str, search_fields: list, entry_types: list = None, page: int = 0, page_size: int = 50) -> tuple[list[dict], bool]
def get_collection_stats_db() -> dict
def get_recent_entries_db(limit: int = 6) -> list[dict]
```

#### Return Format
- **Paginated functions**: Return `(entries_list, has_more_pages)`
- **Stats function**: Return dictionary with aggregated statistics
- **Recent entries**: Return list of most recently completed entries

### 2. Pagination Manager

```python
class PaginationManager:
    def __init__(self, page_size: int = 50):
        self.page_size = page_size
        self.current_page = 0
        self.cache = {}  # Page cache
        self.has_more = True
        self.loading = False
    
    def load_next_page(self, loader_func, *args) -> list[dict]
    def reset(self)
    def get_cached_entries(self) -> list[dict]
```

### 3. Home Dashboard Components

#### Statistics Cards
- **Total Entries**: Count of all media entries
- **Average Rating**: Mean score across rated entries
- **Most Common Type**: Entry type with highest count
- **Most Productive Year**: Year with most completions
- **Featured Entry**: Random entry with high rating or recent completion

#### Quick Access Section
- **Recent Entries Grid**: 6 most recently completed entries
- **Navigation Shortcuts**: Quick buttons to Years and Search
- **Add Entry Button**: Prominent call-to-action

### 4. UI Components

#### Infinite Scroll Container
```python
class InfiniteScrollContainer:
    def __init__(self, loader_func, page_size: int = 50):
        self.pagination_manager = PaginationManager(page_size)
        self.loader_func = loader_func
        self.grid_view = ft.GridView()
        self.loading_indicator = ft.ProgressRing()
    
    def on_scroll(self, e)  # Detect scroll to bottom
    def load_more_content()  # Load next page
    def reset_content()  # Clear and reload from start
```

#### Loading States
- **Initial Load**: Full-screen progress indicator
- **Loading More**: Bottom progress bar
- **No More Content**: "End of results" message
- **Error State**: Retry button with error message

## Data Models

### Collection Statistics
```python
{
    "total_entries": int,
    "average_rating": float,
    "most_common_type": str,
    "most_productive_year": int,
    "total_rated_entries": int,
    "completion_streak": int,  # Days since last completion
    "featured_entry": dict  # Random high-rated or recent entry
}
```

### Pagination State
```python
{
    "current_page": int,
    "page_size": int,
    "total_loaded": int,
    "has_more": bool,
    "loading": bool,
    "cache": dict[int, list[dict]]  # page_number -> entries
}
```

## Error Handling

### Database Errors
- **Connection Issues**: Graceful fallback with retry mechanism
- **Query Errors**: Log error, show user-friendly message
- **Empty Results**: Show appropriate empty state messages

### UI Errors
- **Scroll Detection**: Fallback to manual "Load More" button
- **Image Loading**: Existing error handling in `create_gallery_card`
- **Navigation**: Preserve user's place when switching views

### Performance Safeguards
- **Memory Management**: Clear old cached pages when memory usage is high
- **Query Timeouts**: Set reasonable limits for database queries
- **UI Responsiveness**: Use threading for database operations

## Testing Strategy

### Unit Tests
- **Database Functions**: Test pagination queries with various parameters
- **PaginationManager**: Test page loading, caching, and state management
- **Statistics Calculator**: Test calculation accuracy with sample data

### Integration Tests
- **End-to-End Pagination**: Test full user flow from navigation to content loading
- **Home Dashboard**: Test statistics display and navigation
- **Performance**: Test with large datasets (1000+ entries)

### User Experience Tests
- **Scroll Performance**: Ensure smooth scrolling with large datasets
- **Loading States**: Verify appropriate feedback during operations
- **Navigation**: Test switching between views maintains expected state

### Edge Cases
- **Empty Collections**: Test behavior with no entries
- **Single Page**: Test when total entries < page_size
- **Network Issues**: Test offline behavior and error recovery
- **Large Images**: Test performance with high-resolution images

## Implementation Phases

### Phase 1: Database Layer
- Implement paginated query functions
- Add collection statistics function
- Test with existing data

### Phase 2: Pagination System
- Create PaginationManager class
- Implement infinite scroll container
- Add loading states and error handling

### Phase 3: Home Dashboard
- Design and implement dashboard layout
- Add statistics calculation and display
- Implement recent entries section

### Phase 4: Integration
- Update navigation to include Home as default
- Integrate pagination into Year and Search views
- Add performance monitoring and optimization

### Phase 5: Polish
- Add animations and transitions
- Optimize caching strategy
- Comprehensive testing and bug fixes