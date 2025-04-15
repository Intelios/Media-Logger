# main.py (Confirmation Dialogs REMOVED - Reverted Delete Logic)
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
# If running as a PyInstaller bundle, use the executable's directory
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    # Running in a PyInstaller bundle (frozen)
    base_path = os.path.dirname(sys.executable)
    print(f"Running frozen, base path: {base_path}")
else:
    # Running as a normal script
    base_path = os.path.dirname(os.path.abspath(__file__))
    print(f"Running script, base path: {base_path}")

# Construct the full path to the database file
DB_FILE = os.path.join(base_path, "game_log.db")
print(f"Database file path: {DB_FILE}")

APP_TITLE = "My Game Logger"
YEARS = ["2023", "2024", "2025"] # Adjust years as needed

def init_db():
    """Initializes the SQLite database and tables if they don't exist."""
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        # Completed Games Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                platform TEXT,
                completion_date TEXT, -- Store as ISO format string YYYY-MM-DD
                review_score INTEGER, -- Allow NULL
                year_completed INTEGER, -- Derived from completion_date for indexing/filtering
                is_replay INTEGER DEFAULT 0 NOT NULL CHECK(is_replay IN (0, 1))
            )
        """)
        # Backlog Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS backlog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                platform TEXT, -- Allow NULL
                added_date TEXT, -- Store as ISO format string YYYY-MM-DD
                is_playing INTEGER DEFAULT 0 NOT NULL CHECK(is_playing IN (0, 1)) -- Added is_playing column
            )
        """)

        # --- Handle adding the column if the table already exists ---
        cursor.execute("PRAGMA table_info(backlog)")
        columns = [info[1] for info in cursor.fetchall()]
        if 'is_playing' not in columns:
            print("Adding 'is_playing' column to backlog table...")
            cursor.execute("ALTER TABLE backlog ADD COLUMN is_playing INTEGER DEFAULT 0 NOT NULL CHECK(is_playing IN (0, 1))")
            print("'is_playing' column added.")
        # --- End handling ---

        conn.commit()
        print("Database initialized successfully.")
    except sqlite3.Error as e:
        print(f"Database initialization error: {e}")
    finally:
        if conn:
            conn.close()

def add_game_db(name, platform, completion_date_str, score, is_replay):
    """Adds a completed game entry to the database."""
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

def get_games_by_year_db(year):
    """Retrieves all completed games for a specific year, sorted chronologically."""
    conn = None
    games = []
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row # Return rows as dictionary-like objects
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, platform, completion_date, review_score, is_replay FROM games WHERE year_completed = ? ORDER BY completion_date ASC, id ASC", # Sort chronologically
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
    """Retrieves all completed games, sorted by most recent first."""
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
    """Deletes a specific completed game entry by its ID."""
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
    """Updates an existing game entry in the database."""
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
        score_to_db = score if score is not None else None # Ensure None is stored as NULL

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

def add_backlog_item_db(name, platform):
    """Adds a game to the backlog table (defaulting is_playing to 0)."""
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        added_date = datetime.now().strftime('%Y-%m-%d')
        # is_playing will use its DEFAULT value (0)
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

def get_backlog_db():
    """Retrieves all backlog items, sorted by playing status then name."""
    conn = None
    items = []
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # Select the new column and adjust ORDER BY
        cursor.execute("SELECT id, name, platform, added_date, is_playing FROM backlog ORDER BY is_playing DESC, name ASC")
        items = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database Error getting backlog: {e}")
    finally:
        if conn:
            conn.close()
    return items

def delete_backlog_item_db(item_id):
    """Deletes a specific backlog item by its ID."""
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
    """Toggles the 'is_playing' status (0 to 1, 1 to 0) for a backlog item."""
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        # Use CASE to flip the boolean value
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
# (create_rating_badge remains the same)
def create_rating_badge(score):
    """Creates a circular colored badge displaying the game score."""
    score_text = "N/A"
    bgcolor = ft.Colors.with_opacity(0.5, ft.Colors.ON_SURFACE_VARIANT)
    text_color = ft.Colors.WHITE

    if score is not None:
        try:
            score_val = int(score)
            score_text = str(score_val)
            if 0 <= score_val <= 10:
                if score_val == 10:
                    bgcolor = ft.Colors.LIGHT_GREEN_ACCENT_400
                    text_color = ft.Colors.BLACK
                elif score_val >= 7:
                    bgcolor = ft.Colors.GREEN_600
                    text_color = ft.Colors.WHITE
                elif score_val >= 5:
                    bgcolor = ft.Colors.YELLOW_700
                    text_color = ft.Colors.BLACK
                elif score_val >= 2:
                    bgcolor = ft.Colors.RED_700
                    text_color = ft.Colors.WHITE
                else: # 0-1
                    bgcolor = ft.Colors.RED_500
                    text_color = ft.Colors.WHITE
        except (ValueError, TypeError):
             pass

    return ft.Container(
        content=ft.Text(
            score_text, size=12, weight=ft.FontWeight.BOLD, color=text_color,
            text_align=ft.TextAlign.CENTER
        ),
        width=30, height=30, shape=ft.BoxShape.CIRCLE, bgcolor=bgcolor,
        alignment=ft.alignment.center,
        tooltip=f"Score: {score_text}" if score is not None else "Score: Not Rated"
    )


# --- Main Application ---
def main(page: ft.Page):
    page.title = APP_TITLE
    page.theme_mode = ft.ThemeMode.DARK # Or ft.ThemeMode.LIGHT
    page.theme = ft.Theme(color_scheme_seed=ft.Colors.BLUE_GREY)
    page.window_width = 1400
    page.window_height = 900

    init_db()
    app_state = {"current_view": "2024"}

    # --- SnackBar Helper ---
    # (show_snackbar remains the same)
    def show_snackbar(message: str, color: str = None, duration: int = 4000):
        """Helper function to display a SnackBar."""
        if not page:
            print(f"Snackbar Error: Page context lost. Message: {message}")
            return
        try:
            snackbar_control = ft.SnackBar(
                content=ft.Text(message, max_lines=3, overflow=ft.TextOverflow.ELLIPSIS),
                bgcolor=color, duration=duration, open=True
            )
            page.snack_bar = snackbar_control
            page.update()
            print(f"Showing snackbar: {message}")
        except Exception as e:
            print(f"Error displaying snackbar '{message}': {e}")

    # --- Refs for controls needed across functions ---
    # (Refs remain the same)
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

    # --- Main Stack ---
    main_stack = ft.Stack(expand=True)

    # --- Confirmation Dialog Helper REMOVED ---
    # def close_alert_dialog(e=None): ... REMOVED ...

    # --- DatePicker Setup ---
    # (DatePicker setup remains the same)
    def handle_add_date_change(e):
        selected_date = e.control.value
        if add_game_date_display_field.current and selected_date:
            formatted_date = selected_date.strftime('%Y-%m-%d')
            add_game_date_display_field.current.value = formatted_date
            add_game_date_display_field.current.update()

    add_date_picker = ft.DatePicker(on_change=handle_add_date_change, help_text="Select Completion Date")
    page.overlay.append(add_date_picker)

    # <<< --- FIX HERE (Add Game Picker Trigger) --- >>>
    def open_add_date_picker(e=None):
        if add_date_picker:
            if page:
                # Use open = True and page.update() when picker is in overlay
                add_date_picker.open = True # CHANGED from pick_date()
                page.update()             # ADDED page.update()
                print("Add date picker opened.") # Optional: Added for debugging
            else:
                print("Error: Page context lost before opening date picker.")
        else:
            print("Error: ADD DatePicker object not found.")
            show_snackbar("Could not open date picker.", color=ft.Colors.ERROR) # Added snackbar on error
    # <<< --- END FIX --- >>>

    # --- File Picker Setup ---
    # (File Picker setup remains the same)
    def handle_import_result(e: ft.FilePickerResultEvent):
        if e.files and e.files[0].path:
            selected_file = e.files[0].path
            print(f"CSV file selected: {selected_file}")
            progress_dialog = ft.AlertDialog(
                modal=True, title=ft.Text("Importing CSV"),
                content=ft.Row([ft.ProgressRing(), ft.Text("Processing...")], alignment=ft.MainAxisAlignment.CENTER)
            )
            if page:
                page.dialog = progress_dialog # Use standard page.dialog for progress
                progress_dialog.open = True
                page.update()
                page.run_thread(import_csv_data, selected_file)
            else: print("Error: Page context lost before starting CSV import thread.")
        else: show_snackbar("CSV Import Cancelled or No File Selected")

    import_dialog = ft.FilePicker(on_result=handle_import_result)
    page.overlay.append(import_dialog)

    def open_import_dialog(e):
        if page: import_dialog.pick_files(dialog_title="Select CSV Game Log", allow_multiple=False, allowed_extensions=["csv"])
        else: print("Error: Page context lost before opening import dialog.")

    # (import_csv_data remains the same)
    def import_csv_data(file_path):
        """Parses the selected CSV file and adds games to the database."""
        expected_headers_lower = ["title", "platform", "rating", "datecompleted", "isreplay"]
        header_map = {
            "title": "name", "platform": "platform", "rating": "score",
            "datecompleted": "completion_date_str", "isreplay": "is_replay"
        }
        added_count, skipped_count = 0, 0
        error_messages, warning_messages = [], []
        try:
            with open(file_path, mode='r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                if not reader.fieldnames: raise ValueError("CSV file is empty or has no header row.")
                csv_headers_lower = [h.lower().strip() for h in reader.fieldnames]
                if "title" not in csv_headers_lower or "datecompleted" not in csv_headers_lower:
                    raise ValueError("CSV Header Missing Required Columns: 'Title' and 'DateCompleted'.")
                missing_optional = [eh for eh in expected_headers_lower if eh not in csv_headers_lower and eh not in ["title", "datecompleted"]]
                if missing_optional: warning_messages.append(f"Info: Missing optional columns: {', '.join(missing_optional)}.")
                original_header_lookup = {h.lower().strip(): h for h in reader.fieldnames}
                current_header_map = {eh_lower: header_map[eh_lower] for eh_lower in expected_headers_lower if eh_lower in csv_headers_lower}
                for row_num, row in enumerate(reader, start=2):
                    game_data = {}
                    valid_row, row_errors, row_warnings = True, [], []
                    try:
                        for csv_key_lower, db_arg in current_header_map.items():
                            original_header = original_header_lookup.get(csv_key_lower)
                            game_data[db_arg] = row.get(original_header, "").strip() if original_header else None
                        name = game_data.get("name")
                        date_str = game_data.get("completion_date_str")
                        score_str = game_data.get("score")
                        replay_str = game_data.get("is_replay", "false")
                        platform = game_data.get("platform")
                        if not name: row_errors.append("Missing 'Title'"); valid_row = False
                        if not date_str: row_errors.append("Missing 'DateCompleted'"); valid_row = False
                        else:
                            try: datetime.strptime(date_str, '%Y-%m-%d')
                            except ValueError: row_errors.append(f"Invalid Date Format '{date_str}'"); valid_row = False
                        score_int = None
                        if score_str and score_str.lower() != 'n/a' and score_str.strip() != '':
                            try:
                                score_float = float(score_str); score_int = int(round(score_float))
                                if not (0 <= score_int <= 10):
                                    row_warnings.append(f"Score '{score_str}' invalid (0-10). Setting N/A."); score_int = None
                            except (ValueError, TypeError): row_warnings.append(f"Invalid Score '{score_str}'. Setting N/A.")
                        is_replay = replay_str.lower() in ['true', '1', 'yes', 't', 'y']
                        if valid_row:
                            add_game_db(name, platform, date_str, score_int, is_replay); added_count += 1
                            if row_warnings: warning_messages.extend([f"Row {row_num} ('{name}'): {w}" for w in row_warnings])
                        else:
                            skipped_count += 1; error_messages.append(f"Row {row_num} ('{name or '?'}'): Skipped - {' | '.join(row_errors)}")
                    except Exception as e: skipped_count += 1; error_messages.append(f"Row {row_num}: Skipped - Error: {e}")
        except FileNotFoundError: error_messages.append(f"Error: File not found: {file_path}")
        except ValueError as ve: error_messages.append(f"Error reading CSV structure: {ve}")
        except Exception as e: error_messages.append(f"An unexpected error occurred: {e}")
        summary_lines = [f"CSV Import Finished. Added: {added_count}, Skipped: {skipped_count}."]
        if warning_messages: summary_lines.append("\nWarnings:"); summary_lines.extend(warning_messages[:5]); print("\n--- Import Warnings ---\n" + "\n".join(warning_messages) + "\n---")
        if error_messages: summary_lines.append("\nErrors:"); summary_lines.extend(error_messages[:5]); print("\n--- Import Errors ---\n" + "\n".join(error_messages) + "\n---")
        if page: page.run_thread(show_import_summary_and_refresh, "\n".join(summary_lines), bool(error_messages))
        else: print("Import finished, but page context lost.")

    # (show_import_summary_and_refresh closes the *progress* dialog)
    def show_import_summary_and_refresh(message, had_errors):
        """Displays the import summary and refreshes relevant UI parts."""
        if not page: return
        # Close progress dialog (which uses standard page.dialog)
        if page.dialog and isinstance(page.dialog, ft.AlertDialog): # Check if it's the progress dialog
             page.dialog.open = False
             page.update()
        snackbar_color = ft.Colors.ERROR_CONTAINER if had_errors else ft.Colors.GREEN_700
        show_snackbar(message, color=snackbar_color, duration=10000)
        print("Refreshing views after import...")
        refresh_current_view()
        current_stats_filter = "All Time"
        try:
            if stats_year_filter.current and stats_year_filter.current.selected:
                 current_stats_filter = list(stats_year_filter.current.selected)[0]
        except Exception: pass
        if page: page.run_thread(calculate_and_update_stats_display, current_stats_filter)

    # --- Manual Dialog Creation/Management (for Add/Edit Game/Backlog) ---
    # (close_manual_dialog remains the same, but doesn't call close_alert_dialog anymore)
    def close_manual_dialog(e=None):
        """Closes the currently open manual input dialog (the custom overlay)."""
        print("Attempting to close manual dialog...")
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            try:
                if hasattr(manual_dialog_container.current, '_edit_date_picker_ref'):
                    edit_picker = manual_dialog_container.current._edit_date_picker_ref
                    if edit_picker and edit_picker in page.overlay:
                        try: page.overlay.remove(edit_picker)
                        except (ValueError, AttributeError): pass # Ignore if already removed or page closed
                main_stack.controls.remove(manual_dialog_container.current)
                manual_dialog_container.current = None
                print("Manual dialog container removed.")
                if page: main_stack.update()
            except (ValueError, AttributeError): print("Manual dialog container was already removed or page closed.")
            except Exception as remove_e: print(f"Error removing manual dialog from stack: {remove_e}")

    # (create_dialog_overlay remains the same)
    def create_dialog_overlay(title_text, content_controls, action_buttons, associated_picker=None):
        """Creates the standard overlay container for manual input dialogs."""
        dialog_content = ft.Container(
            content=ft.Column(
                [
                    ft.Text(title_text, style=ft.TextThemeStyle.TITLE_LARGE),
                    ft.Divider(height=10, thickness=1),
                    ft.Container(
                        content=ft.Column(content_controls, spacing=15, tight=True, scroll=ft.ScrollMode.ADAPTIVE),
                        expand=True,
                    ),
                    ft.Divider(height=10, thickness=1),
                    ft.Row(action_buttons, alignment=ft.MainAxisAlignment.END)
                ],
                spacing=10, tight=True,
            ),
            width=450, padding=20,
            bgcolor=ft.colors.with_opacity(0.98, ft.colors.SURFACE if page.theme_mode == ft.ThemeMode.LIGHT else ft.colors.BACKGROUND),
            border_radius=10,
            border=ft.border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.OUTLINE)),
            shadow=ft.BoxShadow(spread_radius=1, blur_radius=15, color=ft.Colors.with_opacity(0.2, ft.Colors.BLACK), offset=ft.Offset(0, 5)),
        )
        overlay_scrim = ft.Container(
            ref=manual_dialog_container, content=dialog_content, alignment=ft.alignment.center,
            bgcolor=ft.Colors.with_opacity(0.6, ft.Colors.BLACK), expand=True,
            on_click=close_manual_dialog
        )
        if associated_picker: overlay_scrim._edit_date_picker_ref = associated_picker
        return overlay_scrim

    # --- View Building Functions ---

    # --- Year View ---
    def build_year_view(year_str):
        """Builds the content for a specific year's game list."""
        print(f"Building year view for: {year_str}")
        year_list_view = ft.ListView(
            expand=True, spacing=8,
            padding=ft.padding.only(left=15, right=15, top=10, bottom=70)
        )

        def refresh_list_content():
            """Clears and repopulates the year_list_view controls."""
            print(f"Refreshing year list controls for {year_str}")
            year_list_view.controls.clear()
            try:
                games = get_games_by_year_db(int(year_str))
                if not games:
                    year_list_view.controls.append(
                        ft.Container(content=ft.Text(f"No games logged for {year_str} yet.", italic=True, text_align=ft.TextAlign.CENTER), padding=20)
                    )
                else:
                    for game in games:
                        # Pass the *direct* delete action
                        year_list_view.controls.append(create_game_log_tile(game, delete_game_action))
            except ValueError: year_list_view.controls.append(ft.Text(f"Invalid year: {year_str}", color=ft.Colors.ERROR))
            except Exception as e: year_list_view.controls.append(ft.Text(f"Error loading games: {e}", color=ft.Colors.ERROR))

        # <<< REVERTED: delete_game_action performs delete directly >>>
        def delete_game_action(game_id, game_name):
            """Deletes the game directly and refreshes."""
            print(f"Deleting game ID {game_id}, Name {game_name}")
            try:
                delete_game_db(game_id)
                show_snackbar(f"Deleted '{game_name}'")
                refresh_list_content()
                if page and year_list_view: year_list_view.update()
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


        # (create_game_log_tile uses Card and calls the direct delete action)
        def create_game_log_tile(game_data, delete_callback):
            """Creates a Card containing a ListTile widget for a single game entry."""
            platform_str = game_data.get('platform', 'N/A') or 'N/A'
            date_str = game_data.get('completion_date', 'Unknown Date') or 'Unknown Date'
            score = game_data.get('review_score')
            is_replay = game_data.get('is_replay') == 1
            title_row_controls = [ft.Text(game_data['name'], weight=ft.FontWeight.BOLD)]
            if is_replay: title_row_controls.append(ft.Icon(name=ft.icons.REPLAY, size=18, tooltip="Replay"))

            def handle_edit_click(e):
                close_manual_dialog() # Close add/edit dialog if open
                open_edit_game_dialog(game_data)

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
                            # Calls the direct delete callback
                            on_click=lambda _: delete_callback(game_data['id'], game_data['name'])
                        ),
                    ]
                ),
            )
            return ft.Card(content=list_tile_content, margin=ft.margin.only(bottom=2))

        refresh_list_content()
        return year_list_view

    # (open_add_game_dialog remains mostly same, calls direct close)
    def open_add_game_dialog(e=None):
        close_manual_dialog() # Close other manual dialog if open
        target_year = app_state["current_view"] if app_state["current_view"] in YEARS else str(datetime.now().year)
        print(f"Opening MANUAL add game dialog for target year: {target_year}")
        name_field = ft.TextField(label="Game Title *", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        platform_field = ft.TextField(label="Platform", capitalization=ft.TextCapitalization.WORDS)
        date_display = ft.TextField(ref=add_game_date_display_field, label="Completion Date *", read_only=True, hint_text="Click calendar...")
        if add_game_date_display_field.current:
             add_game_date_display_field.current.value = ""; add_game_date_display_field.current.error_text = None
             if add_game_date_display_field.current.page: add_game_date_display_field.current.update()
        score_dropdown = ft.Dropdown(label="Score", width=110, options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)], value="N/A")
        replay_check = ft.Checkbox(label="This was a Replay", value=False)

        def save_new_game(e):
            name = name_field.value.strip(); platform = platform_field.value.strip()
            date_str = add_game_date_display_field.current.value.strip() if add_game_date_display_field.current else ""
            score_str = score_dropdown.value; is_replay = replay_check.value
            errors = []
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
            refresh_current_view()
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

    # (open_edit_game_dialog remains mostly same)
    def open_edit_game_dialog(game_data_to_edit):
        close_manual_dialog() # Close other manual dialog if open
        game_id = game_data_to_edit['id']
        print(f"Opening EDIT game dialog for ID: {game_id}, Name: {game_data_to_edit['name']}")
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
            if target_field_ref.current and selected_date:
                formatted_date = selected_date.strftime('%Y-%m-%d'); target_field_ref.current.value = formatted_date
                target_field_ref.current.update()

        # <<< --- FIX HERE (Edit Game Picker Trigger) --- >>>
        def open_edit_date_picker(e):
             if edit_date_picker: # Use the picker created for *this* dialog
                 if page:
                     # Use open = True and page.update()
                     edit_date_picker.open = True # CHANGED from pick_date()
                     page.update()             # ADDED page.update()
                     print("Edit date picker opened.") # Optional: Added for debugging
                 else:
                    print("Page context lost before opening edit date picker.")
             else:
                 print("Error: Edit date picker object not found or not created.")
                 show_snackbar("Edit date picker not available.", color=ft.Colors.ERROR) # Added snackbar on error
        # <<< --- END FIX --- >>>

        def save_edited_game(e):
            name = edit_name_field.current.value.strip() if edit_name_field.current else ""
            platform = edit_platform_field.current.value.strip() if edit_platform_field.current else ""
            date_str = edit_date_display_field.current.value.strip() if edit_date_display_field.current else ""
            score_str = edit_score_dropdown.current.value if edit_score_dropdown.current else "N/A"
            is_replay = edit_replay_check.current.value if edit_replay_check.current else False
            errors = []
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
            if edit_name_field.current: edit_name_field.current.update()
            if edit_platform_field.current: edit_platform_field.current.update()
            if edit_date_display_field.current: edit_date_display_field.current.update()
            if edit_score_dropdown.current: edit_score_dropdown.current.update()
            if errors: show_snackbar("Please fix errors: " + " ".join(errors), color=ft.Colors.ERROR_CONTAINER); return
            update_game_db(game_id, name, platform, date_str, score_int, is_replay)
            show_snackbar(f"Updated '{name}'")
            close_manual_dialog()
            refresh_current_view()
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
    # (Stats view functions remain the same, including 'Pc' fix)
    stats_year_filter = ft.SegmentedButton(
        segments=[ft.Segment(value="All Time", label=ft.Text("Overall"))] + [ft.Segment(value=year, label=ft.Text(year)) for year in YEARS],
        selected={"All Time"}, allow_empty_selection=False, show_selected_icon=False,
    )

    def calculate_and_update_stats_display(filter_year="All Time"):
        """Calculates statistics based on the filter and updates the UI, including monthly bar chart.""" # MODIFIED DOCSTRING
        print(f"Calculating stats for display filter: {filter_year}")
        games_data = []
        total_games, average_score, total_replays, unique_platforms = 0, 0.0, 0, 0
        pie_sections_data, legend_items_data = [], []
        bar_chart_groups = [] # <<< Initialize list for bar chart data
        max_monthly_count = 0 # <<< Initialize max count for Y-axis scaling

        # ... (Platform color definitions remain the same) ...
        platform_specific_colors = {"xbox": ft.Colors.GREEN_600, "playstation": ft.Colors.INDIGO_500, "switch": ft.Colors.RED_600, "pc": ft.Colors.ORANGE_600, "steam deck": ft.Colors.PURPLE_500,}
        fallback_platform_colors = [ft.Colors.BLUE_500, ft.Colors.PURPLE_500, ft.Colors.TEAL_500, ft.Colors.PINK_500, ft.Colors.CYAN_500, ft.Colors.LIGHT_BLUE_500, ft.Colors.LIME_500, ft.Colors.AMBER_500, ft.Colors.DEEP_ORANGE_500, ft.Colors.LIGHT_GREEN_500, ft.Colors.DEEP_PURPLE_500, ft.Colors.BROWN_400, ft.Colors.BLUE_GREY_500, ft.Colors.YELLOW_800]
        unknown_color = ft.Colors.with_opacity(0.5, ft.Colors.ON_SURFACE_VARIANT)

        try:
            # Fetch data based on filter
            if filter_year == "All Time":
                games_data = get_all_games_db()
            else:
                try: year_int = int(filter_year); games_data = get_games_by_year_db(year_int)
                except ValueError: print(f"Error: Invalid year '{filter_year}' for stats filter."); games_data = []
            games_data = games_data or []

            # --- Calculations for Summary Cards & Pie Chart ---
            total_games = len(games_data)
            total_replays = sum(1 for g in games_data if g.get('is_replay') == 1)
            valid_scores = [g['review_score'] for g in games_data if g.get('review_score') is not None and isinstance(g['review_score'], (int, float))]
            average_score = (sum(valid_scores) / len(valid_scores)) if valid_scores else 0.0
            platform_counts = Counter( (g.get('platform', "Unknown") or "Unknown").strip().title() for g in games_data )
            unique_platforms = len(platform_counts)

            # --- Prepare Pie Chart Data ---
            fallback_color_index = 0
            sorted_platforms = platform_counts.most_common()
            for platform, count in sorted_platforms:
                percentage = (count / total_games * 100) if total_games > 0 else 0
                platform_lower = platform.lower(); assigned_color = None
                if platform == "Unknown": assigned_color = unknown_color
                else: # ... (color assignment logic remains same) ...
                    if "steam deck" == platform_lower: assigned_color = platform_specific_colors["steam deck"]
                    elif "xbox" in platform_lower: assigned_color = platform_specific_colors["xbox"]
                    elif "playstation" in platform_lower or "ps" in platform_lower.split(): assigned_color = platform_specific_colors["playstation"]
                    elif "switch" in platform_lower: assigned_color = platform_specific_colors["switch"]
                    elif "pc" == platform_lower or "windows" in platform_lower or "steam" in platform_lower: assigned_color = platform_specific_colors["pc"]
                if assigned_color is None: assigned_color = fallback_platform_colors[fallback_color_index % len(fallback_platform_colors)]; fallback_color_index += 1
                pie_sections_data.append(ft.PieChartSection(value=percentage, title=f"{percentage:.0f}%" if percentage >= 5 else "", title_style=ft.TextStyle(size=10, color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD), color=assigned_color, radius=70))
                display_platform = "PC" if platform == "Pc" else platform
                legend_items_data.append(ft.Row([ft.Container(width=16, height=16, bgcolor=assigned_color, border_radius=3), ft.Text(f"{display_platform} ({count})")], spacing=10))

            # <<< --- CALCULATE MONTHLY COMPLETIONS --- >>>
            monthly_counts = {month: 0 for month in range(1, 13)}
            month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

            for game in games_data:
                date_str = game.get('completion_date')
                if date_str:
                    try:
                        completion_dt = datetime.strptime(date_str, '%Y-%m-%d')
                        month = completion_dt.month
                        monthly_counts[month] += 1
                    except (ValueError, TypeError):
                        print(f"Warning: Could not parse date '{date_str}' for game '{game.get('name')}' during monthly calculation.")

            # --- Prepare Bar Chart Data ---
            bar_chart_color = ft.colors.BLUE_GREY_400 # Choose a color for bars
            for month_num in range(1, 13):
                count = monthly_counts[month_num]
                if count > max_monthly_count:
                    max_monthly_count = count # Track max count for Y-axis

                tooltip_text = f"{month_names[month_num-1]}: {count} game{'s' if count != 1 else ''}"
                bar_rod = ft.BarChartRod(
                    to_y=count,
                    width=18, # Adjust bar width
                    color=bar_chart_color,
                    tooltip=tooltip_text,
                    border_radius=ft.border_radius.only(top_left=5, top_right=5) # Rounded tops
                )
                bar_group = ft.BarChartGroup(
                    x=month_num - 1, # 0-based index for chart groups
                    bar_rods=[bar_rod]
                )
                bar_chart_groups.append(bar_group)

            # Set Y-axis max value (add a small buffer, ensure minimum scale)
            dynamic_max_y = max(5, max_monthly_count + 2) # Minimum scale of 5, or max count + 2

            # <<< --- END MONTHLY CALCULATIONS --- >>>

        except Exception as e:
             # ... (Existing error handling remains the same) ...
             print(f"!!!!!!!!! ERROR DURING STATS CALCULATION !!!!!!!!!\n{e}"); traceback.print_exc(); print(f"!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
             total_games, average_score, total_replays, unique_platforms = "Error", "N/A", "Error", "Error"
             pie_sections_data, legend_items_data = [], [ft.Text("Error loading data.", color=ft.Colors.ERROR)]
             bar_chart_groups = [] # Clear bar chart data on error
             dynamic_max_y = 5 # Default scale on error

        # --- Update UI elements using Refs ---
        if page:
            # Update summary cards and pie chart (existing code)
            if stats_total_games_text.current: stats_total_games_text.current.value = str(total_games); stats_total_games_text.current.update()
            if stats_avg_score_text.current: stats_avg_score_text.current.value = f"{average_score:.1f}" if isinstance(average_score, float) else average_score; stats_avg_score_text.current.update()
            if stats_total_replays_text.current: stats_total_replays_text.current.value = str(total_replays); stats_total_replays_text.current.update()
            if stats_unique_platforms_text.current: stats_unique_platforms_text.current.value = str(unique_platforms); stats_unique_platforms_text.current.update()
            if platform_pie_chart.current: platform_pie_chart.current.sections = pie_sections_data; platform_pie_chart.current.update()
            if platform_legend.current: platform_legend.current.controls = legend_items_data; platform_legend.current.update()

            # <<< --- UPDATE BAR CHART --- >>>
            if stats_monthly_barchart.current:
                stats_monthly_barchart.current.bar_groups = bar_chart_groups
                stats_monthly_barchart.current.max_y = dynamic_max_y # Set dynamic Y-axis max
                stats_monthly_barchart.current.update()
            # <<< --- END BAR CHART UPDATE --- >>>

        print(f"Stats UI update complete for {filter_year}.")

    def on_stats_filter_change(e):
        selected_year = list(e.control.selected)[0] if e.control.selected else "All Time"
        print(f"Stats filter changed to: {selected_year}")
        if page: page.run_thread(calculate_and_update_stats_display, selected_year)

    def create_summary_card(icon, value_ref, label):
        theme_primary = ft.Colors.BLUE
        if page and page.theme and page.theme.color_scheme: theme_primary = page.theme.color_scheme.primary or ft.Colors.BLUE
        return ft.Card(content=ft.Container(padding=15, content=ft.Column([
            ft.Icon(icon, size=24, color=ft.Colors.with_opacity(0.8, theme_primary)),
            ft.Text(ref=value_ref, value="...", size=20, weight=ft.FontWeight.BOLD),
            ft.Text(label, size=12, color=ft.Colors.with_opacity(0.7, ft.Colors.ON_SURFACE), text_align=ft.TextAlign.CENTER)
        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, alignment=ft.MainAxisAlignment.CENTER, spacing=5)))

    def build_stats_view():
        """Builds the content for the Statistics view."""
        print("Building stats view")

        # --- Define Month Labels for X-Axis ---
        # (Month labels definition remains the same)
        month_labels = [
            ft.ChartAxisLabel(value=i, label=ft.Text(month, size=10))
            for i, month in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
        ]

        # --- Structure the view (Create controls FIRST) ---
        controls_list = [
            ft.Text("Statistics", style=ft.TextThemeStyle.HEADLINE_MEDIUM),
            stats_year_filter, # Filter itself

            # Summary GridView
            ft.Container(content=ft.Text("Summary", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.GridView(runs_count=4, max_extent=200, child_aspect_ratio=1.0, spacing=10, run_spacing=10, controls=[
                create_summary_card(ft.icons.VIDEOGAME_ASSET_ROUNDED, stats_total_games_text, "Total Games Logged"), # Refs assigned here
                create_summary_card(ft.icons.STAR_RATE_ROUNDED, stats_avg_score_text, "Average Rating"),
                create_summary_card(ft.icons.REPLAY_ROUNDED, stats_total_replays_text, "Replays Logged"),
                create_summary_card(ft.icons.DEVICES_OTHER_ROUNDED, stats_unique_platforms_text, "Unique Platforms"),
            ]),

            # Platform Breakdown Card
            ft.Container(content=ft.Text("Platform Breakdown", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Card(content=ft.Container(padding=20, content=ft.Row([
                ft.Column([ft.PieChart(ref=platform_pie_chart, sections=[], center_space_radius=40, expand=True,)], expand=3, alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER), # Ref assigned here
                ft.Column([ft.Text("Platforms", weight=ft.FontWeight.BOLD), ft.Column(ref=platform_legend, controls=[ft.ProgressRing(width=20, height=20)], spacing=8, scroll=ft.ScrollMode.ADAPTIVE, expand=True)], expand=2, horizontal_alignment=ft.CrossAxisAlignment.START, scroll=ft.ScrollMode.ADAPTIVE, height=250), # Ref assigned here
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER))),

            # Monthly Completions Chart
            ft.Container(content=ft.Text("Completions per Month", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Card(content=ft.Container(
                    content=ft.BarChart(
                        ref=stats_monthly_barchart, # Ref assigned here
                        bar_groups=[], bottom_axis=ft.ChartAxis(labels=month_labels), tooltip_bgcolor=ft.colors.with_opacity(0.8, ft.colors.BLUE_GREY_700),
                        left_axis=ft.ChartAxis(labels_size=40), border=ft.border.all(1, ft.colors.with_opacity(0.2, ft.colors.OUTLINE)),
                        horizontal_grid_lines=ft.ChartGridLines(interval=2, color=ft.colors.with_opacity(0.1, ft.colors.OUTLINE)),
                        interactive=True, expand=True
                    ),
                    padding=20, height=300
            )),

            # Import/Export section
            ft.Container(content=ft.Text("Import / Export", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Row([ft.ElevatedButton("Import from CSV", icon=ft.icons.UPLOAD_FILE_ROUNDED, on_click=open_import_dialog)], spacing=10),
            ft.Text("CSV Format: 'Title' (Req), 'Platform', 'Rating', 'DateCompleted' (Req, YYYY-MM-DD), 'IsReplay'.", italic=True, size=11, color=ft.Colors.with_opacity(0.6, ft.Colors.ON_SURFACE))
        ]

        # --- Create the final ListView ---
        stats_view_content = ft.ListView(
            expand=True, spacing=20,
            padding=ft.padding.symmetric(horizontal=20, vertical=10),
            controls=controls_list # Add the already created controls
        )

        # --- Assign handlers and trigger calculation AFTER controls are created ---
        stats_year_filter.on_change = on_stats_filter_change
        initial_filter = list(stats_year_filter.selected)[0] if stats_year_filter.selected else "All Time"

        # <<< MODIFICATION: Start thread LATER >>>
        # We don't start the thread here anymore. It will be started AFTER
        # the stats_view_content is added to the page in update_main_content.
        # if page:
        #     page.run_thread(calculate_and_update_stats_display, initial_filter)

        return stats_view_content # Return the complete view


    # --- Backlog View ---
    def refresh_backlog_view_list():
        """Clears and repopulates the backlog list view."""
        print("Refreshing backlog list view controls")
        if not backlog_list_view_content.current: print("Warning: Backlog ListView ref not set."); return
        list_view = backlog_list_view_content.current; list_view.controls.clear()
        items = get_backlog_db()
        if not items: list_view.controls.append(ft.Container(content=ft.Text("Backlog empty.", italic=True, text_align=ft.TextAlign.CENTER), padding=20))
        else:
            for item in items:
                list_view.controls.append(create_backlog_tile(item, delete_backlog_action, toggle_backlog_playing_action))
        # Only update if the view exists and page context is valid
        if page and list_view.page:
             try:
                 list_view.update()
             except Exception as update_err:
                  print(f"Error updating backlog list view: {update_err}")

    # <<< REVERTED: delete_backlog_action performs delete directly >>>
    def delete_backlog_action(item_id, item_name):
        """Deletes the backlog item directly and refreshes."""
        print(f"Deleting backlog item ID {item_id}, Name {item_name}")
        try:
            delete_backlog_item_db(item_id)
            show_snackbar(f"Removed '{item_name}' from backlog")
            # Refresh list - refresh_backlog_view_list handles its own update
            refresh_backlog_view_list()
        except Exception as e:
            print(f"Error during backlog deletion or refresh: {e}")
            show_snackbar(f"Error removing '{item_name}'.", color=ft.Colors.ERROR)


    def toggle_backlog_playing_action(item_id, item_name, current_status):
        """Handles toggling the 'is_playing' status of a backlog item."""
        print(f"Toggling playing status for: ID {item_id}, Name {item_name}")
        try:
            toggle_backlog_playing_status_db(item_id)
            new_status_text = "Now Playing" if not current_status else "Stopped Playing"
            show_snackbar(f"'{item_name}': {new_status_text}")
            # Refresh list - refresh_backlog_view_list handles its own update
            refresh_backlog_view_list()
        except Exception as e:
             print(f"Error toggling playing status or refreshing: {e}")
             show_snackbar(f"Error updating '{item_name}' status.", color=ft.Colors.ERROR)


    # <<< NEW APPROACH: Build backlog tile manually without ListTile >>>
    def create_backlog_tile(item_data, delete_callback, toggle_play_callback):
        """Creates a custom tile widget for a single backlog item using manual layout."""
        platform_str = item_data.get('platform', 'Any Platform') or 'Any Platform'
        added_date_str = item_data.get('added_date', 'Unknown Date') or 'Unknown Date'
        is_playing = item_data.get('is_playing') == 1

        # --- Leading Icon ---
        leading_widget = None
        theme_primary = ft.Colors.BLUE # Default
        if page and page.theme and page.theme.color_scheme:
            theme_primary = page.theme.color_scheme.primary or ft.Colors.BLUE

        if is_playing:
            # Add some padding around the icon
            leading_widget = ft.Container(
                content=ft.Icon(
                    name=ft.icons.PLAY_CIRCLE_FILLED_OUTLINED,
                    color=theme_primary,
                    tooltip="Currently Playing"
                ),
                padding=ft.padding.only(right=12, left=4) # Adjust padding as needed
            )
        else:
            # Add empty container to maintain alignment when icon isn't present
             leading_widget = ft.Container(width=30, padding=ft.padding.only(right=12, left=4)) # Match approx icon width + padding

        # --- Main Text Content ---
        title_text = ft.Text(
            item_data['name'],
            weight=ft.FontWeight.BOLD,
            overflow=ft.TextOverflow.ELLIPSIS, # Handle overflow
            no_wrap=True # Prevent internal wrapping
        )
        subtitle_text = ft.Text(
            f"Platform: {platform_str} | Added: {added_date_str}",
            size=12, # Slightly smaller subtitle
            color=ft.colors.with_opacity(0.7, ft.colors.ON_SURFACE),
            overflow=ft.TextOverflow.ELLIPSIS, # Handle overflow
            no_wrap=True # Prevent internal wrapping
        )

        # Place text in a Column that expands
        text_content = ft.Column(
            [title_text, subtitle_text],
            spacing=2, # Small spacing between title and subtitle
            alignment=ft.MainAxisAlignment.CENTER, # Center text vertically
            # Allow this column to take available horizontal space
            expand=True
        )

        # --- Trailing Actions ---
        toggle_icon = ft.icons.PLAY_ARROW_ROUNDED if not is_playing else ft.icons.STOP_ROUNDED
        toggle_tooltip = "Mark as Currently Playing" if not is_playing else "Mark as Not Playing"

        trailing_actions = ft.Row(
            [
                ft.IconButton(
                    icon=toggle_icon,
                    tooltip=toggle_tooltip,
                    icon_size=20, # Adjust icon size if needed
                    on_click=lambda _: toggle_play_callback(item_data['id'], item_data['name'], is_playing)
                ),
                ft.IconButton(
                    icon=ft.icons.DELETE_OUTLINE,
                    tooltip="Remove from Backlog",
                    icon_color=ft.Colors.ERROR,
                    icon_size=20, # Adjust icon size if needed
                    # Calls the direct delete callback
                    on_click=lambda _: delete_callback(item_data['id'], item_data['name'])
                ),
            ],
            spacing=0, # Keep buttons close
            alignment=ft.MainAxisAlignment.END,
        )

        # --- Assemble the Tile using a Row ---
        manual_tile = ft.Container( # Add container for padding/border/background
            content=ft.Row(
                [
                    leading_widget, # Icon or placeholder
                    text_content,   # Expanding column with text
                    trailing_actions # Action buttons
                ],
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
                # spacing=5 # Adjust spacing between elements if needed
            ),
            padding=ft.padding.symmetric(vertical=8, horizontal=5), # Padding inside the tile
            border_radius=ft.border_radius.all(4),
             border=ft.border.only(bottom=ft.border.BorderSide(1, ft.colors.with_opacity(0.1, ft.colors.OUTLINE))) # Subtle bottom border
            # bgcolor=ft.colors.with_opacity(0.03, ft.colors.ON_SURFACE), # Optional subtle background
        )

        return manual_tile
    # <<< END REWRITTEN FUNCTION >>>
    # (open_add_backlog_dialog remains mostly same)
    def open_add_backlog_dialog(e=None):
        close_manual_dialog() # Close other manual dialog if open
        print("Opening MANUAL add backlog dialog")
        name_field = ft.TextField(label="Game Title *", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        platform_field = ft.TextField(label="Platform (Optional)", capitalization=ft.TextCapitalization.WORDS)
        def save_new_backlog(e):
            name = name_field.value.strip()
            platform = platform_field.value.strip()
            if not name: name_field.error_text = "Required."; name_field.update(); show_snackbar("Title required.", color=ft.Colors.ERROR_CONTAINER); return
            else: name_field.error_text = None; name_field.update()
            add_backlog_item_db(name, platform if platform else None)
            show_snackbar(f"Added '{name}' to backlog")
            close_manual_dialog()
            refresh_backlog_view_list() # Refresh data source (will update list)
        content_controls = [name_field, platform_field]
        action_buttons = [ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Add to Backlog", on_click=save_new_backlog)]
        manual_dialog = create_dialog_overlay("Add Game to Backlog", content_controls, action_buttons)
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog()
        main_stack.controls.append(manual_dialog)
        if page: main_stack.update()

    def build_backlog_view():
        """Builds the content for the Backlog view."""
        print("Building backlog view")
        view_content = ft.ListView(
            ref=backlog_list_view_content, expand=True, spacing=5,
            padding=ft.padding.only(left=15, right=15, top=10, bottom=70)
        )
        refresh_backlog_view_list() # Populate initially
        return view_content

    # --- Floating Action Button (FAB) ---
    # (FAB logic remains same, doesn't call removed dialog functions)
    def fab_clicked(e):
        current_view = app_state["current_view"]
        print(f"FAB clicked on view: {current_view}")
        if current_view in YEARS: open_add_game_dialog()
        elif current_view == "Backlog": open_add_backlog_dialog()
        else: print(f"Warning: FAB clicked in unexpected view '{current_view}'")

    fab = ft.FloatingActionButton(icon=ft.icons.ADD, tooltip="Add Item", visible=False, on_click=fab_clicked)
    page.floating_action_button = fab
    page.floating_action_button_location = ft.FloatingActionButtonLocation.END_CONTAINED


    # --- Navigation Rail ---
    # (Navigation Rail definition remains the same)
    try: initial_index = YEARS.index(app_state["current_view"])
    except ValueError:
        if app_state["current_view"] == "Stats": initial_index = len(YEARS)
        elif app_state["current_view"] == "Backlog": initial_index = len(YEARS) + 1
        else: initial_index = 0; app_state["current_view"] = YEARS[0] if YEARS else "Stats"
    rail = ft.NavigationRail(
        selected_index=initial_index, label_type=ft.NavigationRailLabelType.ALL,
        min_width=100, min_extended_width=200, group_alignment=-0.9,
        destinations=(
            [ft.NavigationRailDestination(icon=ft.icons.CALENDAR_MONTH_OUTLINED, selected_icon=ft.icons.CALENDAR_MONTH, label=y) for y in YEARS] +
            [ft.NavigationRailDestination(icon=ft.icons.QUERY_STATS_OUTLINED, selected_icon=ft.icons.QUERY_STATS, label="Stats"),
             ft.NavigationRailDestination(icon=ft.icons.LIST_ALT_OUTLINED, selected_icon=ft.icons.LIST_ALT, label="Backlog")]
        ),
    )

    # --- Main Content Area ---
    main_content_area = ft.Column(expand=True, controls=[])

    # ------ Navigation and Content Update Logic -------
    # (update_main_content remains the same)
    # ------ Navigation and Content Update Logic -------
    def update_main_content(view_id):
        """Clears the main content area and loads the selected view."""
        print(f"Updating main content to display view: {view_id}")
        app_state["current_view"] = view_id
        main_content_area.controls.clear()
        show_fab, fab_tooltip, content = False, "Add Item", None

        # Build the appropriate view content
        if view_id in YEARS:
            content = build_year_view(view_id)
            show_fab = True; fab_tooltip = f"Add Game to {view_id}"
        elif view_id == "Stats":
            content = build_stats_view() # Builds the layout, but doesn't start calc thread
            show_fab = False
        elif view_id == "Backlog":
            content = build_backlog_view()
            show_fab = True; fab_tooltip = "Add to Backlog"
        else:
            content = ft.Container(content=ft.Text(f"Error: Unknown view '{view_id}'.", color=ft.Colors.ERROR), padding=20)

        # Add the new content and update FAB visibility/tooltip
        if content:
            main_content_area.controls.append(content)
        fab.visible = show_fab; fab.tooltip = fab_tooltip

        # Update the UI parts that changed
        if page:
            # Update the main area FIRST to add the controls to the page
            main_content_area.update()
            fab.update()

            # <<< MODIFICATION: Start calculation thread AFTER adding content >>>
            if view_id == "Stats":
                initial_filter = list(stats_year_filter.selected)[0] if stats_year_filter.selected else "All Time"
                print(f"Triggering stats calculation for {initial_filter} AFTER adding view to page.")
                page.run_thread(calculate_and_update_stats_display, initial_filter)
            # <<< END MODIFICATION >>>

        else:
            print("Warning: Page context lost during view update.")

    # (refresh_current_view closes manual dialog only)
    def refresh_current_view():
        print(f"Refreshing current view: {app_state['current_view']}")
        close_manual_dialog() # Close add/edit overlay if open
        update_main_content(app_state['current_view'])

    # (navigation_change closes manual dialog only)
    def navigation_change(e):
        idx = e.control.selected_index; new_view = "Unknown"
        if 0 <= idx < len(YEARS): new_view = YEARS[idx]
        elif idx == len(YEARS): new_view = "Stats"
        elif idx == len(YEARS) + 1: new_view = "Backlog"
        else: print(f"Warning: Invalid navigation index {idx}")
        print(f"Navigation changed. Index: {idx}, New View: {new_view}")
        close_manual_dialog() # Close add/edit overlay if open before changing view
        if new_view != "Unknown": update_main_content(new_view)
        else: show_snackbar(f"Could not navigate to index {idx}.")

    rail.on_change = navigation_change

    # ----- Main Layout Structure -----
    main_layout = ft.Row(
        controls=[rail, ft.VerticalDivider(width=1), main_content_area],
        expand=True, vertical_alignment=ft.CrossAxisAlignment.START
    )
    main_stack.controls.append(main_layout)

    # ----- Add Main Structure to Page -----
    page.add(main_stack)

    # ----- Load Initial View -----
    print(f"Loading initial view: {app_state['current_view']}")
    update_main_content(app_state["current_view"])

# --- Entry Point ---
if __name__ == "__main__":
    ft.app(target=main)