import flet as ft
import sys
import os

# --- Determine the base path ---
# This logic is crucial for ensuring the app finds its files whether running as a script or a packaged executable.
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    # Running in a PyInstaller bundle or similar
    base_path = os.path.dirname(sys.executable)
else:
    # Running as a normal Python script
    base_path = os.path.dirname(os.path.abspath(__file__))

# --- Core Application Paths ---
DB_FILE = os.path.join(base_path, "jav_log.db")
ASSETS_DIR = os.path.join(base_path, "assets")
IMAGES_DIR = os.path.join(ASSETS_DIR, "images")

# --- Application Metadata ---
APP_TITLE = "Media Logger"
YEARS = ["2023", "2024", "2025"] # TODO: Consider making this dynamic or configurable

# --- Formatting and Defaults ---
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

# --- Entry Type Definitions ---
ENTRY_TYPE_OPTIONS = [
    ft.dropdown.Option("Movie"), ft.dropdown.Option("Show"), ft.dropdown.Option("Anime"),
    ft.dropdown.Option("Book"),
    ft.dropdown.Option("K-Drama"), ft.dropdown.Option("JAV"), ft.dropdown.Option("Hentai"),
    ft.dropdown.Option("Game"), ft.dropdown.Option("Adult Visual Novel"),
    ft.dropdown.Option("Other"),
]
ALL_ENTRY_TYPES_STR = [opt.key for opt in ENTRY_TYPE_OPTIONS if opt.key]

# --- Saved Preferences Keys (for database settings) ---
SAVED_YEAR_VIEW_FILTER_KEY = "year_view_last_filter_v2"
SAVED_STATS_VIEW_FILTER_KEY = "stats_view_last_filter_v2"
SAVED_SEARCH_VIEW_FILTER_KEY = "search_view_last_filter_v2"
SAVED_BACKLOG_VIEW_FILTER_KEY = "backlog_view_last_filter_v1" # <-- NEW

# --- Search Field Options ---
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