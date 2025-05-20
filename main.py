# main.py
import flet as ft
import sqlite3
import csv
from datetime import datetime
import sys
import os
from collections import Counter
import math
import traceback # For detailed error logging

# --- Determine the base path ---
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    base_path = os.path.dirname(sys.executable)
    print(f"Running frozen, base path: {base_path}")
else:
    base_path = os.path.dirname(os.path.abspath(__file__))
    print(f"Running script, base path: {base_path}")

DB_FILE = os.path.join(base_path, "game_log.db")
print(f"Database file path: {DB_FILE}")

APP_TITLE = "My Game Logger"
YEARS = ["2023", "2024", "2025"] # Adjust years as needed

def init_db():
    # (init_db remains the same)
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                platform TEXT,
                completion_date TEXT, 
                review_score INTEGER, 
                year_completed INTEGER, 
                is_replay INTEGER DEFAULT 0 NOT NULL CHECK(is_replay IN (0, 1))
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS backlog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                platform TEXT, 
                added_date TEXT, 
                is_playing INTEGER DEFAULT 0 NOT NULL CHECK(is_playing IN (0, 1))
            )
        """)
        cursor.execute("PRAGMA table_info(backlog)")
        columns = [info[1] for info in cursor.fetchall()]
        if 'is_playing' not in columns:
            print("Adding 'is_playing' column to backlog table...")
            cursor.execute("ALTER TABLE backlog ADD COLUMN is_playing INTEGER DEFAULT 0 NOT NULL CHECK(is_playing IN (0, 1))")
            print("'is_playing' column added.")
        conn.commit()
        print("Database initialized successfully.")
    except sqlite3.Error as e:
        print(f"Database initialization error: {e}")
    finally:
        if conn:
            conn.close()

def add_game_db(name, platform, completion_date_str, score, is_replay):
    # (add_game_db remains the same)
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        year_completed = None
        if completion_date_str:
            try:
                year_completed = datetime.strptime(completion_date_str, '%Y-%m-%d').year
            except (ValueError, TypeError) as e:
                print(f"Warning: Invalid completion date format '{completion_date_str}' for game '{name}'. Storing date as is, year might be null. Error: {e}")
        replay_int = 1 if is_replay else 0
        score_to_db = score if score is not None else None
        cursor.execute(
            "INSERT INTO games (name, platform, completion_date, review_score, year_completed, is_replay) VALUES (?, ?, ?, ?, ?, ?)",
            (name, platform if platform else None, completion_date_str, score_to_db, year_completed, replay_int)
        )
        conn.commit()
        print(f"Game added: {name}")
    except sqlite3.Error as e:
        print(f"Database error adding game '{name}': {e}")
    finally:
        if conn:
            conn.close()

def get_games_by_year_db(year): # REVERTED: Removed search_term
    """Retrieves all completed games for a specific year, sorted chronologically."""
    conn = None
    games = []
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, platform, completion_date, review_score, is_replay FROM games WHERE year_completed = ? ORDER BY completion_date ASC, id ASC",
            (year,)
        )
        games = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database Error getting games for year {year}: {e}")
    finally:
        if conn:
            conn.close()
    return games

def get_all_games_db():
    # (get_all_games_db remains the same)
    conn = None
    games = []
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, platform, completion_date, review_score, year_completed, is_replay FROM games ORDER BY completion_date DESC, id DESC"
        )
        games = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database Error getting all games: {e}")
    finally:
        if conn:
            conn.close()
    return games

def delete_game_db(game_id):
    # (delete_game_db remains the same)
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM games WHERE id = ?", (game_id,))
        conn.commit()
        print(f"Game deleted: ID {game_id}")
    except sqlite3.Error as e:
        print(f"Database error deleting game ID {game_id}: {e}")
    finally:
        if conn:
            conn.close()

def update_game_db(game_id, name, platform, completion_date_str, score, is_replay):
    # (update_game_db remains the same)
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        year_completed = None
        if completion_date_str:
            try:
                year_completed = datetime.strptime(completion_date_str, '%Y-%m-%d').year
            except (ValueError, TypeError) as e:
                print(f"Warning: Invalid completion date format '{completion_date_str}' for game ID {game_id}. Updating date as is, year might be null. Error: {e}")
        replay_int = 1 if is_replay else 0
        score_to_db = score if score is not None else None
        cursor.execute("""
            UPDATE games
            SET name = ?, platform = ?, completion_date = ?, review_score = ?, year_completed = ?, is_replay = ?
            WHERE id = ?
        """, (name, platform if platform else None, completion_date_str, score_to_db, year_completed, replay_int, game_id))
        conn.commit()
        print(f"Game updated: ID {game_id} - {name}")
        if cursor.rowcount == 0:
             print(f"Warning: No rows updated for game ID {game_id}. ID might be invalid.")
    except sqlite3.Error as e:
        print(f"Database error updating game ID {game_id}: {e}")
    finally:
        if conn:
            conn.close()

# --- NEW: Database function for global search ---
def search_completed_games_db(search_term, target_years=None):
    """
    Searches completed games by name or platform, optionally filtered by a list of years.
    Args:
        search_term (str): The term to search for.
        target_years (list, optional): A list of integer years to filter by.
                                     If None or empty, searches all years.
    Returns:
        list: A list of game dictionaries.
    """
    conn = None
    games = []
    if not search_term or not search_term.strip():
        return games # Return empty if search term is blank

    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query_parts = ["SELECT id, name, platform, completion_date, review_score, year_completed, is_replay FROM games"]
        conditions = []
        params = []

        # Search term condition (name or platform)
        like_term = f"%{search_term.strip()}%"
        conditions.append("(LOWER(name) LIKE LOWER(?) OR LOWER(COALESCE(platform, '')) LIKE LOWER(?))")
        params.extend([like_term, like_term])

        # Year condition
        if target_years and isinstance(target_years, list) and len(target_years) > 0:
            year_placeholders = ','.join(['?'] * len(target_years))
            conditions.append(f"year_completed IN ({year_placeholders})")
            params.extend(target_years)

        if conditions:
            query_parts.append("WHERE " + " AND ".join(conditions))

        query_parts.append("ORDER BY year_completed DESC, completion_date DESC, id DESC") # Show most recent first

        final_query = " ".join(query_parts)
        # print(f"Search Query: {final_query} with params: {params}") # For debugging
        cursor.execute(final_query, tuple(params))
        games = [dict(row) for row in cursor.fetchall()]

    except sqlite3.Error as e:
        print(f"Database Error searching games (term: '{search_term}', years: {target_years}): {e}")
    finally:
        if conn:
            conn.close()
    return games


def add_backlog_item_db(name, platform):
    # (add_backlog_item_db remains the same)
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        added_date = datetime.now().strftime('%Y-%m-%d')
        cursor.execute(
            "INSERT INTO backlog (name, platform, added_date) VALUES (?, ?, ?)",
            (name, platform if platform else None, added_date)
        )
        conn.commit()
        print(f"Backlog item added: {name}")
    except sqlite3.Error as e:
        print(f"Database error adding backlog item '{name}': {e}")
    finally:
        if conn:
            conn.close()

def get_backlog_db(): # REVERTED: Removed search_term
    """Retrieves all backlog items, sorted by playing status then name."""
    conn = None
    items = []
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, platform, added_date, is_playing FROM backlog ORDER BY is_playing DESC, name ASC")
        items = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database Error getting backlog: {e}")
    finally:
        if conn:
            conn.close()
    return items

def delete_backlog_item_db(item_id):
    # (delete_backlog_item_db remains the same)
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM backlog WHERE id = ?", (item_id,))
        conn.commit()
        print(f"Backlog item deleted: ID {item_id}")
    except sqlite3.Error as e:
        print(f"Database error deleting backlog item ID {item_id}: {e}")
    finally:
        if conn:
            conn.close()

def toggle_backlog_playing_status_db(item_id):
    # (toggle_backlog_playing_status_db remains the same)
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE backlog SET is_playing = CASE WHEN is_playing = 1 THEN 0 ELSE 1 END WHERE id = ?", (item_id,))
        conn.commit()
        print(f"Toggled playing status for backlog item ID {item_id}")
        if cursor.rowcount == 0:
             print(f"Warning: No rows updated for backlog item ID {item_id}. ID might be invalid.")
    except sqlite3.Error as e:
        print(f"Database error toggling playing status for backlog item ID {item_id}: {e}")
    finally:
        if conn:
            conn.close()

# --- UI Helper Functions ---
def create_rating_badge(score):
    # (create_rating_badge remains the same)
    score_text = "N/A"
    bgcolor = ft.Colors.with_opacity(0.5, ft.Colors.ON_SURFACE_VARIANT)
    text_color = ft.Colors.WHITE
    if score is not None:
        try:
            score_val = int(score)
            score_text = str(score_val)
            if 0 <= score_val <= 10:
                if score_val == 10:
                    bgcolor = ft.Colors.LIGHT_GREEN_ACCENT_400; text_color = ft.Colors.BLACK
                elif score_val >= 7:
                    bgcolor = ft.Colors.GREEN_600; text_color = ft.Colors.WHITE
                elif score_val >= 5:
                    bgcolor = ft.Colors.YELLOW_700; text_color = ft.Colors.BLACK
                elif score_val >= 2:
                    bgcolor = ft.Colors.RED_700; text_color = ft.Colors.WHITE
                else: 
                    bgcolor = ft.Colors.RED_500; text_color = ft.Colors.WHITE
        except (ValueError, TypeError): pass
    return ft.Container(
        content=ft.Text(score_text, size=12, weight=ft.FontWeight.BOLD, color=text_color, text_align=ft.TextAlign.CENTER),
        width=30, height=30, shape=ft.BoxShape.CIRCLE, bgcolor=bgcolor,
        alignment=ft.alignment.center,
        tooltip=f"Score: {score_text}" if score is not None else "Score: Not Rated"
    )

# --- Main Application ---
def main(page: ft.Page):
    page.title = APP_TITLE
    page.theme_mode = ft.ThemeMode.DARK
    page.theme = ft.Theme(color_scheme_seed=ft.Colors.BLUE_GREY)
    page.window_width = 1400
    page.window_height = 900

    init_db()
    app_state = {"current_view": "2024"} # Default view

    def show_snackbar(message: str, color: str = None, duration: int = 4000):
        # (show_snackbar remains the same)
        if not page: print(f"Snackbar Error: Page context lost. Message: {message}"); return
        try:
            snackbar_control = ft.SnackBar(content=ft.Text(message, max_lines=3, overflow=ft.TextOverflow.ELLIPSIS), bgcolor=color, duration=duration, open=True)
            page.snack_bar = snackbar_control
            page.update()
            print(f"Showing snackbar: {message}")
        except Exception as e: print(f"Error displaying snackbar '{message}': {e}")

    # --- Refs ---
    add_game_date_display_field = ft.Ref[ft.TextField]()
    manual_dialog_container = ft.Ref[ft.Container]()
    stats_total_games_text = ft.Ref[ft.Text]()
    stats_avg_score_text = ft.Ref[ft.Text]()
    stats_total_replays_text = ft.Ref[ft.Text]()
    stats_unique_platforms_text = ft.Ref[ft.Text]()
    platform_pie_chart = ft.Ref[ft.PieChart]()
    platform_legend = ft.Ref[ft.Column]()
    backlog_list_view_content = ft.Ref[ft.ListView]()
    stats_monthly_barchart = ft.Ref[ft.BarChart]()
    # Refs for Search View
    search_query_field = ft.Ref[ft.TextField]()
    search_all_years_checkbox = ft.Ref[ft.Checkbox]()
    search_year_checkboxes_refs = {year: ft.Ref[ft.Checkbox]() for year in YEARS} # Dict of refs
    search_results_listview = ft.Ref[ft.ListView]()


    main_stack = ft.Stack(expand=True)

    def handle_add_date_change(e):
        # (handle_add_date_change remains the same)
        selected_date = e.control.value
        if add_game_date_display_field.current and selected_date:
            formatted_date = selected_date.strftime('%Y-%m-%d')
            add_game_date_display_field.current.value = formatted_date
            add_game_date_display_field.current.update()
    add_date_picker = ft.DatePicker(on_change=handle_add_date_change, help_text="Select Completion Date")
    page.overlay.append(add_date_picker)

    def open_add_date_picker(e=None):
        # (open_add_date_picker remains the same)
        if add_date_picker:
            if page: add_date_picker.open = True; page.update(); print("Add date picker opened.")
            else: print("Error: Page context lost before opening date picker.")
        else: print("Error: ADD DatePicker object not found."); show_snackbar("Could not open date picker.", color=ft.Colors.ERROR)

    def handle_import_result(e: ft.FilePickerResultEvent):
        # (handle_import_result remains the same)
        if e.files and e.files[0].path:
            selected_file = e.files[0].path; print(f"CSV file selected: {selected_file}")
            progress_dialog = ft.AlertDialog(modal=True, title=ft.Text("Importing CSV"), content=ft.Row([ft.ProgressRing(), ft.Text("Processing...")], alignment=ft.MainAxisAlignment.CENTER))
            if page: page.dialog = progress_dialog; progress_dialog.open = True; page.update(); page.run_thread(import_csv_data, selected_file)
            else: print("Error: Page context lost before starting CSV import thread.")
        else: show_snackbar("CSV Import Cancelled or No File Selected")
    import_dialog = ft.FilePicker(on_result=handle_import_result)
    page.overlay.append(import_dialog)

    def open_import_dialog(e):
        # (open_import_dialog remains the same)
        if page: import_dialog.pick_files(dialog_title="Select CSV Game Log", allow_multiple=False, allowed_extensions=["csv"])
        else: print("Error: Page context lost before opening import dialog.")

    def import_csv_data(file_path):
        # (import_csv_data remains the same)
        expected_headers_lower = ["title", "platform", "rating", "datecompleted", "isreplay"]
        header_map = {"title": "name", "platform": "platform", "rating": "score", "datecompleted": "completion_date_str", "isreplay": "is_replay"}
        added_count, skipped_count = 0, 0; error_messages, warning_messages = [], []
        try:
            with open(file_path, mode='r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                if not reader.fieldnames: raise ValueError("CSV file is empty or has no header row.")
                csv_headers_lower = [h.lower().strip() for h in reader.fieldnames]
                if "title" not in csv_headers_lower or "datecompleted" not in csv_headers_lower: raise ValueError("CSV Header Missing Required Columns: 'Title' and 'DateCompleted'.")
                missing_optional = [eh for eh in expected_headers_lower if eh not in csv_headers_lower and eh not in ["title", "datecompleted"]]
                if missing_optional: warning_messages.append(f"Info: Missing optional columns: {', '.join(missing_optional)}.")
                original_header_lookup = {h.lower().strip(): h for h in reader.fieldnames}
                current_header_map = {eh_lower: header_map[eh_lower] for eh_lower in expected_headers_lower if eh_lower in csv_headers_lower}
                for row_num, row in enumerate(reader, start=2):
                    game_data = {}; valid_row, row_errors, row_warnings = True, [], []
                    try:
                        for csv_key_lower, db_arg in current_header_map.items():
                            original_header = original_header_lookup.get(csv_key_lower)
                            game_data[db_arg] = row.get(original_header, "").strip() if original_header else None
                        name = game_data.get("name"); date_str = game_data.get("completion_date_str"); score_str = game_data.get("score")
                        replay_str = game_data.get("is_replay", "false"); platform = game_data.get("platform")
                        if not name: row_errors.append("Missing 'Title'"); valid_row = False
                        if not date_str: row_errors.append("Missing 'DateCompleted'"); valid_row = False
                        else:
                            try: datetime.strptime(date_str, '%Y-%m-%d')
                            except ValueError: row_errors.append(f"Invalid Date Format '{date_str}'"); valid_row = False
                        score_int = None
                        if score_str and score_str.lower() != 'n/a' and score_str.strip() != '':
                            try:
                                score_float = float(score_str); score_int = int(round(score_float))
                                if not (0 <= score_int <= 10): row_warnings.append(f"Score '{score_str}' invalid (0-10). Setting N/A."); score_int = None
                            except (ValueError, TypeError): row_warnings.append(f"Invalid Score '{score_str}'. Setting N/A.")
                        is_replay = replay_str.lower() in ['true', '1', 'yes', 't', 'y']
                        if valid_row:
                            add_game_db(name, platform, date_str, score_int, is_replay); added_count += 1
                            if row_warnings: warning_messages.extend([f"Row {row_num} ('{name}'): {w}" for w in row_warnings])
                        else: skipped_count += 1; error_messages.append(f"Row {row_num} ('{name or '?'}'): Skipped - {' | '.join(row_errors)}")
                    except Exception as e: skipped_count += 1; error_messages.append(f"Row {row_num}: Skipped - Error: {e}")
        except FileNotFoundError: error_messages.append(f"Error: File not found: {file_path}")
        except ValueError as ve: error_messages.append(f"Error reading CSV structure: {ve}")
        except Exception as e: error_messages.append(f"An unexpected error occurred: {e}")
        summary_lines = [f"CSV Import Finished. Added: {added_count}, Skipped: {skipped_count}."]
        if warning_messages: summary_lines.append("\nWarnings:"); summary_lines.extend(warning_messages[:5]); print("\n--- Import Warnings ---\n" + "\n".join(warning_messages) + "\n---")
        if error_messages: summary_lines.append("\nErrors:"); summary_lines.extend(error_messages[:5]); print("\n--- Import Errors ---\n" + "\n".join(error_messages) + "\n---")
        if page: page.run_thread(show_import_summary_and_refresh, "\n".join(summary_lines), bool(error_messages))
        else: print("Import finished, but page context lost.")

    def show_import_summary_and_refresh(message, had_errors):
        # (show_import_summary_and_refresh remains the same)
        if not page: return
        if page.dialog and isinstance(page.dialog, ft.AlertDialog): page.dialog.open = False; page.update()
        snackbar_color = ft.Colors.ERROR_CONTAINER if had_errors else ft.Colors.GREEN_700
        show_snackbar(message, color=snackbar_color, duration=10000)
        print("Refreshing views after import...")
        refresh_current_view()
        current_stats_filter = "All Time"
        try:
            if stats_year_filter.current and stats_year_filter.current.selected: current_stats_filter = list(stats_year_filter.current.selected)[0]
        except Exception: pass
        if page: page.run_thread(calculate_and_update_stats_display, current_stats_filter)

    def close_manual_dialog(e=None):
        # (close_manual_dialog remains the same)
        print("Attempting to close manual dialog...")
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            try:
                if hasattr(manual_dialog_container.current, '_edit_date_picker_ref'):
                    edit_picker = manual_dialog_container.current._edit_date_picker_ref
                    if edit_picker and edit_picker in page.overlay:
                        try: page.overlay.remove(edit_picker)
                        except (ValueError, AttributeError): pass 
                main_stack.controls.remove(manual_dialog_container.current)
                manual_dialog_container.current = None; print("Manual dialog container removed.")
                if page: main_stack.update()
            except (ValueError, AttributeError): print("Manual dialog container was already removed or page closed.")
            except Exception as remove_e: print(f"Error removing manual dialog from stack: {remove_e}")

    def create_dialog_overlay(title_text, content_controls, action_buttons, associated_picker=None):
        # (create_dialog_overlay remains the same)
        dialog_content = ft.Container(
            content=ft.Column([
                ft.Text(title_text, style=ft.TextThemeStyle.TITLE_LARGE), ft.Divider(height=10, thickness=1),
                ft.Container(content=ft.Column(content_controls, spacing=15, tight=True, scroll=ft.ScrollMode.ADAPTIVE), expand=True),
                ft.Divider(height=10, thickness=1), ft.Row(action_buttons, alignment=ft.MainAxisAlignment.END)
            ], spacing=10, tight=True),
            width=450, padding=20,
            bgcolor=ft.colors.with_opacity(0.98, ft.colors.SURFACE if page.theme_mode == ft.ThemeMode.LIGHT else ft.colors.BACKGROUND),
            border_radius=10, border=ft.border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.OUTLINE)),
            shadow=ft.BoxShadow(spread_radius=1, blur_radius=15, color=ft.Colors.with_opacity(0.2, ft.Colors.BLACK), offset=ft.Offset(0, 5)),
        )
        overlay_scrim = ft.Container(ref=manual_dialog_container, content=dialog_content, alignment=ft.alignment.center, bgcolor=ft.Colors.with_opacity(0.6, ft.Colors.BLACK), expand=True, on_click=close_manual_dialog)
        if associated_picker: overlay_scrim._edit_date_picker_ref = associated_picker
        return overlay_scrim

    # --- View Building Functions ---

    # --- Year View (Search Bar Removed) ---
    def build_year_view(year_str):
        print(f"Building year view for: {year_str}")
        year_list_view = ft.ListView(
            expand=True, spacing=8,
            padding=ft.padding.only(left=15, right=15, top=10, bottom=70) # Adjusted top padding
        )

        def refresh_list_content(): # No search query needed here anymore
            print(f"Refreshing year list controls for {year_str}")
            year_list_view.controls.clear()
            try:
                games = get_games_by_year_db(int(year_str)) # Uses reverted DB function
                if not games:
                    year_list_view.controls.append(
                        ft.Container(content=ft.Text(f"No games logged for {year_str} yet.", italic=True, text_align=ft.TextAlign.CENTER), padding=20)
                    )
                else:
                    for game in games:
                        year_list_view.controls.append(create_game_log_tile(game, delete_game_action_for_year_view)) # Use specific delete action
            except ValueError: year_list_view.controls.append(ft.Text(f"Invalid year: {year_str}", color=ft.Colors.ERROR))
            except Exception as e: year_list_view.controls.append(ft.Text(f"Error loading games: {e}", color=ft.Colors.ERROR))
            
            if year_list_view.page: # Ensure page context before update
                try: year_list_view.update()
                except Exception as update_err: print(f"Error updating year_list_view: {update_err}")


        def delete_game_action_for_year_view(game_id, game_name): # Specific delete for year view
            print(f"Deleting game ID {game_id}, Name {game_name} from Year View")
            try:
                delete_game_db(game_id)
                show_snackbar(f"Deleted '{game_name}'")
                refresh_list_content() # Refresh this year's list
                # Trigger stats recalc
                current_stats_filter = "All Time"
                try:
                    if stats_year_filter.current and stats_year_filter.current.selected:
                        current_stats_filter = list(stats_year_filter.current.selected)[0]
                except Exception: pass
                if page: page.run_thread(calculate_and_update_stats_display, current_stats_filter)
            except Exception as e:
                print(f"Error during game deletion or refresh: {e}")
                show_snackbar(f"Error deleting '{game_name}'.", color=ft.Colors.ERROR)

        refresh_list_content()
        # Year view now directly returns the ListView, no surrounding Column for search
        return year_list_view


    # --- Game Log Tile (used by Year View and Search View) ---
    def create_game_log_tile(game_data, delete_callback_func): # Takes a generic delete_callback_func
        platform_str = game_data.get('platform', 'N/A') or 'N/A'
        date_str = game_data.get('completion_date', 'Unknown Date') or 'Unknown Date'
        score = game_data.get('review_score')
        is_replay = game_data.get('is_replay') == 1
        
        title_text = game_data['name']
        # For search results, it's good to show the year if it's not obvious from context
        if app_state["current_view"] == "Search": # Check if we are in search view
            year_completed = game_data.get('year_completed')
            if year_completed:
                title_text = f"{game_data['name']} ({year_completed})"

        title_row_controls = [ft.Text(title_text, weight=ft.FontWeight.BOLD)]
        if is_replay: title_row_controls.append(ft.Icon(name=ft.icons.REPLAY, size=18, tooltip="Replay"))

        def handle_edit_click(e):
            close_manual_dialog() 
            open_edit_game_dialog(game_data) # open_edit_game_dialog will handle refresh

        list_tile_content = ft.ListTile(
            leading=create_rating_badge(score),
            title=ft.Row(controls=title_row_controls, spacing=5, vertical_alignment=ft.CrossAxisAlignment.CENTER),
            subtitle=ft.Text(f"{platform_str}  |  Completed: {date_str}"),
            trailing=ft.PopupMenuButton(
                icon=ft.icons.MORE_VERT, tooltip="Options",
                items=[
                    ft.PopupMenuItem(text="Edit", icon=ft.icons.EDIT_OUTLINED, on_click=handle_edit_click),
                    ft.PopupMenuItem(),
                    ft.PopupMenuItem(
                        text="Delete", icon=ft.icons.DELETE_OUTLINE,
                        on_click=lambda _: delete_callback_func(game_data['id'], game_data['name']) # Use passed callback
                    ),
                ]
            ),
        )
        return ft.Card(content=list_tile_content, margin=ft.margin.only(bottom=2))

    def open_add_game_dialog(e=None):
        # (open_add_game_dialog remains mostly the same, refresh logic is fine)
        close_manual_dialog() 
        target_year = app_state["current_view"] if app_state["current_view"] in YEARS else str(datetime.now().year)
        print(f"Opening MANUAL add game dialog for target year: {target_year}")
        name_field = ft.TextField(label="Game Title *", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        platform_field = ft.TextField(label="Platform", capitalization=ft.TextCapitalization.WORDS)
        date_display = ft.TextField(ref=add_game_date_display_field, label="Completion Date *", read_only=True, hint_text="Click calendar...")
        if add_game_date_display_field.current: add_game_date_display_field.current.value = ""; add_game_date_display_field.current.error_text = None; # ...
        score_dropdown = ft.Dropdown(label="Score", width=110, options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)], value="N/A")
        replay_check = ft.Checkbox(label="This was a Replay", value=False)
        def save_new_game(e):
            name = name_field.value.strip(); platform = platform_field.value.strip()
            date_str = add_game_date_display_field.current.value.strip() if add_game_date_display_field.current else ""
            score_str = score_dropdown.value; is_replay = replay_check.value; errors = []
            name_field.error_text = None; date_display.error_text = None; score_dropdown.error_text = None
            if not name: errors.append("Title required."); name_field.error_text = "Required"
            if not date_str: errors.append("Date required."); date_display.error_text = "Required"
            else:
                try: datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError: errors.append("Invalid date."); date_display.error_text = "Invalid Format"
            score_int = None
            if score_str and score_str != "N/A":
                try:
                    score_int = int(score_str)
                    if not (0 <= score_int <= 10): errors.append("Score 0-10."); score_dropdown.error_text = "0-10"
                except ValueError: errors.append("Invalid score."); score_dropdown.error_text = "Invalid"
            name_field.update(); platform_field.update(); date_display.update(); score_dropdown.update()
            if errors: show_snackbar("Please fix errors: " + " ".join(errors), color=ft.Colors.ERROR_CONTAINER); return
            add_game_db(name, platform, date_str, score_int, is_replay)
            show_snackbar(f"Added '{name}' to {target_year}")
            close_manual_dialog()
            refresh_current_view() # This will refresh the current year view or search view
            current_stats_filter = "All Time"
            try:
                if stats_year_filter.current and stats_year_filter.current.selected: current_stats_filter = list(stats_year_filter.current.selected)[0]
            except Exception: pass
            if page: page.run_thread(calculate_and_update_stats_display, current_stats_filter)
        content_controls = [name_field, platform_field, ft.Row([date_display, ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=open_add_date_picker)], alignment=ft.MainAxisAlignment.START), score_dropdown, replay_check]
        action_buttons = [ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Save Game", on_click=save_new_game)]
        manual_dialog = create_dialog_overlay(f"Add Game to {target_year}", content_controls, action_buttons)
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog()
        main_stack.controls.append(manual_dialog)
        if page: main_stack.update()

    def open_edit_game_dialog(game_data_to_edit):
        # (open_edit_game_dialog remains mostly the same, refresh logic is fine)
        close_manual_dialog() 
        game_id = game_data_to_edit['id']; print(f"Opening EDIT game dialog for ID: {game_id}, Name: {game_data_to_edit['name']}")
        edit_name_field = ft.Ref[ft.TextField](); edit_platform_field = ft.Ref[ft.TextField]()
        edit_date_display_field = ft.Ref[ft.TextField](); edit_score_dropdown = ft.Ref[ft.Dropdown]()
        edit_replay_check = ft.Ref[ft.Checkbox]()
        name_field = ft.TextField(ref=edit_name_field, label="Game Title *", autofocus=True, capitalization=ft.TextCapitalization.WORDS, value=game_data_to_edit.get('name', ''))
        platform_field = ft.TextField(ref=edit_platform_field, label="Platform", capitalization=ft.TextCapitalization.WORDS, value=game_data_to_edit.get('platform', '') or '')
        initial_date_str = game_data_to_edit.get('completion_date', '')
        date_display = ft.TextField(ref=edit_date_display_field, label="Completion Date *", read_only=True, hint_text="Click calendar...", value=initial_date_str)
        initial_score = game_data_to_edit.get('review_score'); score_value_str = str(initial_score) if initial_score is not None else "N/A"
        score_dropdown = ft.Dropdown(ref=edit_score_dropdown, label="Score", width=110, options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)], value=score_value_str)
        initial_replay = game_data_to_edit.get('is_replay') == 1
        replay_check = ft.Checkbox(ref=edit_replay_check, label="This was a Replay", value=initial_replay)
        edit_date_picker = None
        if page:
            try:
                initial_picker_date = None
                if initial_date_str:
                    try: initial_picker_date = datetime.strptime(initial_date_str, '%Y-%m-%d')
                    except ValueError: pass
                edit_date_picker = ft.DatePicker(on_change=lambda e: handle_edit_date_change(e, edit_date_display_field), help_text="Select Date", value=initial_picker_date)
                page.overlay.append(edit_date_picker)
            except Exception as dp_err: print(f"Error creating edit date picker: {dp_err}")
        def handle_edit_date_change(e, target_field_ref):
            selected_date = e.control.value
            if target_field_ref.current and selected_date: formatted_date = selected_date.strftime('%Y-%m-%d'); target_field_ref.current.value = formatted_date; target_field_ref.current.update()
        def open_edit_date_picker(e):
             if edit_date_picker: 
                 if page: edit_date_picker.open = True; page.update(); print("Edit date picker opened.")
                 else: print("Page context lost before opening edit date picker.")
             else: print("Error: Edit date picker object not found or not created."); show_snackbar("Edit date picker not available.", color=ft.Colors.ERROR)
        def save_edited_game(e):
            name = edit_name_field.current.value.strip() if edit_name_field.current else ""
            platform = edit_platform_field.current.value.strip() if edit_platform_field.current else ""
            date_str = edit_date_display_field.current.value.strip() if edit_date_display_field.current else ""
            score_str = edit_score_dropdown.current.value if edit_score_dropdown.current else "N/A"
            is_replay = edit_replay_check.current.value if edit_replay_check.current else False; errors = []
            if edit_name_field.current: edit_name_field.current.error_text = None
            if edit_date_display_field.current: edit_date_display_field.current.error_text = None
            if edit_score_dropdown.current: edit_score_dropdown.current.error_text = None
            if not name: errors.append("Title required."); edit_name_field.current.error_text = "Required"
            if not date_str: errors.append("Date required."); edit_date_display_field.current.error_text = "Required"
            else:
                try: datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError: errors.append("Invalid date."); edit_date_display_field.current.error_text = "Invalid Format"
            score_int = None
            if score_str and score_str != "N/A":
                try:
                    score_int = int(score_str)
                    if not (0 <= score_int <= 10): errors.append("Score 0-10."); edit_score_dropdown.current.error_text = "0-10"
                except ValueError: errors.append("Invalid score."); edit_score_dropdown.current.error_text = "Invalid"
            if edit_name_field.current: edit_name_field.current.update() # ... more updates
            if edit_platform_field.current: edit_platform_field.current.update()
            if edit_date_display_field.current: edit_date_display_field.current.update()
            if edit_score_dropdown.current: edit_score_dropdown.current.update()
            if errors: show_snackbar("Please fix errors: " + " ".join(errors), color=ft.Colors.ERROR_CONTAINER); return
            update_game_db(game_id, name, platform, date_str, score_int, is_replay)
            show_snackbar(f"Updated '{name}'")
            close_manual_dialog()
            refresh_current_view() # This will refresh the current year view or search view
            current_stats_filter = "All Time"
            try:
                if stats_year_filter.current and stats_year_filter.current.selected: current_stats_filter = list(stats_year_filter.current.selected)[0]
            except Exception: pass
            if page: page.run_thread(calculate_and_update_stats_display, current_stats_filter)
        content_controls = [name_field, platform_field, ft.Row([date_display, ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=open_edit_date_picker)], alignment=ft.MainAxisAlignment.START), score_dropdown, replay_check]
        action_buttons = [ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Save Changes", on_click=save_edited_game)]
        manual_dialog = create_dialog_overlay(f"Edit Game: {game_data_to_edit['name']}", content_controls, action_buttons, associated_picker=edit_date_picker)
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog()
        main_stack.controls.append(manual_dialog)
        if page: main_stack.update()

    # --- Stats View ---
    stats_year_filter = ft.SegmentedButton(
        segments=[ft.Segment(value="All Time", label=ft.Text("Overall"))] + [ft.Segment(value=year, label=ft.Text(year)) for year in YEARS],
        selected={"All Time"}, allow_empty_selection=False, show_selected_icon=False,
    )
    def calculate_and_update_stats_display(filter_year="All Time"):
        # (calculate_and_update_stats_display remains the same)
        print(f"Calculating stats for display filter: {filter_year}"); games_data = []
        total_games, average_score, total_replays, unique_platforms = 0, 0.0, 0, 0
        pie_sections_data, legend_items_data = [], []; bar_chart_groups = []; max_monthly_count = 0
        platform_specific_colors = {"xbox": ft.Colors.GREEN_600, "playstation": ft.Colors.INDIGO_500, "switch": ft.Colors.RED_600, "pc": ft.Colors.ORANGE_600, "steam deck": ft.Colors.PURPLE_500,}
        fallback_platform_colors = [ft.Colors.BLUE_500, ft.Colors.PURPLE_500, ft.Colors.TEAL_500, ft.Colors.PINK_500, ft.Colors.CYAN_500, ft.Colors.LIGHT_BLUE_500, ft.Colors.LIME_500, ft.Colors.AMBER_500, ft.Colors.DEEP_ORANGE_500, ft.Colors.LIGHT_GREEN_500, ft.Colors.DEEP_PURPLE_500, ft.Colors.BROWN_400, ft.Colors.BLUE_GREY_500, ft.Colors.YELLOW_800]
        unknown_color = ft.Colors.with_opacity(0.5, ft.Colors.ON_SURFACE_VARIANT)
        try:
            if filter_year == "All Time": games_data = get_all_games_db()
            else:
                try: year_int = int(filter_year); games_data = get_games_by_year_db(year_int)
                except ValueError: print(f"Error: Invalid year '{filter_year}' for stats filter."); games_data = []
            games_data = games_data or []
            total_games = len(games_data)
            total_replays = sum(1 for g in games_data if g.get('is_replay') == 1)
            valid_scores = [g['review_score'] for g in games_data if g.get('review_score') is not None and isinstance(g['review_score'], (int, float))]
            average_score = (sum(valid_scores) / len(valid_scores)) if valid_scores else 0.0
            platform_counts = Counter( (g.get('platform', "Unknown") or "Unknown").strip().title() for g in games_data )
            unique_platforms = len(platform_counts); fallback_color_index = 0
            sorted_platforms = platform_counts.most_common()
            for platform, count in sorted_platforms:
                percentage = (count / total_games * 100) if total_games > 0 else 0; platform_lower = platform.lower(); assigned_color = None
                if platform == "Unknown": assigned_color = unknown_color
                else: 
                    if "steam deck" == platform_lower: assigned_color = platform_specific_colors["steam deck"]
                    elif "xbox" in platform_lower: assigned_color = platform_specific_colors["xbox"]
                    elif "playstation" in platform_lower or "ps" in platform_lower.split(): assigned_color = platform_specific_colors["playstation"]
                    elif "switch" in platform_lower: assigned_color = platform_specific_colors["switch"]
                    elif "pc" == platform_lower or "windows" in platform_lower or "steam" in platform_lower: assigned_color = platform_specific_colors["pc"]
                if assigned_color is None: assigned_color = fallback_platform_colors[fallback_color_index % len(fallback_platform_colors)]; fallback_color_index += 1
                pie_sections_data.append(ft.PieChartSection(value=percentage, title=f"{percentage:.0f}%" if percentage >= 5 else "", title_style=ft.TextStyle(size=10, color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD), color=assigned_color, radius=70))
                display_platform = "PC" if platform == "Pc" else platform
                legend_items_data.append(ft.Row([ft.Container(width=16, height=16, bgcolor=assigned_color, border_radius=3), ft.Text(f"{display_platform} ({count})")], spacing=10))
            monthly_counts = {month: 0 for month in range(1, 13)}
            month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            for game in games_data:
                date_str = game.get('completion_date')
                if date_str:
                    try: completion_dt = datetime.strptime(date_str, '%Y-%m-%d'); month = completion_dt.month; monthly_counts[month] += 1
                    except (ValueError, TypeError): print(f"Warning: Could not parse date '{date_str}' for game '{game.get('name')}' during monthly calculation.")
            bar_chart_color = ft.colors.BLUE_GREY_400 
            for month_num in range(1, 13):
                count = monthly_counts[month_num]
                if count > max_monthly_count: max_monthly_count = count 
                tooltip_text = f"{month_names[month_num-1]}: {count} game{'s' if count != 1 else ''}"
                bar_rod = ft.BarChartRod(to_y=count, width=18, color=bar_chart_color, tooltip=tooltip_text, border_radius=ft.border_radius.only(top_left=5, top_right=5))
                bar_group = ft.BarChartGroup(x=month_num - 1, bar_rods=[bar_rod]); bar_chart_groups.append(bar_group)
            dynamic_max_y = max(5, max_monthly_count + 2) 
        except Exception as e:
             print(f"!!!!!!!!! ERROR DURING STATS CALCULATION !!!!!!!!!\n{e}"); traceback.print_exc(); print(f"!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
             total_games, average_score, total_replays, unique_platforms = "Error", "N/A", "Error", "Error"
             pie_sections_data, legend_items_data = [], [ft.Text("Error loading data.", color=ft.Colors.ERROR)]; bar_chart_groups = []; dynamic_max_y = 5 
        if page:
            if stats_total_games_text.current: stats_total_games_text.current.value = str(total_games); stats_total_games_text.current.update()
            if stats_avg_score_text.current: stats_avg_score_text.current.value = f"{average_score:.1f}" if isinstance(average_score, float) else average_score; stats_avg_score_text.current.update()
            if stats_total_replays_text.current: stats_total_replays_text.current.value = str(total_replays); stats_total_replays_text.current.update()
            if stats_unique_platforms_text.current: stats_unique_platforms_text.current.value = str(unique_platforms); stats_unique_platforms_text.current.update()
            if platform_pie_chart.current: platform_pie_chart.current.sections = pie_sections_data; platform_pie_chart.current.update()
            if platform_legend.current: platform_legend.current.controls = legend_items_data; platform_legend.current.update()
            if stats_monthly_barchart.current: stats_monthly_barchart.current.bar_groups = bar_chart_groups; stats_monthly_barchart.current.max_y = dynamic_max_y; stats_monthly_barchart.current.update()
        print(f"Stats UI update complete for {filter_year}.")
    def on_stats_filter_change(e):
        selected_year = list(e.control.selected)[0] if e.control.selected else "All Time"
        print(f"Stats filter changed to: {selected_year}")
        if page: page.run_thread(calculate_and_update_stats_display, selected_year)
    def create_summary_card(icon, value_ref, label):
        # (create_summary_card remains the same)
        theme_primary = ft.Colors.BLUE
        if page and page.theme and page.theme.color_scheme: theme_primary = page.theme.color_scheme.primary or ft.Colors.BLUE
        return ft.Card(content=ft.Container(padding=15, content=ft.Column([
            ft.Icon(icon, size=24, color=ft.Colors.with_opacity(0.8, theme_primary)),
            ft.Text(ref=value_ref, value="...", size=20, weight=ft.FontWeight.BOLD),
            ft.Text(label, size=12, color=ft.Colors.with_opacity(0.7, ft.Colors.ON_SURFACE), text_align=ft.TextAlign.CENTER)
        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, alignment=ft.MainAxisAlignment.CENTER, spacing=5)))
    def build_stats_view():
        # (build_stats_view remains the same)
        print("Building stats view")
        month_labels = [ft.ChartAxisLabel(value=i, label=ft.Text(month, size=10)) for i, month in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])]
        controls_list = [
            ft.Text("Statistics", style=ft.TextThemeStyle.HEADLINE_MEDIUM), stats_year_filter, 
            ft.Container(content=ft.Text("Summary", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.GridView(runs_count=4, max_extent=200, child_aspect_ratio=1.0, spacing=10, run_spacing=10, controls=[
                create_summary_card(ft.icons.VIDEOGAME_ASSET_ROUNDED, stats_total_games_text, "Total Games Logged"), create_summary_card(ft.icons.STAR_RATE_ROUNDED, stats_avg_score_text, "Average Rating"),
                create_summary_card(ft.icons.REPLAY_ROUNDED, stats_total_replays_text, "Replays Logged"), create_summary_card(ft.icons.DEVICES_OTHER_ROUNDED, stats_unique_platforms_text, "Unique Platforms"),
            ]),
            ft.Container(content=ft.Text("Platform Breakdown", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Card(content=ft.Container(padding=20, content=ft.Row([
                ft.Column([ft.PieChart(ref=platform_pie_chart, sections=[], center_space_radius=40, expand=True,)], expand=3, alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER), 
                ft.Column([ft.Text("Platforms", weight=ft.FontWeight.BOLD), ft.Column(ref=platform_legend, controls=[ft.ProgressRing(width=20, height=20)], spacing=8, scroll=ft.ScrollMode.ADAPTIVE, expand=True)], expand=2, horizontal_alignment=ft.CrossAxisAlignment.START, scroll=ft.ScrollMode.ADAPTIVE, height=250), 
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER))),
            ft.Container(content=ft.Text("Completions per Month", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Card(content=ft.Container(
                    content=ft.BarChart(ref=stats_monthly_barchart, bar_groups=[], bottom_axis=ft.ChartAxis(labels=month_labels), tooltip_bgcolor=ft.colors.with_opacity(0.8, ft.colors.BLUE_GREY_700),
                        left_axis=ft.ChartAxis(labels_size=40), border=ft.border.all(1, ft.colors.with_opacity(0.2, ft.colors.OUTLINE)),
                        horizontal_grid_lines=ft.ChartGridLines(interval=2, color=ft.colors.with_opacity(0.1, ft.colors.OUTLINE)), interactive=True, expand=True),
                    padding=20, height=300)),
            ft.Container(content=ft.Text("Import / Export", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Row([ft.ElevatedButton("Import from CSV", icon=ft.icons.UPLOAD_FILE_ROUNDED, on_click=open_import_dialog)], spacing=10),
            ft.Text("CSV Format: 'Title' (Req), 'Platform', 'Rating', 'DateCompleted' (Req, YYYY-MM-DD), 'IsReplay'.", italic=True, size=11, color=ft.Colors.with_opacity(0.6, ft.Colors.ON_SURFACE))
        ]
        stats_view_content = ft.ListView(expand=True, spacing=20, padding=ft.padding.symmetric(horizontal=20, vertical=10), controls=controls_list)
        stats_year_filter.on_change = on_stats_filter_change
        return stats_view_content

    # --- Backlog View (Search Bar Removed) ---
    def refresh_backlog_view_list(): # No search query needed
        print("Refreshing backlog list view controls")
        if not backlog_list_view_content.current: print("Warning: Backlog ListView ref not set."); return
        list_view = backlog_list_view_content.current; list_view.controls.clear()
        items = get_backlog_db() # Uses reverted DB function
        if not items: list_view.controls.append(ft.Container(content=ft.Text("Backlog empty.", italic=True, text_align=ft.TextAlign.CENTER), padding=20))
        else:
            for item in items:
                list_view.controls.append(create_backlog_tile(item, delete_backlog_action, toggle_backlog_playing_action))
        if page and list_view.page:
             try: list_view.update()
             except Exception as update_err: print(f"Error updating backlog list view: {update_err}")
    def delete_backlog_action(item_id, item_name):
        # (delete_backlog_action remains the same)
        print(f"Deleting backlog item ID {item_id}, Name {item_name}")
        try:
            delete_backlog_item_db(item_id); show_snackbar(f"Removed '{item_name}' from backlog")
            refresh_backlog_view_list()
        except Exception as e: print(f"Error during backlog deletion or refresh: {e}"); show_snackbar(f"Error removing '{item_name}'.", color=ft.Colors.ERROR)
    def toggle_backlog_playing_action(item_id, item_name, current_status):
        # (toggle_backlog_playing_action remains the same)
        print(f"Toggling playing status for: ID {item_id}, Name {item_name}")
        try:
            toggle_backlog_playing_status_db(item_id)
            new_status_text = "Now Playing" if not current_status else "Stopped Playing"
            show_snackbar(f"'{item_name}': {new_status_text}")
            refresh_backlog_view_list()
        except Exception as e: print(f"Error toggling playing status or refreshing: {e}"); show_snackbar(f"Error updating '{item_name}' status.", color=ft.Colors.ERROR)
    def create_backlog_tile(item_data, delete_callback, toggle_play_callback):
        # (create_backlog_tile remains the same)
        platform_str = item_data.get('platform', 'Any Platform') or 'Any Platform'; added_date_str = item_data.get('added_date', 'Unknown Date') or 'Unknown Date'
        is_playing = item_data.get('is_playing') == 1; leading_widget = None; theme_primary = ft.Colors.BLUE 
        if page and page.theme and page.theme.color_scheme: theme_primary = page.theme.color_scheme.primary or ft.Colors.BLUE
        if is_playing: leading_widget = ft.Container(content=ft.Icon(name=ft.icons.PLAY_CIRCLE_FILLED_OUTLINED, color=theme_primary, tooltip="Currently Playing"), padding=ft.padding.only(right=12, left=4))
        else: leading_widget = ft.Container(width=30, padding=ft.padding.only(right=12, left=4)) 
        title_text = ft.Text(item_data['name'], weight=ft.FontWeight.BOLD, overflow=ft.TextOverflow.ELLIPSIS, no_wrap=True)
        subtitle_text = ft.Text(f"Platform: {platform_str} | Added: {added_date_str}", size=12, color=ft.colors.with_opacity(0.7, ft.colors.ON_SURFACE), overflow=ft.TextOverflow.ELLIPSIS, no_wrap=True)
        text_content = ft.Column([title_text, subtitle_text], spacing=2, alignment=ft.MainAxisAlignment.CENTER, expand=True)
        toggle_icon = ft.icons.PLAY_ARROW_ROUNDED if not is_playing else ft.icons.STOP_ROUNDED
        toggle_tooltip = "Mark as Currently Playing" if not is_playing else "Mark as Not Playing"
        trailing_actions = ft.Row([
                ft.IconButton(icon=toggle_icon, tooltip=toggle_tooltip, icon_size=20, on_click=lambda _: toggle_play_callback(item_data['id'], item_data['name'], is_playing)),
                ft.IconButton(icon=ft.icons.DELETE_OUTLINE, tooltip="Remove from Backlog", icon_color=ft.Colors.ERROR, icon_size=20, on_click=lambda _: delete_callback(item_data['id'], item_data['name'])),
            ], spacing=0, alignment=ft.MainAxisAlignment.END)
        manual_tile = ft.Container(content=ft.Row([leading_widget, text_content, trailing_actions], vertical_alignment=ft.CrossAxisAlignment.CENTER),
            padding=ft.padding.symmetric(vertical=8, horizontal=5), border_radius=ft.border_radius.all(4),
            border=ft.border.only(bottom=ft.border.BorderSide(1, ft.colors.with_opacity(0.1, ft.colors.OUTLINE))))
        return manual_tile
    def open_add_backlog_dialog(e=None):
        # (open_add_backlog_dialog remains the same)
        close_manual_dialog(); print("Opening MANUAL add backlog dialog")
        name_field = ft.TextField(label="Game Title *", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        platform_field = ft.TextField(label="Platform (Optional)", capitalization=ft.TextCapitalization.WORDS)
        def save_new_backlog(e):
            name = name_field.value.strip(); platform = platform_field.value.strip()
            if not name: name_field.error_text = "Required."; name_field.update(); show_snackbar("Title required.", color=ft.Colors.ERROR_CONTAINER); return
            else: name_field.error_text = None; name_field.update()
            add_backlog_item_db(name, platform if platform else None)
            show_snackbar(f"Added '{name}' to backlog"); close_manual_dialog(); refresh_backlog_view_list()
        content_controls = [name_field, platform_field]
        action_buttons = [ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Add to Backlog", on_click=save_new_backlog)]
        manual_dialog = create_dialog_overlay("Add Game to Backlog", content_controls, action_buttons)
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog()
        main_stack.controls.append(manual_dialog)
        if page: main_stack.update()
    def build_backlog_view():
        print("Building backlog view")
        # Backlog view now directly returns the ListView
        view_content = ft.ListView(
            ref=backlog_list_view_content, expand=True, spacing=5,
            padding=ft.padding.only(left=15, right=15, top=10, bottom=70) # Adjusted top padding
        )
        refresh_backlog_view_list() 
        return view_content

    # --- NEW: Search View ---
    def build_search_view():
        print("Building search view")

        # --- Helper to run search and update list ---
        def perform_search_and_update_list(e=None): # Can be triggered by button or Enter key
            term = search_query_field.current.value if search_query_field.current else ""
            if not term.strip():
                show_snackbar("Please enter a search term.", color=ft.Colors.WARNING)
                if search_results_listview.current:
                    search_results_listview.current.controls.clear()
                    search_results_listview.current.controls.append(
                        ft.Container(content=ft.Text("Enter a term above and click Search.", italic=True, text_align=ft.TextAlign.CENTER), padding=30)
                    )
                    search_results_listview.current.update()
                return

            selected_years_for_search = []
            if search_all_years_checkbox.current and search_all_years_checkbox.current.value:
                selected_years_for_search = None # Signal to search_completed_games_db to search all
            else:
                for year_str, cb_ref in search_year_checkboxes_refs.items():
                    if cb_ref.current and cb_ref.current.value:
                        try: selected_years_for_search.append(int(year_str))
                        except ValueError: print(f"Warning: Invalid year string '{year_str}' in checkboxes.")
                if not selected_years_for_search: # No specific years checked, and "All Years" is off
                    show_snackbar("Please select 'Search All Years' or at least one specific year.", color=ft.Colors.WARNING)
                    return


            print(f"Performing search for: '{term}', Years: {selected_years_for_search}")
            results = search_completed_games_db(term, selected_years_for_search)

            if search_results_listview.current:
                search_results_listview.current.controls.clear()
                if not results:
                    search_results_listview.current.controls.append(
                        ft.Container(content=ft.Text(f"No games found matching '{term}'.", italic=True, text_align=ft.TextAlign.CENTER), padding=30)
                    )
                else:
                    for game in results:
                        # Use a specific delete action for search results
                        search_results_listview.current.controls.append(create_game_log_tile(game, delete_game_action_for_search_view))
                search_results_listview.current.update()
            else:
                print("Error: Search results ListView ref not available.")

        # --- Delete action specific to search view ---
        def delete_game_action_for_search_view(game_id, game_name):
            print(f"Deleting game ID {game_id}, Name {game_name} from Search View")
            try:
                delete_game_db(game_id)
                show_snackbar(f"Deleted '{game_name}'")
                perform_search_and_update_list() # Re-run the current search to refresh results
                # Trigger stats recalc
                current_stats_filter = "All Time"
                try:
                    if stats_year_filter.current and stats_year_filter.current.selected:
                        current_stats_filter = list(stats_year_filter.current.selected)[0]
                except Exception: pass
                if page: page.run_thread(calculate_and_update_stats_display, current_stats_filter)
            except Exception as e:
                print(f"Error during game deletion or refresh from search: {e}")
                show_snackbar(f"Error deleting '{game_name}'.", color=ft.Colors.ERROR)


        # --- Handler for "All Years" checkbox ---
        def on_all_years_toggle(e):
            is_all_years = e.control.value
            for year_str_key in YEARS: # Iterate through defined YEARS
                cb_ref = search_year_checkboxes_refs.get(year_str_key)
                if cb_ref and cb_ref.current:
                    cb_ref.current.disabled = is_all_years
                    if is_all_years: # If "All Years" is checked, uncheck individual years
                        cb_ref.current.value = False
                    cb_ref.current.update()
            # If "All Years" is unchecked, and no specific year is checked, maybe check the first one? Or leave as is.
            # For now, leave as is. User must explicitly check a year if "All Years" is off.

        # --- UI Controls for Search View ---
        _search_input = ft.TextField(
            ref=search_query_field,
            label="Search Completed Games (Name or Platform)",
            hint_text="e.g., Zelda, PS5, RPG...",
            autofocus=True,
            on_submit=perform_search_and_update_list, # Allow Enter key to search
            border_radius=8,
            # border_color=ft.colors.with_opacity(0.3, ft.colors.OUTLINE),
            # height=40, text_size=14,
            # content_padding=ft.padding.symmetric(horizontal=15),
            prefix_icon=ft.icons.SEARCH,
        )

        _all_years_cb = ft.Checkbox(
            ref=search_all_years_checkbox,
            label="Search All Years",
            value=True, # Default to searching all years
            on_change=on_all_years_toggle
        )

        _year_checkbox_controls = [
            ft.Checkbox(
                ref=search_year_checkboxes_refs[year_str], # Assign ref from dict
                label=year_str,
                value=False, # Initially unchecked
                disabled=True # Initially disabled because "All Years" is true
            ) for year_str in YEARS
        ]

        _search_button = ft.ElevatedButton(
            text="Search",
            icon=ft.icons.SEARCH_ROUNDED,
            on_click=perform_search_and_update_list,
            style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8))
        )
        
        _results_lv = ft.ListView(
            ref=search_results_listview,
            expand=True,
            spacing=5,
            padding=ft.padding.only(top=10, bottom=70) # Add some padding
        )
        # Initial message in results list
        _results_lv.controls.append(
             ft.Container(content=ft.Text("Enter a term above and click Search.", italic=True, text_align=ft.TextAlign.CENTER), padding=30)
        )


        # --- Layout for Search View ---
        search_options_row = ft.Row(
            [_all_years_cb] + _year_checkbox_controls,
            spacing=10,
            wrap=True, # Allow checkboxes to wrap if many years
            alignment=ft.MainAxisAlignment.START
        )

        return ft.Column(
            controls=[
                ft.Container(
                    content=ft.Column(
                        [
                            _search_input,
                            ft.Container(search_options_row, padding=ft.padding.only(top=5, bottom=10)),
                            _search_button,
                        ],
                        spacing=10
                    ),
                    padding=ft.padding.all(15) # Padding around search controls
                ),
                ft.Divider(height=1, thickness=1),
                _results_lv # The list view for results
            ],
            expand=True,
            spacing=0 # No space between controls container and list
        )


    # --- Floating Action Button (FAB) ---
    def fab_clicked(e):
        # (fab_clicked remains the same, but Search view won't show FAB)
        current_view = app_state["current_view"]
        print(f"FAB clicked on view: {current_view}")
        if current_view in YEARS: open_add_game_dialog()
        elif current_view == "Backlog": open_add_backlog_dialog()
        else: print(f"Warning: FAB clicked in unexpected view '{current_view}'")
    fab = ft.FloatingActionButton(icon=ft.icons.ADD, tooltip="Add Item", visible=False, on_click=fab_clicked)
    page.floating_action_button = fab
    page.floating_action_button_location = ft.FloatingActionButtonLocation.END_CONTAINED

    # --- Navigation Rail ---
    # Determine initial_index based on app_state["current_view"]
    # The order of destinations must match this logic.
    # Destinations: YEARS, then Stats, then Backlog, THEN Search (at the bottom)
    nav_destinations_config = [(year, ft.icons.CALENDAR_MONTH_OUTLINED, ft.icons.CALENDAR_MONTH) for year in YEARS]
    nav_destinations_config.append(("Stats", ft.icons.QUERY_STATS_OUTLINED, ft.icons.QUERY_STATS))
    nav_destinations_config.append(("Backlog", ft.icons.LIST_ALT_OUTLINED, ft.icons.LIST_ALT))
    nav_destinations_config.append(("Search", ft.icons.SEARCH_OUTLINED, ft.icons.SEARCH_ROUNDED)) # Search is now last

    initial_index = 0 # Default to first year
    for i, (view_name, _, _) in enumerate(nav_destinations_config):
        if app_state["current_view"] == view_name:
            initial_index = i
            break
    if app_state["current_view"] not in [cfg[0] for cfg in nav_destinations_config]: # Fallback if default view is bad
        # If default view was "Search", it will now correctly find its new index.
        # If default view was something else and not found, default to first year or first item in config.
        app_state["current_view"] = nav_destinations_config[0][0] if nav_destinations_config else "2024" # Default to first configured item
        initial_index = 0


    rail = ft.NavigationRail(
        selected_index=initial_index,
        label_type=ft.NavigationRailLabelType.ALL,
        min_width=100,
        min_extended_width=200,
        group_alignment=-0.9, # This aligns the group of destinations towards the top.
                              # The last item in the `destinations` list will appear at the bottom of this group.
        destinations=[
            ft.NavigationRailDestination(icon=icon_outlined, selected_icon=icon_selected, label=label)
            for label, icon_outlined, icon_selected in nav_destinations_config
        ],
    )

    # --- Main Content Area ---
    main_content_area = ft.Column(expand=True, controls=[])

    # ------ Navigation and Content Update Logic -------
    def update_main_content(view_id):
        print(f"Updating main content to display view: {view_id}")
        app_state["current_view"] = view_id
        main_content_area.controls.clear()
        show_fab, fab_tooltip, content = False, "Add Item", None

        if view_id in YEARS:
            content = build_year_view(view_id)
            show_fab = True; fab_tooltip = f"Add Game to {view_id}"
        elif view_id == "Search": # NEW Search View
            content = build_search_view()
            show_fab = False # No FAB on search page
        elif view_id == "Stats":
            content = build_stats_view()
            show_fab = False
        elif view_id == "Backlog":
            content = build_backlog_view()
            show_fab = True; fab_tooltip = "Add to Backlog"
        else:
            content = ft.Container(content=ft.Text(f"Error: Unknown view '{view_id}'.", color=ft.Colors.ERROR), padding=20)

        if content: main_content_area.controls.append(content)
        fab.visible = show_fab; fab.tooltip = fab_tooltip

        if page:
            main_content_area.update(); fab.update()
            if view_id == "Stats":
                initial_filter = list(stats_year_filter.selected)[0] if stats_year_filter.selected else "All Time"
                print(f"Triggering stats calculation for {initial_filter} AFTER adding view to page.")
                page.run_thread(calculate_and_update_stats_display, initial_filter)
        else: print("Warning: Page context lost during view update.")

    def refresh_current_view():
        print(f"Refreshing current view: {app_state['current_view']}")
        close_manual_dialog()
        # If current view is Search, re-trigger the search instead of full rebuild
        if app_state['current_view'] == "Search":
            if search_query_field.current: # Check if search view elements are available
                 # Find the search button or directly call the search function
                 # For simplicity, let's assume the search function can be called directly
                 # This requires the search function to be accessible or part of the search view's context
                 # The `perform_search_and_update_list` is defined within `build_search_view`
                 # A direct call here is tricky. Instead, `update_main_content` will rebuild it.
                 # This is simpler and ensures state is fresh.
                 print("Search view refresh: Rebuilding search view via update_main_content.")
                 update_main_content(app_state['current_view'])
            else: # Fallback if search view isn't fully built yet
                update_main_content(app_state['current_view'])

        else: # For other views, standard refresh
            update_main_content(app_state['current_view'])


    def navigation_change(e):
        idx = e.control.selected_index
        new_view = "Unknown"
        # Logic based on nav_destinations_config order
        if 0 <= idx < len(nav_destinations_config):
            new_view = nav_destinations_config[idx][0] # Get the label (view_id)
        else:
            print(f"Warning: Invalid navigation index {idx}")

        print(f"Navigation changed. Index: {idx}, New View: {new_view}")
        close_manual_dialog()
        if new_view != "Unknown": update_main_content(new_view)
        else: show_snackbar(f"Could not navigate to index {idx}.")

    rail.on_change = navigation_change
    main_layout = ft.Row(
        controls=[rail, ft.VerticalDivider(width=1), main_content_area],
        expand=True, vertical_alignment=ft.CrossAxisAlignment.START
    )
    main_stack.controls.append(main_layout)
    page.add(main_stack)
    print(f"Loading initial view: {app_state['current_view']}")
    update_main_content(app_state["current_view"])

if __name__ == "__main__":
    ft.app(target=main)