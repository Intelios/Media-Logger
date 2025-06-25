import flet as ft
from datetime import datetime
import os
from collections import Counter
import re

# Constants and configurations
APP_TITLE = "Media Logger"
YEARS = ["2023","2024","2025"]
GENRE_SEPARATOR = ", "
DEFAULT_IMAGE_URL = "https://via.placeholder.com/300x150.png?text=No+Image"
THEMES = {
    "Deep Purple (Dark)": {"seed": ft.colors.DEEP_PURPLE, "mode": ft.ThemeMode.DARK},
    "Ocean Blue (Dark)": {"seed": ft.colors.BLUE, "mode": ft.ThemeMode.DARK},
    "Forest Green (Dark)": {"seed": ft.colors.GREEN, "mode": ft.ThemeMode.DARK},
    "Sunny Amber (Dark)": {"seed": ft.colors.AMBER, "mode": ft.ThemeMode.DARK},
    "Crimson Red (Dark)": {"seed": ft.colors.RED, "mode": ft.ThemeMode.DARK},
    "Indigo Night (Dark)": {"seed": ft.colors.INDIGO, "mode": ft.ThemeMode.DARK},
    "Teal Waters (Dark)": {"seed": ft.colors.TEAL, "mode": ft.ThemeMode.DARK},
    "Slate Grey (Dark)": {"seed": ft.colors.BLUE_GREY, "mode": ft.ThemeMode.DARK},
    "Classic Light": {"seed": ft.colors.BLUE_GREY, "mode": ft.ThemeMode.LIGHT},
    "Minty Light": {"seed": ft.colors.GREEN_ACCENT, "mode": ft.ThemeMode.LIGHT},
    "Sky Blue Light": {"seed": ft.colors.LIGHT_BLUE, "mode": ft.ThemeMode.LIGHT},
}
DEFAULT_THEME_NAME = "Deep Purple (Dark)"
ENTRY_TYPE_OPTIONS = [
    ft.dropdown.Option("Movie"), ft.dropdown.Option("Show"), ft.dropdown.Option("Anime"),
    ft.dropdown.Option("Book"), ft.dropdown.Option("K-Drama"), ft.dropdown.Option("JAV"), ft.dropdown.Option("Hentai"),
    ft.dropdown.Option("Game"), ft.dropdown.Option("Adult Visual Novel"),
    ft.dropdown.Option("Other"),
]
ALL_ENTRY_TYPES_STR = [opt.key for opt in ENTRY_TYPE_OPTIONS if opt.key]
SAVED_YEAR_VIEW_FILTER_KEY = "year_view_last_filter_v2"
SAVED_STATS_VIEW_FILTER_KEY = "stats_view_last_filter_v2"
SAVED_SEARCH_VIEW_FILTER_KEY = "search_view_last_filter_v2"
SEARCH_FIELD_OPTIONS = [
    {"key": "name", "label": "Title/Name"},
    {"key": "author", "label": "Author"},
    {"key": "platform", "label": "Platform"},
    {"key": "director", "label": "Studio"},
    {"key": "actress", "label": "Actress"},
    {"key": "update_version", "label": "Version"},
    {"key": "genre", "label": "Genre"},
    {"key": "description", "label": "Description"},
]

# UI related helper functions

def create_rating_badge(score):
    score_text = "N/A"; bgcolor = ft.colors.with_opacity(0.5, ft.colors.ON_SURFACE_VARIANT); text_color = ft.colors.WHITE
    if score is not None:
        try:
            score_val = int(score); score_text = str(score_val)
            if 0 <= score_val <= 10:
                if score_val == 10: bgcolor = ft.colors.LIGHT_GREEN_ACCENT_400; text_color = ft.colors.BLACK
                elif score_val >= 7: bgcolor = ft.colors.GREEN_600; text_color = ft.colors.WHITE
                elif score_val >= 5: bgcolor = ft.colors.YELLOW_700; text_color = ft.colors.BLACK
                elif score_val >= 2: bgcolor = ft.colors.RED_700; text_color = ft.colors.WHITE
                else: bgcolor = ft.colors.RED_500; text_color = ft.colors.WHITE
        except (ValueError, TypeError): pass
    return ft.Container(
        content=ft.Text(score_text, size=12, weight=ft.FontWeight.BOLD, color=text_color, text_align=ft.TextAlign.CENTER),
        width=30, height=30, shape=ft.BoxShape.CIRCLE, bgcolor=bgcolor, alignment=ft.alignment.center,
        tooltip=f"Score: {score_text}" if score is not None else "Score: Not Rated"
    )

def get_entry_type_icon_name(entry_type_str: str) -> str:
    entry_type_str_lower = (entry_type_str or "media").lower()
    if "movie" in entry_type_str_lower: return ft.icons.MOVIE_OUTLINED
    if "show" in entry_type_str_lower: return ft.icons.TV_OUTLINED
    if "anime" in entry_type_str_lower: return ft.icons.ANIMATION_OUTLINED
    if "book" in entry_type_str_lower: return ft.icons.BOOK_OUTLINED
    if "k-drama" in entry_type_str_lower: return ft.icons.LIVE_TV_OUTLINED
    if "jav" in entry_type_str_lower: return ft.icons.VIDEO_CAMERA_BACK_OUTLINED
    if "hentai" in entry_type_str_lower: return ft.icons.FILTER_FRAMES_OUTLINED
    if "game" in entry_type_str_lower: return ft.icons.SPORTS_ESPORTS_OUTLINED
    if "adult visual novel" in entry_type_str_lower: return ft.icons.MENU_BOOK_OUTLINED
    return ft.icons.LABEL_OUTLINED

def get_genre_icon_name(genre_str: str) -> str:
    genre_str_lower = (genre_str or "").lower()
    if "action" in genre_str_lower: return ft.icons.BOLT_OUTLINED
    if "drama" in genre_str_lower: return ft.icons.THEATER_COMEDY_OUTLINED
    if "sci-fi" in genre_str_lower or "science fiction" in genre_str_lower : return ft.icons.ROCKET_LAUNCH_OUTLINED
    if "war" in genre_str_lower: return ft.icons.SHIELD_OUTLINED
    if "mystery" in genre_str_lower: return ft.icons.QUESTION_MARK_OUTLINED
    if "thriller" in genre_str_lower: return ft.icons.FLASHLIGHT_ON_OUTLINED
    if "horror" in genre_str_lower: return ft.icons.SICK_OUTLINED
    if "comedy" in genre_str_lower: return ft.icons.SENTIMENT_VERY_SATISFIED_OUTLINED
    if "romance" in genre_str_lower: return ft.icons.FAVORITE_BORDER_OUTLINED
    if "fantasy" in genre_str_lower: return ft.icons.AUTO_FIX_HIGH_OUTLINED
    if "adventure" in genre_str_lower: return ft.icons.EXPLORE_OUTLINED
    if "slice of life" in genre_str_lower: return ft.icons.CAKE_OUTLINED
    if "supernatural" in genre_str_lower: return ft.icons.AUTO_STORIES_OUTLINED
    if "sports" in genre_str_lower: return ft.icons.SPORTS_VOLLEYBALL_OUTLINED
    if "music" in genre_str_lower: return ft.icons.MUSIC_NOTE_OUTLINED
    if "historical" in genre_str_lower: return ft.icons.ACCOUNT_BALANCE_OUTLINED
    if "school" in genre_str_lower: return ft.icons.SCHOOL_OUTLINED
    return ft.icons.LOCAL_OFFER_OUTLINED

def create_gallery_card(page, jav_item, delete_callback, edit_callback, show_desc_callback):
    name = jav_item.get('name', 'Unknown Title')
    db_image_value = jav_item.get('image_url')
    image_src_for_flet = DEFAULT_IMAGE_URL

    if db_image_value:
        if db_image_value.lower().startswith("http://") or db_image_value.lower().startswith("https://"):
            image_src_for_flet = db_image_value
        else:
            full_local_path_check = os.path.join("assets", db_image_value) 
            if os.path.exists(full_local_path_check):
                image_src_for_flet = db_image_value 

    entry_type_str = jav_item.get('entry_type', 'Media')
    genres_str = jav_item.get('genre', '')
    
    completion_date_str_db = jav_item.get('completion_date', 'N/A') 
    display_completion_date = 'N/A' 

    if completion_date_str_db and completion_date_str_db != 'N/A':
        try:
            date_obj = datetime.strptime(completion_date_str_db, '%Y-%m-%d')
            day = date_obj.day
            if 4 <= day <= 20 or 24 <= day <= 30:
                suffix = "th"
            else:
                suffix = ["st", "nd", "rd"][day % 10 - 1]
            
            if os.name == 'nt': 
                day_format_char = '#' 
            else: 
                day_format_char = '-'
            display_completion_date = date_obj.strftime(f'%{day_format_char}d{suffix} %B %Y')

        except ValueError:
            display_completion_date = completion_date_str_db 
            print(f"Warning: Could not parse date '{completion_date_str_db}' for display in gallery card for '{name}'.")

    score = jav_item.get('review_score')
    description_value = jav_item.get('description')
    has_description = bool(description_value and description_value.strip())

    is_rewatch = jav_item.get('is_rewatch') == 1
    owns_local_copy = jav_item.get('own_local_copy') == 1

    parsed_genres = parse_genres(genres_str)
    
    # Enhanced styling constants
    CARD_RADIUS = 16
    IMAGE_HEIGHT = 160
    CONTENT_PADDING = ft.padding.symmetric(horizontal=20, vertical=16)
    MAIN_SPACING = 14
    
    # Typography
    TITLE_SIZE = 17
    SUBTITLE_SIZE = 13
    TAG_SIZE = 11
    DATE_SIZE = 12
    
    # Colors and styling
    def get_entry_type_styling(entry_type):
        styles = {
            'Game': {
                'bg': ft.colors.BLUE_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.BLUE_600, ft.colors.BLUE_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'Movie': {
                'bg': ft.colors.RED_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.RED_600, ft.colors.RED_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'Show': {
                'bg': ft.colors.PURPLE_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.PURPLE_600, ft.colors.PURPLE_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'K-Drama': {
                'bg': ft.colors.GREEN_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.GREEN_600, ft.colors.GREEN_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'Anime': {
                'bg': ft.colors.PINK_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.PINK_600, ft.colors.PINK_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'Book': {
                'bg': ft.colors.BROWN_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.BROWN_600, ft.colors.BROWN_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'Hentai': {
                'bg': ft.colors.DEEP_PURPLE_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.DEEP_PURPLE_600, ft.colors.DEEP_PURPLE_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'JAV': {
                'bg': ft.colors.INDIGO_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.INDIGO_600, ft.colors.INDIGO_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'Adult Visual Novel': {
                'bg': ft.colors.DEEP_ORANGE_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.DEEP_ORANGE_600, ft.colors.DEEP_ORANGE_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
            'Other': {
                'bg': ft.colors.BLUE_GREY_600,
                'fg': ft.colors.WHITE,
                'gradient': ft.LinearGradient(
                    colors=[ft.colors.BLUE_GREY_600, ft.colors.BLUE_GREY_700],
                    begin=ft.alignment.top_left,
                    end=ft.alignment.bottom_right
                )
            },
        }
        return styles.get(entry_type, styles['Other'])

    # Enhanced title with better typography
    title_text = ft.Text(
        name, 
        weight=ft.FontWeight.W_600, 
        size=TITLE_SIZE, 
        max_lines=2,
        overflow=ft.TextOverflow.ELLIPSIS, 
        color=ft.colors.ON_SURFACE,
        style=ft.TextStyle(
            letter_spacing=0.2,
        )
    )

    # Enhanced entry type badge with gradient
    entry_type_style = get_entry_type_styling(entry_type_str)
    entry_type_icon_name = get_entry_type_icon_name(entry_type_str)
    
    entry_type_badge = ft.Container(
        content=ft.Row(
            [
                ft.Icon(entry_type_icon_name, size=14, color=entry_type_style['fg']),
                ft.Text(
                    entry_type_str, 
                    size=TAG_SIZE, 
                    color=entry_type_style['fg'], 
                    weight=ft.FontWeight.W_600,
                    style=ft.TextStyle(letter_spacing=0.3)
                )
            ],
            spacing=6, 
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
            tight=True,
        ),
        gradient=entry_type_style['gradient'],
        padding=ft.padding.symmetric(horizontal=12, vertical=6),
        border_radius=ft.border_radius.all(20),
        shadow=ft.BoxShadow(
            spread_radius=0,
            blur_radius=4,
            color=ft.colors.with_opacity(0.3, entry_type_style['bg']),
            offset=ft.Offset(0, 2),
        )
    )
    
    # Enhanced rating badge
    def create_enhanced_rating_badge(score):
        if score is None:
            return ft.Container()
        
        # Color coding for different score ranges
        if score >= 9:
            color = ft.colors.GREEN_600
            bg_color = ft.colors.with_opacity(0.1, ft.colors.GREEN_600)
        elif score >= 7:
            color = ft.colors.BLUE_600
            bg_color = ft.colors.with_opacity(0.1, ft.colors.BLUE_600)
        elif score >= 5:
            color = ft.colors.ORANGE_600
            bg_color = ft.colors.with_opacity(0.1, ft.colors.ORANGE_600)
        else:
            color = ft.colors.RED_600
            bg_color = ft.colors.with_opacity(0.1, ft.colors.RED_600)
        
        return ft.Container(
            content=ft.Row(
                [
                    ft.Icon(ft.icons.STAR_ROUNDED, size=14, color=color),
                    ft.Text(
                        f"{score:.1f}", 
                        size=TAG_SIZE + 1, 
                        color=color, 
                        weight=ft.FontWeight.W_700
                    )
                ],
                spacing=4,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
                tight=True,
            ),
            bgcolor=bg_color,
            padding=ft.padding.symmetric(horizontal=10, vertical=6),
            border_radius=ft.border_radius.all(20),
            border=ft.border.all(1, ft.colors.with_opacity(0.2, color))
        )

    rating_badge = create_enhanced_rating_badge(score)

    # Enhanced genre tags
    def create_genre_tag(genre_text):
        return ft.Container(
            content=ft.Text(
                genre_text, 
                size=TAG_SIZE - 1, 
                color=ft.colors.ON_SURFACE_VARIANT,
                weight=ft.FontWeight.W_500,
                max_lines=1,
                overflow=ft.TextOverflow.ELLIPSIS
            ),
            bgcolor=ft.colors.with_opacity(0.08, ft.colors.ON_SURFACE),
            padding=ft.padding.symmetric(horizontal=8, vertical=4),
            border_radius=ft.border_radius.all(12),
            border=ft.border.all(1, ft.colors.with_opacity(0.12, ft.colors.ON_SURFACE))
        )

    genre_widgets_row = ft.Row(
        wrap=True, 
        spacing=6, 
        run_spacing=6,
        tight=True,
    )
    
    if parsed_genres:
        display_genres = parsed_genres[:3]  # Show fewer genres for cleaner look
        for genre_text in display_genres:
            genre_widgets_row.controls.append(create_genre_tag(genre_text))
        
        if len(parsed_genres) > 3:
            remaining_genres = parsed_genres[3:]
            tooltip_text = ", ".join(remaining_genres)
            genre_widgets_row.controls.append(
                ft.Container(
                    content=ft.Text(
                        f"+{len(parsed_genres) - 3}", 
                        size=TAG_SIZE - 1,
                        color=ft.colors.PRIMARY,
                        weight=ft.FontWeight.W_600
                    ),
                    bgcolor=ft.colors.with_opacity(0.1, ft.colors.PRIMARY),
                    padding=ft.padding.symmetric(horizontal=8, vertical=4),
                    border_radius=ft.border_radius.all(12),
                    border=ft.border.all(1, ft.colors.with_opacity(0.3, ft.colors.PRIMARY)),
                    tooltip=tooltip_text,
                )
            )

    # Enhanced indicators with better styling
    def create_indicator(icon, tooltip, color):
        return ft.Container(
            content=ft.Icon(icon, size=16, color=color),
            bgcolor=ft.colors.with_opacity(0.1, color),
            padding=ft.padding.all(6),
            border_radius=ft.border_radius.all(20),
            tooltip=tooltip,
            border=ft.border.all(1, ft.colors.with_opacity(0.3, color))
        )

    bottom_indicators_list = []
    if is_rewatch:
        bottom_indicators_list.append(
            create_indicator(ft.icons.REPLAY_ROUNDED, "Rewatched", ft.colors.AMBER_600)
        )
    if owns_local_copy:
        bottom_indicators_list.append(
            create_indicator(ft.icons.DOWNLOAD_DONE_ROUNDED, "Owns Local Copy", ft.colors.GREEN_600)
        )

    bottom_indicators_row = ft.Row(
        controls=bottom_indicators_list, 
        spacing=8, 
        vertical_alignment=ft.CrossAxisAlignment.CENTER
    )

    # Enhanced options menu
    options_button = ft.Container(
        content=ft.PopupMenuButton(
            content=ft.Icon(ft.icons.MORE_VERT_ROUNDED, color=ft.colors.WHITE, size=18), 
            tooltip="Options",
            items=[
                ft.PopupMenuItem(
                    text="Edit", 
                    icon=ft.icons.EDIT_OUTLINED, 
                    on_click=lambda _, item=jav_item: edit_callback(item)
                ),
                ft.PopupMenuItem(
                    text="View Description", 
                    icon=ft.icons.DESCRIPTION_OUTLINED, 
                    on_click=lambda _, item=jav_item: show_desc_callback(item), 
                    disabled=not has_description
                ),
                ft.PopupMenuItem(),
                ft.PopupMenuItem(
                    text="Delete", 
                    icon=ft.icons.DELETE_OUTLINE, 
                    on_click=lambda _, item_id=jav_item['id'], item_name=jav_item['name']: delete_callback(item_id, item_name)
                )
            ]
        ),
        bgcolor=ft.colors.with_opacity(0.4, ft.colors.BLACK87),
        padding=ft.padding.all(8),
        border_radius=ft.border_radius.all(20),
        shadow=ft.BoxShadow(
            spread_radius=0,
            blur_radius=8,
            color=ft.colors.with_opacity(0.3, ft.colors.BLACK),
            offset=ft.Offset(0, 2),
        )
    )

    # Enhanced image with overlay gradient
    image_stack = ft.Stack(
        [
            ft.Container(
                content=ft.Image(
                    src=image_src_for_flet, 
                    height=IMAGE_HEIGHT, 
                    width=float('inf'), 
                    fit=ft.ImageFit.COVER,
                    error_content=ft.Container( 
                        content=ft.Column(
                            [
                                ft.Icon(ft.icons.BROKEN_IMAGE, size=40, color=ft.colors.ON_SURFACE_VARIANT),
                                ft.Text("Image Error", size=12, color=ft.colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500)
                            ],
                            horizontal_alignment=ft.CrossAxisAlignment.CENTER, 
                            alignment=ft.MainAxisAlignment.CENTER, 
                            spacing=8,
                        ),
                        height=IMAGE_HEIGHT, 
                        width=float('inf'), 
                        bgcolor=ft.colors.SURFACE_VARIANT,
                        alignment=ft.alignment.center
                    )
                ),
                border_radius=ft.border_radius.only(top_left=CARD_RADIUS, top_right=CARD_RADIUS),
                clip_behavior=ft.ClipBehavior.HARD_EDGE,
            ),
            # Subtle gradient overlay for better text readability
            ft.Container(
                height=IMAGE_HEIGHT,
                width=float('inf'),
                gradient=ft.LinearGradient(
                    colors=[
                        ft.colors.with_opacity(0, ft.colors.BLACK),
                        ft.colors.with_opacity(0.2, ft.colors.BLACK)
                    ],
                    begin=ft.alignment.top_center,
                    end=ft.alignment.bottom_center
                ),
                border_radius=ft.border_radius.only(top_left=CARD_RADIUS, top_right=CARD_RADIUS),
            ),
            ft.Container(
                content=options_button,
                top=12, 
                right=12,
            )
        ]
    )

    # Enhanced info chips
    def create_info_chip(icon, text, tooltip_prefix):
        return ft.Container(
            content=ft.Row(
                [
                    ft.Icon(icon, size=12, color=ft.colors.ON_SURFACE_VARIANT),
                    ft.Text(
                        text, 
                        size=TAG_SIZE, 
                        color=ft.colors.ON_SURFACE_VARIANT, 
                        weight=ft.FontWeight.W_500, 
                        max_lines=1, 
                        overflow=ft.TextOverflow.ELLIPSIS
                    )
                ],
                spacing=4, 
                vertical_alignment=ft.CrossAxisAlignment.CENTER, 
                tight=True,
            ),
            bgcolor=ft.colors.with_opacity(0.06, ft.colors.ON_SURFACE),
            padding=ft.padding.symmetric(horizontal=8, vertical=4),
            border_radius=ft.border_radius.all(12),
            tooltip=f"{tooltip_prefix}: {text}",
            border=ft.border.all(1, ft.colors.with_opacity(0.08, ft.colors.ON_SURFACE))
        )

    # Type-specific info
    type_specific_info_container = ft.Row(wrap=True, spacing=6, run_spacing=6)

    if jav_item.get('platform'):
        type_specific_info_container.controls.append(
            create_info_chip(ft.icons.VIDEOGAME_ASSET_OUTLINED, jav_item['platform'], "Platform")
        )
    if jav_item.get('author'):
        type_specific_info_container.controls.append(
            create_info_chip(ft.icons.PERSON_OUTLINE, jav_item['author'], "Author")
        )
    if jav_item.get('director'):
        type_specific_info_container.controls.append(
            create_info_chip(ft.icons.BUSINESS_OUTLINED, jav_item['director'], "Studio")
        )
    if jav_item.get('actress'):
        actress_list = parse_multi_value_field(jav_item['actress'])
        for actress_name in actress_list:
            type_specific_info_container.controls.append(
                create_info_chip(ft.icons.WOMAN_2_OUTLINED, actress_name, f"Actress: {actress_name}")
            )
    if jav_item.get('update_version'):
        type_specific_info_container.controls.append(
            create_info_chip(ft.icons.INFO_OUTLINE, jav_item['update_version'], "Version")
        )

    # Build card content
    card_content_controls = [
        # Title section
        ft.Container(
            content=title_text,
            margin=ft.margin.only(bottom=4)
        ),
        
        # Entry type and rating row  
        ft.Row(
            controls=[entry_type_badge, rating_badge] if rating_badge.content else [entry_type_badge],
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
        ),
    ]

    # Add type-specific info if available
    if type_specific_info_container.controls:
        card_content_controls.append(type_specific_info_container)

    # Add genres if available
    if genre_widgets_row.controls:
        card_content_controls.append(genre_widgets_row)
    
    # Bottom section with indicators and date
    card_content_controls.append(
        ft.Row(
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN, 
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
            controls=[
                bottom_indicators_row,
                ft.Text(
                    display_completion_date, 
                    size=DATE_SIZE, 
                    color=ft.colors.ON_SURFACE_VARIANT, 
                    opacity=0.8, 
                    weight=ft.FontWeight.W_500,
                    style=ft.TextStyle(letter_spacing=0.2)
                ),
            ]
        )
    )
    
    card_content = ft.Column(
        controls=card_content_controls,
        spacing=MAIN_SPACING,
        tight=True,
    )

    # Create the final card with enhanced styling
    return ft.Card(
        content=ft.Container(
            content=ft.Column(
                [
                    image_stack,
                    ft.Container(content=card_content, padding=CONTENT_PADDING)
                ],
                spacing=0,
                tight=True
            ),
            clip_behavior=ft.ClipBehavior.HARD_EDGE,
        ),
        elevation=3,
        margin=ft.margin.all(8),
        shape=ft.RoundedRectangleBorder(radius=CARD_RADIUS),
        shadow_color=ft.colors.with_opacity(0.15, ft.colors.BLACK),
        surface_tint_color=ft.colors.SURFACE_TINT,
    )

def parse_genres(genre_str):
    if not genre_str or not genre_str.strip(): return []
    return [genre.strip() for genre in genre_str.split(',') if genre.strip()]

def parse_multi_value_field(field_str: str) -> list[str]:
    """
    Parses a string that might contain multiple values separated by
    commas, semicolons, or slashes.
    """
    if not field_str or not field_str.strip():
        return []
    # Use regex to split by comma, semicolon, or slash, ignoring surrounding whitespace
    items = re.split(r'\s*[,;/]\s*', field_str)
    # Return a clean list with no empty items
    return [item.strip() for item in items if item and item.strip()]

def format_genres(genre_list):
    if not genre_list: return ""
    return GENRE_SEPARATOR.join(sorted([str(g).strip() for g in genre_list if str(g).strip()]))

def _generate_pie_data_from_list(items_list: list, fallback_colors: list):
    """Helper to generate pie chart sections and legend controls from a list of strings."""
    if not items_list:
        pie_sections = [ft.PieChartSection(value=1, title="N/A", color=ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE))]
        legend_controls = [ft.Text("No data for this category.")]
        return pie_sections, legend_controls

    counts = Counter(item for item in items_list if item and str(item).strip())
    if not counts:
        pie_sections = [ft.PieChartSection(value=1, title="N/A", color=ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE))]
        legend_controls = [ft.Text("No data for this category.")]
        return pie_sections, legend_controls

    total_items = sum(counts.values())
    pie_sections = []
    legend_controls = []
    color_index = 0
    
    # --- New Unlimited Logic ---
    # Loop through every single unique item, sorted by most common
    for item, count in counts.most_common():
        percentage = (count / total_items * 100) if total_items > 0 else 0
        color = fallback_colors[color_index % len(fallback_colors)]
        color_index += 1

        pie_sections.append(
            ft.PieChartSection(
                value=percentage,
                title=f"{percentage:.0f}%" if percentage >= 5 else "",
                title_style=ft.TextStyle(size=10, color=ft.colors.WHITE, weight=ft.FontWeight.BOLD),
                color=color,
                radius=60
            )
        )
        legend_controls.append(
            ft.Row([
                ft.Container(width=16, height=16, bgcolor=color, border_radius=3),
                ft.Text(f"{item} ({count})", max_lines=1, overflow=ft.TextOverflow.ELLIPSIS, tooltip=item)
            ], spacing=10)
        )

    return pie_sections, legend_controls
