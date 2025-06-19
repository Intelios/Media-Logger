import flet as ft
import sqlite3
import csv
from datetime import datetime
import sys
import os
from collections import Counter
import math
import traceback # Import for detailed error logging
import shutil # Already imported
import uuid # Already imported
import re

# --- Determine the base path ---
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    base_path = os.path.dirname(sys.executable)
    print(f"Running frozen, base path: {base_path}")
else:
    base_path = os.path.dirname(os.path.abspath(__file__))
    print(f"Running script, base path: {base_path}")

DB_FILE = os.path.join(base_path, "jav_log.db")
ASSETS_DIR = os.path.join(base_path, "assets")
IMAGES_DIR = os.path.join(ASSETS_DIR, "images")
print(f"Database file path: {DB_FILE}")
print(f"Assets directory: {ASSETS_DIR}")
print(f"Images directory: {IMAGES_DIR}")


APP_TITLE = "Media Logger"
YEARS = ["2023","2024","2025"] # TODO: Consider making this dynamic or configurable
GENRE_SEPARATOR = ", "
DEFAULT_IMAGE_URL = "https://via.placeholder.com/300x150.png?text=No+Image"

# --- Theme Definitions ---
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
    ft.dropdown.Option("Book"), # Added
    ft.dropdown.Option("K-Drama"), ft.dropdown.Option("JAV"), ft.dropdown.Option("Hentai"),
    ft.dropdown.Option("Game"), ft.dropdown.Option("Adult Visual Novel"),
    ft.dropdown.Option("Other"),
]
ALL_ENTRY_TYPES_STR = [opt.key for opt in ENTRY_TYPE_OPTIONS if opt.key]

# --- Saved Preferences Keys ---
SAVED_YEAR_VIEW_FILTER_KEY = "year_view_last_filter_v2"
SAVED_STATS_VIEW_FILTER_KEY = "stats_view_last_filter_v2"


# --- Database Handling ---
def init_db():
    conn = None
    try:
        if not os.path.exists(ASSETS_DIR):
            os.makedirs(ASSETS_DIR)
            print(f"Created assets directory: {ASSETS_DIR}")
        if not os.path.exists(IMAGES_DIR):
            os.makedirs(IMAGES_DIR)
            print(f"Created images directory: {IMAGES_DIR}")
        
        print(f"Attempting to connect to database: {DB_FILE}")
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        print("Database connection successful.")
        # Main log table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS javs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                genre TEXT,
                completion_date TEXT,
                review_score INTEGER,
                description TEXT,
                year_completed INTEGER,
                is_rewatch INTEGER DEFAULT 0 NOT NULL CHECK(is_rewatch IN (0, 1)),
                own_local_copy INTEGER DEFAULT 0 NOT NULL CHECK(own_local_copy IN (0, 1)),
                image_url TEXT,
                entry_type TEXT,
                platform TEXT,
                author TEXT,
                director TEXT,
                actress TEXT,
                update_version TEXT
            )
        """)
        # App Settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        table_info = cursor.execute("PRAGMA table_info(javs)").fetchall()
        column_names = [info[1] for info in table_info]

        # Migration for older versions
        if 'own_local_copy' not in column_names:
            print("Adding column 'own_local_copy' to 'javs' table.")
            cursor.execute("ALTER TABLE javs ADD COLUMN own_local_copy INTEGER DEFAULT 0 NOT NULL CHECK(own_local_copy IN (0, 1))")
        if 'image_url' not in column_names:
            print("Adding column 'image_url' to 'javs' table.")
            cursor.execute("ALTER TABLE javs ADD COLUMN image_url TEXT")
        if 'entry_type' not in column_names:
            print("Adding column 'entry_type' to 'javs' table.")
            cursor.execute("ALTER TABLE javs ADD COLUMN entry_type TEXT")
        if 'platform' not in column_names:
            print("Adding column 'platform' to 'javs' table.")
            cursor.execute("ALTER TABLE javs ADD COLUMN platform TEXT")
        if 'author' not in column_names:
            print("Adding column 'author' to 'javs' table.")
            cursor.execute("ALTER TABLE javs ADD COLUMN author TEXT")
        if 'director' not in column_names:
            print("Adding column 'director' to 'javs' table.")
            cursor.execute("ALTER TABLE javs ADD COLUMN director TEXT")
        if 'actress' not in column_names:
            print("Adding column 'actress' to 'javs' table.")
            cursor.execute("ALTER TABLE javs ADD COLUMN actress TEXT")
        if 'update_version' not in column_names:
            print("Adding column 'update_version' to 'javs' table.")
            cursor.execute("ALTER TABLE javs ADD COLUMN update_version TEXT")

        conn.commit()
        print("Database initialized successfully.")
    except sqlite3.Error as e:
        print(f"Database initialization error: {e}")
        traceback.print_exc()
    finally:
        if conn: conn.close()

def get_setting_db(key, default_value=None):
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row[0] if row else default_value
    except sqlite3.Error as e: print(f"Error getting setting '{key}': {e}"); return default_value
    finally:
        if conn: conn.close()

def set_setting_db(key, value):
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
    except sqlite3.Error as e: print(f"Error saving setting '{key}' = '{value}': {e}")
    finally:
        if conn: conn.close()


def add_jav_db(name, genre_str, completion_date_str, score, description, is_rewatch, own_local_copy, image_ref_for_db, entry_type, conditional_data: dict):
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        year_completed = None
        if completion_date_str:
            try: year_completed = datetime.strptime(completion_date_str, '%Y-%m-%d').year
            except (ValueError, TypeError): pass
        rewatch_int = 1 if is_rewatch else 0
        own_local_copy_int = 1 if own_local_copy else 0
        score_to_db = score if score is not None else None
        genre_to_db = genre_str.strip() if genre_str and genre_str.strip() else None
        description_to_db = description.strip() if description and description.strip() else None
        image_to_db = image_ref_for_db.strip() if image_ref_for_db and image_ref_for_db.strip() else None
        entry_type_to_db = entry_type.strip() if entry_type and entry_type.strip() else None
        
        platform_to_db = conditional_data.get("platform", "").strip() or None
        author_to_db = conditional_data.get("author", "").strip() or None
        director_to_db = conditional_data.get("director", "").strip() or None
        actress_to_db = conditional_data.get("actress", "").strip() or None
        version_to_db = conditional_data.get("update_version", "").strip() or None

        cursor.execute(
            "INSERT INTO javs (name, genre, completion_date, review_score, description, year_completed, is_rewatch, own_local_copy, image_url, entry_type, platform, author, director, actress, update_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, genre_to_db, completion_date_str, score_to_db, description_to_db, year_completed, rewatch_int, own_local_copy_int, image_to_db, entry_type_to_db, platform_to_db, author_to_db, director_to_db, actress_to_db, version_to_db)
        )
        conn.commit()
        print(f"Entry added: {name}")
    except sqlite3.Error as e: print(f"Database error adding entry '{name}': {e}")
    finally:
        if conn: conn.close()

def get_javs_by_year_db(year):
    conn = None; javs = []
    try:
        conn = sqlite3.connect(DB_FILE); conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM javs WHERE year_completed = ? ORDER BY completion_date ASC, id ASC", (year,)
        )
        javs = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e: print(f"Database Error getting entries for year {year}: {e}")
    finally:
        if conn: conn.close()
    return javs

def get_all_javs_db():
    conn = None; javs = []
    try:
        conn = sqlite3.connect(DB_FILE); conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM javs ORDER BY completion_date DESC, id DESC"
        )
        javs = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e: print(f"Database Error getting all entries: {e}")
    finally:
        if conn: conn.close()
    return javs

def delete_jav_db(jav_id):
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE); cursor = conn.cursor()
        cursor.execute("DELETE FROM javs WHERE id = ?", (jav_id,)); conn.commit()
        print(f"Entry deleted: ID {jav_id}")
    except sqlite3.Error as e: print(f"Database error deleting entry ID {jav_id}: {e}")
    finally:
        if conn: conn.close()

def update_jav_db(jav_id, name, genre_str, completion_date_str, score, description, is_rewatch, own_local_copy, image_ref_for_db, entry_type, conditional_data: dict):
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE); cursor = conn.cursor()
        year_completed = None
        if completion_date_str:
            try: year_completed = datetime.strptime(completion_date_str, '%Y-%m-%d').year
            except (ValueError, TypeError): pass
        rewatch_int = 1 if is_rewatch else 0
        own_local_copy_int = 1 if own_local_copy else 0
        score_to_db = score if score is not None else None
        genre_to_db = genre_str.strip() if genre_str and genre_str.strip() else None
        description_to_db = description.strip() if description and description.strip() else None
        image_to_db = image_ref_for_db.strip() if image_ref_for_db and image_ref_for_db.strip() else None
        entry_type_to_db = entry_type.strip() if entry_type and entry_type.strip() else None
        
        platform_to_db = conditional_data.get("platform", "").strip() or None
        author_to_db = conditional_data.get("author", "").strip() or None
        director_to_db = conditional_data.get("director", "").strip() or None
        actress_to_db = conditional_data.get("actress", "").strip() or None
        version_to_db = conditional_data.get("update_version", "").strip() or None

        cursor.execute("""
            UPDATE javs SET name = ?, genre = ?, completion_date = ?, review_score = ?, description = ?, year_completed = ?, is_rewatch = ?, own_local_copy = ?, image_url = ?, entry_type = ?, platform = ?, author = ?, director = ?, actress = ?, update_version = ?
            WHERE id = ?
        """, (name, genre_to_db, completion_date_str, score_to_db, description_to_db, year_completed, rewatch_int, own_local_copy_int, image_to_db, entry_type_to_db, platform_to_db, author_to_db, director_to_db, actress_to_db, version_to_db, jav_id))
        conn.commit()
        print(f"Entry updated: ID {jav_id} - {name}")
    except sqlite3.Error as e: print(f"Database error updating entry ID {jav_id}: {e}")
    finally:
        if conn: conn.close()

# --- Helper Functions ---
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

# --- UI Helper Functions ---
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
            full_local_path_check = os.path.join(ASSETS_DIR, db_image_value) 
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
            create_info_chip(ft.icons.CAMERA_ROLL_OUTLINED, jav_item['director'], "Director")
        )
    if jav_item.get('actress'):
        type_specific_info_container.controls.append(
            create_info_chip(ft.icons.WOMAN_2_OUTLINED, jav_item['actress'], "Actress")
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

# --- Helper Functions for Dynamic Forms ---
def update_conditional_fields(selected_type: str, container: ft.Column, initial_data: dict | None = None):
    """Dynamically adds form fields based on the selected entry type."""
    container.controls.clear()
    
    if selected_type == "Game":
        platform_options = [
            ft.dropdown.Option("PC"), ft.dropdown.Option("PlayStation"), ft.dropdown.Option("Xbox"),
            ft.dropdown.Option("Nintendo Switch"), ft.dropdown.Option("Mobile"), ft.dropdown.Option("Other"),
        ]
        container.controls.append(ft.Dropdown(
            label="Platform", options=platform_options, hint_text="Select the game platform",
            value=initial_data.get('platform') if initial_data else None,
            data="platform"
        ))
    elif selected_type == "Book":
        container.controls.append(ft.TextField(
            label="Author", capitalization=ft.TextCapitalization.WORDS,
            value=initial_data.get('author') if initial_data else None,
            data="author"
        ))
    elif selected_type == "JAV":
        container.controls.extend([
            ft.TextField(
                label="Director", capitalization=ft.TextCapitalization.WORDS,
                value=initial_data.get('director') if initial_data else None,
                data="director"
            ),
            ft.TextField(
                label="Actress(es)", capitalization=ft.TextCapitalization.WORDS,
                value=initial_data.get('actress') if initial_data else None,
                data="actress"
            )
        ])
    elif selected_type == "Adult Visual Novel":
        container.controls.append(ft.TextField(
            label="Update / Version",
            value=initial_data.get('update_version') if initial_data else None,
            data="update_version"
        ))

    if container.page:
        try:
            container.update()
        except Exception:
            pass

def get_data_from_conditional_fields(container: ft.Column) -> dict:
    """Extracts data from the dynamically generated fields by looking at their 'data' property."""
    data = {}
    for control in container.controls:
        if hasattr(control, 'data') and control.data:
            data[control.data] = control.value
    return data

# --- Helper function to create entry type filter UI (Button + BottomSheet) ---
def create_entry_type_filter_button_with_sheet(
    page_ref: ft.Page,
    available_types: list[str],
    selected_types_set: set[str], 
    on_change_callback: callable,
    button_label_prefix: str = "Filter Types"
):
    filter_button_ref = ft.Ref[ft.OutlinedButton]()

    def get_button_text():
        count = len(selected_types_set)
        if count == len(available_types):
            return f"{button_label_prefix} (All)"
        elif count == 0:
            return f"{button_label_prefix} (None)"
        else:
            return f"{button_label_prefix} ({count} selected)"

    all_types_checkbox_bs_ref = ft.Ref[ft.Checkbox]()
    individual_checkbox_bs_refs = {type_name: ft.Ref[ft.Checkbox]() for type_name in available_types}

    def update_button_and_all_cb_state():
        if filter_button_ref.current:
            filter_button_ref.current.text = get_button_text()
            if filter_button_ref.current.page: 
                try: filter_button_ref.current.update()
                except: pass 

        if all_types_checkbox_bs_ref.current:
            all_selected = len(selected_types_set) == len(available_types)
            if all_types_checkbox_bs_ref.current.value != all_selected:
                 all_types_checkbox_bs_ref.current.value = all_selected
                 if all_types_checkbox_bs_ref.current.page: 
                     try: all_types_checkbox_bs_ref.current.update()
                     except: pass

    def on_all_types_bs_change(e):
        is_checked = e.control.value
        if is_checked:
            selected_types_set.update(available_types)
        else:
            selected_types_set.clear()
        
        for type_name, cb_ref in individual_checkbox_bs_refs.items():
            if cb_ref.current:
                if cb_ref.current.value != is_checked:
                    cb_ref.current.value = is_checked
                    if cb_ref.current.page: 
                        try: cb_ref.current.update()
                        except: pass
        update_button_and_all_cb_state()

    def on_individual_type_bs_change(e):
        type_name = e.control.data
        is_checked = e.control.value
        if is_checked:
            selected_types_set.add(type_name)
        else:
            selected_types_set.discard(type_name)
        update_button_and_all_cb_state()

    bs_checkbox_controls = []
    all_types_cb_bs = ft.Checkbox(
        ref=all_types_checkbox_bs_ref, label="All Types",
        value=len(selected_types_set) == len(available_types),
        on_change=on_all_types_bs_change, adaptive=True
    )
    bs_checkbox_controls.append(all_types_cb_bs)
    bs_checkbox_controls.append(ft.Divider(height=5, thickness=0.5))


    for type_name_str in available_types:
        cb = ft.Checkbox(
            ref=individual_checkbox_bs_refs[type_name_str], label=type_name_str,
            value=type_name_str in selected_types_set, data=type_name_str,
            on_change=on_individual_type_bs_change, adaptive=True
        )
        bs_checkbox_controls.append(cb)

    filter_bottom_sheet_ref = ft.Ref[ft.BottomSheet]()

    def close_bs_and_apply(e=None):
        if filter_bottom_sheet_ref.current:
            filter_bottom_sheet_ref.current.open = False
            if filter_bottom_sheet_ref.current.page:
                try: filter_bottom_sheet_ref.current.update()
                except: pass
        on_change_callback() 

    filter_bottom_sheet = ft.BottomSheet(
        ref=filter_bottom_sheet_ref,
        content=ft.Container(
            ft.Column(
                [
                    ft.Text("Select Entry Types", weight=ft.FontWeight.BOLD, size=16),
                    ft.Divider(height=10),
                    ft.Column(bs_checkbox_controls, scroll=ft.ScrollMode.ADAPTIVE, spacing=0, tight=True, expand=True),
                    ft.Divider(height=10),
                    ft.Row(
                        [ft.ElevatedButton("Done", on_click=close_bs_and_apply, expand=True, style=ft.ButtonStyle(padding=12))],
                        alignment=ft.MainAxisAlignment.CENTER
                    )
                ],
                tight=True, spacing=5,
            ),
            padding=ft.padding.only(left=20, right=20, top=10, bottom=20),
            height=page_ref.window_height * 0.6 if page_ref and page_ref.window_height else 400,
        ),
        open=False,
        on_dismiss=lambda e: on_change_callback(), 
        enable_drag=True,
        show_drag_handle=True,
    )
    if filter_bottom_sheet not in page_ref.overlay:
        page_ref.overlay.append(filter_bottom_sheet)

    def open_filter_bottom_sheet(e):
        if all_types_checkbox_bs_ref.current:
            all_types_checkbox_bs_ref.current.value = (len(selected_types_set) == len(available_types))
        for type_name, cb_ref in individual_checkbox_bs_refs.items():
            if cb_ref.current:
                cb_ref.current.value = (type_name in selected_types_set)
        
        if filter_bottom_sheet_ref.current and filter_bottom_sheet_ref.current.page:
            for ctrl in bs_checkbox_controls: 
                if hasattr(ctrl, 'page') and ctrl.page: 
                    try: ctrl.update()
                    except: pass
        
        if filter_bottom_sheet_ref.current:
            filter_bottom_sheet_ref.current.open = True
            page_ref.update()

    filter_button = ft.OutlinedButton(
        ref=filter_button_ref,
        text=get_button_text(),
        icon=ft.icons.FILTER_LIST_ROUNDED,
        on_click=open_filter_bottom_sheet,
        tooltip="Filter by entry type"
    )
    return filter_button


# --- Main Application ---
def main(page: ft.Page):
    page.title = APP_TITLE
    page.window_width = 1400
    page.window_height = 900

    init_db()

    current_theme_name = get_setting_db("current_theme", DEFAULT_THEME_NAME)
    selected_theme_config = THEMES.get(current_theme_name, THEMES[DEFAULT_THEME_NAME])
    page.theme_mode = selected_theme_config["mode"]
    page.theme = ft.Theme(color_scheme_seed=selected_theme_config["seed"])

    # --- Load saved filter preferences ---
    saved_year_filter_str = get_setting_db(SAVED_YEAR_VIEW_FILTER_KEY)
    if saved_year_filter_str is not None:
        year_view_selected_types = set(s_type for s_type in saved_year_filter_str.split(',') if s_type)
    else: # Default to all if not found
        year_view_selected_types = set(ALL_ENTRY_TYPES_STR)

    saved_stats_filter_str = get_setting_db(SAVED_STATS_VIEW_FILTER_KEY)
    if saved_stats_filter_str is not None:
        stats_view_selected_types = set(s_type for s_type in saved_stats_filter_str.split(',') if s_type)
    else: # Default to all if not found
        stats_view_selected_types = set(ALL_ENTRY_TYPES_STR)
    
    app_state = {
        "current_view": YEARS[0] if YEARS else "Stats",
        "year_view_selected_entry_types": year_view_selected_types,
        "stats_view_selected_entry_types": stats_view_selected_types,
    }
    
    add_jav_date_display_field = ft.Ref[ft.TextField]()
    manual_dialog_container = ft.Ref[ft.Container]()
    stats_total_javs_text = ft.Ref[ft.Text]()
    stats_avg_score_text = ft.Ref[ft.Text]()
    stats_total_rewatches_text = ft.Ref[ft.Text]()
    stats_unique_genres_text = ft.Ref[ft.Text]()
    genre_pie_chart = ft.Ref[ft.PieChart]()
    genre_legend = ft.Ref[ft.Column]()
    main_stack = ft.Stack(expand=True)
    stats_year_filter = ft.Ref[ft.SegmentedButton]()

    # --- Refs for new stats charts ---
    platform_chart_container = ft.Ref[ft.Card]()
    platform_pie_chart = ft.Ref[ft.PieChart]()
    platform_legend = ft.Ref[ft.Column]()

    author_chart_container = ft.Ref[ft.Card]()
    author_pie_chart = ft.Ref[ft.PieChart]()
    author_legend = ft.Ref[ft.Column]()

    director_chart_container = ft.Ref[ft.Card]()
    director_pie_chart = ft.Ref[ft.PieChart]()
    director_legend = ft.Ref[ft.Column]()

    actress_chart_container = ft.Ref[ft.Card]()
    actress_pie_chart = ft.Ref[ft.PieChart]()
    actress_legend = ft.Ref[ft.Column]()

    version_chart_container = ft.Ref[ft.Card]()
    version_pie_chart = ft.Ref[ft.PieChart]()
    version_legend = ft.Ref[ft.Column]()

    _target_image_field_for_picker = None

    def handle_image_file_pick(e: ft.FilePickerResultEvent):
        nonlocal _target_image_field_for_picker
        if _target_image_field_for_picker is None:
            show_snackbar("Internal error: Target field for image not set.", color=ft.colors.ERROR_CONTAINER)
            return

        if e.files and e.files[0].path:
            selected_file_path = e.files[0].path
            _target_image_field_for_picker.value = selected_file_path
            _target_image_field_for_picker.error_text = None
            if hasattr(_target_image_field_for_picker, 'page') and _target_image_field_for_picker.page: _target_image_field_for_picker.update()
            show_snackbar(f"Image selected: {os.path.basename(selected_file_path)}", duration=2500)
        elif not e.files and not e.path:
            show_snackbar("Image selection cancelled.", duration=2000)
        
        _target_image_field_for_picker = None

    image_file_picker = ft.FilePicker(on_result=handle_image_file_pick)
    page.overlay.append(image_file_picker)

    def show_snackbar(message: str, color: str = None, duration: int = 4000):
        if not page: print(f"Snackbar Error: Page context lost. Message: {message}"); return
        try:
            snackbar_control = ft.SnackBar(
                content=ft.Text(message, max_lines=3, overflow=ft.TextOverflow.ELLIPSIS),
                bgcolor=color, duration=duration, open=True
            )
            page.snack_bar = snackbar_control
            if page: page.update()
        except Exception as e: print(f"Error displaying snackbar '{message}': {e}")

    add_date_picker = ft.DatePicker(on_change=lambda e: handle_add_date_change(e), help_text="Select Completion Date")
    page.overlay.append(add_date_picker)
    def handle_add_date_change(e):
        selected_date = e.control.value
        if add_jav_date_display_field.current and selected_date:
            add_jav_date_display_field.current.value = selected_date.strftime('%Y-%m-%d')
            if hasattr(add_jav_date_display_field.current, 'page') and add_jav_date_display_field.current.page: add_jav_date_display_field.current.update()
    def open_add_date_picker(e=None):
        if add_date_picker: 
            add_date_picker.open = True 
            page.update()
        else: show_snackbar("Could not open date picker.", color=ft.colors.ERROR_CONTAINER)


    import_dialog = ft.FilePicker(on_result=lambda e: handle_import_result(e)); page.overlay.append(import_dialog)
    def handle_import_result(e: ft.FilePickerResultEvent):
        page.dialog = None
        if e.files and e.files[0].path:
            selected_file = e.files[0].path; print(f"CSV file selected: {selected_file}")
            progress_dialog = ft.AlertDialog(modal=True, title=ft.Text("Importing CSV"), content=ft.Row([ft.ProgressRing(), ft.Text("Processing...")], alignment=ft.MainAxisAlignment.CENTER))
            page.dialog = progress_dialog; progress_dialog.open = True; page.update()
            page.run_thread(import_csv_data, selected_file)
        else: show_snackbar("CSV Import Cancelled or No File Selected")
    def open_import_dialog(e): import_dialog.pick_files(dialog_title="Select CSV Log", allow_multiple=False, allowed_extensions=["csv"])
    
    def import_csv_data(file_path):
        expected_headers_lower = [ 
            "name", "genre", "review_score", "completion_date", "description", 
            "isrewatch", "ownlocalcopy", "entrytype", "imageurl", "platform",
            "author", "director", "actress", "updateversion"
        ]
        header_map = {
            "name": "name", "genre": "genre_str", "review_score": "score",
            "completion_date": "completion_date_str", "description": "description",
            "isrewatch": "is_rewatch_csv", "ownlocalcopy": "own_local_copy_csv",
            "entrytype": "entry_type_csv", "imageurl": "image_url_csv",
            "platform": "platform_csv", "author": "author_csv", "director": "director_csv",
            "actress": "actress_csv", "updateversion": "update_version_csv"
        }
        added_count, skipped_count = 0, 0; error_messages, warning_messages = [], []
        print(f"--- Starting CSV Import from: {file_path} ---")
        try:
            with open(file_path, mode='r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                csv_headers_lower_normalized = [h.lower().strip().replace(" ", "") for h in reader.fieldnames or []]
                
                if not csv_headers_lower_normalized: 
                    raise ValueError("CSV file is empty or has no header row.")
                
                print(f"Normalized CSV Headers: {csv_headers_lower_normalized}")

                if "name" not in csv_headers_lower_normalized or "completion_date" not in csv_headers_lower_normalized:
                    raise ValueError("CSV Header Missing Required Columns: 'Name' and 'Completion_Date' (or similar) are mandatory.")

                normalized_expected_headers_map_to_original = {eh.replace(" ", ""): eh for eh in expected_headers_lower}
                current_header_to_internal_var_map = {}
                for norm_expected_h, original_expected_h in normalized_expected_headers_map_to_original.items():
                    if norm_expected_h in csv_headers_lower_normalized:
                        current_header_to_internal_var_map[norm_expected_h] = header_map[original_expected_h]

                missing_optional = [
                    eh for eh in expected_headers_lower 
                    if eh.replace(" ", "") not in csv_headers_lower_normalized and eh not in ["name", "completion_date"]
                ]
                if missing_optional: 
                    warning_messages.append(f"Info: Missing optional columns: {', '.join(missing_optional)}. Defaults/blanks will be used.")
                
                original_csv_header_lookup = {h.lower().strip().replace(" ", ""): h for h in reader.fieldnames}

                for row_num, row in enumerate(reader, start=2):
                    jav_data_for_db = {} 
                    valid_row = True; row_errors, row_warnings = [], []
                    print(f"\nProcessing CSV Row {row_num}: {row}")
                    try:
                        for norm_csv_h, internal_var_key in current_header_to_internal_var_map.items():
                            original_csv_header_str = original_csv_header_lookup.get(norm_csv_h)
                            if original_csv_header_str:
                                jav_data_for_db[internal_var_key] = row.get(original_csv_header_str, "").strip()
                            else:
                                jav_data_for_db[internal_var_key] = None

                        name_val = jav_data_for_db.get("name")
                        date_input_str = jav_data_for_db.get("completion_date_str")
                        score_str = jav_data_for_db.get("score")
                        rewatch_csv_str = jav_data_for_db.get("is_rewatch_csv", "false")
                        own_local_copy_csv_str = jav_data_for_db.get("own_local_copy_csv", "false")
                        genre_str_from_csv = jav_data_for_db.get("genre_str")
                        description_val = jav_data_for_db.get("description")
                        entry_type_from_csv = jav_data_for_db.get("entry_type_csv") 
                        image_url_from_csv = jav_data_for_db.get("image_url_csv")
                        
                        conditional_data_from_csv = {
                            "platform": jav_data_for_db.get("platform_csv"),
                            "author": jav_data_for_db.get("author_csv"),
                            "director": jav_data_for_db.get("director_csv"),
                            "actress": jav_data_for_db.get("actress_csv"),
                            "update_version": jav_data_for_db.get("update_version_csv"),
                        }

                        if not entry_type_from_csv or not entry_type_from_csv.strip():
                            entry_type_from_csv = "Other" 
                            row_warnings.append(f"Missing or blank Entry Type. Defaulted to 'Other'.")
                            print(f"Row {row_num} ('{name_val}'): EntryType was blank, defaulted to 'Other'.")
                        elif entry_type_from_csv not in ALL_ENTRY_TYPES_STR:
                            row_warnings.append(f"Entry Type '{entry_type_from_csv}' is not a standard option. It will be stored, but may not appear in filters unless you add it to ENTRY_TYPE_OPTIONS.")
                            print(f"Row {row_num} ('{name_val}'): Non-standard EntryType '{entry_type_from_csv}'.")

                        if not name_val: row_errors.append("Missing 'Name' value"); valid_row = False
                        
                        db_date_str = None
                        year_for_db = None 
                        if date_input_str:
                            parsed_date_obj = None
                            common_date_formats = ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d', '%d-%m-%Y', '%m-%d-%Y']
                            for fmt in common_date_formats:
                                try:
                                    parsed_date_obj = datetime.strptime(date_input_str, fmt)
                                    db_date_str = parsed_date_obj.strftime('%Y-%m-%d')
                                    year_for_db = parsed_date_obj.year
                                    break
                                except ValueError:
                                    continue
                            if not parsed_date_obj:
                                row_errors.append(f"Invalid Date Format '{date_input_str}'. Use YYYY-MM-DD or common variations. Item will have no year_completed."); 
                                print(f"Row {row_num} ('{name_val}'): Invalid date '{date_input_str}'. year_completed will be NULL.")
                        else:
                            row_errors.append("Missing 'Completion_Date' value. Item will have no year_completed."); 
                            print(f"Row {row_num} ('{name_val}'): Missing Completion_Date. year_completed will be NULL.")
                        
                        score_int = None
                        if score_str and score_str.lower() != 'n/a' and score_str.strip() != '':
                            try:
                                score_float = float(score_str); score_int = int(round(score_float))
                                if not (0 <= score_int <= 10): row_warnings.append(f"Score '{score_str}' rounded to {score_int}, outside 0-10 range. Setting to N/A."); score_int = None
                            except (ValueError, TypeError): row_warnings.append(f"Invalid Score '{score_str}'. Setting to N/A."); score_int = None
                        
                        is_rewatch = rewatch_csv_str.lower() in ['true', '1', 'yes', 't', 'y']
                        own_local_copy = own_local_copy_csv_str.lower() in ['true', '1', 'yes', 't', 'y']
                        
                        if valid_row:
                            print(f"Row {row_num} ('{name_val}'): Adding to DB. Date for DB: {db_date_str} (Year: {year_for_db}), EntryType: {entry_type_from_csv}")
                            add_jav_db(name_val, genre_str_from_csv, db_date_str, score_int, description_val, is_rewatch, own_local_copy, image_url_from_csv, entry_type_from_csv, conditional_data_from_csv); added_count += 1
                            if row_warnings: warning_messages.extend([f"Row {row_num} ('{name_val}'): {w}" for w in row_warnings])
                        else: 
                            skipped_count += 1; error_messages.append(f"Row {row_num} ('{name_val or '<?>'}'): Skipped - {' | '.join(row_errors)}")
                            print(f"Row {row_num} ('{name_val or '<?>'}'): SKIPPED. Errors: {' | '.join(row_errors)}")
                    except Exception as e: 
                        skipped_count += 1; error_messages.append(f"Row {row_num}: Skipped - Unexpected error processing row: {e} - {traceback.format_exc(limit=1)}")
                        print(f"Row {row_num}: SKIPPED due to unexpected error: {e}")
        except FileNotFoundError: error_messages.append(f"Error: File not found at path: {file_path}")
        except ValueError as ve: error_messages.append(f"Error reading CSV structure: {ve}")
        except Exception as e: error_messages.append(f"An unexpected error occurred during import: {e}"); traceback.print_exc()
        
        print(f"--- CSV Import Finished. Added: {added_count}, Skipped: {skipped_count} ---")
        summary_lines = [f"CSV Import Finished. Added: {added_count}, Skipped: {skipped_count}."]
        if warning_messages: summary_lines.append("\nWarnings (Max 5 shown):"); summary_lines.extend(warning_messages[:5]); print("\n--- Import Warnings ---\n" + "\n".join(warning_messages) + "\n-----------------------\n")
        if error_messages: summary_lines.append("\nErrors (Max 5 shown):"); summary_lines.extend(error_messages[:5]); print("\n--- Import Errors ---\n" + "\n".join(error_messages) + "\n---------------------\n")
        
        if page: page.run_thread(show_import_summary_and_refresh, "\n".join(summary_lines), bool(error_messages or (skipped_count > 0 and added_count == 0)))
        else: print("Import process finished, but page context was lost. UI not updated.")


    def show_import_summary_and_refresh(message, had_errors):
        if not page: return
        if hasattr(page, 'dialog') and page.dialog and isinstance(page.dialog, ft.AlertDialog) and page.dialog.title and hasattr(page.dialog.title, 'value') and page.dialog.title.value == "Importing CSV":
            page.dialog.open = False; page.update()
        snackbar_color = ft.colors.ERROR_CONTAINER if had_errors else ft.colors.GREEN_700
        show_snackbar(message, color=snackbar_color, duration=10000); print("Refreshing views after import...")
        refresh_current_view()
        current_stats_filter = "All Time"
        try:
            if stats_year_filter.current and stats_year_filter.current.selected: 
                current_stats_filter = list(stats_year_filter.current.selected)[0]
        except Exception as stats_e: print(f"Warning: Error accessing stats_year_filter selection after import: {stats_e}")
        print(f"Triggering background stats recalculation for: {current_stats_filter}")
        page.run_thread(calculate_and_update_stats_display, current_stats_filter); page.update()


    def close_manual_dialog(e=None):
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            try:
                if hasattr(manual_dialog_container.current, '_edit_date_picker_ref'):
                    edit_picker = manual_dialog_container.current._edit_date_picker_ref
                    if edit_picker in page.overlay: page.overlay.remove(edit_picker);
                main_stack.controls.remove(manual_dialog_container.current); manual_dialog_container.current = None; main_stack.update()
            except Exception as remove_e: print(f"Error removing manual dialog from stack: {remove_e}")

    def create_dialog_overlay(title_text, content_controls, action_buttons, associated_picker=None):
        dialog_content = ft.Container(
            content=ft.Column(
                [
                    ft.Text(title_text, style=ft.TextThemeStyle.TITLE_LARGE),
                    ft.Divider(height=10, thickness=1),
                    ft.Container(
                        content=ft.Column(content_controls, spacing=12, tight=True, scroll=ft.ScrollMode.ADAPTIVE),
                        expand=True,
                    ),
                    ft.Divider(height=10, thickness=1),
                    ft.Row(action_buttons, alignment=ft.MainAxisAlignment.END)
                ],
                spacing=10, tight=True,
            ),
            width=550, padding=20, bgcolor=ft.colors.with_opacity(0.98, ft.colors.SURFACE),
            border_radius=10, border=ft.border.all(1, ft.colors.with_opacity(0.2, ft.colors.OUTLINE)),
            shadow=ft.BoxShadow(spread_radius=1, blur_radius=15, color=ft.colors.with_opacity(0.2, ft.colors.BLACK), offset=ft.Offset(0, 5)),
        )
        dialog_content.constraints = ft.BoxConstraints(max_height=page.window_height * 0.85 if page and page.window_height else 700)
        overlay_scrim = ft.Container(
            ref=manual_dialog_container, content=dialog_content, alignment=ft.alignment.center,
            bgcolor=ft.colors.with_opacity(0.6, ft.colors.BLACK), expand=True,
        )
        if associated_picker: overlay_scrim._edit_date_picker_ref = associated_picker
        return overlay_scrim

    def show_description_dialog(jav_data):
        if hasattr(page, '_dialog_is_opening') and page._dialog_is_opening:
            print("INFO: Dialog operation already in progress. Ignoring click.")
            return
        page._dialog_is_opening = True
        dialog_instance_ref = ft.Ref[ft.AlertDialog]()
        try:
            if hasattr(page, 'dialog') and page.dialog is not None and page.dialog.open:
                page._dialog_is_opening = False 
                return
            description_text = jav_data.get('description') or "No description provided."
            dialog_title = f"Description: {jav_data.get('name', 'Entry')}"
            description_content_container = ft.Container(
                content=ft.Text(description_text, selectable=True),
                padding=ft.padding.only(top=5, bottom=10),
            )
            description_content_container.scroll = ft.ScrollMode.ADAPTIVE
            description_content_container.constraints = ft.BoxConstraints(max_height=300)
            
            dialog_instance = ft.AlertDialog(
                ref=dialog_instance_ref, modal=True, title=ft.Text(dialog_title),
                content=description_content_container, actions_alignment=ft.MainAxisAlignment.END,
            )
            def handle_dialog_dismiss(dismissed_dialog_instance):
                 if hasattr(page, 'dialog') and page.dialog == dismissed_dialog_instance: page.dialog = None
                 if hasattr(dismissed_dialog_instance, 'open'): dismissed_dialog_instance.open = False
                 if dismissed_dialog_instance in page.overlay:
                     try: page.overlay.remove(dismissed_dialog_instance)
                     except ValueError: pass
                 if page: page.update() 
            dialog_instance.on_dismiss = lambda e, inst=dialog_instance: handle_dialog_dismiss(inst) 
            def close_dialog_action(e):
                instance_to_close = dialog_instance 
                if instance_to_close: instance_to_close.open = False
                if page: page.update() 
            dialog_instance.actions = [ft.TextButton("Close", on_click=close_dialog_action)]
            if dialog_instance not in page.overlay: page.overlay.append(dialog_instance)
            dialog_instance.open = True; page.dialog = dialog_instance
            if page: page.update()
        except Exception as e: print(f"Error in show_description_dialog: {e}"); traceback.print_exc()
        finally: page._dialog_is_opening = False

    def process_and_copy_image(image_source_path_or_url: str) -> str | None:
        if not image_source_path_or_url or not image_source_path_or_url.strip():
            return None
        source_str = image_source_path_or_url.strip()

        if source_str.lower().startswith("http://") or source_str.lower().startswith("https://"):
            return source_str

        if not os.path.exists(source_str):
            print(f"Warning: Local image path does not exist: {source_str}")
            return None 

        try:
            if not os.path.exists(IMAGES_DIR):
                os.makedirs(IMAGES_DIR)
                print(f"Created images directory during processing: {IMAGES_DIR}")

            _, extension = os.path.splitext(source_str)
            extension = extension.lower() if extension else ".png"
            if not extension.startswith("."): extension = "." + extension
            if len(extension) > 10: extension = ".dat" 

            unique_filename = f"{uuid.uuid4()}{extension}"
            destination_path = os.path.join(IMAGES_DIR, unique_filename)
            
            shutil.copy2(source_str, destination_path)
            print(f"Image copied from '{source_str}' to '{destination_path}'")
            
            relative_path_for_flet = os.path.join("images", unique_filename).replace("\\", "/")
            return relative_path_for_flet
        except Exception as e:
            print(f"Error copying image from '{source_str}': {e}")
            traceback.print_exc()
            show_snackbar(f"Error copying image: {os.path.basename(source_str)}", color=ft.colors.ERROR_CONTAINER)
            return None

    def open_add_jav_dialog(e=None):
        nonlocal _target_image_field_for_picker
        target_year = app_state["current_view"] if app_state["current_view"] in YEARS else str(datetime.now().year)
        
        name_field = ft.TextField(label="Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        
        conditional_fields_container = ft.Column(spacing=12, tight=True)
        def on_type_change_add(e):
            update_conditional_fields(e.control.value, conditional_fields_container)

        entry_type_dropdown = ft.Dropdown(
            label="Entry Type", options=ENTRY_TYPE_OPTIONS, 
            hint_text="Select the type of media", on_change=on_type_change_add
        )
        
        image_source_field = ft.TextField(
            label="Image Source (URL or Local Path)", 
            hint_text="e.g., https://... or C:\\path\\to\\image.jpg",
            expand=True
        )
        def browse_for_image_add(e):
            nonlocal _target_image_field_for_picker
            _target_image_field_for_picker = image_source_field
            image_file_picker.pick_files(
                dialog_title="Select Image", allow_multiple=False,
                allowed_extensions=["jpg", "jpeg", "png", "gif", "bmp", "webp"]
            )
        image_source_row = ft.Row(
            [ image_source_field, ft.IconButton(icon=ft.icons.FOLDER_OPEN_OUTLINED, tooltip="Browse for local image", on_click=browse_for_image_add) ], 
            vertical_alignment=ft.CrossAxisAlignment.END
        )

        genre_field = ft.TextField(label="Genres (comma-separated)", hint_text="e.g., Action, Drama", capitalization=ft.TextCapitalization.WORDS)
        date_display = ft.TextField(ref=add_jav_date_display_field, label="Completion Date", read_only=True, hint_text="Click calendar to select...")
        
        if add_jav_date_display_field.current: 
            add_jav_date_display_field.current.value = ""
            add_jav_date_display_field.current.error_text = None
        
        description_field = ft.TextField(label="Description / Notes", multiline=True, min_lines=2, max_lines=4, capitalization=ft.TextCapitalization.SENTENCES)
        score_dropdown = ft.Dropdown(label="Score", width=110, options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)], value="N/A")
        rewatch_check = ft.Checkbox(label="This was a Rewatch", value=False)
        own_local_copy_check = ft.Checkbox(label="Own Local Copy?", value=False)

        def save_new_jav(e):
            name = name_field.value.strip()
            entry_type_val = entry_type_dropdown.value
            image_source_input = image_source_field.value.strip()
            genre_input_str = genre_field.value.strip()
            date_str = add_jav_date_display_field.current.value.strip() if add_jav_date_display_field.current else ""
            score_str = score_dropdown.value
            description = description_field.value.strip()
            is_rewatch = rewatch_check.value
            own_local_copy = own_local_copy_check.value
            errors = []

            name_field.error_text = None; date_display.error_text = None; score_dropdown.error_text = None; entry_type_dropdown.error_text = None; image_source_field.error_text = None

            if not name: errors.append("Title is required."); name_field.error_text = "Required"
            if not entry_type_val: errors.append("Entry Type is required."); entry_type_dropdown.error_text = "Required"
            if not date_str: errors.append("Completion Date is required."); date_display.error_text = "Required"
            else:
                try: datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError: errors.append("Invalid date format (YYYY-MM-DD)."); date_display.error_text = "Invalid Format"
            
            if image_source_input and not (image_source_input.lower().startswith("http://") or image_source_input.lower().startswith("https://")):
                if not os.path.exists(image_source_input): 
                    errors.append("Local image file not found."); image_source_field.error_text = "File not found"

            score_int = None
            if score_str and score_str != "N/A":
                try:
                    score_int = int(score_str);
                    if not (0 <= score_int <= 10): errors.append("Score must be 0-10."); score_dropdown.error_text = "0-10"
                except ValueError: errors.append("Invalid score."); score_dropdown.error_text = "Invalid"

            if hasattr(name_field, 'page') and name_field.page: name_field.update()
            if hasattr(entry_type_dropdown, 'page') and entry_type_dropdown.page: entry_type_dropdown.update()
            if hasattr(image_source_field, 'page') and image_source_field.page: image_source_field.update()
            if hasattr(date_display, 'page') and date_display.page: date_display.update()
            if hasattr(score_dropdown, 'page') and score_dropdown.page: score_dropdown.update()

            if errors: show_snackbar("Please fix errors: " + " ".join(errors), color=ft.colors.ERROR_CONTAINER); return

            final_image_ref_for_db = process_and_copy_image(image_source_input)
            
            conditional_data = get_data_from_conditional_fields(conditional_fields_container)

            add_jav_db(name, genre_input_str, date_str, score_int, description, is_rewatch, own_local_copy, final_image_ref_for_db, entry_type_val, conditional_data)
            show_snackbar(f"Added '{name}' to {target_year}")
            close_manual_dialog()
            refresh_current_view()
            current_stats_filter = "All Time"
            try:
                if stats_year_filter.current and stats_year_filter.current.selected:
                    current_stats_filter = list(stats_year_filter.current.selected)[0]
            except Exception as stats_e: print(f"Warning: Error accessing stats_year_filter selection after add: {stats_e}")
            page.run_thread(calculate_and_update_stats_display, current_stats_filter)

        content_controls = [
            name_field, entry_type_dropdown, conditional_fields_container, image_source_row, genre_field,
            ft.Row([date_display, ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=open_add_date_picker)], alignment=ft.MainAxisAlignment.START),
            score_dropdown, description_field, rewatch_check, own_local_copy_check
        ]
        action_buttons = [ ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Save Entry", on_click=save_new_jav), ]
        manual_dialog = create_dialog_overlay(f"Add Entry to {target_year}", content_controls, action_buttons);
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog() 
        main_stack.controls.append(manual_dialog); main_stack.update()

    def open_edit_jav_dialog(jav_data_to_edit, list_refresh_callback):
        nonlocal _target_image_field_for_picker
        jav_id = jav_data_to_edit['id']
        
        edit_name_field_ref = ft.Ref[ft.TextField](); edit_genre_field_ref = ft.Ref[ft.TextField](); edit_date_display_field_ref = ft.Ref[ft.TextField](); edit_score_dropdown_ref = ft.Ref[ft.Dropdown](); edit_description_field_ref = ft.Ref[ft.TextField](); edit_rewatch_check_ref = ft.Ref[ft.Checkbox](); edit_own_local_copy_check_ref = ft.Ref[ft.Checkbox]()
        edit_entry_type_dropdown_ref = ft.Ref[ft.Dropdown]()
        
        name_field = ft.TextField(ref=edit_name_field_ref, label="Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS, value=jav_data_to_edit.get('name', ''))
        
        conditional_fields_container = ft.Column(spacing=12, tight=True)
        def on_type_change_edit(e):
            update_conditional_fields(e.control.value, conditional_fields_container)

        entry_type_dropdown = ft.Dropdown(
            ref=edit_entry_type_dropdown_ref, label="Entry Type", options=ENTRY_TYPE_OPTIONS, 
            value=jav_data_to_edit.get('entry_type'), on_change=on_type_change_edit
        )
        
        update_conditional_fields(
            jav_data_to_edit.get('entry_type'), 
            conditional_fields_container, 
            initial_data=jav_data_to_edit
        )

        _edit_image_source_tf = ft.TextField( 
            label="Image Source (URL or Local Path)", 
            value=jav_data_to_edit.get('image_url', ''), 
            expand=True,
            hint_text="e.g., https://... or C:\\path\\to\\image.jpg or images/file.jpg"
        )
        def browse_for_image_edit(e):
            nonlocal _target_image_field_for_picker
            _target_image_field_for_picker = _edit_image_source_tf 
            image_file_picker.pick_files(
                dialog_title="Select Image", allow_multiple=False,
                allowed_extensions=["jpg", "jpeg", "png", "gif", "bmp", "webp"]
            )
        edit_image_source_row = ft.Row(
            [ _edit_image_source_tf, ft.IconButton(icon=ft.icons.FOLDER_OPEN_OUTLINED, tooltip="Browse for local image", on_click=browse_for_image_edit) ],
            vertical_alignment=ft.CrossAxisAlignment.END
        )

        genre_field = ft.TextField(ref=edit_genre_field_ref, label="Genres (comma-separated)", hint_text="e.g., Action, Drama", capitalization=ft.TextCapitalization.WORDS, value=jav_data_to_edit.get('genre', '') or '')
        initial_date_str = jav_data_to_edit.get('completion_date', ''); date_display = ft.TextField(ref=edit_date_display_field_ref, label="Completion Date", read_only=True, hint_text="Click calendar to select...", value=initial_date_str)
        initial_score = jav_data_to_edit.get('review_score'); score_value_str = str(initial_score) if initial_score is not None else "N/A"; score_dropdown = ft.Dropdown(ref=edit_score_dropdown_ref, label="Score", width=110, options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)], value=score_value_str)
        description_field = ft.TextField(ref=edit_description_field_ref, label="Description / Notes", multiline=True, min_lines=2, max_lines=4, capitalization=ft.TextCapitalization.SENTENCES, value=jav_data_to_edit.get('description', '') or '')
        initial_rewatch = jav_data_to_edit.get('is_rewatch') == 1; rewatch_check = ft.Checkbox(ref=edit_rewatch_check_ref, label="This was a Rewatch", value=initial_rewatch)
        initial_own_local_copy = jav_data_to_edit.get('own_local_copy') == 1; own_local_copy_check = ft.Checkbox(ref=edit_own_local_copy_check_ref, label="Own Local Copy?", value=initial_own_local_copy)

        initial_picker_date = None
        if initial_date_str:
            try: initial_picker_date = datetime.strptime(initial_date_str, '%Y-%m-%d')
            except ValueError: pass
        
        _edit_date_picker_instance = ft.DatePicker( 
            on_change=lambda e: handle_edit_date_change(e, edit_date_display_field_ref), 
            help_text="Select Completion Date", value=initial_picker_date
        )
        if _edit_date_picker_instance not in page.overlay: 
            page.overlay.append(_edit_date_picker_instance)
        
        def handle_edit_date_change(e, target_field_ref): 
            selected_date = e.control.value
            if target_field_ref.current and selected_date: 
                target_field_ref.current.value = selected_date.strftime('%Y-%m-%d')
                if hasattr(target_field_ref.current, 'page') and target_field_ref.current.page: target_field_ref.current.update()
        def open_edit_date_picker(e): 
            _edit_date_picker_instance.open = True
            page.update()

        def save_edited_jav(e):
            name = edit_name_field_ref.current.value.strip()
            entry_type_val = edit_entry_type_dropdown_ref.current.value
            image_source_input = _edit_image_source_tf.value.strip() 
            genre_input_str = edit_genre_field_ref.current.value.strip()
            date_str = edit_date_display_field_ref.current.value.strip()
            score_str = edit_score_dropdown_ref.current.value
            description = edit_description_field_ref.current.value.strip()
            is_rewatch = edit_rewatch_check_ref.current.value
            own_local_copy = edit_own_local_copy_check_ref.current.value
            errors = []

            edit_name_field_ref.current.error_text = None; edit_date_display_field_ref.current.error_text = None; edit_score_dropdown_ref.current.error_text = None; edit_entry_type_dropdown_ref.current.error_text = None; _edit_image_source_tf.error_text = None

            if not name: errors.append("Title is required."); edit_name_field_ref.current.error_text = "Required"
            if not entry_type_val: errors.append("Entry Type is required."); edit_entry_type_dropdown_ref.current.error_text = "Required"
            if not date_str: errors.append("Completion Date is required."); edit_date_display_field_ref.current.error_text = "Required"
            else:
                try: datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError: errors.append("Invalid date format (YYYY-MM-DD)."); edit_date_display_field_ref.current.error_text = "Invalid Format"

            if image_source_input and \
               not (image_source_input.lower().startswith("http://") or image_source_input.lower().startswith("https://")) and \
               not (image_source_input.startswith("images/") and os.path.exists(os.path.join(ASSETS_DIR, image_source_input))): 
                if not os.path.exists(image_source_input): 
                    errors.append("Local image file not found."); _edit_image_source_tf.error_text = "File not found"
            
            score_int = None
            if score_str and score_str != "N/A":
                try:
                    score_int = int(score_str);
                    if not (0 <= score_int <= 10): errors.append("Score must be 0-10."); edit_score_dropdown_ref.current.error_text = "0-10"
                except ValueError: errors.append("Invalid score."); edit_score_dropdown_ref.current.error_text = "Invalid"

            if hasattr(edit_name_field_ref.current, 'page') and edit_name_field_ref.current.page: edit_name_field_ref.current.update()
            if hasattr(edit_entry_type_dropdown_ref.current, 'page') and edit_entry_type_dropdown_ref.current.page: edit_entry_type_dropdown_ref.current.update()
            if hasattr(_edit_image_source_tf, 'page') and _edit_image_source_tf.page: _edit_image_source_tf.update()
            if hasattr(edit_genre_field_ref.current, 'page') and edit_genre_field_ref.current.page: edit_genre_field_ref.current.update()
            if hasattr(edit_date_display_field_ref.current, 'page') and edit_date_display_field_ref.current.page: edit_date_display_field_ref.current.update()
            if hasattr(edit_score_dropdown_ref.current, 'page') and edit_score_dropdown_ref.current.page: edit_score_dropdown_ref.current.update()

            if errors: show_snackbar("Please fix errors: " + " ".join(errors), color=ft.colors.ERROR_CONTAINER); return

            final_image_ref_for_db = jav_data_to_edit.get('image_url') 
            original_db_image_url = jav_data_to_edit.get('image_url')

            if image_source_input != original_db_image_url: 
                if not image_source_input: 
                    final_image_ref_for_db = None
                elif (image_source_input.lower().startswith("http://") or image_source_input.lower().startswith("https://")): 
                    final_image_ref_for_db = image_source_input
                elif not image_source_input.startswith("images/"): 
                    final_image_ref_for_db = process_and_copy_image(image_source_input)
                else: 
                    final_image_ref_for_db = image_source_input 
            
            conditional_data = get_data_from_conditional_fields(conditional_fields_container)

            update_jav_db(jav_id, name, genre_input_str, date_str, score_int, description, is_rewatch, own_local_copy, final_image_ref_for_db, entry_type_val, conditional_data)
            show_snackbar(f"Updated '{name}'")
            close_manual_dialog() 
            list_refresh_callback()
            current_stats_filter = "All Time"
            try:
                if stats_year_filter.current and stats_year_filter.current.selected:
                    current_stats_filter = list(stats_year_filter.current.selected)[0]
            except Exception as stats_e: print(f"Warning: Error accessing stats_year_filter selection after edit: {stats_e}")
            page.run_thread(calculate_and_update_stats_display, current_stats_filter)

        content_controls = [
            name_field, entry_type_dropdown, conditional_fields_container, edit_image_source_row, genre_field,
            ft.Row([date_display, ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=open_edit_date_picker)], alignment=ft.MainAxisAlignment.START),
            score_dropdown, description_field, rewatch_check, own_local_copy_check
        ]
        action_buttons = [ ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Save Changes", on_click=save_edited_jav), ]
        manual_dialog = create_dialog_overlay(f"Edit Entry: {jav_data_to_edit['name']}", content_controls, action_buttons, associated_picker=_edit_date_picker_instance)
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog() 
        main_stack.controls.append(manual_dialog); main_stack.update()

    def build_year_view(year_str):
        print(f"Building year view (Gallery) for: {year_str}")
        year_grid_view_ref = ft.Ref[ft.GridView]() 

        def refresh_view_content():
            grid_view = year_grid_view_ref.current
            if not grid_view: return

            grid_view.controls.clear()
            try:
                javs = get_javs_by_year_db(int(year_str))
                current_selected_types = app_state["year_view_selected_entry_types"]
                filtered_javs = []

                if not current_selected_types: 
                    filtered_javs = []
                else:
                    filtered_javs = [
                        jav for jav in javs
                        if jav.get('entry_type') in current_selected_types
                    ]

                if not javs: 
                    grid_view.controls.append(
                        ft.Container(
                            content=ft.Text(f"No entries logged for {year_str} yet. Use the '+' button to add one!", italic=True, text_align=ft.TextAlign.CENTER, size=16),
                            alignment=ft.alignment.center, padding=30, expand=True 
                        )
                    )
                elif not filtered_javs: 
                    grid_view.controls.append(
                        ft.Container(
                            content=ft.Text(
                                f"No entries for {year_str} match the selected type filters." if app_state["year_view_selected_entry_types"] else f"No entry types selected. Please select types to view for {year_str}.", 
                                italic=True, text_align=ft.TextAlign.CENTER, size=16
                            ),
                            alignment=ft.alignment.center, padding=30, expand=True 
                        )
                    )
                else:
                    for jav_item in filtered_javs:
                        try:
                            card = create_gallery_card(page, jav_item, delete_jav_action, open_edit_jav_dialog_wrapper, show_description_dialog)
                            if card: grid_view.controls.append(card)
                        except Exception as card_error:
                            print(f"ERROR CREATING CARD for entry ID {jav_item.get('id', '???')}: {card_error}"); traceback.print_exc()
                            grid_view.controls.append(
                                ft.Card(content=ft.Container(padding=20, content=ft.Column([
                                    ft.Icon(ft.icons.ERROR_OUTLINE, color=ft.colors.ERROR, size=30),
                                    ft.Text(f"Error loading: {jav_item.get('name', 'Unknown')}", color=ft.colors.ERROR),
                                    ft.Text(f"{card_error}", size=10, color=ft.colors.ERROR, max_lines=2, overflow=ft.TextOverflow.ELLIPSIS)
                                ])))
                            )
            except ValueError: grid_view.controls.append(ft.Text(f"Invalid year: {year_str}", color=ft.colors.ERROR))
            except Exception as e:
                print(f"OVERALL ERROR loading entries for {year_str}: {e}"); traceback.print_exc()
                grid_view.controls.append(ft.Text(f"Error loading entries: {e}", color=ft.colors.ERROR))
            
            if hasattr(grid_view, 'page') and grid_view.page: 
                try: grid_view.update()
                except: pass

        def on_year_view_filter_change():
            refresh_view_content()
            # --- Save the current year view filter selection ---
            filter_str_to_save = ",".join(sorted(list(app_state["year_view_selected_entry_types"])))
            set_setting_db(SAVED_YEAR_VIEW_FILTER_KEY, filter_str_to_save)
            print(f"Saved year view filter: {filter_str_to_save}")


        def delete_jav_action(jav_id, jav_name):
            jav_to_delete = next((j for j in get_all_javs_db() if j['id'] == jav_id), None) 
            
            delete_jav_db(jav_id) 

            if jav_to_delete:
                image_to_delete_ref = jav_to_delete.get('image_url')
                if image_to_delete_ref and image_to_delete_ref.startswith("images/") and \
                   not (image_to_delete_ref.lower().startswith("http://") or image_to_delete_ref.lower().startswith("https://")):
                    full_image_path_to_delete = os.path.join(ASSETS_DIR, image_to_delete_ref)
                    if os.path.exists(full_image_path_to_delete):
                        try:
                            os.remove(full_image_path_to_delete)
                            print(f"Deleted local image: {full_image_path_to_delete}")
                            show_snackbar(f"Deleted '{jav_name}' and its local image.", duration=2500)
                        except OSError as e:
                            print(f"Error deleting local image {full_image_path_to_delete}: {e}")
                            show_snackbar(f"Deleted '{jav_name}', but failed to delete its local image: {e}", color=ft.colors.WARNING_CONTAINER, duration=3000)
                    else:
                        show_snackbar(f"Deleted '{jav_name}'. Local image file not found for deletion.", color=ft.colors.WARNING_CONTAINER, duration=3000)
                else:
                     show_snackbar(f"Deleted '{jav_name}'", duration=2500) 
            else:
                show_snackbar(f"Deleted entry (ID: {jav_id})", duration=2500) 
            
            refresh_view_content() 
            current_stats_filter = "All Time"
            try:
                if stats_year_filter.current and stats_year_filter.current.selected:
                    current_stats_filter = list(stats_year_filter.current.selected)[0]
            except Exception as stats_e: print(f"Warning: Error accessing stats_year_filter selection after delete: {stats_e}")
            page.run_thread(calculate_and_update_stats_display, current_stats_filter) 

        def open_edit_jav_dialog_wrapper(jav_item_data):
            open_edit_jav_dialog(jav_item_data, refresh_view_content)
        
        filter_button_ui = create_entry_type_filter_button_with_sheet(
            page, ALL_ENTRY_TYPES_STR, app_state["year_view_selected_entry_types"], 
            on_year_view_filter_change, button_label_prefix="Filter Entries"
        )
        
        # --- THE FIX IS HERE ---
        year_grid_view = ft.GridView(
            ref=year_grid_view_ref,
            expand=True, runs_count=5, max_extent=270, child_aspect_ratio=0.55, # Changed from 0.68 to 0.58
            spacing=10, run_spacing=10, padding=ft.padding.all(10)
        )

        refresh_view_content() 

        return ft.Column( 
            expand=True,
            controls=[
                ft.Container(
                    content=ft.Row([filter_button_ui], alignment=ft.MainAxisAlignment.END),
                    padding=ft.padding.only(left=10, right=10, top=10, bottom=5),
                ),
                year_grid_view 
            ]
        )

    def calculate_and_update_stats_display(filter_year="All Time"):
        print(f"Calculating stats for display filter: {filter_year}")
        base_jav_data = []; total_javs, average_score, total_rewatches, unique_genres_count = 0, 0.0, 0, 0
        pie_sections_data, legend_items_data = [], []
        genre_specific_colors = { 
            "action": ft.colors.RED_600, "drama": ft.colors.INDIGO_500, "comedy": ft.colors.ORANGE_600,
            "school": ft.colors.GREEN_600, "romance": ft.colors.PINK_400, "slice of life": ft.colors.CYAN_700,
            "fantasy": ft.colors.PURPLE_400, "sci-fi": ft.colors.BLUE_GREY_500, "thriller": ft.colors.DEEP_ORANGE_800,
            "horror": ft.colors.BLACK, "mystery": ft.colors.TEAL_700, "adventure": ft.colors.AMBER_700,
            "supernatural": ft.colors.DEEP_PURPLE_400, "sports": ft.colors.LIGHT_GREEN_700,
            "historical": ft.colors.BROWN_500, "music": ft.colors.LIGHT_BLUE_500,
            "jav": ft.colors.RED_ACCENT_700, "anime": ft.colors.BLUE_ACCENT_700, "movie": ft.colors.GREEN_ACCENT_700,
            "show": ft.colors.PURPLE_ACCENT_700, "k-drama": ft.colors.ORANGE_ACCENT_700, "hentai": ft.colors.PINK_ACCENT_400,
            "game": ft.colors.CYAN_ACCENT_700, 
            "rpg": ft.colors.DEEP_PURPLE_ACCENT_200,
            "strategy": ft.colors.INDIGO_ACCENT_100,
        }
        fallback_genre_colors = [ft.colors.BLUE_500, ft.colors.PURPLE_500, ft.colors.TEAL_500, ft.colors.CYAN_500, ft.colors.LIGHT_BLUE_500, ft.colors.LIME_500, ft.colors.AMBER_500, ft.colors.DEEP_ORANGE_500, ft.colors.LIGHT_GREEN_500, ft.colors.DEEP_PURPLE_500, ft.colors.BROWN_400, ft.colors.BLUE_GREY_500, ft.colors.YELLOW_800]
        
        # New color palettes for variety
        platform_colors = [ft.colors.CYAN_700, ft.colors.INDIGO_400, ft.colors.GREEN_700, ft.colors.RED_700, ft.colors.ORANGE_ACCENT_700, ft.colors.BLUE_GREY_600]
        person_colors = [ft.colors.TEAL_400, ft.colors.AMBER_600, ft.colors.LIGHT_BLUE_400, ft.colors.LIME_700, ft.colors.DEEP_PURPLE_300, ft.colors.PINK_300]
        version_colors = [ft.colors.BROWN_400, ft.colors.BLUE_GREY_500, ft.colors.GREEN_300, ft.colors.INDIGO_200, ft.colors.DEEP_ORANGE_300]
        
        unknown_genre_color = ft.colors.with_opacity(0.5, ft.colors.ON_SURFACE_VARIANT)

        # Chart data placeholders
        platform_pie_sections, platform_legend_items = [], []
        author_pie_sections, author_legend_items = [], []
        director_pie_sections, director_legend_items = [], []
        actress_pie_sections, actress_legend_items = [], []
        version_pie_sections, version_legend_items = [], []
        show_platform_chart, show_book_chart, show_jav_charts, show_avn_chart = False, False, False, False

        try:
            if filter_year == "All Time": base_jav_data = get_all_javs_db()
            else:
                try: year_int = int(filter_year); base_jav_data = get_javs_by_year_db(year_int)
                except ValueError: base_jav_data = [] 
            base_jav_data = base_jav_data or [] 

            current_selected_stat_types = app_state["stats_view_selected_entry_types"]
            jav_data = []
            if not current_selected_stat_types: 
                jav_data = []
            else:
                jav_data = [
                    jav for jav in base_jav_data
                    if jav.get('entry_type') in current_selected_stat_types
                ]
            
            total_javs = len(jav_data);
            total_rewatches = sum(1 for g in jav_data if g.get('is_rewatch') == 1)
            valid_scores = [g['review_score'] for g in jav_data if g.get('review_score') is not None and isinstance(g['review_score'], (int, float))]
            average_score = (sum(valid_scores) / len(valid_scores)) if valid_scores else 0.0

            genre_counts = Counter()
            total_genre_instances = 0 
            if jav_data:
                for g in jav_data:
                    genre_str = g.get('genre')
                    genres_in_entry = parse_genres(genre_str) 
                    if genres_in_entry:
                        genre_counts.update(genres_in_entry)
                        total_genre_instances += len(genres_in_entry)
                    else: 
                        genre_counts.update(["Unknown Genre"]) 
                        total_genre_instances += 1 
            unique_genres_count = len(genre_counts) 

            fallback_color_index = 0; sorted_genres = genre_counts.most_common() 
            
            if not sorted_genres and total_javs > 0 and not total_genre_instances : 
                legend_items_data.append(ft.Text("No genre data for selected items."))
            elif not sorted_genres and total_javs == 0: 
                legend_items_data.append(ft.Text("No items match current filters."))


            for genre, count in sorted_genres:
                percentage = (count / total_genre_instances * 100) if total_genre_instances > 0 else 0
                genre_lower = genre.lower().strip() 
                
                assigned_color = unknown_genre_color if genre == "Unknown Genre" else None
                if assigned_color is None: 
                    assigned_color = genre_specific_colors.get(genre_lower)
                if assigned_color is None: 
                    for specific_genre_key, color_val in genre_specific_colors.items():
                        if specific_genre_key in genre_lower:
                            assigned_color = color_val
                            break
                if assigned_color is None: 
                    assigned_color = fallback_genre_colors[fallback_color_index % len(fallback_genre_colors)]
                    fallback_color_index += 1

                pie_sections_data.append(
                    ft.PieChartSection(
                        value=percentage, 
                        title=f"{percentage:.0f}%" if percentage >= 5 else "", 
                        title_style=ft.TextStyle(size=10, color=ft.colors.WHITE, weight=ft.FontWeight.BOLD), 
                        color=assigned_color, radius=60 
                    )
                )
                legend_items_data.append( ft.Row([ ft.Container(width=16, height=16, bgcolor=assigned_color, border_radius=3), ft.Text(f"{genre} ({count})") ], spacing=10))
            
            if not pie_sections_data and total_javs > 0 :
                pie_sections_data.append(ft.PieChartSection(value=100, title="", color=ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE)))
                if not legend_items_data: legend_items_data.append(ft.Text("No genre data to display."))
            elif not pie_sections_data and total_javs == 0: 
                pie_sections_data.append(ft.PieChartSection(value=100, title="N/A", color=ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE)))
                if not legend_items_data: legend_items_data.append(ft.Text("No data for chart."))

            # --- Type-Specific Chart Data Calculation ---
            platforms, authors, directors, actresses, versions = [], [], [], [], []
            
            show_platform_chart = "Game" in current_selected_stat_types
            show_book_chart = "Book" in current_selected_stat_types
            show_jav_charts = "JAV" in current_selected_stat_types
            show_avn_chart = "Adult Visual Novel" in current_selected_stat_types

            if show_platform_chart or show_book_chart or show_jav_charts or show_avn_chart:
                for jav in jav_data:
                    entry_type = jav.get('entry_type')
                    if show_platform_chart and entry_type == 'Game' and jav.get('platform'):
                        platforms.append(jav['platform'])
                    if show_book_chart and entry_type == 'Book' and jav.get('author'):
                        authors.extend(parse_multi_value_field(jav['author']))
                    if show_jav_charts and entry_type == 'JAV':
                        # --- THE FIX IS HERE ---
                        if jav.get('director'): 
                            directors.extend(parse_multi_value_field(jav['director']))
                        if jav.get('actress'): 
                            actresses.extend(parse_multi_value_field(jav['actress']))
                    if show_avn_chart and entry_type == 'Adult Visual Novel' and jav.get('update_version'):
                        versions.append(jav['update_version'])

            platform_pie_sections, platform_legend_items = _generate_pie_data_from_list(platforms, platform_colors)
            author_pie_sections, author_legend_items = _generate_pie_data_from_list(authors, person_colors)
            director_pie_sections, director_legend_items = _generate_pie_data_from_list(directors, person_colors)
            actress_pie_sections, actress_legend_items = _generate_pie_data_from_list(actresses, person_colors[::-1])
            version_pie_sections, version_legend_items = _generate_pie_data_from_list(versions, version_colors)

        except Exception as e: 
            print(f"ERROR DURING STATS CALCULATION: {e}"); traceback.print_exc(); 
            total_javs, average_score, total_rewatches, unique_genres_count = "Error", "N/A", "Error", "Error"
            pie_sections_data, legend_items_data = [], [ft.Text("Error loading genre data.", color=ft.colors.ERROR)]
            platform_pie_sections, platform_legend_items = [], [ft.Text("Error", color=ft.colors.ERROR)]
            author_pie_sections, author_legend_items = [], [ft.Text("Error", color=ft.colors.ERROR)]
            director_pie_sections, director_legend_items = [], [ft.Text("Error", color=ft.colors.ERROR)]
            actress_pie_sections, actress_legend_items = [], [ft.Text("Error", color=ft.colors.ERROR)]
            version_pie_sections, version_legend_items = [], [ft.Text("Error", color=ft.colors.ERROR)]
            show_platform_chart = show_book_chart = show_jav_charts = show_avn_chart = False

        def safe_update(control_ref, value_attr, new_value, default_value_for_empty_list=None):
            if control_ref.current and hasattr(control_ref.current, 'page') and control_ref.current.page:
                if (value_attr == "sections" or value_attr == "controls") and not new_value and default_value_for_empty_list is not None:
                    setattr(control_ref.current, value_attr, default_value_for_empty_list)
                else:
                    setattr(control_ref.current, value_attr, new_value)
                try: control_ref.current.update()
                except Exception as update_err: print(f"Error updating control {control_ref}: {update_err}")


        safe_update(stats_total_javs_text, "value", str(total_javs))
        safe_update(stats_avg_score_text, "value", f"{average_score:.1f}" if isinstance(average_score, float) else str(average_score))
        safe_update(stats_total_rewatches_text, "value", str(total_rewatches))
        safe_update(stats_unique_genres_text, "value", str(unique_genres_count))
        
        pie_placeholder = [ft.PieChartSection(value=1, title="N/A", color=ft.colors.SURFACE_VARIANT)]
        safe_update(genre_pie_chart, "sections", pie_sections_data if pie_sections_data else pie_placeholder)
        
        legend_placeholder = [ft.Text("No genre data.")]
        safe_update(genre_legend, "controls", legend_items_data if legend_items_data else legend_placeholder)
        
        # --- NEW: Update visibility and data for new charts ---
        safe_update(platform_chart_container, "visible", show_platform_chart)
        if show_platform_chart:
            safe_update(platform_pie_chart, "sections", platform_pie_sections)
            safe_update(platform_legend, "controls", platform_legend_items)

        safe_update(author_chart_container, "visible", show_book_chart)
        if show_book_chart:
            safe_update(author_pie_chart, "sections", author_pie_sections)
            safe_update(author_legend, "controls", author_legend_items)

        safe_update(director_chart_container, "visible", show_jav_charts)
        if show_jav_charts:
            safe_update(director_pie_chart, "sections", director_pie_sections)
            safe_update(director_legend, "controls", director_legend_items)

        safe_update(actress_chart_container, "visible", show_jav_charts)
        if show_jav_charts:
            safe_update(actress_pie_chart, "sections", actress_pie_sections)
            safe_update(actress_legend, "controls", actress_legend_items)

        safe_update(version_chart_container, "visible", show_avn_chart)
        if show_avn_chart:
            safe_update(version_pie_chart, "sections", version_pie_sections)
            safe_update(version_legend, "controls", version_legend_items)

        print(f"Stats UI update complete for {filter_year}.")

    def on_stats_filter_change(e): 
        selected_year = list(e.control.selected)[0] if e.control.selected else "All Time" 
        if page: page.run_thread(calculate_and_update_stats_display, selected_year)

    def create_summary_card(icon_name, value_ref, label):
        return ft.Card(
            content=ft.Container(
                padding=15,
                content=ft.Column(
                    [
                        ft.Icon(name=icon_name, size=24),
                        ft.Text(ref=value_ref, value="...", size=20, weight=ft.FontWeight.BOLD),
                        ft.Text(label, size=12, color=ft.colors.with_opacity(0.7, ft.colors.ON_SURFACE))
                    ],
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    alignment=ft.MainAxisAlignment.CENTER, spacing=5,
                )
            )
        )
    
    def on_theme_change(e):
        new_theme_name = e.control.value
        if new_theme_name and new_theme_name in THEMES:
            theme_config = THEMES[new_theme_name]
            page.theme_mode = theme_config["mode"]
            page.theme.color_scheme_seed = theme_config["seed"]
            page.update()
            set_setting_db("current_theme", new_theme_name)
            show_snackbar(f"Theme changed to {new_theme_name}", duration=2000)
            if app_state["current_view"] == "Stats" and stats_year_filter.current:
                current_stats_filter = list(stats_year_filter.current.selected)[0] if stats_year_filter.current.selected else "All Time"
                page.run_thread(calculate_and_update_stats_display, current_stats_filter)

    theme_dropdown = ft.Dropdown(
        label="App Theme",
        options=[ft.dropdown.Option(name) for name in THEMES.keys()],
        value=get_setting_db("current_theme", DEFAULT_THEME_NAME),
        on_change=on_theme_change, width=250
    )

    def build_stats_view():
        print("Building stats view")
        
        if not stats_year_filter.current:
            stats_year_filter.current = ft.SegmentedButton(
                segments=[ft.Segment(value="All Time", label=ft.Text("Overall"))] + [ft.Segment(value=year, label=ft.Text(year)) for year in YEARS],
                selected={"All Time"}, 
                allow_empty_selection=False, 
                show_selected_icon=False, 
                on_change=on_stats_filter_change
            )
        else: 
            stats_year_filter.current.on_change = on_stats_filter_change

        initial_filter = "All Time"
        if stats_year_filter.current and stats_year_filter.current.selected: 
             initial_filter = list(stats_year_filter.current.selected)[0]
        
        def on_stats_entry_type_filter_change():
            current_year_filter_for_stats = "All Time" 
            if stats_year_filter.current and stats_year_filter.current.selected:
                current_year_filter_for_stats = list(stats_year_filter.current.selected)[0]
            page.run_thread(calculate_and_update_stats_display, current_year_filter_for_stats)
            # --- Save the current stats view filter selection ---
            filter_str_to_save = ",".join(sorted(list(app_state["stats_view_selected_entry_types"])))
            set_setting_db(SAVED_STATS_VIEW_FILTER_KEY, filter_str_to_save)
            print(f"Saved stats view filter: {filter_str_to_save}")


        stats_entry_type_filter_button = create_entry_type_filter_button_with_sheet(
            page, ALL_ENTRY_TYPES_STR, app_state["stats_view_selected_entry_types"], 
            on_stats_entry_type_filter_change, button_label_prefix="Filter Stats"
        )
        
        page.run_thread(calculate_and_update_stats_display, initial_filter)
        theme_dropdown.value = get_setting_db("current_theme", DEFAULT_THEME_NAME) 

        def _create_breakdown_card(container_ref, chart_ref, legend_ref, title):
            return ft.Card(
                ref=container_ref,
                visible=False, # Initially hidden
                content=ft.Container(
                    padding=20,
                    content=ft.Row([
                        ft.Column([
                            ft.Text(title, style=ft.TextThemeStyle.TITLE_MEDIUM),
                            ft.PieChart(
                                ref=chart_ref, sections=[], center_space_radius=40,
                                sections_space=1,
                            )
                        ], expand=3, alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column([
                            ft.Text("Top Entries", weight=ft.FontWeight.BOLD),
                            ft.Column(
                                ref=legend_ref, controls=[], spacing=8,
                                scroll=ft.ScrollMode.ADAPTIVE
                            )
                        ], expand=2, horizontal_alignment=ft.CrossAxisAlignment.START, scroll=ft.ScrollMode.ADAPTIVE, height=250),
                    ], alignment=ft.MainAxisAlignment.SPACE_AROUND, vertical_alignment=ft.CrossAxisAlignment.CENTER, spacing=20, height=260)
                )
            )

        controls_list = [
            ft.Text("Statistics", style=ft.TextThemeStyle.HEADLINE_MEDIUM), 
            ft.Row([stats_year_filter.current, stats_entry_type_filter_button], alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER),
            ft.Container(content=ft.Text("Summary", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.GridView( runs_count=5, max_extent=180, child_aspect_ratio=1.1, spacing=10, run_spacing=10, controls=[
                create_summary_card(ft.icons.MOVIE_FILTER_ROUNDED, stats_total_javs_text, "Total Entries Logged"),
                create_summary_card(ft.icons.STAR_RATE_ROUNDED, stats_avg_score_text, "Average Rating"),
                create_summary_card(ft.icons.REPLAY_CIRCLE_FILLED_ROUNDED, stats_total_rewatches_text, "Rewatches Logged"),
                create_summary_card(ft.icons.CATEGORY_ROUNDED, stats_unique_genres_text, "Unique Genres"),
            ] ),
            ft.Container(content=ft.Text("Genre Breakdown", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Card( content=ft.Container( padding=20, content=ft.Row( [ ft.Column( [ ft.PieChart( ref=genre_pie_chart, sections=[], center_space_radius=40, sections_space=1, ) ], expand=3, alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER ), ft.Column( [ ft.Text("Genres", weight=ft.FontWeight.BOLD), ft.Column( ref=genre_legend, controls=[ft.ProgressRing(width=20, height=20)], spacing=8, scroll=ft.ScrollMode.ADAPTIVE) ], expand=2, horizontal_alignment=ft.CrossAxisAlignment.START, scroll=ft.ScrollMode.ADAPTIVE, height=250 ), ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER, height=260 ) ) ),
            
            # --- New Type-Specific Charts ---
            ft.Container(content=ft.Text("Type-Specific Breakdowns", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            _create_breakdown_card(platform_chart_container, platform_pie_chart, platform_legend, "Platform Breakdown (Games)"),
            _create_breakdown_card(author_chart_container, author_pie_chart, author_legend, "Author Breakdown (Books)"),
            _create_breakdown_card(director_chart_container, director_pie_chart, director_legend, "Director Breakdown (JAV)"),
            _create_breakdown_card(actress_chart_container, actress_pie_chart, actress_legend, "Actress Breakdown (JAV)"),
            _create_breakdown_card(version_chart_container, version_pie_chart, version_legend, "Version Breakdown (AVN)"),

            ft.Divider(height=20, thickness=1),
            ft.Text("Settings", style=ft.TextThemeStyle.TITLE_MEDIUM),
            ft.Row([ft.Text("Theme:"), theme_dropdown], vertical_alignment=ft.CrossAxisAlignment.CENTER),
            ft.Divider(height=20, thickness=1),
            ft.Container(content=ft.Text("Import / Export", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Row( [ ft.ElevatedButton("Import from CSV", icon=ft.icons.UPLOAD_FILE_ROUNDED, on_click=open_import_dialog), ], spacing=10 ),
            ft.Text( "CSV Format: Header row required. Columns: Name (Req), Genre, Review_Score, Completion_Date (Req), Description, IsRewatch, OwnLocalCopy, EntryType, ImageURL, Platform, Author, Director, Actress, UpdateVersion. Case insensitive for headers.", italic=True, size=11, color=ft.colors.with_opacity(0.6, ft.colors.ON_SURFACE), max_lines=4 )
        ]
        return ft.Container(
    content=ft.Column(
        expand=True,
        spacing=20,
        controls=controls_list,
        scroll=ft.ScrollMode.ADAPTIVE
    ),
    padding=ft.padding.symmetric(horizontal=20, vertical=10),
    expand=True
)

    def fab_clicked(e):
        current_view = app_state["current_view"]
        if current_view in YEARS: open_add_jav_dialog()
        else: show_snackbar("No action available here.") 
    fab = ft.FloatingActionButton(icon=ft.icons.ADD, tooltip="Add Entry", visible=False, on_click=fab_clicked)
    page.floating_action_button = fab; page.floating_action_button_location = ft.FloatingActionButtonLocation.END_CONTAINED

    try:
        initial_index = YEARS.index(app_state["current_view"])
    except ValueError: 
        if app_state["current_view"] == "Stats": initial_index = len(YEARS)
        else: 
            initial_index = 0
            app_state["current_view"] = YEARS[0] if YEARS else "Stats"

    rail = ft.NavigationRail(
        selected_index=initial_index, label_type=ft.NavigationRailLabelType.ALL,
        min_width=100, min_extended_width=200, group_alignment=-0.9,
        destinations=(
            [ft.NavigationRailDestination(icon=ft.icons.CALENDAR_MONTH_OUTLINED, selected_icon=ft.icons.CALENDAR_MONTH, label=y) for y in YEARS] +
            [ft.NavigationRailDestination(icon=ft.icons.QUERY_STATS_OUTLINED, selected_icon=ft.icons.QUERY_STATS, label="Stats")]
        ),
    )
    main_content_area = ft.Column(expand=True, controls=[]) 

    def update_main_content(view_id):
        app_state["current_view"] = view_id
        main_content_area.controls.clear(); show_fab, fab_tooltip, content = False, "Add Entry", None
        if view_id in YEARS: content = build_year_view(view_id); show_fab = True; fab_tooltip = f"Add Entry to {view_id}"
        elif view_id == "Stats": content = build_stats_view(); show_fab = False
        else: content = ft.Container(content=ft.Text(f"Error: Unknown view '{view_id}' selected.", color=ft.colors.ERROR), padding=20); show_fab = False
        
        if content: main_content_area.controls.append(content)
        
        fab.visible = show_fab; fab.tooltip = fab_tooltip
        if page: 
            try:
                main_content_area.update(); fab.update()
            except Exception as e: print(f"Error updating main content/fab: {e}")


    def refresh_current_view(): update_main_content(app_state['current_view'])
    def navigation_change(e):
        idx = e.control.selected_index; new_view = "Unknown"
        if 0 <= idx < len(YEARS): new_view = YEARS[idx]
        elif idx == len(YEARS): new_view = "Stats" 
        
        close_manual_dialog() 
        if hasattr(page, 'dialog') and page.dialog is not None and page.dialog.open:
             page.dialog.open = False
             if hasattr(page.dialog, 'on_dismiss') and callable(page.dialog.on_dismiss):
                 page.dialog.on_dismiss(None) 
             else: 
                 if page.dialog in page.overlay: page.overlay.remove(page.dialog)
                 page.dialog = None
             if page: page.update()

        if new_view != "Unknown": update_main_content(new_view)
        else: show_snackbar(f"Could not navigate to index {idx}.")
    rail.on_change = navigation_change

    main_layout = ft.Row(controls=[rail, ft.VerticalDivider(width=1), main_content_area], expand=True, vertical_alignment=ft.CrossAxisAlignment.START)
    main_stack.controls.append(main_layout)
    page.add(main_stack)
    update_main_content(app_state["current_view"]) 

if __name__ == "__main__":
    ft.app(target=main)