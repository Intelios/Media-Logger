import flet as ft
import os
import uuid
import shutil
from typing import TYPE_CHECKING

# Import project modules
import database
import config
import utils
from ui_enhanced import (
    ResponsiveLayoutManager, 
    GlassmorphismStyles, 
    AnimationHelpers, 
    ColorThemeManager,
    MicroInteractions
)

# Use a forward reference for type hinting to avoid circular imports
if TYPE_CHECKING:
    from ui import AppUI, create_gallery_card

class ProfilesView:
    """
    Manages the UI and state for the Profiles section of the application.
    """
    def __init__(self, app_ui: 'AppUI'):
        self.app_ui = app_ui
        self.page = app_ui.page
        
        # State management
        self.view_mode = "list"  # "list" or "detail"
        self.current_profile = None
        self.profiles_summary = []
        self.profile_entries = []
        
        # Search/Filter/Sort state
        self.search_term = ""
        self.type_filters = set()  # Empty means all types, or contains specific types like {"actress", "artist"}
        self.sort_by = "entry_count"  # "entry_count", "average_score", "name"
        self.sort_ascending = False
        
        # UI references for dynamic updates
        self.profiles_grid_ref = ft.Ref[ft.ResponsiveRow]()
        self.search_field_ref = ft.Ref[ft.TextField]()
        self.profile_count_text_ref = ft.Ref[ft.Text]()

        # File picker for profile images
        self.profile_image_picker = ft.FilePicker(on_result=self._handle_profile_image_pick)
        if self.profile_image_picker not in self.page.overlay:
            self.page.overlay.append(self.profile_image_picker)

        # UI element references
        self.main_container = ft.Ref[ft.Container]()
        self.profile_detail_image = ft.Ref[ft.Image]()

    def build(self) -> ft.Container:
        """
        Builds the main container for the Profiles view.
        This is the entry point called by the main UI.
        """
        initial_content = self._build_list_view()
        return ft.Container(
            ref=self.main_container,
            content=initial_content,
            expand=True,
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
        )

    def _update_view(self):
        """Switches the content between the list view and the detail view with an animation."""
        if not self.main_container.current:
            return

        new_content = self._build_list_view() if self.view_mode == "list" else self._build_detail_view()
        
        # Use AnimatedSwitcher for a smooth transition
        self.main_container.current.content = ft.AnimatedSwitcher(
            content=new_content,
            transition=ft.AnimatedSwitcherTransition.FADE,
            duration=300,
        )
        self.main_container.current.update()

    # --- List View ---

    def _build_list_view(self) -> ft.Column:
        """Builds the UI that displays a grid of all automatically generated profiles."""
        self.profiles_summary = database.get_all_profiles_summary_db()

        if not self.profiles_summary:
            return self._build_empty_state()

        # Get unique profile types for filter chips
        available_types = sorted(set(p['type'] for p in self.profiles_summary))
        
        # Enhanced header with gradient icon (matching Collections style)
        header_icon = ft.Container(
            content=ft.Icon(ft.Icons.PEOPLE_ROUNDED, size=22, color=ft.Colors.WHITE),
            gradient=ft.LinearGradient(
                colors=[ColorThemeManager.BRAND_COLORS['primary'], ColorThemeManager.BRAND_COLORS['primary_dark']],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            width=40,
            height=40,
            border_radius=10,
            alignment=ft.alignment.center
        )
        
        # Profile count badge
        profile_count_badge = ft.Container(
            content=ft.Row([
                ft.Icon(ft.Icons.PERSON_OUTLINED, size=14, color=ft.Colors.PRIMARY),
                ft.Text(ref=self.profile_count_text_ref, value=f"{len(self.profiles_summary)}", size=13, weight=ft.FontWeight.W_600, color=ft.Colors.PRIMARY)
            ], spacing=4, tight=True),
            bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.PRIMARY),
            padding=ft.padding.symmetric(horizontal=10, vertical=5),
            border_radius=12,
            border=ft.border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.PRIMARY))
        )
        
        header_row = ft.Row([
            header_icon,
            ft.Column([
                ft.Text("Profiles", size=26, weight=ft.FontWeight.BOLD),
                ft.Text("Discover your most frequent artists, studios, and more.", size=13, color=ft.Colors.ON_SURFACE_VARIANT)
            ], spacing=2),
            ft.Container(width=12),
            profile_count_badge,
            ft.Container(expand=True),
        ], alignment=ft.MainAxisAlignment.START, vertical_alignment=ft.CrossAxisAlignment.CENTER, spacing=16)

        # Search and filter controls
        search_field = ft.TextField(
            ref=self.search_field_ref,
            label="Search profiles...",
            prefix_icon=ft.Icons.SEARCH_ROUNDED,
            on_change=self._on_search_change,
            border_radius=10,
            content_padding=ft.padding.symmetric(horizontal=16, vertical=12),
            expand=True,
            value=self.search_term
        )
        
        # Multi-select type filter chips
        type_filter_chips = []
        for profile_type in available_types:
            type_label = profile_type.replace('_', ' ').capitalize()
            is_selected = profile_type in self.type_filters
            type_color = ColorThemeManager.get_profile_type_color(profile_type, 'primary')
            
            # Get icon for type
            type_icon = {
                "actress": ft.Icons.WOMAN_2_OUTLINED,
                "director": ft.Icons.BUSINESS_OUTLINED,
                "artist": ft.Icons.HEADSET_OUTLINED,
                "author": ft.Icons.PERSON_OUTLINE,
                "platform": ft.Icons.VIDEOGAME_ASSET_OUTLINED
            }.get(profile_type, ft.Icons.PERSON)
            
            chip = ft.Container(
                content=ft.Row([
                    ft.Icon(type_icon, size=14, color=ft.Colors.WHITE if is_selected else type_color),
                    ft.Text(type_label, size=12, weight=ft.FontWeight.W_500, 
                           color=ft.Colors.WHITE if is_selected else type_color)
                ], spacing=4, tight=True),
                bgcolor=type_color if is_selected else ft.Colors.with_opacity(0.1, type_color),
                padding=ft.padding.symmetric(horizontal=10, vertical=6),
                border_radius=14,
                border=ft.border.all(1, ft.Colors.with_opacity(0.3 if is_selected else 0.2, type_color)),
                on_click=lambda e, t=profile_type: self._toggle_type_filter(t),
                ink=True,
                shadow=ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=4 if is_selected else 0,
                    color=ft.Colors.with_opacity(0.3, type_color) if is_selected else ft.Colors.TRANSPARENT,
                    offset=ft.Offset(0, 2)
                ) if is_selected else None
            )
            type_filter_chips.append(chip)
        
        # Clear all filters button (only shown when filters are active)
        clear_filters_btn = ft.Container(
            content=ft.Row([
                ft.Icon(ft.Icons.CLEAR_ROUNDED, size=14, color=ft.Colors.ERROR),
                ft.Text("Clear", size=12, weight=ft.FontWeight.W_500, color=ft.Colors.ERROR)
            ], spacing=4, tight=True),
            bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.ERROR),
            padding=ft.padding.symmetric(horizontal=10, vertical=6),
            border_radius=14,
            border=ft.border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.ERROR)),
            on_click=self._clear_type_filters,
            visible=len(self.type_filters) > 0,
            ink=True
        )
        
        type_filters_row = ft.Row(
            controls=type_filter_chips + [clear_filters_btn],
            spacing=8,
            scroll=ft.ScrollMode.AUTO
        )
        
        sort_dropdown = ft.Dropdown(
            label="Sort by",
            options=[
                ft.dropdown.Option("entry_count", "Entry Count"),
                ft.dropdown.Option("average_score", "Avg. Score"),
                ft.dropdown.Option("name", "Name")
            ],
            value=self.sort_by,
            width=140,
            on_change=self._on_sort_change,
            border_radius=10,
            content_padding=ft.padding.symmetric(horizontal=12, vertical=8)
        )
        
        sort_direction_btn = ft.IconButton(
            icon=ft.Icons.ARROW_UPWARD_ROUNDED if self.sort_ascending else ft.Icons.ARROW_DOWNWARD_ROUNDED,
            tooltip="Ascending" if self.sort_ascending else "Descending",
            on_click=self._toggle_sort_direction,
            icon_color=ft.Colors.PRIMARY
        )
        
        # Split into two rows for better layout
        search_sort_row = ft.Row([
            search_field,
            ft.Container(width=12),
            sort_dropdown,
            sort_direction_btn
        ], vertical_alignment=ft.CrossAxisAlignment.CENTER)
        
        filter_row = ft.Row([
            ft.Text("Filter:", size=13, weight=ft.FontWeight.W_500, color=ft.Colors.ON_SURFACE_VARIANT),
            ft.Container(width=8),
            type_filters_row
        ], vertical_alignment=ft.CrossAxisAlignment.CENTER)

        # Gradient divider
        divider = ft.Container(
            height=2,
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0, ft.Colors.PRIMARY),
                    ft.Colors.with_opacity(0.3, ft.Colors.PRIMARY),
                    ft.Colors.with_opacity(0, ft.Colors.PRIMARY)
                ],
                begin=ft.alignment.center_left,
                end=ft.alignment.center_right
            ),
            margin=ft.margin.symmetric(vertical=16)
        )

        # Filter and sort profiles
        filtered_profiles = self._get_filtered_sorted_profiles()
        
        # Build profile cards
        profile_cards = [self._build_profile_card(p) for p in filtered_profiles]
        
        # Grid layout for profile cards
        profiles_grid = ft.ResponsiveRow(
            ref=self.profiles_grid_ref,
            controls=[
                ft.Container(
                    content=card,
                    col={"sm": 12, "md": 6, "lg": 4, "xl": 4}
                ) for card in profile_cards
            ],
            spacing=20,
            run_spacing=20
        )
        
        # No results message
        no_results = ft.Container(
            content=ft.Column([
                ft.Icon(ft.Icons.SEARCH_OFF_ROUNDED, size=48, color=ft.Colors.ON_SURFACE_VARIANT),
                ft.Text("No profiles match your search", size=16, color=ft.Colors.ON_SURFACE_VARIANT)
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=12),
            alignment=ft.alignment.center,
            padding=50,
            visible=len(filtered_profiles) == 0
        )

        return ft.Container(
            content=ft.Column(
                controls=[header_row, ft.Container(height=16), search_sort_row, ft.Container(height=12), filter_row, divider, profiles_grid if filtered_profiles else no_results],
                scroll=ft.ScrollMode.ADAPTIVE,
                spacing=0,
            ),
            padding=ft.padding.all(24),
            expand=True
        )
    
    def _get_filtered_sorted_profiles(self) -> list:
        """Returns profiles filtered by search term and type, then sorted."""
        profiles = self.profiles_summary
        
        # Filter by search term
        if self.search_term:
            search_lower = self.search_term.lower()
            profiles = [p for p in profiles if search_lower in p['name'].lower()]
        
        # Filter by type (multi-select - empty means show all)
        if self.type_filters:
            profiles = [p for p in profiles if p['type'] in self.type_filters]
        
        # Sort profiles
        if self.sort_by == "entry_count":
            profiles = sorted(profiles, key=lambda x: x['entry_count'], reverse=not self.sort_ascending)
        elif self.sort_by == "average_score":
            profiles = sorted(profiles, key=lambda x: x['average_score'] or 0, reverse=not self.sort_ascending)
        elif self.sort_by == "name":
            profiles = sorted(profiles, key=lambda x: x['name'].lower(), reverse=self.sort_ascending)
        
        return profiles
    
    def _on_search_change(self, e):
        """Handles search field changes."""
        self.search_term = e.control.value
        self._refresh_list_view()
    
    def _toggle_type_filter(self, profile_type: str):
        """Toggles a profile type in/out of the filter set."""
        if profile_type in self.type_filters:
            self.type_filters.remove(profile_type)
        else:
            self.type_filters.add(profile_type)
        # Rebuild the entire view to update chip states
        self._update_view()
    
    def _clear_type_filters(self, e=None):
        """Clears all type filters."""
        self.type_filters.clear()
        self._update_view()
    
    def _on_sort_change(self, e):
        """Handles sort dropdown changes."""
        self.sort_by = e.control.value
        self._refresh_list_view()
    
    def _toggle_sort_direction(self, e):
        """Toggles sort direction between ascending and descending."""
        self.sort_ascending = not self.sort_ascending
        e.control.icon = ft.Icons.ARROW_UPWARD_ROUNDED if self.sort_ascending else ft.Icons.ARROW_DOWNWARD_ROUNDED
        e.control.tooltip = "Ascending" if self.sort_ascending else "Descending"
        e.control.update()
        self._refresh_list_view()
    
    def _refresh_list_view(self):
        """Refreshes the profiles grid with current filter/sort settings."""
        if not self.profiles_grid_ref.current:
            return
            
        filtered_profiles = self._get_filtered_sorted_profiles()
        profile_cards = [self._build_profile_card(p) for p in filtered_profiles]
        
        self.profiles_grid_ref.current.controls = [
            ft.Container(
                content=card,
                col={"sm": 12, "md": 6, "lg": 4, "xl": 4}
            ) for card in profile_cards
        ]
        
        # Update count badge
        if self.profile_count_text_ref.current:
            self.profile_count_text_ref.current.value = str(len(filtered_profiles))
            self.profile_count_text_ref.current.update()
        
        self.profiles_grid_ref.current.update()

    
    def _build_empty_state(self) -> ft.Column:
        """Builds the UI shown when no profiles meet the criteria to be displayed."""
        return ft.Container(
            content=ft.Column([
                # Gradient icon container
                ft.Container(
                    content=ft.Icon(ft.Icons.GROUP_ADD_OUTLINED, size=56, color=ft.Colors.WHITE),
                    gradient=ft.LinearGradient(
                        colors=[ColorThemeManager.BRAND_COLORS['primary'], ColorThemeManager.BRAND_COLORS['secondary']],
                        begin=ft.alignment.top_left,
                        end=ft.alignment.bottom_right
                    ),
                    width=100,
                    height=100,
                    border_radius=50,
                    alignment=ft.alignment.center,
                    shadow=ft.BoxShadow(
                        spread_radius=0,
                        blur_radius=20,
                        color=ft.Colors.with_opacity(0.3, ColorThemeManager.BRAND_COLORS['primary']),
                        offset=ft.Offset(0, 8)
                    )
                ),
                ft.Container(height=16),
                ft.Text("No Profiles Yet", size=24, weight=ft.FontWeight.BOLD),
                ft.Text(
                    "Profiles are automatically created for artists, studios, etc.,\nthat appear in 3 or more entries.",
                    text_align=ft.TextAlign.CENTER,
                    color=ft.Colors.ON_SURFACE_VARIANT
                ),
                ft.Container(height=8),
                ft.Text(
                    "Keep logging your media to unlock this feature!",
                    text_align=ft.TextAlign.CENTER,
                    weight=ft.FontWeight.W_500,
                    color=ft.Colors.PRIMARY
                )
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=8),
            alignment=ft.alignment.center,
            expand=True
        )

    def _build_profile_card(self, profile: dict) -> ft.Container:
        """Creates a single, modern card for a profile in the list view."""
        profile_type = profile['type']
        profile_type_label = profile_type.replace('_', ' ').capitalize()
        profile_name = profile['name']
        
        # Get profile-specific data (custom image)
        profile_db_data = database.get_profile_db(profile_type, profile_name)
        image_src = config.DEFAULT_IMAGE_URL
        if profile_db_data and profile_db_data.get('image_url'):
            full_path = os.path.join(config.ASSETS_DIR, profile_db_data['image_url'])
            if os.path.exists(full_path):
                image_src = profile_db_data['image_url']
        
        # Default icon if no image
        default_icon = {
            "actress": ft.Icons.WOMAN_2_OUTLINED,
            "director": ft.Icons.BUSINESS_OUTLINED,
            "artist": ft.Icons.HEADSET_OUTLINED,
            "author": ft.Icons.PERSON_OUTLINE,
            "platform": ft.Icons.VIDEOGAME_ASSET_OUTLINED
        }.get(profile_type, ft.Icons.PERSON)
        
        # Get profile type color for theming
        profile_color = ColorThemeManager.get_profile_type_color(profile_type, 'primary')
        profile_color_light = ColorThemeManager.get_profile_type_color(profile_type, 'light')
        profile_color_dark = ColorThemeManager.get_profile_type_color(profile_type, 'dark')

        # Get recent entries for thumbnail grid
        entries = database.get_entries_for_profile_db(profile_type, profile_name)[:4]
        
        # Create thumbnail mosaic from entries (2x2 grid like Collections)
        thumbnail_images = []
        for entry in entries:
            img_url = entry.get('image_url', '')
            thumbnail_images.append(
                ft.Container(
                    content=ft.Image(
                        src=img_url,
                        fit=ft.ImageFit.COVER,
                        error_content=ft.Container(
                            bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE),
                            content=ft.Icon(ft.Icons.IMAGE, size=14, color=ft.Colors.ON_SURFACE_VARIANT),
                            alignment=ft.alignment.center
                        )
                    ) if img_url else ft.Container(
                        bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE),
                        content=ft.Icon(ft.Icons.IMAGE, size=14, color=ft.Colors.ON_SURFACE_VARIANT),
                        alignment=ft.alignment.center
                    ),
                    width=46,
                    height=46,
                    border_radius=6,
                    clip_behavior=ft.ClipBehavior.ANTI_ALIAS
                )
            )
        
        # Fill remaining slots if less than 4 entries
        while len(thumbnail_images) < 4:
            thumbnail_images.append(
                ft.Container(
                    bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.ON_SURFACE),
                    width=46,
                    height=46,
                    border_radius=6,
                    border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE))
                )
            )
        
        # Thumbnail grid
        thumbnail_grid = ft.Column([
            ft.Row([thumbnail_images[0], thumbnail_images[1]], spacing=4),
            ft.Row([thumbnail_images[2], thumbnail_images[3]], spacing=4)
        ], spacing=4)
        
        # Profile avatar (circular, smaller when thumbnails are shown)
        image_content = ft.Image(src=image_src, fit=ft.ImageFit.COVER, width=60, height=60) if image_src != config.DEFAULT_IMAGE_URL else ft.Icon(default_icon, size=30, color=profile_color)
        
        avatar_container = ft.Container(
            content=image_content,
            width=60, height=60,
            bgcolor=ft.Colors.with_opacity(0.1, profile_color) if image_src == config.DEFAULT_IMAGE_URL else None,
            border_radius=30,
            alignment=ft.alignment.center,
            clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            border=ft.border.all(2, ft.Colors.with_opacity(0.3, profile_color))
        )

        # Profile type badge with color
        type_badge = ft.Container(
            content=ft.Row([
                ft.Icon(default_icon, size=12, color=profile_color),
                ft.Text(profile_type_label, size=11, weight=ft.FontWeight.W_500, color=profile_color)
            ], spacing=4, tight=True),
            bgcolor=ft.Colors.with_opacity(0.1, profile_color),
            padding=ft.padding.symmetric(horizontal=8, vertical=3),
            border_radius=10,
            border=ft.border.all(1, ft.Colors.with_opacity(0.2, profile_color))
        )

        # Stats row
        avg_score = profile['average_score']
        score_display = ft.Container()
        if avg_score is not None:
            color_scheme = ColorThemeManager.get_rating_color_scheme(avg_score)
            score_display = ft.Container(
                content=ft.Row([
                    ft.Icon(ft.Icons.STAR_ROUNDED, size=14, color=color_scheme['primary']),
                    ft.Text(f"{avg_score:.1f}", size=13, weight=ft.FontWeight.BOLD, color=color_scheme['primary'])
                ], spacing=3, tight=True),
                bgcolor=color_scheme['bg'],
                padding=ft.padding.symmetric(horizontal=8, vertical=3),
                border_radius=10
            )
        
        entry_count_badge = ft.Container(
            content=ft.Row([
                ft.Icon(ft.Icons.VIDEO_LIBRARY_OUTLINED, size=14, color=ft.Colors.PRIMARY),
                ft.Text(f"{profile['entry_count']}", size=13, weight=ft.FontWeight.W_600, color=ft.Colors.PRIMARY)
            ], spacing=4, tight=True),
            bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.PRIMARY),
            padding=ft.padding.symmetric(horizontal=8, vertical=3),
            border_radius=10
        )

        card_content = ft.Column([
            # Top row with thumbnail grid and profile info
            ft.Row([
                thumbnail_grid,
                ft.Container(width=12),
                ft.Column([
                    ft.Row([avatar_container, ft.Container(width=8), 
                        ft.Column([
                            ft.Text(profile_name, weight=ft.FontWeight.BOLD, size=16, max_lines=2, overflow=ft.TextOverflow.ELLIPSIS),
                            type_badge
                        ], spacing=4, expand=True)
                    ], vertical_alignment=ft.CrossAxisAlignment.START),
                    ft.Container(height=8),
                    ft.Row([entry_count_badge, score_display], spacing=8)
                ], spacing=0, expand=True, alignment=ft.MainAxisAlignment.START)
            ], vertical_alignment=ft.CrossAxisAlignment.START, expand=True),
        ], spacing=0)
        
        # Create a themed gradient for the card
        card_gradient = ft.LinearGradient(
            begin=ft.alignment.top_left,
            end=ft.alignment.bottom_right,
            colors=[
                ft.Colors.with_opacity(0.12, profile_color_light),
                ft.Colors.with_opacity(0.04, profile_color_dark)
            ]
        )

        # Card container with hover effects
        card_container = ft.Container(
            content=card_content,
            padding=ft.padding.all(16),
            border_radius=16,
            bgcolor=ft.Colors.SURFACE,
            border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE)),
            gradient=card_gradient,
            ink=True,
            on_click=lambda e, p=profile: self._handle_profile_click(p),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=8,
                color=ft.Colors.with_opacity(0.08, ft.Colors.BLACK),
                offset=ft.Offset(0, 2)
            ),
            animate=ft.Animation(duration=200, curve=ft.AnimationCurve.EASE_OUT),
            animate_scale=ft.Animation(duration=200, curve=ft.AnimationCurve.EASE_OUT)
        )
        
        # Hover animation
        def on_hover(e):
            if e.data == "true":
                card_container.shadow = ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=16,
                    color=ft.Colors.with_opacity(0.2, profile_color),
                    offset=ft.Offset(0, 6)
                )
                card_container.scale = 1.02
                card_container.border = ft.border.all(1, ft.Colors.with_opacity(0.3, profile_color))
            else:
                card_container.shadow = ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=8,
                    color=ft.Colors.with_opacity(0.08, ft.Colors.BLACK),
                    offset=ft.Offset(0, 2)
                )
                card_container.scale = 1.0
                card_container.border = ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE))
            card_container.update()
        
        card_container.on_hover = on_hover
        
        return card_container
    
    def _handle_profile_click(self, profile_data: dict):
        """Sets the state to detail view and fetches the necessary data."""
        self.current_profile = profile_data
        self.profile_entries = database.get_entries_for_profile_db(profile_data['type'], profile_data['name'])
        self.view_mode = "detail"
        self._update_view()

    # --- Detail View ---

    def _build_detail_view(self) -> ft.Column:
        """Builds the detailed view for a single profile."""
        if not self.current_profile:
            return ft.Column([ft.Text("Error: No profile selected.")])

        profile_type = self.current_profile['type']
        profile_type_label = profile_type.replace('_', ' ').capitalize()
        
        # Get profile type colors
        profile_color = ColorThemeManager.get_profile_type_color(profile_type, 'primary')
        profile_color_light = ColorThemeManager.get_profile_type_color(profile_type, 'light')
        profile_color_dark = ColorThemeManager.get_profile_type_color(profile_type, 'dark')
        
        # Default icon for profile type
        default_icon = {
            "actress": ft.Icons.WOMAN_2_OUTLINED,
            "director": ft.Icons.BUSINESS_OUTLINED,
            "artist": ft.Icons.HEADSET_OUTLINED,
            "author": ft.Icons.PERSON_OUTLINE,
            "platform": ft.Icons.VIDEOGAME_ASSET_OUTLINED
        }.get(profile_type, ft.Icons.PERSON)

        # Get profile image
        profile_db_data = database.get_profile_db(self.current_profile['type'], self.current_profile['name'])
        image_src = config.DEFAULT_IMAGE_URL
        if profile_db_data and profile_db_data.get('image_url'):
            full_path = os.path.join(config.ASSETS_DIR, profile_db_data['image_url'])
            if os.path.exists(full_path):
                image_src = profile_db_data['image_url']

        # Enhanced back button (styled like Collections)
        back_button = ft.Container(
            content=ft.IconButton(
                icon=ft.Icons.ARROW_BACK_ROUNDED, 
                on_click=lambda _: self._handle_back_to_list(), 
                tooltip="Back to Profiles",
                icon_color=ft.Colors.ON_SURFACE
            ),
            bgcolor=ft.Colors.with_opacity(0.08, ft.Colors.ON_SURFACE),
            border_radius=12,
            width=44,
            height=44,
            alignment=ft.alignment.center
        )
        
        # Entry count badge
        entry_count_badge = ft.Container(
            content=ft.Row([
                ft.Icon(ft.Icons.VIDEO_LIBRARY_OUTLINED, size=14, color=ft.Colors.PRIMARY),
                ft.Text(f"{len(self.profile_entries)} entries", size=13, weight=ft.FontWeight.W_600, color=ft.Colors.PRIMARY)
            ], spacing=6, tight=True),
            bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.PRIMARY),
            padding=ft.padding.symmetric(horizontal=12, vertical=6),
            border_radius=14,
            border=ft.border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.PRIMARY))
        )

        # Header row with back button
        top_row = ft.Row([
            back_button,
            ft.Container(width=12),
            ft.Text(self.current_profile['name'], size=24, weight=ft.FontWeight.BOLD, max_lines=1, overflow=ft.TextOverflow.ELLIPSIS, expand=True),
            entry_count_badge
        ], alignment=ft.MainAxisAlignment.START, vertical_alignment=ft.CrossAxisAlignment.CENTER)

        # Profile image container with edit button
        image_content = ft.Image(ref=self.profile_detail_image, src=image_src, fit=ft.ImageFit.COVER, width=140, height=140) if image_src != config.DEFAULT_IMAGE_URL else ft.Icon(default_icon, size=70, color=profile_color)
        
        image_container = ft.Container(
            content=image_content,
            width=140, height=140,
            border_radius=70,
            alignment=ft.alignment.center,
            clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            bgcolor=ft.Colors.with_opacity(0.1, profile_color) if image_src == config.DEFAULT_IMAGE_URL else None,
            on_click=lambda e, src=image_src: self._show_enlarged_image(src),
            tooltip="View larger image" if image_src != config.DEFAULT_IMAGE_URL else "",
            border=ft.border.all(3, ft.Colors.with_opacity(0.3, profile_color)),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=16,
                color=ft.Colors.with_opacity(0.2, profile_color),
                offset=ft.Offset(0, 6)
            )
        )
        
        # Edit image button overlay
        edit_button = ft.Container(
            content=ft.IconButton(
                icon=ft.Icons.CAMERA_ALT_ROUNDED, icon_size=18,
                on_click=self._open_image_picker,
                bgcolor=ft.Colors.with_opacity(0.85, profile_color),
                icon_color=ft.Colors.WHITE
            ),
            bottom=0, right=0
        )

        # Profile type badge
        type_badge = ft.Container(
            content=ft.Row([
                ft.Icon(default_icon, size=16, color=ft.Colors.WHITE),
                ft.Text(profile_type_label, size=13, weight=ft.FontWeight.W_600, color=ft.Colors.WHITE)
            ], spacing=6, tight=True),
            gradient=ft.LinearGradient(
                colors=[profile_color, profile_color_dark],
                begin=ft.alignment.center_left,
                end=ft.alignment.center_right
            ),
            padding=ft.padding.symmetric(horizontal=14, vertical=7),
            border_radius=16,
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=8,
                color=ft.Colors.with_opacity(0.3, profile_color),
                offset=ft.Offset(0, 3)
            )
        )
        
        # Enhanced stats with gradient icon backgrounds
        avg_score = self.current_profile['average_score']
        score_color_scheme = ColorThemeManager.get_rating_color_scheme(avg_score)
        
        stats_row = ft.Row([
            self._create_enhanced_detail_stat(
                "Entries", 
                str(self.current_profile['entry_count']), 
                ft.Icons.VIDEO_LIBRARY_OUTLINED,
                ft.Colors.PRIMARY
            ),
            self._create_enhanced_detail_stat(
                "Avg. Score", 
                f"{avg_score:.1f}" if avg_score else "N/A", 
                ft.Icons.STAR_ROUNDED,
                score_color_scheme['primary']
            ),
        ], spacing=24)

        # Header card with gradient background
        header_card = ft.Container(
            content=ft.Row([
                ft.Stack([image_container, edit_button]),
                ft.Container(width=24),
                ft.Column([
                    ft.Text(self.current_profile['name'], size=28, weight=ft.FontWeight.BOLD, max_lines=2, overflow=ft.TextOverflow.ELLIPSIS),
                    ft.Container(height=4),
                    type_badge,
                    ft.Container(height=16),
                    stats_row
                ], spacing=0, expand=True, alignment=ft.MainAxisAlignment.CENTER)
            ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
            padding=ft.padding.all(28),
            border_radius=20,
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0.08, profile_color_light),
                    ft.Colors.with_opacity(0.03, profile_color_dark)
                ],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            border=ft.border.all(1, ft.Colors.with_opacity(0.15, profile_color)),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=12,
                color=ft.Colors.with_opacity(0.08, ft.Colors.BLACK),
                offset=ft.Offset(0, 4)
            )
        )

        # Gradient divider
        divider = ft.Container(
            height=2,
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0, profile_color),
                    ft.Colors.with_opacity(0.3, profile_color),
                    ft.Colors.with_opacity(0, profile_color)
                ],
                begin=ft.alignment.center_left,
                end=ft.alignment.center_right
            ),
            margin=ft.margin.symmetric(vertical=20)
        )

        # Gallery section header
        gallery_header = ft.Text(f"Associated Entries", size=20, weight=ft.FontWeight.BOLD)

        # Gallery of associated entries
        from ui import create_gallery_card
        
        def refresh_profile_view():
            """Callback to refresh data after an edit/delete action."""
            self._handle_profile_click(self.current_profile)

        gallery_cards = [
            create_gallery_card(
                self.page, 
                entry, 
                self.app_ui.delete_jav_action_with_callback,
                lambda item, cb=refresh_profile_view: self.app_ui.open_edit_jav_dialog(item, cb),
                self.app_ui.show_description_dialog,
                self.app_ui.show_image_dialog
            ) for entry in self.profile_entries
        ]
        
        gallery_grid = ResponsiveLayoutManager.create_responsive_grid(
            items=gallery_cards,
            grid_type='media_cards',
            spacing=10,
            run_spacing=10
        ) if gallery_cards else ft.Container(
            content=ft.Column([
                ft.Icon(ft.Icons.PHOTO_LIBRARY_OUTLINED, size=48, color=ft.Colors.ON_SURFACE_VARIANT),
                ft.Text("No entries found for this profile.", text_align=ft.TextAlign.CENTER, color=ft.Colors.ON_SURFACE_VARIANT)
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=12),
            padding=50, alignment=ft.alignment.center
        )

        return ft.Container(
            content=ft.Column(
                controls=[
                    top_row,
                    ft.Container(height=16),
                    header_card,
                    divider,
                    gallery_header,
                    ft.Container(height=8),
                    ft.Container(content=gallery_grid, expand=True)
                ],
                scroll=ft.ScrollMode.ADAPTIVE,
                spacing=0,
                expand=True
            ),
            padding=ft.padding.all(24),
            expand=True
        )
    
    def _create_enhanced_detail_stat(self, label, value, icon, color):
        """Helper to create an enhanced stat display with gradient icon background."""
        return ft.Row([
            ft.Container(
                content=ft.Icon(icon, color=ft.Colors.WHITE, size=20),
                width=40, height=40,
                border_radius=10,
                gradient=ft.LinearGradient(
                    colors=[color, ft.Colors.with_opacity(0.7, color)],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                ),
                alignment=ft.alignment.center
            ),
            ft.Column([
                ft.Text(str(value), size=22, weight=ft.FontWeight.BOLD),
                ft.Text(label, color=ft.Colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500, size=12)
            ], spacing=0)
        ], spacing=10)
    
    def _create_detail_stat(self, label, value, icon):
        """Helper to create a stat display for the profile detail header."""
        return ft.Row([
            ft.Icon(icon, color=ft.Colors.PRIMARY, size=24),
            ft.Column([
                ft.Text(str(value), style=ft.TextThemeStyle.HEADLINE_SMALL, weight=ft.FontWeight.BOLD),
                ft.Text(label, color=ft.Colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500, size=12, offset=ft.Offset(0, -0.2))
            ], spacing=0)
        ], spacing=12)

    def _handle_back_to_list(self, e=None):
        """Resets state to show the main profile list."""
        self.current_profile = None
        self.view_mode = "list"
        self._update_view()

    def _show_enlarged_image(self, image_src: str):
        """Displays the profile image in a larger view within a dialog."""
        if not image_src or image_src == config.DEFAULT_IMAGE_URL:
            # Don't show dialog for default/missing images
            return

        def close_dialog(e):
            dialog.open = False
            self.page.update()

        dialog = ft.AlertDialog(
            modal=True,
            content=ft.Container(
                content=ft.Image(
                    src=image_src,
                    fit=ft.ImageFit.CONTAIN,
                    border_radius=ft.border_radius.all(12)
                ),
                padding=0, # Image will fill the content area
                clip_behavior=ft.ClipBehavior.ANTI_ALIAS
            ),
            actions=[
                ft.TextButton("Close", on_click=close_dialog)
            ],
            actions_alignment=ft.MainAxisAlignment.END,
            content_padding=ft.padding.all(24),
            shape=ft.RoundedRectangleBorder(radius=16)
        )

        self.page.dialog = dialog
        dialog.open = True
        self.page.update()

    # --- Image Handling ---

    def _open_image_picker(self, e):
        """Opens the file picker to choose a new profile image."""
        self.profile_image_picker.pick_files(
            dialog_title="Select Profile Image",
            allow_multiple=False,
            allowed_extensions=["jpg", "jpeg", "png", "gif", "bmp", "webp"]
        )
    
    def _handle_profile_image_pick(self, e: ft.FilePickerResultEvent):
        if not e.files or not self.current_profile:
            return
        
        source_path = e.files[0].path
        try:
            # Copy image to assets/images directory
            if not os.path.exists(config.IMAGES_DIR):
                os.makedirs(config.IMAGES_DIR)
            
            _, extension = os.path.splitext(source_path)
            unique_filename = f"profile_{uuid.uuid4()}{extension}"
            destination_path = os.path.join(config.IMAGES_DIR, unique_filename)
            shutil.copy2(source_path, destination_path)
            
            # Relative path for DB
            db_path = os.path.join("images", unique_filename).replace("\\", "/")
            
            # Save to DB
            database.set_profile_image_db(self.current_profile['type'], self.current_profile['name'], db_path)
            
            # Update UI
            if self.profile_detail_image.current:
                self.profile_detail_image.current.src = db_path
                self.profile_detail_image.current.update()
            
            self.app_ui.show_snackbar("Profile image updated successfully.", color=ft.Colors.GREEN_700)

        except Exception as ex:
            print(f"Error updating profile image: {ex}")
            self.app_ui.show_snackbar(f"Error updating image: {ex}", color=ft.Colors.ERROR_CONTAINER)