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
        
        genre_pie_sections, genre_legend_items = utils._generate_pie_data_from_list(all_genres, [ft.Colors.BLUE_500, ft.Colors.GREEN_500, ft.Colors.RED_500, ft.Colors.YELLOW_500, ft.Colors.PURPLE_500])
        
        platforms = [jav['platform'] for jav in jav_data if jav.get('entry_type') == 'Game' and jav.get('platform')]
        authors = [author for jav in jav_data if jav.get('entry_type') == 'Book' and jav.get('author') for author in utils.parse_multi_value_field(jav['author'])]
        artists = [artist for jav in jav_data if jav.get('entry_type') == 'Album' and jav.get('artist') for artist in utils.parse_multi_value_field(jav['artist'])]
        directors = [director for jav in jav_data if jav.get('entry_type') == 'JAV' and jav.get('director') for director in utils.parse_multi_value_field(jav['director'])]
        actresses = [actress for jav in jav_data if jav.get('entry_type') == 'JAV' and jav.get('actress') for actress in utils.parse_multi_value_field(jav['actress'])]
        versions = [jav['update_version'] for jav in jav_data if jav.get('entry_type') == 'Adult Visual Novel' and jav.get('update_version')]

        # Define the color map for platforms
        platform_color_map = {
            "Xbox": ft.Colors.GREEN,
            "PlayStation": ft.Colors.BLUE,
            "Nintendo Switch": ft.Colors.RED,
            "PC": ft.Colors.ORANGE,
            "Steam Deck": ft.Colors.PURPLE,
        }

        # The fallback colors will be used for any platforms not in the map (e.g., "Mobile", "Other")
        platform_pie_sections, platform_legend_items = utils._generate_pie_data_from_list(
            platforms, 
            [ft.Colors.CYAN, ft.Colors.TEAL, ft.Colors.AMBER, ft.Colors.BROWN],
            color_map=platform_color_map
        )

        author_pie_sections, author_legend_items = utils._generate_pie_data_from_list(authors, [ft.Colors.TEAL_400, ft.Colors.AMBER_600])
        artist_pie_sections, artist_legend_items = utils._generate_pie_data_from_list(artists, [ft.Colors.CYAN_400, ft.Colors.LIGHT_GREEN_500])
        director_pie_sections, director_legend_items = utils._generate_pie_data_from_list(directors, [ft.Colors.LIGHT_BLUE_400, ft.Colors.LIME_700])
        actress_pie_sections, actress_legend_items = utils._generate_pie_data_from_list(actresses, [ft.Colors.DEEP_PURPLE_300, ft.Colors.PINK_300])
        version_pie_sections, version_legend_items = utils._generate_pie_data_from_list(versions, [ft.Colors.BROWN_400, ft.Colors.BLUE_GREY_500])

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
                bar_color = ft.Colors.AMBER_400 if is_most_common else ft.Colors.TEAL_400
                
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
                                bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.SURFACE),
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
                        border=ft.border.all(2, ft.Colors.AMBER_400) if is_most_common else None,
                        border_radius=8 if is_most_common else 0,
                        bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.AMBER_400) if is_most_common else None
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
        """Creates an enhanced stat card with modern gradient styling and animations."""
        
        # Build the content list dynamically
        content_items = []
        
        # Icon row with gradient background
        content_items.append(
            ft.Row([
                ft.Container(
                    content=ft.Icon(icon, color=ft.Colors.WHITE, size=32),
                    padding=16,
                    gradient=ft.LinearGradient(
                        colors=[color, ft.Colors.with_opacity(0.7, color)],
                        begin=ft.alignment.top_left,
                        end=ft.alignment.bottom_right
                    ),
                    border_radius=20,
                    shadow=ft.BoxShadow(
                        spread_radius=1,
                        blur_radius=12,
                        color=ft.Colors.with_opacity(0.3, color),
                        offset=ft.Offset(0, 4)
                    ),
                    animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
                ),
                ft.Container(expand=True),  # Spacer
                # Trend indicator (if provided)
                ft.Container(
                    content=ft.Icon(trend_icon, color=ft.Colors.WHITE, size=18),
                    visible=bool(trend_icon),
                    padding=8,
                    gradient=ft.LinearGradient(
                        colors=[trend_color or ft.Colors.GREY, ft.Colors.with_opacity(0.7, trend_color or ft.Colors.GREY)],
                        begin=ft.alignment.top_left,
                        end=ft.alignment.bottom_right
                    ),
                    border_radius=12,
                    shadow=ft.BoxShadow(
                        spread_radius=0,
                        blur_radius=8,
                        color=ft.Colors.with_opacity(0.2, trend_color or ft.Colors.GREY),
                        offset=ft.Offset(0, 2)
                    )
                ) if trend_icon else ft.Container()
            ])
        )
        
        # Value with animation and gradient text effect
        content_items.append(
            ft.AnimatedSwitcher(
                ft.Text(
                    ref=value_ref, 
                    value="...", 
                    size=42, 
                    weight=ft.FontWeight.BOLD,
                    color=color,
                    style=ft.TextStyle(
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=8,
                            color=ft.Colors.with_opacity(0.15, color),
                            offset=ft.Offset(0, 2)
                        )
                    )
                ),
                duration=400,
                transition=ft.AnimatedSwitcherTransition.SCALE
            )
        )
        
        # Label
        content_items.append(
            ft.Text(
                label, 
                size=15, 
                color=ft.Colors.ON_SURFACE, 
                weight=ft.FontWeight.W_600,
                style=ft.TextStyle(letter_spacing=0.5)
            )
        )
        
        # Subtitle (if provided)
        if subtitle:
            content_items.append(
                ft.Text(
                    subtitle, 
                    size=12, 
                    color=ft.Colors.ON_SURFACE_VARIANT,
                    opacity=0.7,
                    italic=True
                )
            )
        
        return ft.Container(
            content=ft.Column(content_items, spacing=14),
            padding=ft.padding.all(28),
            border_radius=24,
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0.05, color),
                    ft.Colors.with_opacity(0.02, ft.Colors.SURFACE)
                ],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            border=ft.border.all(2, ft.Colors.with_opacity(0.15, color)),
            expand=True,
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT),
            on_hover=self._on_stat_card_hover,
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=20,
                color=ft.Colors.with_opacity(0.08, color),
                offset=ft.Offset(0, 6)
            )
        )

    def _on_stat_card_hover(self, e):
        """Add smooth hover effect to stat cards with elevation and scale."""
        if e.data == "true":  # Hover enter
            e.control.shadow = ft.BoxShadow(
                spread_radius=2,
                blur_radius=28,
                color=ft.Colors.with_opacity(0.15, ft.Colors.PRIMARY),
                offset=ft.Offset(0, 8)
            )
            e.control.scale = 1.03
        else:  # Hover exit
            # Get the original color from the card's border
            original_color = ft.Colors.PRIMARY  # Default fallback
            if hasattr(e.control, 'border') and e.control.border:
                original_color = e.control.border.top.color if hasattr(e.control.border, 'top') else ft.Colors.PRIMARY
            
            e.control.shadow = ft.BoxShadow(
                spread_radius=0,
                blur_radius=20,
                color=ft.Colors.with_opacity(0.08, original_color),
                offset=ft.Offset(0, 6)
            )
            e.control.scale = 1.0
        e.control.update()

    def _create_expandable_breakdown_card(self, container_ref, chart_ref, legend_ref, title, icon, color):
        """Creates an expandable breakdown card with modern gradient styling."""
        return ft.Container(
            ref=container_ref,
            content=ft.ExpansionTile(
                leading=ft.Container(
                    content=ft.Icon(icon, color=ft.Colors.WHITE, size=24),
                    gradient=ft.LinearGradient(
                        colors=[color, ft.Colors.with_opacity(0.7, color)],
                        begin=ft.alignment.top_left,
                        end=ft.alignment.bottom_right
                    ),
                    padding=12,
                    border_radius=16,
                    shadow=ft.BoxShadow(
                        spread_radius=0,
                        blur_radius=10,
                        color=ft.Colors.with_opacity(0.25, color),
                        offset=ft.Offset(0, 3)
                    )
                ),
                title=ft.Text(title, style=ft.TextThemeStyle.TITLE_MEDIUM, weight=ft.FontWeight.W_600),
                subtitle=ft.Text("Tap to expand and view detailed breakdown", size=12, color=ft.Colors.ON_SURFACE_VARIANT, italic=True),
                controls=[
                    ft.Container(
                        content=ft.Row([
                            # Chart section with enhanced styling
                            ft.Container(
                                content=ft.Column([
                                    ft.Container(
                                        content=ft.PieChart(
                                            ref=chart_ref,
                                            sections=[],
                                            center_space_radius=55,
                                            animate=ft.Animation(600, ft.AnimationCurve.ELASTIC_OUT)
                                        ),
                                        padding=ft.padding.all(16),
                                        border_radius=20,
                                        gradient=ft.LinearGradient(
                                            colors=[
                                                ft.Colors.with_opacity(0.03, color),
                                                ft.Colors.with_opacity(0.01, ft.Colors.SURFACE)
                                            ],
                                            begin=ft.alignment.top_left,
                                            end=ft.alignment.bottom_right
                                        ),
                                        border=ft.border.all(1, ft.Colors.with_opacity(0.1, color))
                                    )
                                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                                expand=3,
                                padding=20
                            ),
                            # Legend section with enhanced styling
                            ft.Container(
                                content=ft.Column([
                                    ft.Container(
                                        content=ft.Row([
                                            ft.Icon(ft.Icons.LIST_ROUNDED, size=18, color=color),
                                            ft.Text("Top Entries", weight=ft.FontWeight.BOLD, size=15)
                                        ], spacing=10),
                                        padding=ft.padding.symmetric(horizontal=12, vertical=8),
                                        bgcolor=ft.Colors.with_opacity(0.08, color),
                                        border_radius=12
                                    ),
                                    ft.Container(height=12),
                                    ft.Container(
                                        content=ft.Column(
                                            ref=legend_ref, 
                                            controls=[], 
                                            spacing=10, 
                                            scroll=ft.ScrollMode.ADAPTIVE
                                        ),
                                        height=230,
                                        padding=ft.padding.all(8)
                                    )
                                ]),
                                expand=2,
                                padding=20
                            )
                        ], vertical_alignment=ft.CrossAxisAlignment.START),
                        gradient=ft.LinearGradient(
                            colors=[
                                ft.Colors.with_opacity(0.04, color),
                                ft.Colors.with_opacity(0.01, ft.Colors.SURFACE)
                            ],
                            begin=ft.alignment.top_left,
                            end=ft.alignment.bottom_right
                        ),
                        border_radius=16,
                        border=ft.border.all(1, ft.Colors.with_opacity(0.12, color)),
                        margin=ft.margin.symmetric(horizontal=12, vertical=8),
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=12,
                            color=ft.Colors.with_opacity(0.08, color),
                            offset=ft.Offset(0, 4)
                        )
                    )
                ],
                bgcolor=ft.Colors.SURFACE,
                collapsed_bgcolor=ft.Colors.SURFACE,
                text_color=ft.Colors.ON_SURFACE,
                icon_color=color
            ),
            border_radius=20,
            border=ft.border.all(2, ft.Colors.with_opacity(0.1, color)),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=16,
                color=ft.Colors.with_opacity(0.06, color),
                offset=ft.Offset(0, 4)
            ),
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT),
            visible=False
        )

    def _create_settings_section(self):
        """Creates a modern settings section with enhanced visual styling."""
        theme_dropdown = ft.Dropdown(
            label="App Theme",
            options=[ft.dropdown.Option(name) for name in config.THEMES.keys()],
            value=database.get_setting_db("current_theme", config.DEFAULT_THEME_NAME),
            on_change=self.on_theme_change_callback,
            expand=True,
            border_radius=16,
            border_color=ft.Colors.PRIMARY
        )
        
        return ft.Container(
            content=ft.Column([
                # Settings header with gradient
                ft.Container(
                    content=ft.Row([
                        ft.Container(
                            content=ft.Icon(ft.Icons.SETTINGS_ROUNDED, color=ft.Colors.WHITE, size=28),
                            gradient=ft.LinearGradient(
                                colors=[ft.Colors.PRIMARY, ft.Colors.with_opacity(0.7, ft.Colors.PRIMARY)],
                                begin=ft.alignment.top_left,
                                end=ft.alignment.bottom_right
                            ),
                            padding=14,
                            border_radius=18,
                            shadow=ft.BoxShadow(
                                spread_radius=0,
                                blur_radius=12,
                                color=ft.Colors.with_opacity(0.3, ft.Colors.PRIMARY),
                                offset=ft.Offset(0, 4)
                            )
                        ),
                        ft.Column([
                            ft.Text("Application Settings", style=ft.TextThemeStyle.TITLE_LARGE, weight=ft.FontWeight.W_700),
                            ft.Text("Customize your experience", size=13, color=ft.Colors.ON_SURFACE_VARIANT, italic=True)
                        ], spacing=4)
                    ], spacing=16),
                    padding=ft.padding.only(bottom=20)
                ),
                
                ft.Divider(height=1, color=ft.Colors.with_opacity(0.15, ft.Colors.OUTLINE)),
                
                ft.Container(height=8),
                
                # Theme setting
                ft.Container(
                    content=ft.Row([
                        ft.Container(
                            content=ft.Icon(ft.Icons.PALETTE_ROUNDED, color=ft.Colors.WHITE, size=20),
                            gradient=ft.LinearGradient(
                                colors=[ft.Colors.SECONDARY, ft.Colors.with_opacity(0.7, ft.Colors.SECONDARY)],
                                begin=ft.alignment.top_left,
                                end=ft.alignment.bottom_right
                            ),
                            padding=10,
                            border_radius=12
                        ),
                        ft.Text("Theme", weight=ft.FontWeight.W_600, size=15, expand=True),
                        ft.Container(content=theme_dropdown, expand=2)
                    ], spacing=14, alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER),
                    padding=ft.padding.all(16),
                    border_radius=16,
                    bgcolor=ft.Colors.with_opacity(0.03, ft.Colors.SURFACE),
                    border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.OUTLINE))
                ),
                
                ft.Container(height=8),
                
                # Data management
                ft.Container(
                    content=ft.Column([
                        ft.Row([
                            ft.Container(
                                content=ft.Icon(ft.Icons.STORAGE_ROUNDED, color=ft.Colors.WHITE, size=20),
                                gradient=ft.LinearGradient(
                                    colors=[ft.Colors.TERTIARY, ft.Colors.with_opacity(0.7, ft.Colors.TERTIARY)],
                                    begin=ft.alignment.top_left,
                                    end=ft.alignment.bottom_right
                                ),
                                padding=10,
                                border_radius=12
                            ),
                            ft.Text("Data Management", weight=ft.FontWeight.W_600, size=15)
                        ], spacing=14),
                        ft.Container(height=8),
                        ft.Row([
                            ft.ElevatedButton(
                                "Import CSV", 
                                icon=ft.Icons.UPLOAD_FILE_ROUNDED, 
                                on_click=self.open_import_dialog_callback, 
                                expand=True,
                                style=ft.ButtonStyle(
                                    shape=ft.RoundedRectangleBorder(radius=14),
                                    padding=ft.padding.symmetric(horizontal=20, vertical=16)
                                ),
                                icon_color=ft.Colors.GREEN_400
                            ),
                            ft.ElevatedButton(
                                "Export CSV", 
                                icon=ft.Icons.DOWNLOAD_FOR_OFFLINE_ROUNDED, 
                                on_click=self.open_export_dialog_callback, 
                                expand=True,
                                style=ft.ButtonStyle(
                                    shape=ft.RoundedRectangleBorder(radius=14),
                                    padding=ft.padding.symmetric(horizontal=20, vertical=16)
                                ),
                                icon_color=ft.Colors.BLUE_400
                            )
                        ], spacing=14)
                    ], spacing=12),
                    padding=ft.padding.all(16),
                    border_radius=16,
                    bgcolor=ft.Colors.with_opacity(0.03, ft.Colors.SURFACE),
                    border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.OUTLINE))
                )
            ], spacing=12),
            padding=32,
            border_radius=24,
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0.05, ft.Colors.PRIMARY),
                    ft.Colors.with_opacity(0.02, ft.Colors.SURFACE)
                ],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            border=ft.border.all(2, ft.Colors.with_opacity(0.12, ft.Colors.PRIMARY)),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=24,
                color=ft.Colors.with_opacity(0.08, ft.Colors.PRIMARY),
                offset=ft.Offset(0, 8)
            ),
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
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
                icon=ft.Icons.REFRESH_ROUNDED,
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
                    ft.Icons.MOVIE_FILTER_ROUNDED, 
                    self.stats_total_javs_text, 
                    "Total Entries", 
                    ft.Colors.BLUE_400,
                    subtitle="All time collection"
                ),
                self._create_enhanced_stat_card(
                    ft.Icons.STAR_RATE_ROUNDED, 
                    self.stats_avg_score_text, 
                    "Average Rating", 
                    ft.Colors.AMBER_400,
                    subtitle="Quality score"
                ),
                self._create_enhanced_stat_card(
                    ft.Icons.REPLAY_CIRCLE_FILLED_ROUNDED, 
                    self.stats_total_rewatches_text, 
                    "Total Rewatches", 
                    ft.Colors.GREEN_400,
                    subtitle="Favorite content"
                ),
                self._create_enhanced_stat_card(
                    ft.Icons.CATEGORY_ROUNDED, 
                    self.stats_unique_genres_text, 
                    "Unique Genres", 
                    ft.Colors.PURPLE_400,
                    subtitle="Content variety"
                ),
            ]
        )

        # Main Genre Breakdown Card (always visible) with enhanced styling
        genre_breakdown_card = ft.Container(
            content=ft.Container(
                padding=32,
                content=ft.Column([
                    # Header with gradient icon
                    ft.Row([
                        ft.Container(
                            content=ft.Icon(ft.Icons.PIE_CHART_ROUNDED, color=ft.Colors.WHITE, size=28),
                            gradient=ft.LinearGradient(
                                colors=[ft.Colors.PURPLE_500, ft.Colors.DEEP_PURPLE_600],
                                begin=ft.alignment.top_left,
                                end=ft.alignment.bottom_right
                            ),
                            padding=14,
                            border_radius=18,
                            shadow=ft.BoxShadow(
                                spread_radius=0,
                                blur_radius=12,
                                color=ft.Colors.with_opacity(0.3, ft.Colors.PURPLE_500),
                                offset=ft.Offset(0, 4)
                            )
                        ),
                        ft.Column([
                            ft.Text("Genre Distribution", style=ft.TextThemeStyle.TITLE_LARGE, weight=ft.FontWeight.W_700),
                            ft.Text("Most popular genres in your collection", size=13, color=ft.Colors.ON_SURFACE_VARIANT, italic=True)
                        ], spacing=4)
                    ], spacing=16),
                    
                    ft.Container(height=8),
                    ft.Divider(height=1, color=ft.Colors.with_opacity(0.15, ft.Colors.OUTLINE)),
                    ft.Container(height=16),
                    
                    # Chart and legend row
                    ft.Row([
                        # Chart section with decorative container
                        ft.Container(
                            content=ft.Column([
                                ft.Container(
                                    content=ft.PieChart(
                                        ref=self.genre_pie_chart, 
                                        sections=[], 
                                        center_space_radius=58,
                                        animate=ft.Animation(600, ft.AnimationCurve.ELASTIC_OUT)
                                    ),
                                    padding=ft.padding.all(20),
                                    border_radius=20,
                                    gradient=ft.LinearGradient(
                                        colors=[
                                            ft.Colors.with_opacity(0.03, ft.Colors.PURPLE_500),
                                            ft.Colors.with_opacity(0.01, ft.Colors.SURFACE)
                                        ],
                                        begin=ft.alignment.top_left,
                                        end=ft.alignment.bottom_right
                                    ),
                                    border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.PURPLE_500))
                                )
                            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                            expand=3,
                            padding=ft.padding.all(12)
                        ),
                        
                        # Legend section with enhanced styling
                        ft.Container(
                            content=ft.Column([
                                ft.Container(
                                    content=ft.Row([
                                        ft.Icon(ft.Icons.LIST_ROUNDED, size=18, color=ft.Colors.PURPLE_500),
                                        ft.Text("Top Genres", weight=ft.FontWeight.BOLD, size=16)
                                    ], spacing=10),
                                    padding=ft.padding.symmetric(horizontal=14, vertical=10),
                                    bgcolor=ft.Colors.with_opacity(0.08, ft.Colors.PURPLE_500),
                                    border_radius=14
                                ),
                                ft.Container(height=12),
                                ft.Container(
                                    content=ft.Column(
                                        ref=self.genre_legend, 
                                        controls=[], 
                                        scroll=ft.ScrollMode.ADAPTIVE,
                                        spacing=10
                                    ),
                                    height=260,
                                    padding=ft.padding.all(8)
                                )
                            ]),
                            expand=2
                        )
                    ], height=300, vertical_alignment=ft.CrossAxisAlignment.START)
                ])
            ),
            border_radius=24,
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0.05, ft.Colors.PURPLE_500),
                    ft.Colors.with_opacity(0.02, ft.Colors.SURFACE)
                ],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            border=ft.border.all(2, ft.Colors.with_opacity(0.12, ft.Colors.PURPLE_500)),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=24,
                color=ft.Colors.with_opacity(0.08, ft.Colors.PURPLE_500),
                offset=ft.Offset(0, 8)
            ),
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
        )

        return ft.Container(
            content=ft.Column(
                scroll=ft.ScrollMode.ADAPTIVE,
                spacing=32,
                controls=[
                    # Modern header with gradient background
                    ft.Container(
                        content=ft.Row([
                            ft.Container(
                                content=ft.Icon(ft.Icons.ANALYTICS_ROUNDED, size=38, color=ft.Colors.WHITE),
                                gradient=ft.LinearGradient(
                                    colors=[ft.Colors.PRIMARY, ft.Colors.with_opacity(0.7, ft.Colors.PRIMARY)],
                                    begin=ft.alignment.top_left,
                                    end=ft.alignment.bottom_right
                                ),
                                padding=18,
                                border_radius=22,
                                shadow=ft.BoxShadow(
                                    spread_radius=1,
                                    blur_radius=16,
                                    color=ft.Colors.with_opacity(0.35, ft.Colors.PRIMARY),
                                    offset=ft.Offset(0, 5)
                                ),
                                animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
                            ),
                            ft.Column([
                                ft.Text("Statistics & Analytics", size=32, weight=ft.FontWeight.W_800,
                                       style=ft.TextStyle(letter_spacing=0.5)),
                                ft.Text("Deep insights into your collection", size=15, color=ft.Colors.ON_SURFACE_VARIANT, 
                                       italic=True, weight=ft.FontWeight.W_400)
                            ], spacing=6, expand=True),
                            ft.Container(
                                content=ft.Row([
                                    self.stats_loading_indicator.current,
                                    ft.Container(
                                        content=self.stats_refresh_button.current,
                                        gradient=ft.LinearGradient(
                                            colors=[
                                                ft.Colors.with_opacity(0.08, ft.Colors.PRIMARY),
                                                ft.Colors.with_opacity(0.03, ft.Colors.SURFACE)
                                            ]
                                        ),
                                        border_radius=14,
                                        padding=4
                                    )
                                ], spacing=8),
                                padding=ft.padding.all(8)
                            )
                        ], spacing=20, alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER),
                        padding=ft.padding.symmetric(horizontal=24, vertical=20),
                        border_radius=24,
                        gradient=ft.LinearGradient(
                            colors=[
                                ft.Colors.with_opacity(0.06, ft.Colors.PRIMARY),
                                ft.Colors.with_opacity(0.02, ft.Colors.SURFACE)
                            ],
                            begin=ft.alignment.top_left,
                            end=ft.alignment.bottom_right
                        ),
                        border=ft.border.all(2, ft.Colors.with_opacity(0.15, ft.Colors.PRIMARY)),
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=20,
                            color=ft.Colors.with_opacity(0.08, ft.Colors.PRIMARY),
                            offset=ft.Offset(0, 6)
                        )
                    ),

                    # Modern filters section with enhanced styling
                    ft.Container(
                        content=ft.Column([
                            ft.Row([
                                ft.Icon(ft.Icons.FILTER_ALT_ROUNDED, color=ft.Colors.SECONDARY, size=22),
                                ft.Text("Filters & Options", style=ft.TextThemeStyle.TITLE_MEDIUM, weight=ft.FontWeight.W_700),
                            ], spacing=12),
                            ft.Container(height=8),
                            ft.Divider(height=1, color=ft.Colors.with_opacity(0.12, ft.Colors.OUTLINE)),
                            ft.Container(height=12),
                            ft.Row([
                                ft.Container(
                                    content=ft.Column([
                                        ft.Row([
                                            ft.Icon(ft.Icons.CALENDAR_TODAY_ROUNDED, size=16, color=ft.Colors.BLUE_500),
                                            ft.Text("Time Period", size=13, color=ft.Colors.ON_SURFACE, weight=ft.FontWeight.W_600)
                                        ], spacing=8),
                                        ft.Container(height=6),
                                        self.stats_year_filter.current
                                    ], spacing=4),
                                    padding=ft.padding.all(18),
                                    border_radius=18,
                                    bgcolor=ft.Colors.with_opacity(0.04, ft.Colors.SURFACE),
                                    border=ft.border.all(1.5, ft.Colors.with_opacity(0.12, ft.Colors.BLUE_500)),
                                    expand=True,
                                    shadow=ft.BoxShadow(
                                        spread_radius=0,
                                        blur_radius=8,
                                        color=ft.Colors.with_opacity(0.04, ft.Colors.BLUE_500),
                                        offset=ft.Offset(0, 2)
                                    )
                                ),
                                ft.Container(width=16),
                                ft.Container(
                                    content=ft.Column([
                                        ft.Row([
                                            ft.Icon(ft.Icons.CATEGORY_ROUNDED, size=16, color=ft.Colors.GREEN_500),
                                            ft.Text("Content Type", size=13, color=ft.Colors.ON_SURFACE, weight=ft.FontWeight.W_600)
                                        ], spacing=8),
                                        ft.Container(height=6),
                                        stats_entry_type_filter_button
                                    ], spacing=4),
                                    padding=ft.padding.all(18),
                                    border_radius=18,
                                    bgcolor=ft.Colors.with_opacity(0.04, ft.Colors.SURFACE),
                                    border=ft.border.all(1.5, ft.Colors.with_opacity(0.12, ft.Colors.GREEN_500)),
                                    expand=True,
                                    shadow=ft.BoxShadow(
                                        spread_radius=0,
                                        blur_radius=8,
                                        color=ft.Colors.with_opacity(0.04, ft.Colors.GREEN_500),
                                        offset=ft.Offset(0, 2)
                                    )
                                )
                            ], vertical_alignment=ft.CrossAxisAlignment.START)
                        ], spacing=8),
                        padding=24,
                        border_radius=22,
                        gradient=ft.LinearGradient(
                            colors=[
                                ft.Colors.with_opacity(0.04, ft.Colors.SECONDARY),
                                ft.Colors.with_opacity(0.01, ft.Colors.SURFACE)
                            ],
                            begin=ft.alignment.top_left,
                            end=ft.alignment.bottom_right
                        ),
                        border=ft.border.all(2, ft.Colors.with_opacity(0.12, ft.Colors.SECONDARY)),
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=18,
                            color=ft.Colors.with_opacity(0.06, ft.Colors.SECONDARY),
                            offset=ft.Offset(0, 5)
                        )
                    ),

                    # Overview statistics
                    overview_stats,

                    # Main genre breakdown
                    genre_breakdown_card,

                    # Rating Distribution with enhanced styling
                    ft.Container(
                        content=ft.Container(
                            padding=32,
                            content=ft.Column([
                                # Header with gradient icon
                                ft.Row([
                                    ft.Container(
                                        content=ft.Icon(ft.Icons.BAR_CHART_ROUNDED, color=ft.Colors.WHITE, size=28),
                                        gradient=ft.LinearGradient(
                                            colors=[ft.Colors.BLUE_500, ft.Colors.LIGHT_BLUE_700],
                                            begin=ft.alignment.top_left,
                                            end=ft.alignment.bottom_right
                                        ),
                                        padding=14,
                                        border_radius=18,
                                        shadow=ft.BoxShadow(
                                            spread_radius=0,
                                            blur_radius=12,
                                            color=ft.Colors.with_opacity(0.3, ft.Colors.BLUE_500),
                                            offset=ft.Offset(0, 4)
                                        )
                                    ),
                                    ft.Column([
                                        ft.Text("Rating Distribution", style=ft.TextThemeStyle.TITLE_LARGE, weight=ft.FontWeight.W_700),
                                        ft.Text("How you rate your collection", size=13, color=ft.Colors.ON_SURFACE_VARIANT, italic=True)
                                    ], spacing=4)
                                ], spacing=16),
                                
                                ft.Container(height=8),
                                ft.Divider(height=1, color=ft.Colors.with_opacity(0.15, ft.Colors.OUTLINE)),
                                ft.Container(height=16),
                                
                                # Stats summary with gradient backgrounds
                                ft.Row([
                                    ft.Container(
                                        content=ft.Column([
                                            ft.Row([
                                                ft.Icon(ft.Icons.STAR_ROUNDED, color=ft.Colors.AMBER_300, size=20),
                                                ft.Text("Most Common", size=13, color=ft.Colors.WHITE70, weight=ft.FontWeight.W_500)
                                            ], spacing=8, alignment=ft.MainAxisAlignment.CENTER),
                                            ft.Text(ref=self.rating_most_common, value="N/A", size=24, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
                                        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=8),
                                        padding=20,
                                        gradient=ft.LinearGradient(
                                            colors=[ft.Colors.AMBER_600, ft.Colors.ORANGE_700],
                                            begin=ft.alignment.top_left,
                                            end=ft.alignment.bottom_right
                                        ),
                                        border_radius=18,
                                        border=ft.border.all(2, ft.Colors.with_opacity(0.3, ft.Colors.AMBER_200)),
                                        expand=True,
                                        shadow=ft.BoxShadow(
                                            spread_radius=0,
                                            blur_radius=16,
                                            color=ft.Colors.with_opacity(0.25, ft.Colors.AMBER_600),
                                            offset=ft.Offset(0, 4)
                                        )
                                    ),
                                    ft.Container(
                                        content=ft.Column([
                                            ft.Row([
                                                ft.Icon(ft.Icons.FORMAT_LIST_NUMBERED_ROUNDED, color=ft.Colors.BLUE_300, size=20),
                                                ft.Text("Total Rated", size=13, color=ft.Colors.WHITE70, weight=ft.FontWeight.W_500)
                                            ], spacing=8, alignment=ft.MainAxisAlignment.CENTER),
                                            ft.Text(ref=self.rating_total_count, value="0 entries", size=24, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
                                        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=8),
                                        padding=20,
                                        gradient=ft.LinearGradient(
                                            colors=[ft.Colors.BLUE_600, ft.Colors.INDIGO_700],
                                            begin=ft.alignment.top_left,
                                            end=ft.alignment.bottom_right
                                        ),
                                        border_radius=18,
                                        border=ft.border.all(2, ft.Colors.with_opacity(0.3, ft.Colors.BLUE_200)),
                                        expand=True,
                                        shadow=ft.BoxShadow(
                                            spread_radius=0,
                                            blur_radius=16,
                                            color=ft.Colors.with_opacity(0.25, ft.Colors.BLUE_600),
                                            offset=ft.Offset(0, 4)
                                        )
                                    )
                                ], spacing=20),
                                
                                ft.Container(height=8),
                                ft.Divider(height=1, color=ft.Colors.with_opacity(0.15, ft.Colors.OUTLINE)),
                                ft.Container(height=16),
                                
                                # Bar chart container
                                ft.Container(
                                    ref=self.rating_chart_container,
                                    content=ft.Column([
                                        ft.Container(
                                            content=ft.Row([
                                                ft.Icon(ft.Icons.INSIGHTS_ROUNDED, size=20, color=ft.Colors.BLUE_500),
                                                ft.Text("Rating Breakdown", weight=ft.FontWeight.W_600, size=17)
                                            ], spacing=10),
                                            padding=ft.padding.symmetric(horizontal=12, vertical=8),
                                            bgcolor=ft.Colors.with_opacity(0.08, ft.Colors.BLUE_500),
                                            border_radius=12
                                        ),
                                        ft.Container(height=12),
                                        ft.Container(
                                            content=ft.Column(ref=self.rating_bars_column, controls=[], spacing=6),
                                            padding=ft.padding.all(8)
                                        )
                                    ], spacing=4),
                                    visible=True
                                ),
                                
                                # Empty state
                                ft.Container(
                                    ref=self.rating_empty_state,
                                    content=ft.Column([
                                        ft.Container(
                                            content=ft.Icon(ft.Icons.STAR_BORDER_ROUNDED, size=72, color=ft.Colors.BLUE_300),
                                            gradient=ft.LinearGradient(
                                                colors=[
                                                    ft.Colors.with_opacity(0.1, ft.Colors.BLUE_500),
                                                    ft.Colors.with_opacity(0.05, ft.Colors.SURFACE)
                                                ]
                                            ),
                                            padding=28,
                                            border_radius=100,
                                            border=ft.border.all(2, ft.Colors.with_opacity(0.2, ft.Colors.BLUE_500))
                                        ),
                                        ft.Text("No rated entries yet", size=18, weight=ft.FontWeight.W_600, color=ft.Colors.ON_SURFACE),
                                        ft.Text("Start rating your entries to see the distribution", size=13, color=ft.Colors.ON_SURFACE_VARIANT, text_align=ft.TextAlign.CENTER)
                                    ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=16),
                                    padding=50,
                                    visible=False
                                )
                            ], spacing=12)
                        ),
                        border_radius=24,
                        gradient=ft.LinearGradient(
                            colors=[
                                ft.Colors.with_opacity(0.05, ft.Colors.BLUE_500),
                                ft.Colors.with_opacity(0.02, ft.Colors.SURFACE)
                            ],
                            begin=ft.alignment.top_left,
                            end=ft.alignment.bottom_right
                        ),
                        border=ft.border.all(2, ft.Colors.with_opacity(0.12, ft.Colors.BLUE_500)),
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=24,
                            color=ft.Colors.with_opacity(0.08, ft.Colors.BLUE_500),
                            offset=ft.Offset(0, 8)
                        ),
                        animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
                    ),

                    # Expandable breakdown cards with modern header
                    ft.Column([
                        ft.Container(
                            content=ft.Row([
                                ft.Icon(ft.Icons.VIEW_MODULE_ROUNDED, color=ft.Colors.TERTIARY, size=24),
                                ft.Text("Detailed Breakdowns", style=ft.TextThemeStyle.TITLE_LARGE, weight=ft.FontWeight.W_700)
                            ], spacing=12),
                            padding=ft.padding.symmetric(horizontal=8, vertical=12)
                        ),
                        self._create_expandable_breakdown_card(
                            self.platform_chart_container, self.platform_pie_chart, self.platform_legend,
                            "Platform Distribution", ft.Icons.DEVICES_ROUNDED, ft.Colors.BLUE_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.author_chart_container, self.author_pie_chart, self.author_legend,
                            "Author Analysis", ft.Icons.PERSON_ROUNDED, ft.Colors.GREEN_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.artist_chart_container, self.artist_pie_chart, self.artist_legend,
                            "Artist Analysis", ft.Icons.HEADSET_ROUNDED, ft.Colors.CYAN_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.director_chart_container, self.director_pie_chart, self.director_legend,
                            "Studio Breakdown", ft.Icons.BUSINESS_ROUNDED, ft.Colors.ORANGE_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.actress_chart_container, self.actress_pie_chart, self.actress_legend,
                            "Actress Statistics", ft.Icons.FACE_ROUNDED, ft.Colors.PINK_400
                        ),
                        self._create_expandable_breakdown_card(
                            self.version_chart_container, self.version_pie_chart, self.version_legend,
                            "Version Analysis", ft.Icons.LAYERS_ROUNDED, ft.Colors.PURPLE_400
                        ),
                    ], spacing=8),

                    ft.Divider(height=32, color=ft.Colors.with_opacity(0.1, ft.Colors.OUTLINE)),

                    # Enhanced settings section
                    self._create_settings_section()
                ]
            ),
            padding=ft.padding.symmetric(horizontal=28, vertical=20),
            expand=True,
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
        )
