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
import asyncio

# --- Markdown Rendering Function ---
def render_markdown(markdown_text: str) -> list[ft.Control]:
    """
    Converts raw Markdown text into a list of Flet controls with rich formatting.
    Supports headings, lists, quotes, inline styles (bold, italic), and dividers.
    """
    if not markdown_text or not markdown_text.strip():
        return [ft.Text("No description provided.", style=ft.TextStyle(italic=True, color=ft.colors.ON_SURFACE_VARIANT))]
    
    lines = markdown_text.split('\n')
    controls = []
    
    for line in lines:
        line_stripped = line.strip()
        
        # Skip empty lines (they'll add spacing)
        if not line_stripped:
            controls.append(ft.Container(height=8))  # Add vertical spacing
            continue
        
        # Handle headings
        if line_stripped.startswith('###'):
            heading_text = line_stripped[3:].strip()
            controls.append(ft.Text(heading_text, size=16, weight=ft.FontWeight.W_600, color=ft.colors.ON_SURFACE))
        elif line_stripped.startswith('##'):
            heading_text = line_stripped[2:].strip()
            controls.append(ft.Text(heading_text, size=20, weight=ft.FontWeight.BOLD, color=ft.colors.ON_SURFACE))
        elif line_stripped.startswith('#'):
            heading_text = line_stripped[1:].strip()
            controls.append(ft.Text(heading_text, size=24, weight=ft.FontWeight.BOLD, color=ft.colors.ON_SURFACE))
        
        # Handle horizontal dividers
        elif line_stripped in ['---', '***']:
            controls.append(ft.Divider(height=1, thickness=1, color=ft.colors.with_opacity(0.2, ft.colors.ON_SURFACE)))
        
        # Handle blockquotes
        elif line_stripped.startswith('>'):
            quote_text = line_stripped[1:].strip()
            quote_content = _parse_inline_styles(quote_text)
            controls.append(
                ft.Container(
                    content=ft.Text(spans=quote_content, style=ft.TextStyle(italic=True)),
                    padding=ft.padding.only(left=16, top=8, bottom=8, right=8),
                    border=ft.border.only(left=ft.BorderSide(4, ft.colors.PRIMARY)),
                    bgcolor=ft.colors.with_opacity(0.05, ft.colors.PRIMARY),
                    margin=ft.margin.symmetric(vertical=4)
                )
            )
        
        # Handle list items
        elif line_stripped.startswith('* ') or line_stripped.startswith('- '):
            list_text = line_stripped[2:].strip()
            list_content = _parse_inline_styles(list_text)
            controls.append(
                ft.Row([
                    ft.Container(
                        content=ft.Icon(ft.icons.CIRCLE, size=6, color=ft.colors.ON_SURFACE_VARIANT),
                        margin=ft.margin.only(top=6, right=8)
                    ),
                    ft.Container(
                        content=ft.Text(spans=list_content, style=ft.TextStyle(height=1.4)),
                        expand=True
                    )
                ], vertical_alignment=ft.CrossAxisAlignment.START, spacing=0)
            )
        
        # Handle nested list items (with indentation)
        elif line.startswith('  * ') or line.startswith('  - '):
            list_text = line[4:].strip()
            list_content = _parse_inline_styles(list_text)
            controls.append(
                ft.Row([
                    ft.Container(width=16),  # Indentation
                    ft.Container(
                        content=ft.Icon(ft.icons.CIRCLE, size=4, color=ft.colors.ON_SURFACE_VARIANT),
                        margin=ft.margin.only(top=6, right=8)
                    ),
                    ft.Container(
                        content=ft.Text(spans=list_content, style=ft.TextStyle(height=1.4)),
                        expand=True
                    )
                ], vertical_alignment=ft.CrossAxisAlignment.START, spacing=0)
            )
        
        # Handle regular paragraphs
        else:
            paragraph_content = _parse_inline_styles(line_stripped)
            controls.append(
                ft.Text(
                    spans=paragraph_content,
                    style=ft.TextStyle(
                        size=16,
                        height=1.6,
                        letter_spacing=0.2,
                        color=ft.colors.ON_SURFACE
                    )
                )
            )
    
    return controls

def _parse_inline_styles(text: str) -> list[ft.TextSpan]:
    """
    Parses inline markdown styles like **bold**, *italic*, and ~~strikethrough~~
    Returns a list of TextSpan objects for use in ft.Text with spans.
    """
    if not text:
        return [ft.TextSpan("")]
    
    spans = []
    current_pos = 0
    
    # Define regex patterns for different styles
    patterns = [
        (r'\*\*(.*?)\*\*', ft.FontWeight.BOLD, None, None),  # **bold**
        (r'\*(.*?)\*', None, True, None),                    # *italic*
        (r'~~(.*?)~~', None, None, True),                    # ~~strikethrough~~
    ]
    
    # Find all matches for all patterns
    all_matches = []
    for pattern, weight, italic, strikethrough in patterns:
        for match in re.finditer(pattern, text):
            all_matches.append({
                'start': match.start(),
                'end': match.end(),
                'content': match.group(1),
                'weight': weight,
                'italic': italic,
                'strikethrough': strikethrough,
                'full_match': match.group(0)
            })
    
    # Sort matches by start position
    all_matches.sort(key=lambda x: x['start'])
    
    # Process text with matches
    for match in all_matches:
        # Add text before the match
        if current_pos < match['start']:
            spans.append(ft.TextSpan(text[current_pos:match['start']]))
        
        # Add the styled text
        style = ft.TextStyle(
            weight=match['weight'],
            italic=match['italic'],
            decoration=ft.TextDecoration.LINE_THROUGH if match['strikethrough'] else None
        )
        spans.append(ft.TextSpan(match['content'], style))
        
        current_pos = match['end']
    
    # Add remaining text
    if current_pos < len(text):
        spans.append(ft.TextSpan(text[current_pos:]))
    
    # If no matches found, return the whole text as a single span
    if not spans:
        spans.append(ft.TextSpan(text))
    
    return spans

# Import UI components from ui.py
from ui import (
    APP_TITLE, YEARS, GENRE_SEPARATOR, DEFAULT_IMAGE_URL, THEMES, DEFAULT_THEME_NAME,
    ENTRY_TYPE_OPTIONS, ALL_ENTRY_TYPES_STR, SAVED_YEAR_VIEW_FILTER_KEY,
    SAVED_STATS_VIEW_FILTER_KEY, SAVED_SEARCH_VIEW_FILTER_KEY, SEARCH_FIELD_OPTIONS,
    create_rating_badge, get_entry_type_icon_name, get_genre_icon_name,
    create_gallery_card, parse_genres, parse_multi_value_field, format_genres,
    _generate_pie_data_from_list
)

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

def search_javs_db(search_term, search_fields, entry_types=None):
    """
    Search for entries based on search term and specified fields.
    
    Args:
        search_term: The term to search for
        search_fields: List of field keys to search in
        entry_types: Optional list of entry types to filter by
    
    Returns:
        List of matching entries
    """
    conn = None
    javs = []
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if not search_term or not search_term.strip():
            return []
        
        search_term_lower = search_term.strip().lower()
        
        # Build WHERE conditions for search fields
        where_conditions = []
        params = []
        
        # All searchable fields are text-based and can be handled with the same logic.
        # The `IFNULL` function makes the query robust against NULL values in the database,
        # treating them as empty strings for the purpose of the search.
        # The `LIKE` operator with wildcards ('%') allows for substring matching. This will
        # correctly find "name2" within a field containing "name1, name2, name3".
        valid_db_columns = {opt["key"] for opt in SEARCH_FIELD_OPTIONS}
        
        for field in search_fields:
            if field in valid_db_columns:
                where_conditions.append(f"LOWER(IFNULL({field}, '')) LIKE ?")
                params.append(f"%{search_term_lower}%")
        
        if not where_conditions:
            return []
        
        # Combine search conditions with OR
        search_where = " OR ".join(where_conditions)
        
        # Add entry type filter if specified
        if entry_types:
            entry_type_placeholders = ",".join("?" * len(entry_types))
            full_where = f"({search_where}) AND entry_type IN ({entry_type_placeholders})"
            params.extend(entry_types)
        else:
            full_where = search_where
        
        query = f"SELECT * FROM javs WHERE {full_where} ORDER BY completion_date DESC, id DESC"
        
        cursor.execute(query, params)
        javs = [dict(row) for row in cursor.fetchall()]
        
    except sqlite3.Error as e:
        print(f"Database error during search: {e}")
        traceback.print_exc()
    finally:
        if conn:
            conn.close()
    
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
                label="Studio", capitalization=ft.TextCapitalization.WORDS,
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

# --- Helper function to create search field selection UI ---
def create_search_fields_filter_button_with_sheet(
    page_ref: ft.Page,
    available_fields: list[dict],
    selected_fields_set: set[str], 
    on_change_callback: callable,
    button_label_prefix: str = "Search In"
):
    filter_button_ref = ft.Ref[ft.OutlinedButton]()

    def get_button_text():
        count = len(selected_fields_set)
        if count == len(available_fields):
            return f"{button_label_prefix} (All Fields)"
        elif count == 0:
            return f"{button_label_prefix} (No Fields)"
        else:
            return f"{button_label_prefix} ({count} fields)"

    all_fields_checkbox_bs_ref = ft.Ref[ft.Checkbox]()
    individual_checkbox_bs_refs = {field["key"]: ft.Ref[ft.Checkbox]() for field in available_fields}

    def update_button_and_all_cb_state():
        if filter_button_ref.current:
            filter_button_ref.current.text = get_button_text()
            if filter_button_ref.current.page: 
                try: filter_button_ref.current.update()
                except: pass 

        if all_fields_checkbox_bs_ref.current:
            all_selected = len(selected_fields_set) == len(available_fields)
            if all_fields_checkbox_bs_ref.current.value != all_selected:
                 all_fields_checkbox_bs_ref.current.value = all_selected
                 if all_fields_checkbox_bs_ref.current.page: 
                     try: all_fields_checkbox_bs_ref.current.update()
                     except: pass

    def on_all_fields_bs_change(e):
        is_checked = e.control.value
        if is_checked:
            selected_fields_set.update([field["key"] for field in available_fields])
        else:
            selected_fields_set.clear()
        
        for field_key, cb_ref in individual_checkbox_bs_refs.items():
            if cb_ref.current:
                if cb_ref.current.value != is_checked:
                    cb_ref.current.value = is_checked
                    if cb_ref.current.page: 
                        try: cb_ref.current.update()
                        except: pass
        update_button_and_all_cb_state()

    def on_individual_field_bs_change(e):
        field_key = e.control.data
        is_checked = e.control.value
        if is_checked:
            selected_fields_set.add(field_key)
        else:
            selected_fields_set.discard(field_key)
        update_button_and_all_cb_state()

    bs_checkbox_controls = []
    all_fields_cb_bs = ft.Checkbox(
        ref=all_fields_checkbox_bs_ref, label="All Fields",
        value=len(selected_fields_set) == len(available_fields),
        on_change=on_all_fields_bs_change, adaptive=True
    )
    bs_checkbox_controls.append(all_fields_cb_bs)
    bs_checkbox_controls.append(ft.Divider(height=5, thickness=0.5))

    for field in available_fields:
        cb = ft.Checkbox(
            ref=individual_checkbox_bs_refs[field["key"]], label=field["label"],
            value=field["key"] in selected_fields_set, data=field["key"],
            on_change=on_individual_field_bs_change, adaptive=True
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
                    ft.Text("Select Search Fields", weight=ft.FontWeight.BOLD, size=16),
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
        if all_fields_checkbox_bs_ref.current:
            all_fields_checkbox_bs_ref.current.value = (len(selected_fields_set) == len(available_fields))
        for field_key, cb_ref in individual_checkbox_bs_refs.items():
            if cb_ref.current:
                cb_ref.current.value = (field_key in selected_fields_set)
        
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
        icon=ft.icons.SEARCH_OUTLINED,
        on_click=open_filter_bottom_sheet,
        tooltip="Select which fields to search in"
    )
    return filter_button


# --- Main Application ---
async def main(page: ft.Page):
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

    saved_search_filter_str = get_setting_db(SAVED_SEARCH_VIEW_FILTER_KEY)
    if saved_search_filter_str is not None:
        search_view_selected_types = set(s_type for s_type in saved_search_filter_str.split(',') if s_type)
    else: # Default to all if not found
        search_view_selected_types = set(ALL_ENTRY_TYPES_STR)
    
    app_state = {
        "current_view": YEARS[0] if YEARS else "Stats",
        "year_view_selected_entry_types": year_view_selected_types,
        "stats_view_selected_entry_types": stats_view_selected_types,
        "search_view_selected_entry_types": search_view_selected_types,
        "search_selected_fields": {"name", "author", "platform", "director", "actress", "update_version"},  # Default search fields
        "current_search_term": "",
        "search_results": [],
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

    # --- Search view refs ---
    search_text_field = ft.Ref[ft.TextField]()
    search_results_grid = ft.Ref[ft.GridView]()
    search_results_count_text = ft.Ref[ft.Text]()

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

    export_dialog = ft.FilePicker(on_result=lambda e: handle_export_result(e)); page.overlay.append(export_dialog)
    def handle_export_result(e: ft.FilePickerResultEvent):
        page.dialog = None
        if e.path:
            export_path = e.path
            if not export_path.lower().endswith('.csv'):
                export_path += '.csv'
            print(f"CSV export path selected: {export_path}")
            progress_dialog = ft.AlertDialog(modal=True, title=ft.Text("Exporting CSV"), content=ft.Row([ft.ProgressRing(), ft.Text("Processing...")], alignment=ft.MainAxisAlignment.CENTER))
            page.dialog = progress_dialog; progress_dialog.open = True; page.update()
            page.run_thread(export_csv_data, export_path)
        else: show_snackbar("CSV Export Cancelled or No Path Selected")
    def open_export_dialog(e): export_dialog.save_file(dialog_title="Save CSV Export", file_name="media_log_export.csv", allowed_extensions=["csv"])
    
    def import_csv_data(file_path):
        expected_headers_lower = [ 
            "name", "genre", "review_score", "completion_date", "description", 
            "isrewatch", "ownlocalcopy", "entrytype", "imageurl", "platform",
            "author", "studio", "actress", "updateversion" # Changed director to studio
        ]
        header_map = {
            "name": "name", "genre": "genre_str", "review_score": "score",
            "completion_date": "completion_date_str", "description": "description",
            "isrewatch": "is_rewatch_csv", "ownlocalcopy": "own_local_copy_csv",
            "entrytype": "entry_type_csv", "imageurl": "image_url_csv",
            "platform": "platform_csv", "author": "author_csv", "studio": "director_csv", # Changed director to studio
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


    def export_csv_data(export_path):
        try:
            print(f"--- Starting CSV Export to: {export_path} ---")
            all_entries = get_all_javs_db()
            
            if not all_entries:
                if page: page.run_thread(show_export_summary, "No entries to export.", True)
                return
            
            # Define CSV headers matching the import format
            csv_headers = [
                "Name", "Genre", "Review_Score", "Completion_Date", "Description", 
                "IsRewatch", "OwnLocalCopy", "EntryType", "ImageURL", "Platform",
                "Author", "Studio", "Actress", "UpdateVersion"
            ]
            
            exported_count = 0
            
            with open(export_path, mode='w', encoding='utf-8', newline='') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=csv_headers)
                writer.writeheader()
                
                for entry in all_entries:
                    # Convert database values to CSV format
                    csv_row = {
                        "Name": entry.get('name', ''),
                        "Genre": entry.get('genre', ''),
                        "Review_Score": entry.get('review_score', ''),
                        "Completion_Date": entry.get('completion_date', ''),
                        "Description": entry.get('description', ''),
                        "IsRewatch": 'true' if entry.get('is_rewatch') == 1 else 'false',
                        "OwnLocalCopy": 'true' if entry.get('own_local_copy') == 1 else 'false',
                        "EntryType": entry.get('entry_type', ''),
                        "ImageURL": entry.get('image_url', ''),
                        "Platform": entry.get('platform', ''),
                        "Author": entry.get('author', ''),
                        "Studio": entry.get('director', ''),  # Map director to Studio for consistency
                        "Actress": entry.get('actress', ''),
                        "UpdateVersion": entry.get('update_version', '')
                    }
                    writer.writerow(csv_row)
                    exported_count += 1
            
            print(f"--- CSV Export Finished. Exported: {exported_count} entries ---")
            if page: page.run_thread(show_export_summary, f"Successfully exported {exported_count} entries to {os.path.basename(export_path)}", False)
            
        except Exception as e:
            error_msg = f"Error during CSV export: {e}"
            print(error_msg)
            traceback.print_exc()
            if page: page.run_thread(show_export_summary, error_msg, True)
    
    def show_export_summary(message, had_errors):
        if not page: return
        if hasattr(page, 'dialog') and page.dialog and isinstance(page.dialog, ft.AlertDialog) and page.dialog.title and hasattr(page.dialog.title, 'value') and page.dialog.title.value == "Exporting CSV":
            page.dialog.open = False; page.update()
        snackbar_color = ft.colors.ERROR_CONTAINER if had_errors else ft.colors.GREEN_700
        show_snackbar(message, color=snackbar_color, duration=8000)
        if page: page.update()

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
        
        try:
            if hasattr(page, 'dialog') and page.dialog is not None and page.dialog.open:
                page._dialog_is_opening = False 
                return
                
            description_text = jav_data.get('description') or "No description provided."
            entry_name = jav_data.get('name', 'Entry')
            entry_type = jav_data.get('entry_type', 'Media')
            
            # Create enhanced header with entry type icon and styling
            entry_type_icon = get_entry_type_icon_name(entry_type)
            
            # Enhanced header section
            header_section = ft.Container(
                content=ft.Column([
                    ft.Row([
                        ft.Container(
                            content=ft.Icon(
                                entry_type_icon, 
                                size=28, 
                                color=ft.colors.PRIMARY
                            ),
                            bgcolor=ft.colors.with_opacity(0.1, ft.colors.PRIMARY),
                            padding=ft.padding.all(12),
                            border_radius=ft.border_radius.all(12),
                        ),
                        ft.Container(
                            content=ft.Column([
                                ft.Text(
                                    entry_name,
                                    style=ft.TextThemeStyle.TITLE_LARGE,
                                    weight=ft.FontWeight.W_600,
                                    color=ft.colors.ON_SURFACE,
                                    max_lines=2,
                                    overflow=ft.TextOverflow.ELLIPSIS,
                                ),
                                ft.Container(
                                    content=ft.Text(
                                        entry_type,
                                        size=14,
                                        color=ft.colors.PRIMARY,
                                        weight=ft.FontWeight.W_500,
                                    ),
                                    bgcolor=ft.colors.with_opacity(0.08, ft.colors.PRIMARY),
                                    padding=ft.padding.symmetric(horizontal=12, vertical=6),
                                    border_radius=ft.border_radius.all(16),
                                    margin=ft.margin.only(top=4),
                                )
                            ], spacing=8, tight=True),
                            expand=True
                        )
                    ], spacing=16, vertical_alignment=ft.CrossAxisAlignment.START),
                    
                    # Divider with gradient effect
                    ft.Container(
                        height=1,
                        bgcolor=ft.colors.with_opacity(0.12, ft.colors.ON_SURFACE),
                        margin=ft.margin.symmetric(vertical=20),
                    )
                ], spacing=0, tight=True),
                padding=ft.padding.all(24),
                bgcolor=ft.colors.with_opacity(0.02, ft.colors.PRIMARY),
            )
            
            # Enhanced description content with markdown rendering
            markdown_controls = render_markdown(description_text)
            
            description_content = ft.Container(
                content=ft.Column(
                    controls=markdown_controls,
                    spacing=8,
                    tight=True
                ),
                padding=ft.padding.symmetric(horizontal=24, vertical=16),
                margin=ft.margin.only(bottom=8),
            )
            
            # Scrollable container for description
            max_height = min(400, page.window_height * 0.5) if page.window_height else 400
            scrollable_content = ft.Container(
                content=ft.Column(
                    controls=[description_content],
                    scroll=ft.ScrollMode.ADAPTIVE,
                    tight=True
                ),
                height=max_height,
            )
            
            # Enhanced close button
            close_button = ft.Container(
                content=ft.ElevatedButton(
                    text="Close",
                    icon=ft.icons.CLOSE_ROUNDED,
                    style=ft.ButtonStyle(
                        padding=ft.padding.symmetric(horizontal=24, vertical=12),
                        text_style=ft.TextStyle(
                            size=14,
                            weight=ft.FontWeight.W_600,
                        ),
                        shape=ft.RoundedRectangleBorder(radius=12),
                    ),
                    on_click=lambda e: close_enhanced_dialog()
                ),
                alignment=ft.alignment.center_right,
                padding=ft.padding.only(right=24, bottom=20, top=16),
            )
            
            # Main dialog content
            dialog_content = ft.Container(
                content=ft.Column([
                    header_section,
                    scrollable_content,
                    close_button,
                ], spacing=0, tight=True),
                width=min(600, page.window_width * 0.8) if page.window_width else 600,
                bgcolor=ft.colors.SURFACE,
                border_radius=ft.border_radius.all(20),
                shadow=ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=24,
                    color=ft.colors.with_opacity(0.15, ft.colors.BLACK),
                    offset=ft.Offset(0, 8),
                ),
                border=ft.border.all(
                    1, 
                    ft.colors.with_opacity(0.08, ft.colors.ON_SURFACE)
                ),
            )
            
            # Background overlay
            dialog_overlay = ft.Container(
                content=dialog_content,
                alignment=ft.alignment.center,
                bgcolor=ft.colors.with_opacity(0.5, ft.colors.BLACK),
                expand=True,
                on_click=lambda e: close_enhanced_dialog(),  # Click outside to close
            )
            
            def close_enhanced_dialog():
                if dialog_overlay in main_stack.controls:
                    try:
                        main_stack.controls.remove(dialog_overlay)
                        main_stack.update()
                    except Exception as e:
                        print(f"Error removing enhanced dialog: {e}")
            
            # Prevent clicking on dialog content from closing the dialog
            dialog_content.on_click = lambda e: e.control.page.update() if hasattr(e.control, 'page') else None
            
            # Add to stack and show
            main_stack.controls.append(dialog_overlay)
            main_stack.update()
            
        except Exception as e: 
            print(f"Error in show_description_dialog: {e}")
            traceback.print_exc()
        finally: 
            page._dialog_is_opening = False

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
        
        # Toolbar for Markdown formatting
        def handle_bold_click(e):
            apply_markdown_style(description_field, '**')

        def handle_italic_click(e):
            apply_markdown_style(description_field, '*')

        def handle_header_click(e):
            apply_markdown_style(description_field, '# ', line_start=True)

        def handle_list_click(e):
            apply_markdown_style(description_field, '* ', line_start=True)

        def apply_markdown_style(textfield, style, line_start=False):
            """
            Applies markdown formatting at cursor position or appends to text.
            Since Flet doesn't support text selection, we work with cursor position.
            """
            if not textfield or not hasattr(textfield, 'value'):
                return
                
            current_text = textfield.value or ""
            
            if line_start:
                # For line-start styles (headers, lists), add at beginning of new line
                if current_text and not current_text.endswith('\n'):
                    textfield.value = current_text + '\n' + style
                else:
                    textfield.value = current_text + style
            else:
                # For inline styles (bold, italic), add the markers where cursor is
                # Since we can't get cursor position in Flet, append at the end
                textfield.value = current_text + style + style
            
            textfield.update()
            textfield.focus()

        toolbar = ft.Row([
            ft.IconButton(
                icon=ft.icons.FORMAT_BOLD, 
                tooltip="Add **bold** markers", 
                on_click=handle_bold_click,
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
            ),
            ft.IconButton(
                icon=ft.icons.FORMAT_ITALIC, 
                tooltip="Add *italic* markers", 
                on_click=handle_italic_click,
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
            ),
            ft.IconButton(
                icon=ft.icons.FORMAT_SIZE, 
                tooltip="Add # header", 
                on_click=handle_header_click,
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
            ),
            ft.IconButton(
                icon=ft.icons.FORMAT_LIST_BULLETED, 
                tooltip="Add * list item", 
                on_click=handle_list_click,
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
            ),
        ],
        spacing=4,
        )

        description_field = ft.TextField(
            label="Description / Notes", 
            multiline=True, 
            min_lines=3, 
            max_lines=6, 
            capitalization=ft.TextCapitalization.SENTENCES,
            hint_text="Markdown supported: # Title, **bold**, *italic*, * lists"
        )
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
            show_snackbar(f"Added '{name}'") if app_state["current_view"] not in YEARS else show_snackbar(f"Added '{name}' to {target_year}")
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
            score_dropdown, 
            ft.Column([
                ft.Row([
                    ft.Text("Description / Notes", size=12, color=ft.colors.PRIMARY, weight=ft.FontWeight.W_500),
                    toolbar
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                description_field
            ], spacing=5),
            rewatch_check, own_local_copy_check
        ]
        action_buttons = [ ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Save Entry", on_click=save_new_jav), ]
        title_text = f"Add Entry to {target_year}" if app_state["current_view"] in YEARS else "Add New Entry"
        manual_dialog = create_dialog_overlay(title_text, content_controls, action_buttons);
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
            description_field = ft.TextField(
                ref=edit_description_field_ref, 
                label="Description / Notes", 
                multiline=True, 
                min_lines=3, 
                max_lines=6, 
                capitalization=ft.TextCapitalization.SENTENCES, 
                value=jav_data_to_edit.get('description', '') or '',
                hint_text="Markdown supported: # Title, **bold**, *italic*, * lists"
            )
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

    def open_edit_jav_dialog(jav_data_to_edit, list_refresh_callback):
        nonlocal _target_image_field_for_picker
        jav_id = jav_data_to_edit['id']

        # --- Field References ---
        edit_name_field_ref = ft.Ref[ft.TextField]()
        edit_genre_field_ref = ft.Ref[ft.TextField]()
        edit_date_display_field_ref = ft.Ref[ft.TextField]()
        edit_score_dropdown_ref = ft.Ref[ft.Dropdown]()
        edit_description_field_ref = ft.Ref[ft.TextField]()
        edit_rewatch_check_ref = ft.Ref[ft.Checkbox]()
        edit_own_local_copy_check_ref = ft.Ref[ft.Checkbox]()
        edit_entry_type_dropdown_ref = ft.Ref[ft.Dropdown]()
        image_preview_ref = ft.Ref[ft.Image]()
        
        # --- Field Definitions ---
        name_field = ft.TextField(
            ref=edit_name_field_ref, label="Title", autofocus=True,
            capitalization=ft.TextCapitalization.WORDS, value=jav_data_to_edit.get('name', '')
        )
        
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
            hint_text="e.g., https://... or C:\\path\\to\\image.jpg",
            on_change=lambda e: update_image_preview(e.control.value)
        )

        genre_field = ft.TextField(
            ref=edit_genre_field_ref, label="Genres (comma-separated)",
            hint_text="e.g., Action, Drama", capitalization=ft.TextCapitalization.WORDS,
            value=jav_data_to_edit.get('genre', '') or ''
        )
        
        initial_date_str = jav_data_to_edit.get('completion_date', '')
        date_display = ft.TextField(
            ref=edit_date_display_field_ref, label="Completion Date", read_only=True,
            hint_text="Select a date...", value=initial_date_str, expand=True
        )
        
        initial_score = jav_data_to_edit.get('review_score')
        score_value_str = str(initial_score) if initial_score is not None else "N/A"
        score_dropdown = ft.Dropdown(
            ref=edit_score_dropdown_ref, label="Score", expand=True,
            options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)],
            value=score_value_str
        )
        
        description_field = ft.TextField(
            ref=edit_description_field_ref, label=None, multiline=True, min_lines=5, max_lines=8,
            capitalization=ft.TextCapitalization.SENTENCES,
            value=jav_data_to_edit.get('description', '') or '',
            hint_text="Markdown supported: # Title, **bold**, *italic*, * lists"
        )
        
        initial_rewatch = jav_data_to_edit.get('is_rewatch') == 1
        rewatch_check = ft.Checkbox(ref=edit_rewatch_check_ref, label="This was a Rewatch", value=initial_rewatch)
        
        initial_own_local_copy = jav_data_to_edit.get('own_local_copy') == 1
        own_local_copy_check = ft.Checkbox(ref=edit_own_local_copy_check_ref, label="Own Local Copy?", value=initial_own_local_copy)

        # --- Date Picker Setup ---
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
                if hasattr(target_field_ref.current, 'page') and target_field_ref.current.page:
                    target_field_ref.current.update()
        
        def open_edit_date_picker(e):
            _edit_date_picker_instance.open = True
            page.update()

        # --- Image Handling ---
        def update_image_preview(source_path_or_url):
            if not image_preview_ref.current: return
            
            src_for_flet = DEFAULT_IMAGE_URL
            if source_path_or_url:
                if source_path_or_url.lower().startswith("http"):
                    src_for_flet = source_path_or_url
                else:
                    # Check if it's a relative path within assets
                    if source_path_or_url.startswith("images/"):
                        full_path = os.path.join(ASSETS_DIR, source_path_or_url)
                        if os.path.exists(full_path):
                            src_for_flet = source_path_or_url
                    # Check if it's an absolute local path
                    elif os.path.exists(source_path_or_url):
                        src_for_flet = source_path_or_url
            
            image_preview_ref.current.src = src_for_flet
            if hasattr(image_preview_ref.current, 'page') and image_preview_ref.current.page:
                image_preview_ref.current.update()

        def browse_for_image_edit(e):
            nonlocal _target_image_field_for_picker
            _target_image_field_for_picker = _edit_image_source_tf
            image_file_picker.pick_files(
                dialog_title="Select Image", allow_multiple=False,
                allowed_extensions=["jpg", "jpeg", "png", "gif", "bmp", "webp"]
            )

        # --- Markdown Toolbar ---
        def apply_markdown_style_edit(textfield, style, line_start=False):
            if textfield and hasattr(textfield, 'value'):
                current_text = textfield.value or ""
                if line_start:
                    if current_text and not current_text.endswith('\n'):
                        textfield.value = current_text + '\n' + style
                    else:
                        textfield.value = current_text + style
                else:
                    textfield.value = current_text + style + style
                textfield.update()
                textfield.focus()

        edit_toolbar = ft.Row([
            ft.IconButton(icon=ft.icons.FORMAT_BOLD, tooltip="Bold", on_click=lambda e: apply_markdown_style_edit(description_field, '**')),
            ft.IconButton(icon=ft.icons.FORMAT_ITALIC, tooltip="Italic", on_click=lambda e: apply_markdown_style_edit(description_field, '*')),
            ft.IconButton(icon=ft.icons.TITLE, tooltip="Header", on_click=lambda e: apply_markdown_style_edit(description_field, '# ', True)),
            ft.IconButton(icon=ft.icons.FORMAT_LIST_BULLETED, tooltip="List Item", on_click=lambda e: apply_markdown_style_edit(description_field, '* ', True)),
        ], spacing=4)

        # --- UI Layout Construction ---
        image_preview_widget = ft.Image(
            ref=image_preview_ref,
            height=180, width=float('inf'), fit=ft.ImageFit.COVER,
            border_radius=ft.border_radius.all(12),
            error_content=ft.Container(
                content=ft.Column([
                    ft.Icon(ft.icons.BROKEN_IMAGE_OUTLINED, size=40),
                    ft.Text("Image Not Found", size=12)
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, alignment=ft.MainAxisAlignment.CENTER),
                bgcolor=ft.colors.SURFACE_VARIANT, border_radius=12
            )
        )
        update_image_preview(_edit_image_source_tf.value) # Set initial image

        left_column = ft.Container(
            content=ft.Column([
                ft.Text("Cover Image", style=ft.TextThemeStyle.LABEL_LARGE, weight=ft.FontWeight.BOLD),
                image_preview_widget,
                _edit_image_source_tf,
                ft.ElevatedButton("Browse for Local Image", icon=ft.icons.FOLDER_OPEN_OUTLINED, on_click=browse_for_image_edit, width=float('inf')),
                ft.Divider(height=20),
                name_field,
                entry_type_dropdown,
                conditional_fields_container,
            ], spacing=12),
            padding=ft.padding.only(right=15),
            expand=2,
        )

        right_column = ft.Container(
            content=ft.Column([
                ft.Row([
                    ft.Column([
                        ft.Text("Completion", style=ft.TextThemeStyle.LABEL_LARGE, weight=ft.FontWeight.BOLD),
                        ft.Row([date_display, ft.IconButton(icon=ft.icons.CALENDAR_MONTH, on_click=open_edit_date_picker)])
                    ], expand=True),
                    ft.Column([
                        ft.Text("Score", style=ft.TextThemeStyle.LABEL_LARGE, weight=ft.FontWeight.BOLD),
                        score_dropdown
                    ], expand=True),
                ], spacing=15),
                genre_field,
                ft.Column([
                    ft.Row([
                        ft.Text("Description / Notes", style=ft.TextThemeStyle.LABEL_LARGE, weight=ft.FontWeight.BOLD),
                        edit_toolbar
                    ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    description_field
                ], spacing=5),
                ft.Row([rewatch_check, own_local_copy_check])
            ], spacing=12),
            padding=ft.padding.only(left=15),
            expand=3,
        )

        # --- Save Logic ---
        def save_edited_jav(e):
            # (This logic remains the same as your original function)
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

        # --- Dialog Assembly ---
        dialog_content = ft.Container(
            content=ft.Column(
                [
                    # Header
                    ft.Row(
                        [
                            ft.Text("Edit Entry", style=ft.TextThemeStyle.HEADLINE_SMALL),
                            ft.IconButton(icon=ft.icons.CLOSE_ROUNDED, on_click=close_manual_dialog, tooltip="Close")
                        ],
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN
                    ),
                    ft.Divider(height=1),
                    # Main Form Content
                    ft.Container(
                        content=ft.Row(
                            [left_column, ft.VerticalDivider(width=1), right_column],
                            vertical_alignment=ft.CrossAxisAlignment.START,
                        ),
                        padding=ft.padding.symmetric(vertical=15),
                        expand=True,
                    ),
                    ft.Divider(height=1),
                    # Footer / Actions
                    ft.Row(
                        [
                            ft.TextButton("Cancel", on_click=close_manual_dialog),
                            ft.ElevatedButton("Save Changes", icon=ft.icons.SAVE_OUTLINED, on_click=save_edited_jav)
                        ],
                        alignment=ft.MainAxisAlignment.END
                    )
                ],
                spacing=0,
            ),
            width=900,
            bgcolor=ft.colors.with_opacity(0.98, ft.colors.SURFACE),
            border_radius=12,
            border=ft.border.all(1, ft.colors.with_opacity(0.2, ft.colors.OUTLINE)),
            shadow=ft.BoxShadow(
                spread_radius=1, blur_radius=15,
                color=ft.colors.with_opacity(0.2, ft.colors.BLACK),
                offset=ft.Offset(0, 5)
            ),
            clip_behavior=ft.ClipBehavior.HARD_EDGE,
            padding=ft.padding.all(20)
        )
        dialog_content.constraints = ft.BoxConstraints(max_height=page.window_height * 0.9 if page and page.window_height else 800)

        # Create the overlay scrim
        overlay_scrim = ft.Container(
            ref=manual_dialog_container,
            content=dialog_content,
            alignment=ft.alignment.center,
            bgcolor=ft.colors.with_opacity(0.6, ft.colors.BLACK),
            expand=True,
        )
        # Store the date picker instance to remove it from overlay when dialog closes
        overlay_scrim._edit_date_picker_ref = _edit_date_picker_instance

        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            close_manual_dialog()
        main_stack.controls.append(overlay_scrim)
        main_stack.update()

        # Toolbar for Markdown formatting in edit dialog
        def handle_bold_click_edit(e):
            apply_markdown_style_edit(description_field, '**')

        def handle_italic_click_edit(e):
            apply_markdown_style_edit(description_field, '*')

        def handle_header_click_edit(e):
            apply_markdown_style_edit(description_field, '# ', line_start=True)

        def handle_list_click_edit(e):
            apply_markdown_style_edit(description_field, '* ', line_start=True)

        def apply_markdown_style_edit(textfield, style, line_start=False):
            if textfield and hasattr(textfield, 'value'):
                current_text = textfield.value or ""
                # For now, just append the style at the end since Flet doesn't support text selection
                if line_start:
                    # Add header style at the beginning of a new line
                    if current_text and not current_text.endswith('\n'):
                        textfield.value = current_text + '\n' + style
                    else:
                        textfield.value = current_text + style
                else:
                    # Add bold/italic markers
                    textfield.value = current_text + style + style
                textfield.update()

        edit_toolbar = ft.Row([
            ft.IconButton(
                icon=ft.icons.FORMAT_BOLD, 
                tooltip="Add **bold** markers", 
                on_click=handle_bold_click_edit,
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
            ),
            ft.IconButton(
                icon=ft.icons.FORMAT_ITALIC, 
                tooltip="Add *italic* markers", 
                on_click=handle_italic_click_edit,
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
            ),
            ft.IconButton(
                icon=ft.icons.FORMAT_SIZE, 
                tooltip="Add # header", 
                on_click=handle_header_click_edit,
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
            ),
            ft.IconButton(
                icon=ft.icons.FORMAT_LIST_BULLETED, 
                tooltip="Add * list item", 
                on_click=handle_list_click_edit,
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
            ),
        ],
        spacing=4,
        )

        content_controls = [
            name_field, entry_type_dropdown, conditional_fields_container, edit_image_source_row, genre_field,
            ft.Row([date_display, ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=open_edit_date_picker)], alignment=ft.MainAxisAlignment.START),
            score_dropdown, 
            ft.Column([
                ft.Row([
                    ft.Text("Description / Notes", size=12, color=ft.colors.PRIMARY, weight=ft.FontWeight.W_500),
                    edit_toolbar
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                description_field
            ], spacing=5),
            rewatch_check, own_local_copy_check
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

    def build_search_view():
        print("Building search view")
        
        # --- DEBOUNCER STATE ---
        # This task will hold our waiting search job
        search_task = None

        async def on_search_text_change(e):
            nonlocal search_task
            # If there's an old search task waiting, cancel it
            if search_task:
                search_task.cancel()

            # This is our new search job
            async def debounced_search_job():
                try:
                    # Wait for 400ms of inactivity
                    await asyncio.sleep(0.4)
                    # After the wait, perform the actual search
                    perform_search()
                except asyncio.CancelledError:
                    # This is expected if the user keeps typing
                    print("Search task cancelled.")
            
            # Schedule the new search job to run
            search_task = asyncio.create_task(debounced_search_job())

        def perform_search():
            search_term = search_text_field.current.value.strip() if search_text_field.current else ""
            
            # The console log is very noisy, let's only print if there's a term
            if search_term:
                print(f"Performing search for: '{search_term}' in fields: {app_state['search_selected_fields']}")
            
            # Get selected entry types for filtering
            selected_entry_types = list(app_state["search_view_selected_entry_types"]) if app_state["search_view_selected_entry_types"] else None
            
            # Perform the search
            search_results = search_javs_db(
                search_term, 
                list(app_state["search_selected_fields"]), 
                selected_entry_types
            )
            
            app_state["search_results"] = search_results
            app_state["current_search_term"] = search_term
            refresh_search_results()
        
        def refresh_search_results():
            grid_view = search_results_grid.current
            count_text = search_results_count_text.current
            
            if not grid_view:
                return
            
            grid_view.controls.clear()
            results = app_state["search_results"]
            search_term = app_state["current_search_term"]
            
            # Update results count
            if count_text:
                if not search_term:
                    count_text.value = "Enter a search term to find entries"
                else:
                    count_text.value = f"Found {len(results)} result{'s' if len(results) != 1 else ''}"
                    count_text.value += f" for '{search_term}'"
                try:
                    count_text.update()
                except:
                    pass
            
            if not search_term:
                grid_view.controls.append(
                    ft.Container(
                        content=ft.Column([
                            ft.Icon(ft.icons.SEARCH_OUTLINED, size=64, color=ft.colors.ON_SURFACE_VARIANT),
                            ft.Text("Enter a search term to find entries", size=16, color=ft.colors.ON_SURFACE_VARIANT),
                            ft.Text("Search across titles, authors, platforms, and more", size=12, color=ft.colors.ON_SURFACE_VARIANT, italic=True),
                        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=8),
                        alignment=ft.alignment.center,
                        padding=30,
                        expand=True
                    )
                )
            elif not results:
                grid_view.controls.append(
                    ft.Container(
                        content=ft.Column([
                            ft.Icon(ft.icons.SEARCH_OFF_OUTLINED, size=64, color=ft.colors.ON_SURFACE_VARIANT),
                            ft.Text(f"No results found for '{search_term}'", size=16, color=ft.colors.ON_SURFACE_VARIANT),
                            ft.Text("Try different search terms or check your filters", size=12, color=ft.colors.ON_SURFACE_VARIANT, italic=True),
                        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=8),
                        alignment=ft.alignment.center,
                        padding=30,
                        expand=True
                    )
                )
            else:
                for jav_item in results:
                    try:
                        card = create_gallery_card(page, jav_item, delete_jav_action_search, open_edit_jav_dialog_wrapper_search, show_description_dialog)
                        if card:
                            grid_view.controls.append(card)
                    except Exception as card_error:
                        print(f"ERROR CREATING SEARCH CARD for entry ID {jav_item.get('id', '???')}: {card_error}")
                        traceback.print_exc()
                        grid_view.controls.append(
                            ft.Card(content=ft.Container(padding=20, content=ft.Column([
                                ft.Icon(ft.icons.ERROR_OUTLINE, color=ft.colors.ERROR, size=30),
                                ft.Text(f"Error loading: {jav_item.get('name', 'Unknown')}", color=ft.colors.ERROR),
                                ft.Text(f"{card_error}", size=10, color=ft.colors.ERROR, max_lines=2, overflow=ft.TextOverflow.ELLIPSIS)
                            ])))
                        )
            
            if hasattr(grid_view, 'page') and grid_view.page:
                try:
                    grid_view.update()
                except:
                    pass
        
        def delete_jav_action_search(jav_id, jav_name):
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
            
            perform_search()
            current_stats_filter = "All Time"
            try:
                if stats_year_filter.current and stats_year_filter.current.selected:
                    current_stats_filter = list(stats_year_filter.current.selected)[0]
            except Exception as stats_e: 
                print(f"Warning: Error accessing stats_year_filter selection after delete: {stats_e}")
            page.run_thread(calculate_and_update_stats_display, current_stats_filter)

        def open_edit_jav_dialog_wrapper_search(jav_item_data):
            def refresh_search_after_edit():
                perform_search()
            open_edit_jav_dialog(jav_item_data, refresh_search_after_edit)

        def on_search_entry_type_filter_change():
            perform_search()
            filter_str_to_save = ",".join(sorted(list(app_state["search_view_selected_entry_types"])))
            set_setting_db(SAVED_SEARCH_VIEW_FILTER_KEY, filter_str_to_save)
            print(f"Saved search view filter: {filter_str_to_save}")

        def on_search_fields_filter_change():
            perform_search()

        search_entry_type_filter_button = create_entry_type_filter_button_with_sheet(
            page, ALL_ENTRY_TYPES_STR, app_state["search_view_selected_entry_types"], 
            on_search_entry_type_filter_change, button_label_prefix="Filter Types"
        )

        search_fields_filter_button = create_search_fields_filter_button_with_sheet(
            page, SEARCH_FIELD_OPTIONS, app_state["search_selected_fields"],
            on_search_fields_filter_change, button_label_prefix="Search In"
        )

        def clear_search():
            if search_text_field.current:
                search_text_field.current.value = ""
                search_text_field.current.update()
            perform_search()

        search_text_field_widget = ft.TextField(
            ref=search_text_field,
            label="Search entries...",
            hint_text="Enter title, author, platform, etc.",
            prefix_icon=ft.icons.SEARCH_ROUNDED,
            on_change=on_search_text_change, # This now points to our async debouncer
            expand=True,
            autofocus=True
        )

        search_results_count_widget = ft.Text(
            ref=search_results_count_text,
            value="Enter a search term to find entries",
            size=14,
            color=ft.colors.ON_SURFACE_VARIANT
        )

        search_grid = ft.GridView(
            ref=search_results_grid,
            expand=True, 
            runs_count=5, 
            max_extent=270, 
            child_aspect_ratio=0.55,
            spacing=10, 
            run_spacing=10, 
            padding=ft.padding.all(10)
        )

        refresh_search_results()

        return ft.Column(
            expand=True,
            controls=[
                ft.Container(
                    content=ft.Row([
                        search_text_field_widget,
                        ft.IconButton(
                            icon=ft.icons.CLEAR_ROUNDED,
                            tooltip="Clear search",
                            on_click=lambda e: clear_search()
                        )
                    ], spacing=10),
                    padding=ft.padding.symmetric(horizontal=10, vertical=10),
                ),
                ft.Container(
                    content=ft.Row([
                        search_fields_filter_button,
                        search_entry_type_filter_button,
                    ], alignment=ft.MainAxisAlignment.START, spacing=10),
                    padding=ft.padding.only(left=10, right=10, bottom=5),
                ),
                ft.Container(
                    content=search_results_count_widget,
                    padding=ft.padding.symmetric(horizontal=10),
                ),
                search_grid
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
        
        # --- START OF CHANGE ---
        # Define specific brand colors for platforms
        specific_platform_colors = {
            "pc": ft.colors.ORANGE_700,
            "playstation": ft.colors.BLUE_700,
            "xbox": ft.colors.GREEN_700,
            "nintendo switch": ft.colors.RED_700,
        }
        # Define fallback colors for other platforms like "Mobile"
        fallback_platform_colors = [ft.colors.CYAN_700, ft.colors.INDIGO_400, ft.colors.BLUE_GREY_600]
        # --- END OF CHANGE ---

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
                        if jav.get('director'): 
                            directors.extend(parse_multi_value_field(jav['director']))
                        if jav.get('actress'): 
                            actresses.extend(parse_multi_value_field(jav['actress']))
                    if show_avn_chart and entry_type == 'Adult Visual Novel' and jav.get('update_version'):
                        versions.append(jav['update_version'])

            # --- START OF CHANGE ---
            # Platform Chart Data (Custom Color Logic)
            if show_platform_chart:
                if not platforms:
                    platform_pie_sections, platform_legend_items = _generate_pie_data_from_list([], [])
                else:
                    platform_counts = Counter(p for p in platforms if p and p.strip())
                    total_platforms = sum(platform_counts.values())
                    temp_pie_sections = []
                    temp_legend_items = []
                    fallback_color_idx = 0
                    
                    for platform_name, count in platform_counts.most_common():
                        percentage = (count / total_platforms * 100) if total_platforms > 0 else 0
                        
                        # Assign color based on our specific map, or use a fallback
                        platform_lower = platform_name.lower()
                        color = specific_platform_colors.get(platform_lower)
                        if color is None:
                            color = fallback_platform_colors[fallback_color_idx % len(fallback_platform_colors)]
                            fallback_color_idx += 1

                        # Create pie section
                        temp_pie_sections.append(
                            ft.PieChartSection(
                                value=percentage,
                                title=f"{percentage:.0f}%" if percentage >= 5 else "",
                                title_style=ft.TextStyle(size=10, color=ft.colors.WHITE, weight=ft.FontWeight.BOLD),
                                color=color,
                                radius=60
                            )
                        )
                        # Create legend item
                        temp_legend_items.append(
                            ft.Row([
                                ft.Container(width=16, height=16, bgcolor=color, border_radius=3),
                                ft.Text(f"{platform_name} ({count})", max_lines=1, overflow=ft.TextOverflow.ELLIPSIS, tooltip=platform_name)
                            ], spacing=10)
                        )
                    platform_pie_sections = temp_pie_sections
                    platform_legend_items = temp_legend_items
            else:
                platform_pie_sections, platform_legend_items = [], []
            # --- END OF CHANGE ---

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
            _create_breakdown_card(director_chart_container, director_pie_chart, director_legend, "Studio Breakdown (JAV)"),
            _create_breakdown_card(actress_chart_container, actress_pie_chart, actress_legend, "Actress Breakdown (JAV)"),
            _create_breakdown_card(version_chart_container, version_pie_chart, version_legend, "Version Breakdown (AVN)"),

            ft.Divider(height=20, thickness=1),
            ft.Text("Settings", style=ft.TextThemeStyle.TITLE_MEDIUM),
            ft.Row([ft.Text("Theme:"), theme_dropdown], vertical_alignment=ft.CrossAxisAlignment.CENTER),
            ft.Divider(height=20, thickness=1),
            ft.Container(content=ft.Text("Import / Export", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Row( [ 
                ft.ElevatedButton("Import from CSV", icon=ft.icons.UPLOAD_FILE_ROUNDED, on_click=open_import_dialog), 
                ft.ElevatedButton("Export to CSV", icon=ft.icons.DOWNLOAD_ROUNDED, on_click=open_export_dialog),
            ], spacing=10 ),
            ft.Text( "CSV Format: Header row required. Columns: Name (Req), Genre, Review_Score, Completion_Date (Req), Description, IsRewatch, OwnLocalCopy, EntryType, ImageURL, Platform, Author, Studio, Actress, UpdateVersion. Case insensitive for headers.", italic=True, size=11, color=ft.colors.with_opacity(0.6, ft.colors.ON_SURFACE), max_lines=4 )
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
        if current_view in YEARS or current_view == "Search": open_add_jav_dialog()
        else: show_snackbar("No action available here.") 
    fab = ft.FloatingActionButton(icon=ft.icons.ADD, tooltip="Add Entry", visible=False, on_click=fab_clicked)
    page.floating_action_button = fab; page.floating_action_button_location = ft.FloatingActionButtonLocation.END_CONTAINED

    try:
        initial_index = YEARS.index(app_state["current_view"])
    except ValueError: 
        if app_state["current_view"] == "Stats": initial_index = len(YEARS)
        elif app_state["current_view"] == "Search": initial_index = len(YEARS) + 1
        else: 
            initial_index = 0
            app_state["current_view"] = YEARS[0] if YEARS else "Stats"

    rail = ft.NavigationRail(
        selected_index=initial_index, label_type=ft.NavigationRailLabelType.ALL,
        min_width=100, min_extended_width=200, group_alignment=-0.9,
        destinations=(
            [ft.NavigationRailDestination(icon=ft.icons.CALENDAR_MONTH_OUTLINED, selected_icon=ft.icons.CALENDAR_MONTH, label=y) for y in YEARS] +
            [ft.NavigationRailDestination(icon=ft.icons.QUERY_STATS_OUTLINED, selected_icon=ft.icons.QUERY_STATS, label="Stats")] +
            [ft.NavigationRailDestination(icon=ft.icons.SEARCH_OUTLINED, selected_icon=ft.icons.SEARCH, label="Search")]
        ),
    )
    main_content_area = ft.Column(expand=True, controls=[]) 

    def update_main_content(view_id):
        app_state["current_view"] = view_id
        main_content_area.controls.clear(); show_fab, fab_tooltip, content = False, "Add Entry", None
        if view_id in YEARS: content = build_year_view(view_id); show_fab = True; fab_tooltip = f"Add Entry to {view_id}"
        elif view_id == "Stats": content = build_stats_view(); show_fab = False
        elif view_id == "Search": content = build_search_view(); show_fab = True; fab_tooltip = "Add New Entry"
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
        elif idx == len(YEARS) + 1: new_view = "Search"
        
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