"""
Statistics View Module

This module contains the StatsView class which handles all statistics screen
functionality including charts, filters, and data visualization.
"""

import flet as ft
import config
import database
import utils


class StatsView:
    """
    Handles the statistics view screen including charts, filters, and settings.
    
    This class encapsulates all stats-related UI components, data calculations,
    and user interactions for the statistics dashboard.
    """
    
    def __init__(self, page: ft.Page, app_state: dict, 
                 on_theme_change_callback, 
                 open_import_dialog_callback, 
                 open_export_dialog_callback):
        """
        Initialize the StatsView.
        
        Args:
            page: The Flet page instance
            app_state: Reference to the application state dictionary
            on_theme_change_callback: Callback for theme changes
            open_import_dialog_callback: Callback for CSV import
            open_export_dialog_callback: Callback for CSV export
        """
        self.page = page
        self.app_state = app_state
        self.on_theme_change_callback = on_theme_change_callback
        self.open_import_dialog_callback = open_import_dialog_callback
        self.open_export_dialog_callback = open_export_dialog_callback
        
        # Initialize all refs for stats components
        self.stats_total_javs_text = ft.Ref[ft.Text]()
        self.stats_avg_score_text = ft.Ref[ft.Text]()
        self.stats_total_rewatches_text = ft.Ref[ft.Text]()
        self.stats_unique_genres_text = ft.Ref[ft.Text]()
        self.genre_pie_chart = ft.Ref[ft.PieChart]()
        self.genre_legend = ft.Ref[ft.Column]()
        self.stats_year_filter = ft.Ref[ft.SegmentedButton]()
        
        # Platform chart refs
        self.platform_chart_container = ft.Ref[ft.Container]()
        self.platform_pie_chart = ft.Ref[ft.PieChart]()
        self.platform_legend = ft.Ref[ft.Column]()
        
        # Author chart refs
        self.author_chart_container = ft.Ref[ft.Container]()
        self.author_pie_chart = ft.Ref[ft.PieChart]()
        self.author_legend = ft.Ref[ft.Column]()
        
        # Artist chart refs
        self.artist_chart_container = ft.Ref[ft.Container]()
        self.artist_pie_chart = ft.Ref[ft.PieChart]()
        self.artist_legend = ft.Ref[ft.Column]()
        
        # Director chart refs
        self.director_chart_container = ft.Ref[ft.Container]()
        self.director_pie_chart = ft.Ref[ft.PieChart]()
        self.director_legend = ft.Ref[ft.Column]()
        
        # Actress chart refs
        self.actress_chart_container = ft.Ref[ft.Container]()
        self.actress_pie_chart = ft.Ref[ft.PieChart]()
        self.actress_legend = ft.Ref[ft.Column]()
        
        # Version chart refs
        self.version_chart_container = ft.Ref[ft.Container]()
        self.version_pie_chart = ft.Ref[ft.PieChart]()
        self.version_legend = ft.Ref[ft.Column]()
        
        # UI control refs
        self.stats_loading_indicator = ft.Ref[ft.ProgressRing]()
        self.stats_refresh_button = ft.Ref[ft.IconButton]()
        
        # Rating Distribution refs
        self.rating_chart_container = ft.Ref[ft.Container]()
        self.rating_bars_column = ft.Ref[ft.Column]()
        self.rating_most_common = ft.Ref[ft.Text]()
        self.rating_total_count = ft.Ref[ft.Text]()
        self.rating_empty_state = ft.Ref[ft.Container]()
    
    def calculate_and_update_stats_display(self, filter_year="All Time"):
        """
        Calculate and update statistics display for the given year filter.
        
        Args:
            filter_year: Year to filter by, or "All Time" for all data
        """
        base_jav_data = database.get_all_javs_db() if filter_year == "All Time" else database.get_javs_by_year_db(int(filter_year))
        jav_data = [jav for jav in base_jav_data if jav.get('entry_type') in self.app_state["stats_view_selected_entry_types"]]
        
        total_javs = len(jav_data)
        valid_scores = [g['review_score'] for g in jav_data if g.get('review_score') is not None]
        average_score = (sum(valid_scores) / len(valid_scores)) if valid_scores else 0.0
        total_rewatches = sum(1 for g in jav_data if g.get('is_rewatch') == 1)
        
        all_genres = [genre for g in jav_data for genre in utils.parse_genres(g.get('genre'))]
        unique_genres_count = len(set(all_genres))
        
        genre_pie_sections, genre_legend_items = utils._generate_pie_data_from_list(all_genres, [ft.colors.BLUE_500, ft.colors.GREEN_500, ft.colors.RED_500, ft.colors.YELLOW_500, ft.colors.PURPLE_500])
        
        platforms = [jav['platform'] for jav in jav_data if jav.get('entry_type') == 'Game' and jav.get('platform')]
        authors = [author for jav in jav_data if jav.get('entry_type') == 'Book' and jav.get('author') for author in utils.parse_multi_value_field(jav['author'])]
        artists = [artist for jav in jav_data if jav.get('entry_type') == 'Album' and jav.get('artist') for artist in utils.parse_multi_value_field(jav['artist'])]
        directors = [director for jav in jav_data if jav.get('entry_type') == 'JAV' and jav.get('director') for director in utils.parse_multi_value_field(jav['director'])]
        actresses = [actress for jav in jav_data if jav.get('entry_type') == 'JAV' and jav.get('actress') for actress in utils.parse_multi_value_field(jav['actress'])]
        versions = [jav['update_version'] for jav in jav_data if jav.get('entry_type') == 'Adult Visual Novel' and jav.get('update_version')]

        # Define the color map for platforms
        platform_color_map = {
            "Xbox": ft.colors.GREEN,
            "PlayStation": ft.colors.BLUE,
            "Nintendo Switch": ft.colors.RED,
            "PC": ft.colors.ORANGE,
            "Steam Deck": ft.colors.PURPLE,
        }

        # The fallback colors will be used for any platforms not in the map (e.g., "Mobile", "Other")
        platform_pie_sections, platform_legend_items = utils._generate_pie_data_from_list(
            platforms, 
            [ft.colors.CYAN, ft.colors.TEAL, ft.colors.AMBER, ft.colors.BROWN],
            color_map=platform_color_map
        )

        author_pie_sections, author_legend_items = utils._generate_pie_data_from_list(authors, [ft.colors.TEAL_400, ft.colors.AMBER_600])
        artist_pie_sections, artist_legend_items = utils._generate_pie_data_from_list(artists, [ft.colors.CYAN_400, ft.colors.LIGHT_GREEN_500])
        director_pie_sections, director_legend_items = utils._generate_pie_data_from_list(directors, [ft.colors.LIGHT_BLUE_400, ft.colors.LIME_700])
        actress_pie_sections, actress_legend_items = utils._generate_pie_data_from_list(actresses, [ft.colors.DEEP_PURPLE_300, ft.colors.PINK_300])
        version_pie_sections, version_legend_items = utils._generate_pie_data_from_list(versions, [ft.colors.BROWN_400, ft.colors.BLUE_GREY_500])

        # Calculate Rating Distribution
        ratings = [jav['review_score'] for jav in jav_data if jav.get('review_score') is not None]
        rating_counts = {i: ratings.count(i) for i in range(1, 11)}
        total_rated = len(ratings)
        
        rating_bars = []
        if total_rated > 0:
            max_count = max(rating_counts.values()) if rating_counts.values() else 1
            most_common_rating = max(rating_counts.items(), key=lambda x: x[1])[0] if rating_counts else None
            
            for rating in range(10, 0, -1):  # 10 to 1, descending
                count = rating_counts[rating]
                percentage = (count / total_rated * 100) if total_rated > 0 else 0
                bar_ratio = (count / max_count) if max_count > 0 else 0
                
                is_most_common = (rating == most_common_rating and count > 0)
                bar_color = ft.colors.AMBER_400 if is_most_common else ft.colors.TEAL_400
                
                # Create the bar with proper proportions
                bar_content = ft.Row(
                    controls=[
                        ft.Container(
                            bgcolor=bar_color,
                            border_radius=4,
                            height=24,
                            expand=int(bar_ratio * 100) if count > 0 else 0,
                            animate=ft.Animation(500, ft.AnimationCurve.EASE_OUT)
                        ),
                        ft.Container(
                            expand=int((1 - bar_ratio) * 100) if count > 0 else 100
                        )
                    ],
                    spacing=0
                )
                
                rating_bars.append(
                    ft.Container(
                        content=ft.Row([
                            ft.Container(
                                content=ft.Text(str(rating), weight=ft.FontWeight.BOLD, size=14),
                                width=30,
                                alignment=ft.alignment.center_right
                            ),
                            ft.Container(
                                content=bar_content,
                                bgcolor=ft.colors.with_opacity(0.1, ft.colors.SURFACE_VARIANT),
                                border_radius=4,
                                expand=True,
                                height=24
                            ),
                            ft.Container(
                                content=ft.Text(f"{count} ({percentage:.1f}%)", size=12, weight=ft.FontWeight.W_500),
                                width=80,
                                alignment=ft.alignment.center_left
                            )
                        ], spacing=10, alignment=ft.MainAxisAlignment.START),
                        padding=ft.padding.symmetric(vertical=4),
                        border=ft.border.all(2, ft.colors.AMBER_400) if is_most_common else None,
                        border_radius=8 if is_most_common else 0,
                        bgcolor=ft.colors.with_opacity(0.05, ft.colors.AMBER_400) if is_most_common else None
                    )
                )
            
            most_common_text = f"⭐ {most_common_rating}/10" if most_common_rating else "N/A"
        else:
            most_common_text = "N/A"
        
        rating_chart_visible = total_rated > 0
        rating_empty_visible = total_rated == 0

        def safe_update(control_ref, attr, value):
            if control_ref.current and control_ref.current.page:
                setattr(control_ref.current, attr, value)
                try: 
                    control_ref.current.update()
                except: 
                    pass
        
        safe_update(self.stats_total_javs_text, "value", str(total_javs))
        safe_update(self.stats_avg_score_text, "value", f"{average_score:.1f}")
        safe_update(self.stats_total_rewatches_text, "value", str(total_rewatches))
        safe_update(self.stats_unique_genres_text, "value", str(unique_genres_count))
        safe_update(self.genre_pie_chart, "sections", genre_pie_sections)
        safe_update(self.genre_legend, "controls", genre_legend_items)
        
        # Update Rating Distribution
        safe_update(self.rating_bars_column, "controls", rating_bars)
        safe_update(self.rating_most_common, "value", most_common_text)
        safe_update(self.rating_total_count, "value", f"{total_rated} rated {'entry' if total_rated == 1 else 'entries'}")
        safe_update(self.rating_chart_container, "visible", rating_chart_visible)
        safe_update(self.rating_empty_state, "visible", rating_empty_visible)
        
        for container, sections, legend, data, pie_data, legend_data in [
            (self.platform_chart_container, self.platform_pie_chart, self.platform_legend, platforms, platform_pie_sections, platform_legend_items),
            (self.author_chart_container, self.author_pie_chart, self.author_legend, authors, author_pie_sections, author_legend_items),
            (self.artist_chart_container, self.artist_pie_chart, self.artist_legend, artists, artist_pie_sections, artist_legend_items),
            (self.director_chart_container, self.director_pie_chart, self.director_legend, directors, director_pie_sections, director_legend_items),
            (self.actress_chart_container, self.actress_pie_chart, self.actress_legend, actresses, actress_pie_sections, actress_legend_items),
            (self.version_chart_container, self.version_pie_chart, self.version_legend, versions, version_pie_sections, version_legend_items)
        ]:
            safe_update(container, "visible", bool(data))
            if data:
                safe_update(sections, "sections", pie_data)
                safe_update(legend, "controls", legend_data)

    def on_stats_filter_change(self, e):
        """Handle year filter change events."""
        selected_year = list(e.control.selected)[0] if e.control.selected else "All Time"
        if self.page: 
            self.page.run_thread(self.calculate_and_update_stats_display, selected_year)

    def on_stats_refresh(self, e):
        """Refresh statistics with visual feedback."""
        self.stats_refresh_button.current.disabled = True
        self.stats_loading_indicator.current.visible = True
        self.page.update()
        
        # Get current filter
        current_year_filter = list(self.stats_year_filter.current.selected)[0] if self.stats_year_filter.current.selected else "All Time"
        
        # Refresh data in background
        self.page.run_thread(self._refresh_stats_with_feedback, current_year_filter)

    def _refresh_stats_with_feedback(self, year_filter):
        """Background thread to refresh stats with UI feedback."""
        try:
            self.calculate_and_update_stats_display(year_filter)
            self._show_snackbar("Statistics refreshed successfully", duration=2000)
        except Exception as e:
            self._show_snackbar(f"Error refreshing stats: {str(e)}", duration=3000)
        finally:
            # Re-enable button and hide loading indicator
            self.stats_refresh_button.current.disabled = False
            self.stats_loading_indicator.current.visible = False
            self.page.update()

    def _show_snackbar(self, message: str, duration: int = 4000):
        """Show a snackbar message."""
        if not self.page: 
            return
        try:
            if hasattr(self.page, 'snack_bar') and self.page.snack_bar:
                self.page.snack_bar.open = False
            
            self.page.snack_bar = ft.SnackBar(
                content=ft.Text(message, max_lines=3, overflow=ft.TextOverflow.ELLIPSIS), 
                duration=duration, 
                open=True
            )
            self.page.update()
        except Exception as e:
            print(f"Error displaying snackbar '{message}': {e}")

    def _create_enhanced_stat_card(self, icon: str, value_ref: ft.Ref[ft.Text], label: str, color: str, 
                                  subtitle: str = None, trend_icon: str = None, trend_color: str = None):
        """Creates an enhanced stat card with optional subtitle and trend indicators."""
        
        # Build the content list dynamically
        content_items = []
        
        # Icon row
        content_items.append(
            ft.Row([
                ft.Container(
                    content=ft.Icon(icon, color=color, size=28),
                    padding=14,
                    bgcolor=ft.colors.with_opacity(0.12, color),
                    border_radius=16,
                    animate=ft.Animation(200, ft.AnimationCurve.EASE_OUT)
                ),
                ft.Container(expand=True),  # Spacer
                # Trend indicator (if provided)
                ft.Container(
                    content=ft.Icon(trend_icon, color=trend_color, size=18),
                    visible=bool(trend_icon),
                    padding=6,
                    bgcolor=ft.colors.with_opacity(0.1, trend_color or ft.colors.GREY),
                    border_radius=8
                ) if trend_icon else ft.Container()
            ])
        )
        
        # Value with animation
        content_items.append(
            ft.AnimatedSwitcher(
                ft.Text(
                    ref=value_ref, 
                    value="...", 
                    size=32, 
                    weight=ft.FontWeight.BOLD,
                    color=color
                ),
                duration=300,
                transition=ft.AnimatedSwitcherTransition.SCALE
            )
        )
        
        # Label
        content_items.append(
            ft.Text(
                label, 
                size=14, 
                color=ft.colors.ON_SURFACE_VARIANT, 
                weight=ft.FontWeight.W_500
            )
        )
        
        # Subtitle (if provided)
        if subtitle:
            content_items.append(
                ft.Text(
                    subtitle, 
                    size=12, 
                    color=ft.colors.ON_SURFACE_VARIANT,
                    opacity=0.8
                )
            )
        
        return ft.Container(
            content=ft.Column(content_items, spacing=12),
            padding=ft.padding.all(24),
            border_radius=20,
            border=ft.border.all(1, ft.colors.with_opacity(0.08, ft.colors.OUTLINE)),
            bgcolor=ft.colors.SURFACE_VARIANT,
            expand=True,
            animate=ft.Animation(200, ft.AnimationCurve.EASE_OUT),
            on_hover=self._on_stat_card_hover,
            ink=True
        )

    def _on_stat_card_hover(self, e):
        """Add subtle hover effect to stat cards."""
        if e.data == "true":  # Hover enter
            e.control.elevation = 4
            e.control.scale = 1.02
        else:  # Hover exit
            e.control.elevation = 0
            e.control.scale = 1.0
        e.control.update()

    def _create_expandable_breakdown_card(self, container_ref, chart_ref, legend_ref, title, icon, color):
        """Creates an expandable breakdown card with modern styling."""
        return ft.ExpansionTile(
            ref=container_ref,
            leading=ft.Icon(icon, color=color),
            title=ft.Text(title, style=ft.TextThemeStyle.TITLE_MEDIUM, weight=ft.FontWeight.W_500),
            subtitle=ft.Text("Tap to view breakdown", size=12, color=ft.colors.ON_SURFACE_VARIANT),
            controls=[
                ft.Container(
                    content=ft.Row([
                        # Chart section
                        ft.Container(
                            content=ft.Column([
                                ft.PieChart(
                                    ref=chart_ref,
                                    sections=[],
                                    center_space_radius=50,
                                    animate=ft.Animation(500, ft.AnimationCurve.EASE_OUT)
                                )
                            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                            expand=3,
                            padding=20
                        ),
                        # Legend section
                        ft.Container(
                            content=ft.Column([
                                ft.Row([
                                    ft.Icon(ft.icons.LIST_ROUNDED, size=16, color=color),
                                    ft.Text("Top Entries", weight=ft.FontWeight.BOLD, size=14)
                                ], spacing=8),
                                ft.Divider(height=10),
                                ft.Container(
                                    content=ft.Column(
                                        ref=legend_ref, 
                                        controls=[], 
                                        spacing=8, 
                                        scroll=ft.ScrollMode.ADAPTIVE
                                    ),
                                    height=220
                                )
                            ]),
                            expand=2,
                            padding=20
                        )
                    ], vertical_alignment=ft.CrossAxisAlignment.START),
                    bgcolor=ft.colors.with_opacity(0.03, ft.colors.SURFACE_VARIANT),
                    border_radius=12,
                    margin=ft.margin.symmetric(horizontal=8, vertical=4)
                )
            ],
            bgcolor=ft.colors.SURFACE_VARIANT,
            collapsed_bgcolor=ft.colors.SURFACE_VARIANT,
            text_color=ft.colors.ON_SURFACE,
            icon_color=color,
            visible=False
        )

    def _create_settings_section(self):
        """Creates a modern settings section with better organization."""
        theme_dropdown = ft.Dropdown(
            label="App Theme",
            options=[ft.dropdown.Option(name) for name in config.THEMES.keys()],
            value=database.get_setting_db("current_theme", config.DEFAULT_THEME_NAME),
            on_change=self.on_theme_change_callback,
            expand=True,
            border_radius=12
        )
        
        return ft.Container(
            content=ft.Column([
                # Settings header
                ft.Row([
                    ft.Icon(ft.icons.SETTINGS_ROUNDED, color=ft.colors.PRIMARY, size=24),
                    ft.Text("Application Settings", style=ft.TextThemeStyle.TITLE_LARGE, weight=ft.FontWeight.W_500)
                ], spacing=12),
                
                ft.Divider(height=20, color=ft.colors.with_opacity(0.1, ft.colors.OUTLINE)),
                
                # Theme setting
                ft.Row([
                    ft.Icon(ft.icons.PALETTE_ROUNDED, color=ft.colors.SECONDARY, size=20),
                    ft.Text("Theme", weight=ft.FontWeight.W_500, expand=True),
                    ft.Container(content=theme_dropdown, expand=2)
                ], spacing=12, alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                
                ft.Divider(height=20, color=ft.colors.with_opacity(0.1, ft.colors.OUTLINE)),
                
                # Data management
                ft.Column([
                    ft.Row([
                        ft.Icon(ft.icons.STORAGE_ROUNDED, color=ft.colors.TERTIARY, size=20),
                        ft.Text("Data Management", weight=ft.FontWeight.W_500)
                    ], spacing=12),
                    ft.Row([
                        ft.ElevatedButton(
                            "Import CSV", 
                            icon=ft.icons.UPLOAD_FILE_ROUNDED, 
                            on_click=self.open_import_dialog_callback, 
                            expand=True,
                            style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=12))
                        ),
                        ft.ElevatedButton(
                            "Export CSV", 
                            icon=ft.icons.DOWNLOAD_FOR_OFFLINE_ROUNDED, 
                            on_click=self.open_export_dialog_callback, 
                            expand=True,
                            style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=12))
                        )
                    ], spacing=12)
                ], spacing=12)
            ], spacing=16),
            padding=28,
            border_radius=20,
            border=ft.border.all(1, ft.colors.with_opacity(0.08, ft.colors.OUTLINE)),
            bgcolor=ft.colors.SURFACE_VARIANT,
            animate=ft.Animation(200, ft.AnimationCurve.EASE_OUT)
        )

    def build_stats_view(self):
        """Builds the enhanced statistics view with improved UI and animations."""
        from ui import create_entry_type_filter_button_with_sheet
        
        # Initialize year filter if not exists
        if not self.stats_year_filter.current:
            self.stats_year_filter.current = ft.SegmentedButton(
                segments=[ft.Segment(value="All Time", label=ft.Text("Overall"))] + 
                         [ft.Segment(value=year, label=ft.Text(year)) for year in config.YEARS],
                selected={"All Time"},
                allow_empty_selection=False,
                show_selected_icon=False,
                on_change=self.on_stats_filter_change
            )

        # Initialize loading indicator and refresh button
        if not self.stats_loading_indicator.current:
            self.stats_loading_indicator.current = ft.ProgressRing(
                visible=False,
                width=20,
                height=20,
                stroke_width=2
            )
            
        if not self.stats_refresh_button.current:
            self.stats_refresh_button.current = ft.IconButton(
                icon=ft.icons.REFRESH_ROUNDED,
                tooltip="Refresh Statistics",
                on_click=self.on_stats_refresh,
                icon_size=20
            )

        def on_stats_entry_type_filter_change():
            current_year_filter = list(self.stats_year_filter.current.selected)[0] if self.stats_year_filter.current.selected else "All Time"
            self.page.run_thread(self.calculate_and_update_stats_display, current_year_filter)
            database.set_setting_db(config.SAVED_STATS_VIEW_FILTER_KEY, ",".join(sorted(list(self.app_state["stats_view_selected_entry_types"]))))

        stats_entry_type_filter_button = create_entry_type_filter_button_with_sheet(
            self.page, config.ALL_ENTRY_TYPES_STR, self.app_state["stats_view_selected_entry_types"],
            on_stats_entry_type_filter_change, button_label_prefix="Filter Stats"
        )

        # Initial data load
        self.page.run_thread(self.calculate_and_update_stats_display, "All Time")

        # Enhanced stat cards with additional context
        overview_stats = ft.Row(
            spacing=24,
            controls=[
                self._create_enhanced_stat_card(
                    ft.icons.MOVIE_FILTER_ROUNDED, 
                    self.stats_total_javs_text, 
                    "Total Entries", 
                    ft.colors.BLUE_400,
                    subtitle="All time collection"
                ),
                self._create_enhanced_stat_card(
                    ft.icons.STAR_RATE_ROUNDED, 
                    self.stats_avg_score_text, 
                    "Average Rating", 
                    ft.colors.AMBER_400,
                    subtitle="Quality score"
                ),
                self._create_enhanced_stat_card(
                    ft.icons.REPLAY_CIRCLE_FILLED_ROUNDED, 
                    self.stats_total_rewatches_text, 
                    "Total Rewatches", 
                    ft.colors.GREEN_400,
                    subtitle="Favorite content"
                ),
                self._create_enhanced_stat_card(
                    ft.icons.CATEGORY_ROUNDED, 
                    self.stats_unique_genres_text, 
                    "Unique Genres", 
                    ft.colors.PURPLE_400,
                    subtitle="Content variety"
                ),
            ]
        )

        # Main Genre Breakdown Card (always visible)
        genre_breakdown_card = ft.Container(
            content=ft.Card(
                elevation=2,
                content=ft.Container(
                    padding=28,
                    content=ft.Column([
                        ft.Row([
                            ft.Icon(ft.icons.PIE_CHART_ROUNDED, color=ft.colors.PRIMARY, size=24),
                            ft.Text("Genre Distribution", style=ft.TextThemeStyle.TITLE_LARGE, weight=ft.FontWeight.W_600)
                        ], spacing=12),
                        ft.Divider(height=20),
                        ft.Row([
                            ft.Column([
                                ft.PieChart(
                                    ref=self.genre_pie_chart, 
                                    sections=[], 
                                    center_space_radius=50,
                                    animate=ft.Animation(500, ft.AnimationCurve.EASE_OUT)
                                )
                            ], expand=3, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                            ft.Column([
                                ft.Row([
                                    ft.Icon(ft.icons.LIST_ROUNDED, size=16, color=ft.colors.PRIMARY),
                                    ft.Text("Top Genres", weight=ft.FontWeight.BOLD, size=14)
                                ], spacing=8),
                                ft.Divider(height=10),
                                ft.Container(
                                    content=ft.Column(
                                        ref=self.genre_legend, 
                                        controls=[], 
                                        scroll=ft.ScrollMode.ADAPTIVE
                                    ),
                                    height=250
                                )
                            ], expand=2, scroll=ft.ScrollMode.ADAPTIVE)
                        ], height=280)
                    ])
                )
            ),
            border_radius=20
        )

        return ft.Container(
            content=ft.Column(
                scroll=ft.ScrollMode.ADAPTIVE,
                spacing=32,
                controls=[
                    # Enhanced header with loading indicator
                    ft.Row([
                        ft.Icon(ft.icons.ANALYTICS_ROUNDED, size=36, color=ft.colors.PRIMARY),
                        ft.Column([
                            ft.Text("Statistics & Analytics", style=ft.TextThemeStyle.HEADLINE_MEDIUM, weight=ft.FontWeight.W_600),
                            ft.Text("View your collection insights", size=14, color=ft.colors.ON_SURFACE_VARIANT)
                        ], spacing=4, expand=True),
                        ft.Row([
                            self.stats_loading_indicator.current,
                            self.stats_refresh_button.current
                        ], spacing=8)
                    ], spacing=16, alignment=ft.MainAxisAlignment.SPACE_BETWEEN),

                    # Enhanced filters section
                    ft.Container(
                        content=ft.Row([
                            ft.Column([
                                ft.Text("Time Period", size=12, color=ft.colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500),
                                self.stats_year_filter.current
                            ], spacing=8),
                            ft.Column([
                                ft.Text("Content Filter", size=12, color=ft.colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500),
                                stats_entry_type_filter_button
                            ], spacing=8)
                        ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                        padding=20,
                        border_radius=16,
                        bgcolor=ft.colors.with_opacity(0.03, ft.colors.SURFACE_VARIANT),
                        border=ft.border.all(1, ft.colors.with_opacity(0.08, ft.colors.OUTLINE))
                    ),

                    # Overview statistics
                    overview_stats,

                    # Main genre breakdown
                    genre_breakdown_card,

                    # Rating Distribution
                    ft.Container(
                        content=ft.Card(
                            elevation=2,
                            content=ft.Container(
                                padding=28,
                                content=ft.Column([
                                    ft.Row([
                                        ft.Icon(ft.icons.BAR_CHART_ROUNDED, color=ft.colors.BLUE_400, size=24),
                                        ft.Text("Rating Distribution", style=ft.TextThemeStyle.TITLE_LARGE, weight=ft.FontWeight.W_600)
                                    ], spacing=12),
                                    ft.Divider(height=20),
                                    
                                    # Stats summary
                                    ft.Row([
                                        ft.Container(
                                            content=ft.Column([
                                                ft.Text("Most Common Rating", size=12, color=ft.colors.ON_SURFACE_VARIANT),
                                                ft.Text(ref=self.rating_most_common, value="N/A", size=20, weight=ft.FontWeight.BOLD, color=ft.colors.AMBER_400)
                                            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=4),
                                            padding=16,
                                            bgcolor=ft.colors.with_opacity(0.05, ft.colors.AMBER_400),
                                            border_radius=12,
                                            border=ft.border.all(1, ft.colors.with_opacity(0.2, ft.colors.AMBER_400)),
                                            expand=True
                                        ),
                                        ft.Container(
                                            content=ft.Column([
                                                ft.Text("Total Rated", size=12, color=ft.colors.ON_SURFACE_VARIANT),
                                                ft.Text(ref=self.rating_total_count, value="0 entries", size=20, weight=ft.FontWeight.BOLD, color=ft.colors.BLUE_400)
                                            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=4),
                                            padding=16,
                                            bgcolor=ft.colors.with_opacity(0.05, ft.colors.BLUE_400),
                                            border_radius=12,
                                            border=ft.border.all(1, ft.colors.with_opacity(0.2, ft.colors.BLUE_400)),
                                            expand=True
                                        )
                                    ], spacing=16),
                                    
                                    ft.Divider(height=20),
                                    
                                    # Bar chart container
                                    ft.Container(
                                        ref=self.rating_chart_container,
                                        content=ft.Column([
                                            ft.Text("📊 Rating Breakdown", weight=ft.FontWeight.W_500, size=16),
                                            ft.Column(ref=self.rating_bars_column, controls=[], spacing=4)
                                        ], spacing=10),
                                        visible=True
                                    ),
                                    
                                    # Empty state
                                    ft.Container(
                                        ref=self.rating_empty_state,
                                        content=ft.Column([
                                            ft.Icon(ft.icons.STAR_BORDER_ROUNDED, size=64, color=ft.colors.ON_SURFACE_VARIANT),
                                            ft.Text("No rated entries yet", size=16, weight=ft.FontWeight.W_500, color=ft.colors.ON_SURFACE_VARIANT),
                                            ft.Text("Start rating your entries to see the distribution", size=12, color=ft.colors.ON_SURFACE_VARIANT, text_align=ft.TextAlign.CENTER)
                                        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=12),
                                        padding=40,
                                        visible=False
                                    )
                                ], spacing=16)
                            )
                        ),
                        border_radius=20
                    ),

                    # Expandable breakdown cards
                    ft.Column([
                        ft.Text("Detailed Breakdowns", style=ft.TextThemeStyle.TITLE_MEDIUM, weight=ft.FontWeight.W_500),
                        self._create_expandable_breakdown_card(
                            self.platform_chart_container, self.platform_pie_chart, self.platform_legend,
                            "Platform Distribution", ft.icons.DEVICES_ROUNDED, ft.colors.BLUE_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.author_chart_container, self.author_pie_chart, self.author_legend,
                            "Author Analysis", ft.icons.PERSON_ROUNDED, ft.colors.GREEN_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.artist_chart_container, self.artist_pie_chart, self.artist_legend,
                            "Artist Analysis", ft.icons.HEADSET_ROUNDED, ft.colors.CYAN_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.director_chart_container, self.director_pie_chart, self.director_legend,
                            "Studio Breakdown", ft.icons.BUSINESS_ROUNDED, ft.colors.ORANGE_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.actress_chart_container, self.actress_pie_chart, self.actress_legend,
                            "Actress Statistics", ft.icons.FACE_ROUNDED, ft.colors.PINK_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.version_chart_container, self.version_pie_chart, self.version_legend,
                            "Version Analysis", ft.icons.LAYERS_ROUNDED, ft.colors.PURPLE_400
                        ),
                    ], spacing=8),

                    ft.Divider(height=32, color=ft.colors.with_opacity(0.1, ft.colors.OUTLINE)),

                    # Enhanced settings section
                    self._create_settings_section()
                ]
            ),
            padding=ft.padding.symmetric(horizontal=28, vertical=20),
            expand=True,
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
        )
