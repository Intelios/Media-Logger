"""
InfiniteScrollContainer component for handling infinite scroll functionality.

This module provides the InfiniteScrollContainer class which wraps a GridView
and provides infinite scroll functionality with automatic loading, loading indicators,
and error states. It integrates with the PaginationManager for state management.
"""

import flet as ft
from typing import Callable, List, Dict, Any, Optional
from pagination import PaginationManager


class InfiniteScrollContainer:
    """
    A reusable infinite scroll wrapper for GridView that handles:
    - Scroll detection and automatic loading
    - Loading indicators and error states
    - Integration with PaginationManager
    - Smooth user experience with proper feedback
    """
    
    def __init__(
        self, 
        loader_func: Callable,
        page_size: int = 50,
        grid_runs_count: int = 5,
        grid_max_extent: int = 270,
        grid_child_aspect_ratio: float = 0.55,
        grid_spacing: int = 10,
        grid_run_spacing: int = 10,
        grid_padding: int = 10
    ):
        """
        Initialize the InfiniteScrollContainer.
        
        Args:
            loader_func: Function that loads paginated data. Should return (entries, has_more)
            page_size: Number of items per page (default: 50)
            grid_runs_count: Number of columns in the grid (default: 5)
            grid_max_extent: Maximum width of each grid item (default: 270)
            grid_child_aspect_ratio: Aspect ratio of grid items (default: 0.55)
            grid_spacing: Spacing between grid items (default: 10)
            grid_run_spacing: Spacing between grid rows (default: 10)
            grid_padding: Padding around the grid (default: 10)
        """
        self.loader_func = loader_func
        self.pagination_manager = PaginationManager(page_size=page_size)
        
        # Grid configuration
        self.grid_runs_count = grid_runs_count
        self.grid_max_extent = grid_max_extent
        self.grid_child_aspect_ratio = grid_child_aspect_ratio
        self.grid_spacing = grid_spacing
        self.grid_run_spacing = grid_run_spacing
        self.grid_padding = grid_padding
        
        # UI components
        self.grid_view_ref = ft.Ref[ft.GridView]()
        self.loading_indicator_ref = ft.Ref[ft.Container]()
        self.error_container_ref = ft.Ref[ft.Container]()
        self.no_more_content_ref = ft.Ref[ft.Container]()
        self.main_column_ref = ft.Ref[ft.Column]()
        
        # State
        self.loader_args = ()
        self.loader_kwargs = {}
        self.card_creator_func: Optional[Callable] = None
        self.error_message = ""
        self.is_loading_initial = False
        
        # Create UI components
        self._create_ui_components()
    
    def _create_ui_components(self):
        """Create the UI components for the infinite scroll container."""
        
        # Main grid view with scroll detection
        self.grid_view = ft.GridView(
            ref=self.grid_view_ref,
            expand=True,
            runs_count=self.grid_runs_count,
            max_extent=self.grid_max_extent,
            child_aspect_ratio=self.grid_child_aspect_ratio,
            spacing=self.grid_spacing,
            run_spacing=self.grid_run_spacing,
            padding=self.grid_padding,
            on_scroll=self._on_scroll
        )
        
        # Loading indicator for initial load
        self.initial_loading_indicator = ft.Container(
            content=ft.Column(
                controls=[
                    ft.ProgressRing(width=40, height=40, stroke_width=4),
                    ft.Text(
                        "Loading content...",
                        size=16,
                        color=ft.colors.ON_SURFACE_VARIANT,
                        text_align=ft.TextAlign.CENTER
                    )
                ],
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                alignment=ft.MainAxisAlignment.CENTER,
                spacing=16
            ),
            alignment=ft.alignment.center,
            expand=True,
            visible=False
        )
        
        # Loading indicator for loading more content
        self.loading_more_indicator = ft.Container(
            ref=self.loading_indicator_ref,
            content=ft.Row(
                controls=[
                    ft.ProgressRing(width=20, height=20, stroke_width=3),
                    ft.Text(
                        "Loading more...",
                        size=14,
                        color=ft.colors.ON_SURFACE_VARIANT
                    )
                ],
                alignment=ft.MainAxisAlignment.CENTER,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
                spacing=12
            ),
            padding=ft.padding.all(20),
            visible=False
        )
        
        # Error state container
        self.error_container = ft.Container(
            ref=self.error_container_ref,
            content=ft.Column(
                controls=[
                    ft.Icon(
                        ft.icons.ERROR_OUTLINE,
                        size=48,
                        color=ft.colors.ERROR
                    ),
                    ft.Text(
                        "Failed to load content",
                        size=16,
                        color=ft.colors.ERROR,
                        weight=ft.FontWeight.W_500,
                        text_align=ft.TextAlign.CENTER
                    ),
                    ft.Text(
                        "",  # Error message will be set dynamically
                        size=12,
                        color=ft.colors.ON_SURFACE_VARIANT,
                        text_align=ft.TextAlign.CENTER
                    ),
                    ft.ElevatedButton(
                        "Retry",
                        icon=ft.icons.REFRESH,
                        on_click=self._on_retry_click,
                        style=ft.ButtonStyle(
                            padding=ft.padding.symmetric(horizontal=24, vertical=12)
                        )
                    )
                ],
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                alignment=ft.MainAxisAlignment.CENTER,
                spacing=12
            ),
            alignment=ft.alignment.center,
            padding=ft.padding.all(40),
            visible=False
        )
        
        # No more content indicator
        self.no_more_content = ft.Container(
            ref=self.no_more_content_ref,
            content=ft.Row(
                controls=[
                    ft.Icon(
                        ft.icons.CHECK_CIRCLE_OUTLINE,
                        size=20,
                        color=ft.colors.ON_SURFACE_VARIANT
                    ),
                    ft.Text(
                        "No more content to load",
                        size=14,
                        color=ft.colors.ON_SURFACE_VARIANT,
                        style=ft.TextStyle(
                            italic=True
                        )
                    )
                ],
                alignment=ft.MainAxisAlignment.CENTER,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
                spacing=8
            ),
            padding=ft.padding.all(20),
            visible=False
        )
        
        # Empty state container
        self.empty_state_container = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Icon(
                        ft.icons.INBOX_OUTLINED,
                        size=64,
                        color=ft.colors.ON_SURFACE_VARIANT
                    ),
                    ft.Text(
                        "No content found",
                        size=18,
                        color=ft.colors.ON_SURFACE_VARIANT,
                        weight=ft.FontWeight.W_500,
                        text_align=ft.TextAlign.CENTER
                    ),
                    ft.Text(
                        "Try adjusting your filters or search criteria",
                        size=14,
                        color=ft.colors.ON_SURFACE_VARIANT,
                        text_align=ft.TextAlign.CENTER
                    )
                ],
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                alignment=ft.MainAxisAlignment.CENTER,
                spacing=16
            ),
            alignment=ft.alignment.center,
            expand=True,
            visible=False
        )
        
        # Main container that holds everything
        self.main_column = ft.Column(
            ref=self.main_column_ref,
            controls=[
                self.initial_loading_indicator,
                self.error_container,
                self.empty_state_container,
                self.grid_view,
                self.loading_more_indicator,
                self.no_more_content
            ],
            expand=True,
            spacing=0
        )
    
    def _on_scroll(self, e: ft.OnScrollEvent):
        """
        Handle scroll events to detect when to load more content.
        
        Args:
            e: Scroll event containing scroll position information
        """
        # Check if we're near the bottom of the scroll area
        if e.pixels >= e.max_scroll_extent - 200:  # Load when 200px from bottom
            self._load_more_content()
    
    def _load_more_content(self):
        """Load more content if not already loading and more content is available."""
        if (self.pagination_manager.loading or 
            not self.pagination_manager.has_more or 
            not self.card_creator_func):
            return
        
        try:
            # Show loading indicator
            self._show_loading_more_indicator(True)
            
            # Load next page
            entries = self.pagination_manager.load_next_page(
                self.loader_func, 
                *self.loader_args, 
                **self.loader_kwargs
            )
            
            # Add new cards to grid
            if entries and self.grid_view_ref.current:
                grid_view = self.grid_view_ref.current
                for entry in entries:
                    card = self.card_creator_func(entry)
                    grid_view.controls.append(card)
                
                # Update grid view
                if grid_view.page:
                    grid_view.update()
            
            # Update no more content indicator
            self._update_no_more_content_indicator()
            
        except Exception as e:
            print(f"Error loading more content: {e}")
            self._show_error(f"Failed to load more content: {str(e)}")
        finally:
            # Hide loading indicator
            self._show_loading_more_indicator(False)
    
    def _show_loading_more_indicator(self, show: bool):
        """Show or hide the loading more indicator."""
        if self.loading_indicator_ref.current:
            self.loading_indicator_ref.current.visible = show
            if self.loading_indicator_ref.current.page:
                self.loading_indicator_ref.current.update()
    
    def _update_no_more_content_indicator(self):
        """Update the visibility of the no more content indicator."""
        if self.no_more_content_ref.current:
            # Show if we have content and no more pages
            show_indicator = (
                not self.pagination_manager.has_more and 
                self.pagination_manager.total_loaded > 0
            )
            self.no_more_content_ref.current.visible = show_indicator
            if self.no_more_content_ref.current.page:
                self.no_more_content_ref.current.update()
    
    def _show_error(self, error_message: str):
        """Show error state with the given message."""
        self.error_message = error_message
        
        if self.error_container_ref.current:
            # Update error message
            error_text = self.error_container_ref.current.content.controls[2]
            error_text.value = error_message
            
            # Show error container
            self.error_container_ref.current.visible = True
            
            # Hide other states
            self._show_initial_loading(False)
            self._show_empty_state(False)
            
            if self.error_container_ref.current.page:
                self.error_container_ref.current.update()
    
    def _show_initial_loading(self, show: bool):
        """Show or hide the initial loading indicator."""
        self.is_loading_initial = show
        self.initial_loading_indicator.visible = show
        
        if show:
            # Hide other states when showing initial loading
            self.error_container.visible = False
            self.empty_state_container.visible = False
            self.grid_view.visible = False
        else:
            self.grid_view.visible = True
        
        if self.initial_loading_indicator.page:
            self.initial_loading_indicator.update()
            self.grid_view.update()
            if self.error_container.page:
                self.error_container.update()
            if self.empty_state_container.page:
                self.empty_state_container.update()
    
    def _show_empty_state(self, show: bool):
        """Show or hide the empty state."""
        self.empty_state_container.visible = show
        
        if show:
            # Hide other states when showing empty state
            self.grid_view.visible = False
            self.error_container.visible = False
            self.initial_loading_indicator.visible = False
        else:
            self.grid_view.visible = True
        
        if self.empty_state_container.page:
            self.empty_state_container.update()
            self.grid_view.update()
            if self.error_container.page:
                self.error_container.update()
            if self.initial_loading_indicator.page:
                self.initial_loading_indicator.update()
    
    def _on_retry_click(self, e):
        """Handle retry button click."""
        self.reset_and_load()
    
    def load_initial_content(
        self, 
        card_creator_func: Callable,
        *args, 
        **kwargs
    ):
        """
        Load initial content for the infinite scroll container.
        
        Args:
            card_creator_func: Function that creates UI cards from data entries
            *args: Arguments to pass to the loader function
            **kwargs: Keyword arguments to pass to the loader function
        """
        self.card_creator_func = card_creator_func
        self.loader_args = args
        self.loader_kwargs = kwargs
        
        # Show initial loading
        self._show_initial_loading(True)
        
        try:
            # Load first page
            entries = self.pagination_manager.load_next_page(
                self.loader_func, 
                *args, 
                **kwargs
            )
            
            # Clear grid and add new content
            if self.grid_view_ref.current:
                grid_view = self.grid_view_ref.current
                grid_view.controls.clear()
                
                if entries:
                    # Add cards to grid
                    for entry in entries:
                        card = card_creator_func(entry)
                        grid_view.controls.append(card)
                    
                    # Show grid and hide loading
                    self._show_initial_loading(False)
                    self._update_no_more_content_indicator()
                    
                    if grid_view.page:
                        grid_view.update()
                else:
                    # No content found
                    self._show_initial_loading(False)
                    self._show_empty_state(True)
            
        except Exception as e:
            print(f"Error loading initial content: {e}")
            self._show_error(f"Failed to load content: {str(e)}")
    
    def reset_and_load(self):
        """Reset pagination state and reload content from the beginning."""
        # Reset pagination
        self.pagination_manager.reset()
        
        # Hide all indicators
        self._show_loading_more_indicator(False)
        self._update_no_more_content_indicator()
        
        # Hide error state
        if self.error_container_ref.current:
            self.error_container_ref.current.visible = False
            if self.error_container_ref.current.page:
                self.error_container_ref.current.update()
        
        # Reload initial content
        if self.card_creator_func:
            self.load_initial_content(
                self.card_creator_func,
                *self.loader_args,
                **self.loader_kwargs
            )
    
    def get_container(self) -> ft.Column:
        """
        Get the main container for the infinite scroll component.
        
        Returns:
            The main Column container that should be added to the UI
        """
        return self.main_column
    
    def get_pagination_info(self) -> Dict[str, Any]:
        """
        Get current pagination information for debugging.
        
        Returns:
            Dictionary containing pagination state information
        """
        return self.pagination_manager.get_page_info()
    
    def clear_cache(self):
        """Clear the pagination cache to free memory."""
        self.pagination_manager.clear_cache()
    
    def update_grid_configuration(
        self,
        runs_count: Optional[int] = None,
        max_extent: Optional[int] = None,
        child_aspect_ratio: Optional[float] = None,
        spacing: Optional[int] = None,
        run_spacing: Optional[int] = None,
        padding: Optional[int] = None
    ):
        """
        Update grid configuration parameters.
        
        Args:
            runs_count: Number of columns in the grid
            max_extent: Maximum width of each grid item
            child_aspect_ratio: Aspect ratio of grid items
            spacing: Spacing between grid items
            run_spacing: Spacing between grid rows
            padding: Padding around the grid
        """
        if self.grid_view_ref.current:
            grid_view = self.grid_view_ref.current
            
            if runs_count is not None:
                grid_view.runs_count = runs_count
                self.grid_runs_count = runs_count
            
            if max_extent is not None:
                grid_view.max_extent = max_extent
                self.grid_max_extent = max_extent
            
            if child_aspect_ratio is not None:
                grid_view.child_aspect_ratio = child_aspect_ratio
                self.grid_child_aspect_ratio = child_aspect_ratio
            
            if spacing is not None:
                grid_view.spacing = spacing
                self.grid_spacing = spacing
            
            if run_spacing is not None:
                grid_view.run_spacing = run_spacing
                self.grid_run_spacing = run_spacing
            
            if padding is not None:
                grid_view.padding = padding
                self.grid_padding = padding
            
            if grid_view.page:
                grid_view.update()