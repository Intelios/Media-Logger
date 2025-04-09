# main.py (Final Version with Platform Colors)
import flet as ft
import sqlite3
import csv
from datetime import datetime
import sys
import os
from collections import Counter
import math
# import time # Not used

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
DB_FILE = os.path.join(base_path, "game_log.db") # <--- MODIFIED LINE
print(f"Database file path: {DB_FILE}")

APP_TITLE = "My Game Logger"
YEARS = ["2023", "2024", "2025"] # Adjust years as needed

# --- Database Handling ---
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
                added_date TEXT -- Store as ISO format string YYYY-MM-DD
            )
        """)
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
    """Adds a game to the backlog table."""
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

def get_backlog_db():
    """Retrieves all backlog items, sorted alphabetically by name."""
    conn = None
    items = []
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, platform, added_date FROM backlog ORDER BY name ASC")
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


# --- UI Helper Functions ---
def create_rating_badge(score):
    """Creates a circular colored badge displaying the game score."""
    score_text = "N/A"
    # Default N/A color (grey)
    bgcolor = ft.Colors.with_opacity(0.5, ft.Colors.ON_SURFACE_VARIANT)
    # Default text color (suitable for grey and darker backgrounds)
    text_color = ft.Colors.WHITE

    if score is not None:
        try:
            score_val = int(score)
            score_text = str(score_val)

            # Apply colors based on score range (Metacritic-inspired)
            if 0 <= score_val <= 10:
                if score_val == 10:
                    # Bright Green for 10
                    bgcolor = ft.Colors.LIGHT_GREEN_ACCENT_400
                    text_color = ft.Colors.BLACK # Needs dark text
                elif score_val >= 7:
                    # Standard Green for 7-9
                    bgcolor = ft.Colors.GREEN_600
                    text_color = ft.Colors.WHITE
                elif score_val >= 5:
                    # Yellow for 5-6
                    bgcolor = ft.Colors.YELLOW_700
                    text_color = ft.Colors.BLACK # Needs dark text
                elif score_val >= 2:
                    # Standard Red for 2-4
                    bgcolor = ft.Colors.RED_700
                    text_color = ft.Colors.WHITE
                else: # 0-1
                    # Brighter Red for 0-1
                    bgcolor = ft.Colors.RED_500
                    text_color = ft.Colors.WHITE
            # else: If score is somehow outside 0-10, keep default grey/white

        except (ValueError, TypeError):
             # If score conversion fails, keep N/A text and default grey/white colors
             pass

    return ft.Container(
        content=ft.Text(
            score_text,
            size=12,
            weight=ft.FontWeight.BOLD,
            color=text_color,
            text_align=ft.TextAlign.CENTER # Ensure text is centered within its box
        ),
        width=30,
        height=30,
        shape=ft.BoxShape.CIRCLE,
        bgcolor=bgcolor,
        alignment=ft.alignment.center, # Center the Text widget within the Container
        tooltip=f"Score: {score_text}" if score is not None else "Score: Not Rated"
    )

# --- Main Application ---
def main(page: ft.Page):
    page.title = APP_TITLE
    page.theme_mode = ft.ThemeMode.DARK # Or ft.ThemeMode.LIGHT
    page.theme = ft.Theme(color_scheme_seed=ft.Colors.BLUE_GREY)
    # Set initial window size
    page.window_width = 1400
    page.window_height = 900

    init_db()
    # Use a dictionary to manage mutable app state like the current view
    app_state = {"current_view": "2024"} # Default view

    # --- SnackBar Helper ---
    def show_snackbar(message: str, color: str = None, duration: int = 4000):
        """Helper function to display a SnackBar."""
        if not page:
            print(f"Snackbar Error: Page context lost. Message: {message}")
            return
        try:
            # Create a new SnackBar instance each time
            snackbar_control = ft.SnackBar(
                content=ft.Text(message, max_lines=3, overflow=ft.TextOverflow.ELLIPSIS),
                bgcolor=color,
                duration=duration,
                open=True  # Set open to True immediately
            )
            page.snack_bar = snackbar_control # Assign it to the page property
            page.update() # Update the page to show it
            print(f"Showing snackbar: {message}")
        except Exception as e:
            # Catch potential errors during snackbar display itself
            print(f"Error displaying snackbar '{message}': {e}")

    # --- Refs for controls needed across functions ---
    add_game_date_display_field = ft.Ref[ft.TextField]()
    manual_dialog_container = ft.Ref[ft.Container]() # Ref for the dialog overlay container
    stats_total_games_text = ft.Ref[ft.Text]()
    stats_avg_score_text = ft.Ref[ft.Text]()
    stats_total_replays_text = ft.Ref[ft.Text]()
    stats_unique_platforms_text = ft.Ref[ft.Text]()
    platform_pie_chart = ft.Ref[ft.PieChart]()
    platform_legend = ft.Ref[ft.Column]()
    backlog_list_view_content = ft.Ref[ft.ListView]()

    # --- Main Stack (for layering dialogs over content) ---
    # Defined later, but needed for dialog functions
    main_stack = ft.Stack(expand=True)

    # -------------- DatePicker Setup --------------------------------------------
    # This is the picker for the ADD dialog
    def handle_add_date_change(e):
        """Updates the date field when a date is selected in the ADD DatePicker."""
        selected_date = e.control.value
        if add_game_date_display_field.current and selected_date:
            formatted_date = selected_date.strftime('%Y-%m-%d')
            add_game_date_display_field.current.value = formatted_date
            add_game_date_display_field.current.update()

    add_date_picker = ft.DatePicker(
        on_change=handle_add_date_change,
        help_text="Select Completion Date",
    )
    page.overlay.append(add_date_picker) # Add DatePicker to page overlay

    # --- Helper Function to Open ADD Date Picker ---
    def open_add_date_picker(e=None):
        """Opens the ADD DatePicker dialog."""
        if add_date_picker:
            add_date_picker.open = True
            page.update()
        else:
            print("Error: ADD DatePicker object not found.")
            show_snackbar("Could not open date picker.", color=ft.Colors.ERROR)

    # --- File Picker for CSV Import ---
    def handle_import_result(e: ft.FilePickerResultEvent):
        """Processes the result of the file picker dialog for CSV import."""
        page.dialog = None # Close any previous generic dialog
        if e.files and e.files[0].path:
            selected_file = e.files[0].path
            print(f"CSV file selected: {selected_file}")

            # Show progress dialog
            progress_dialog = ft.AlertDialog(
                modal=True,
                title=ft.Text("Importing CSV"),
                content=ft.Row([ft.ProgressRing(), ft.Text("Processing...")], alignment=ft.MainAxisAlignment.CENTER)
            )
            page.dialog = progress_dialog
            progress_dialog.open = True
            page.update()

            # Run import in a separate thread to avoid blocking UI
            page.run_thread(import_csv_data, selected_file)
        else:
            show_snackbar("CSV Import Cancelled or No File Selected")

    import_dialog = ft.FilePicker(on_result=handle_import_result)
    page.overlay.append(import_dialog) # Add FilePicker to overlay

    def open_import_dialog(e):
        """Opens the file picker dialog to select a CSV file."""
        import_dialog.pick_files(
            dialog_title="Select CSV Game Log",
            allow_multiple=False,
            allowed_extensions=["csv"]
        )

    def import_csv_data(file_path):
        """Parses the selected CSV file and adds games to the database."""
        # Define expected headers (lowercase) and mapping to DB arguments
        expected_headers_lower = ["title", "platform", "rating", "datecompleted", "isreplay"]
        header_map = {
            "title": "name", "platform": "platform", "rating": "score",
            "datecompleted": "completion_date_str", "isreplay": "is_replay"
        }
        added_count, skipped_count = 0, 0
        error_messages, warning_messages = [], []

        try:
            with open(file_path, mode='r', encoding='utf-8-sig') as csvfile: # Use utf-8-sig to handle potential BOM
                reader = csv.DictReader(csvfile)
                if not reader.fieldnames:
                    raise ValueError("CSV file is empty or has no header row.")

                # Validate headers (case-insensitive)
                csv_headers_lower = [h.lower().strip() for h in reader.fieldnames]
                if "title" not in csv_headers_lower or "datecompleted" not in csv_headers_lower:
                    raise ValueError("CSV Header Missing Required Columns: 'Title' and 'DateCompleted' are mandatory.")

                # Check for missing optional headers
                missing_optional = [eh for eh in expected_headers_lower if eh not in csv_headers_lower and eh not in ["title", "datecompleted"]]
                if missing_optional:
                    warning_messages.append(f"Info: Missing optional columns: {', '.join(missing_optional)}. Defaults will be used.")

                # Create lookups for efficient processing
                original_header_lookup = {h.lower().strip(): h for h in reader.fieldnames}
                current_header_map = {eh_lower: header_map[eh_lower] for eh_lower in expected_headers_lower if eh_lower in csv_headers_lower}

                # Process each row
                for row_num, row in enumerate(reader, start=2):
                    game_data = {}
                    valid_row = True
                    row_errors, row_warnings = [], []
                    try:
                        # Map CSV data to expected DB arguments
                        for csv_key_lower, db_arg in current_header_map.items():
                            original_header = original_header_lookup.get(csv_key_lower)
                            game_data[db_arg] = row.get(original_header, "").strip() if original_header else None

                        # Extract and validate data for the current game
                        name = game_data.get("name")
                        date_str = game_data.get("completion_date_str")
                        score_str = game_data.get("score")
                        replay_str = game_data.get("is_replay", "false") # Default to false if missing
                        platform = game_data.get("platform")

                        if not name: row_errors.append("Missing 'Title'"); valid_row = False
                        if not date_str: row_errors.append("Missing 'DateCompleted'"); valid_row = False
                        else:
                            try: datetime.strptime(date_str, '%Y-%m-%d')
                            except ValueError: row_errors.append(f"Invalid Date Format '{date_str}' (use YYYY-MM-DD)"); valid_row = False

                        # Process score
                        score_int = None
                        if score_str and score_str.lower() != 'n/a' and score_str.strip() != '':
                            try:
                                score_float = float(score_str); score_int = int(round(score_float))
                                if not (0 <= score_int <= 10):
                                    row_warnings.append(f"Score '{score_str}' rounded to {score_int}, outside 0-10 range. Setting to N/A.")
                                    score_int = None
                            except (ValueError, TypeError):
                                row_warnings.append(f"Invalid Score '{score_str}'. Setting to N/A.")
                                score_int = None

                        # Process replay status
                        is_replay = replay_str.lower() in ['true', '1', 'yes', 't', 'y']

                        # Add to DB if valid
                        if valid_row:
                            add_game_db(name, platform, date_str, score_int, is_replay)
                            added_count += 1
                            if row_warnings:
                                warning_messages.extend([f"Row {row_num} ('{name}'): {w}" for w in row_warnings])
                        else:
                            skipped_count += 1
                            error_messages.append(f"Row {row_num} ('{name or '<?>'}'): Skipped - {' | '.join(row_errors)}")

                    except Exception as e:
                        skipped_count += 1
                        error_messages.append(f"Row {row_num}: Skipped - Unexpected error processing row: {e}")

        except FileNotFoundError: error_messages.append(f"Error: File not found at path: {file_path}")
        except ValueError as ve: error_messages.append(f"Error reading CSV structure: {ve}")
        except Exception as e: error_messages.append(f"An unexpected error occurred: {e}")

        # Prepare summary message
        summary_lines = [f"CSV Import Finished. Added: {added_count}, Skipped: {skipped_count}."]
        if warning_messages:
            summary_lines.append("\nWarnings (Max 5 shown):"); summary_lines.extend(warning_messages[:5])
            if len(warning_messages) > 5: summary_lines.append("...")
            print("\n--- Import Warnings ---\n" + "\n".join(warning_messages) + "\n-----------------------\n")
        if error_messages:
            summary_lines.append("\nErrors (Max 5 shown):"); summary_lines.extend(error_messages[:5])
            if len(error_messages) > 5: summary_lines.append("...")
            print("\n--- Import Errors ---\n" + "\n".join(error_messages) + "\n---------------------\n")

        # Show summary and refresh UI (run on main thread via page.run_thread)
        if page:
            page.run_thread(show_import_summary_and_refresh, "\n".join(summary_lines), bool(error_messages))
        else:
            print("Import process finished, but page context was lost. UI not updated.")


    def show_import_summary_and_refresh(message, had_errors):
        """Displays the import summary and refreshes relevant UI parts."""
        if not page: return

        # Close progress dialog if it's open
        if page.dialog and isinstance(page.dialog, ft.AlertDialog) and page.dialog.title.value == "Importing CSV":
            page.dialog.open = False
            page.update()

        # Show summary snackbar
        snackbar_color = ft.Colors.ERROR_CONTAINER if had_errors else ft.Colors.GREEN_700
        show_snackbar(message, color=snackbar_color, duration=10000)

        print("Refreshing views after import...")
        refresh_current_view() # Refresh the currently active view

        # Refresh stats view in the background if it might have changed
        current_stats_filter = "All Time" # Default
        if 'stats_year_filter' in locals() or 'stats_year_filter' in globals(): # Check if control exists
             if stats_year_filter.current and stats_year_filter.current.selected: # Check if Ref is valid and selection exists
                  current_stats_filter = list(stats_year_filter.current.selected)[0]
             elif hasattr(stats_year_filter, 'selected') and stats_year_filter.selected: # Fallback check if Ref isn't used/ready but variable is
                  current_stats_filter = list(stats_year_filter.selected)[0]

        print(f"Triggering background stats recalculation for: {current_stats_filter}")
        page.run_thread(calculate_and_update_stats_display, current_stats_filter)

        page.update() # General page update

    # --- Manual Dialog Creation/Management ---
    def close_manual_dialog(e=None):
        """Closes the currently open manual input dialog."""
        print("Attempting to close manual dialog...")
        # Check if the ref has a value and if that value is in the stack's controls
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            try:
                # Remove the specific DatePicker associated with the Edit dialog if it exists
                if hasattr(manual_dialog_container.current, '_edit_date_picker_ref'):
                    edit_picker = manual_dialog_container.current._edit_date_picker_ref
                    if edit_picker in page.overlay:
                        page.overlay.remove(edit_picker)
                        print("Removed edit date picker from overlay.")

                # Remove the dialog overlay itself
                main_stack.controls.remove(manual_dialog_container.current)
                manual_dialog_container.current = None # Clear the ref
                print("Manual dialog container removed.")
                main_stack.update()
            except Exception as remove_e:
                print(f"Error removing manual dialog from stack: {remove_e}")
        else:
            print("Could not close manual dialog: Not open or ref is broken.")


    def create_dialog_overlay(title_text, content_controls, action_buttons, associated_picker=None):
        """Creates the standard overlay container for manual input dialogs."""
        dialog_content = ft.Container(
            content=ft.Column(
                [
                    ft.Text(title_text, style=ft.TextThemeStyle.TITLE_LARGE),
                    ft.Divider(height=10, thickness=1),
                    # Allow content to scroll if it overflows vertically
                    ft.Container(
                        content=ft.Column(content_controls, spacing=15, tight=True, scroll=ft.ScrollMode.ADAPTIVE),
                        expand=True, # Take available vertical space
                    ),
                    ft.Divider(height=10, thickness=1),
                    ft.Row(action_buttons, alignment=ft.MainAxisAlignment.END)
                ],
                spacing=10,
                tight=True, # Try to fit content height
            ),
            width=450,
            padding=20,
            bgcolor=ft.Colors.with_opacity(0.98, ft.Colors.SURFACE), # Dialog background color
            border_radius=10,
            border=ft.border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.OUTLINE)),
            shadow=ft.BoxShadow(
                spread_radius=1, blur_radius=15,
                color=ft.Colors.with_opacity(0.2, ft.Colors.BLACK),
                offset=ft.Offset(0, 5),
            ),
        )

        # The scrim (dark semi-transparent background)
        overlay_scrim = ft.Container(
            ref=manual_dialog_container, # Assign the ref here
            content=dialog_content,
            alignment=ft.alignment.center, # Center the dialog_content container
            bgcolor=ft.Colors.with_opacity(0.6, ft.Colors.BLACK), # Scrim color
            expand=True, # Fill the whole stack layer
            # Close dialog if clicking outside it (on the scrim)
            on_click=close_manual_dialog
        )
        # Store the associated picker ref on the scrim container for cleanup if needed
        if associated_picker:
             overlay_scrim._edit_date_picker_ref = associated_picker

        return overlay_scrim

    # --- View Building Functions ---

    # --- Year View ---
    def build_year_view(year_str):
        """Builds the content for a specific year's game list."""
        print(f"Building year view for: {year_str}")
        # Create the ListView that will hold the game tiles
        year_list_view = ft.ListView(expand=True, spacing=8, padding=ft.padding.only(top=10, bottom=70))

        def refresh_list_content():
            """Clears and repopulates the year_list_view controls."""
            print(f"Refreshing year list controls for {year_str}")
            year_list_view.controls.clear()
            try:
                games = get_games_by_year_db(int(year_str))
                if not games:
                    year_list_view.controls.append(
                        ft.Container( # Add padding for empty message
                            content=ft.Text(f"No games logged for {year_str} yet. Use the '+' button to add one!", italic=True, text_align=ft.TextAlign.CENTER),
                            padding=20
                        )
                    )
                else:
                    for game in games:
                        # Pass the delete action handler to the tile creation
                        year_list_view.controls.append(create_game_log_tile(game, delete_game_action))
            except ValueError: # Handle case where year_str is not a valid integer
                year_list_view.controls.append(ft.Text(f"Invalid year: {year_str}", color=ft.Colors.ERROR))
            except Exception as e:
                print(f"Error loading games for {year_str}: {e}")
                year_list_view.controls.append(ft.Text(f"Error loading games: {e}", color=ft.Colors.ERROR))
            # No year_list_view.update() needed here, parent update handles initial draw

        def delete_game_action(game_id, game_name):
            """Handles the deletion of a game from the list and database."""
            print(f"Attempting to delete game: ID {game_id}, Name {game_name}")
            delete_game_db(game_id)
            show_snackbar(f"Deleted '{game_name}'")
            refresh_list_content() # Refresh the list data source
            year_list_view.update() # Update the UI list specifically after deletion

            # Trigger stats recalculation in the background
            current_stats_filter = "All Time"
            if 'stats_year_filter' in locals() or 'stats_year_filter' in globals():
                 if stats_year_filter.current and stats_year_filter.current.selected:
                      current_stats_filter = list(stats_year_filter.current.selected)[0]
                 elif hasattr(stats_year_filter, 'selected') and stats_year_filter.selected:
                      current_stats_filter = list(stats_year_filter.selected)[0]
            page.run_thread(calculate_and_update_stats_display, current_stats_filter)

        def create_game_log_tile(game_data, delete_callback):
            """Creates a ListTile widget for a single game entry."""
            platform_str = game_data.get('platform', 'N/A') or 'N/A' # Handle None or empty platform
            date_str = game_data.get('completion_date', 'Unknown Date') or 'Unknown Date'
            score = game_data.get('review_score')
            is_replay = game_data.get('is_replay') == 1

            # Create title row with optional replay icon
            title_row_controls = [
                ft.Text(game_data['name'], weight=ft.FontWeight.BOLD)
            ]
            if is_replay:
                title_row_controls.append(
                    ft.Icon(name=ft.icons.REPLAY, size=18, tooltip="Replay")
                )

            # --- Add the 'Edit' action ---
            def handle_edit_click(e):
                open_edit_game_dialog(game_data) # Pass the game data to the edit dialog function

            return ft.ListTile(
                leading=create_rating_badge(score),
                title=ft.Row(
                    controls=title_row_controls,
                    spacing=5, # Space between name and icon
                    vertical_alignment=ft.CrossAxisAlignment.CENTER
                ),
                subtitle=ft.Text(f"{platform_str}  |  Completed: {date_str}"),
                trailing=ft.PopupMenuButton(
                    icon=ft.icons.MORE_VERT,
                    tooltip="Options",
                    items=[
                        # Add Edit option
                        ft.PopupMenuItem(
                            text="Edit",
                            icon=ft.icons.EDIT_OUTLINED,
                            on_click=handle_edit_click # Call the handler
                        ),
                        ft.PopupMenuItem(), # Divider
                        ft.PopupMenuItem(
                            text="Delete", icon=ft.icons.DELETE_OUTLINE,
                            # Call the passed delete_callback with game details
                            on_click=lambda _: delete_callback(game_data['id'], game_data['name'])
                        ),
                    ]
                ),
            )

        refresh_list_content() # Populate the list view initially
        return year_list_view

    def open_add_game_dialog(e=None):
        """Opens the dialog for manually adding a completed game."""
        # Determine target year based on current view
        target_year = app_state["current_view"] if app_state["current_view"] in YEARS else str(datetime.now().year)
        print(f"Opening MANUAL add game dialog for target year: {target_year}")

        # Create dialog input fields
        name_field = ft.TextField(label="Game Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        platform_field = ft.TextField(label="Platform", capitalization=ft.TextCapitalization.WORDS)
        date_display = ft.TextField(
            ref=add_game_date_display_field, label="Completion Date",
            read_only=True, hint_text="Click calendar to select..."
        )
        # Reset add game date field value when opening dialog
        add_game_date_display_field.current.value = ""
        add_game_date_display_field.current.error_text = None
        if add_game_date_display_field.current.page: # Update if already on page
             add_game_date_display_field.current.update()

        score_dropdown = ft.Dropdown(
            label="Score", width=110,
            options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)],
            value="N/A"
        )
        replay_check = ft.Checkbox(label="This was a Replay", value=False)

        def save_new_game(e):
            """Validates input and saves the new game to the database."""
            name = name_field.value.strip()
            platform = platform_field.value.strip()
            date_str = add_game_date_display_field.current.value.strip() if add_game_date_display_field.current else ""
            score_str = score_dropdown.value
            is_replay = replay_check.value
            errors = []

            # --- Input Validation ---
            name_field.error_text = None; date_display.error_text = None; score_dropdown.error_text = None # Reset errors
            if not name: errors.append("Game Title is required."); name_field.error_text = "Required"
            if not date_str: errors.append("Completion Date is required."); date_display.error_text = "Required"
            else:
                try: datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError: errors.append("Invalid date format (YYYY-MM-DD)."); date_display.error_text = "Invalid Format"

            score_int = None
            if score_str and score_str != "N/A":
                try:
                    score_int = int(score_str)
                    if not (0 <= score_int <= 10): errors.append("Score must be 0-10."); score_dropdown.error_text = "0-10"
                except ValueError: errors.append("Invalid score."); score_dropdown.error_text = "Invalid"
            # --- End Validation ---

            # Update fields to show potential errors
            name_field.update(); platform_field.update(); date_display.update(); score_dropdown.update()

            if errors:
                show_snackbar("Please fix errors: " + " ".join(errors), color=ft.Colors.ERROR_CONTAINER)
                return

            # Add to DB, show confirmation, close dialog, refresh view
            add_game_db(name, platform, date_str, score_int, is_replay)
            show_snackbar(f"Added '{name}' to {target_year}")
            close_manual_dialog()
            refresh_current_view()

            # Trigger stats recalculation
            current_stats_filter = "All Time"
            if 'stats_year_filter' in locals() or 'stats_year_filter' in globals():
                 if stats_year_filter.current and stats_year_filter.current.selected:
                      current_stats_filter = list(stats_year_filter.current.selected)[0]
                 elif hasattr(stats_year_filter, 'selected') and stats_year_filter.selected:
                      current_stats_filter = list(stats_year_filter.selected)[0]
            page.run_thread(calculate_and_update_stats_display, current_stats_filter)

        # Assemble dialog content and actions
        content_controls = [
            name_field, platform_field,
            # Use the specific date picker opener for the ADD dialog
            ft.Row([date_display, ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=open_add_date_picker)], alignment=ft.MainAxisAlignment.START),
            score_dropdown, replay_check
        ]
        action_buttons = [
            ft.TextButton("Cancel", on_click=close_manual_dialog),
            ft.ElevatedButton("Save Game", on_click=save_new_game),
        ]

        # Create and display the dialog overlay
        manual_dialog = create_dialog_overlay(f"Add Game to {target_year}", content_controls, action_buttons)
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            close_manual_dialog() # Close existing dialog first
        main_stack.controls.append(manual_dialog)
        print("Manual add game dialog added to stack.")
        main_stack.update()
        print("...stack updated to show dialog.")

    def open_edit_game_dialog(game_data_to_edit):
        """Opens the dialog for editing an existing completed game."""
        game_id = game_data_to_edit['id']
        print(f"Opening EDIT game dialog for ID: {game_id}, Name: {game_data_to_edit['name']}")

        # --- Create Refs specific to the Edit Dialog ---
        edit_name_field = ft.Ref[ft.TextField]()
        edit_platform_field = ft.Ref[ft.TextField]()
        edit_date_display_field = ft.Ref[ft.TextField]()
        edit_score_dropdown = ft.Ref[ft.Dropdown]()
        edit_replay_check = ft.Ref[ft.Checkbox]()
        # --- End Edit Refs ---

        # Create dialog input fields and PRE-POPULATE them
        name_field = ft.TextField(
            ref=edit_name_field,
            label="Game Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS,
            value=game_data_to_edit.get('name', '') # Pre-populate
        )
        platform_field = ft.TextField(
            ref=edit_platform_field,
            label="Platform", capitalization=ft.TextCapitalization.WORDS,
            value=game_data_to_edit.get('platform', '') or '' # Pre-populate, handle None
        )
        # Pre-populate date field
        initial_date_str = game_data_to_edit.get('completion_date', '')
        date_display = ft.TextField(
            ref=edit_date_display_field, label="Completion Date",
            read_only=True, hint_text="Click calendar to select...",
            value=initial_date_str # Pre-populate
        )

        # Pre-populate score dropdown
        initial_score = game_data_to_edit.get('review_score')
        score_value_str = str(initial_score) if initial_score is not None else "N/A"
        score_dropdown = ft.Dropdown(
            ref=edit_score_dropdown,
            label="Score", width=110,
            options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)],
            value=score_value_str # Pre-populate
        )

        # Pre-populate replay checkbox
        initial_replay = game_data_to_edit.get('is_replay') == 1
        replay_check = ft.Checkbox(
            ref=edit_replay_check,
            label="This was a Replay",
            value=initial_replay # Pre-populate
        )

        # --- Date Picker specific setup for Edit ---
        # Try to set the initial date for the picker itself
        initial_picker_date = None
        if initial_date_str:
            try:
                initial_picker_date = datetime.strptime(initial_date_str, '%Y-%m-%d')
            except ValueError:
                pass # Ignore if date is invalid format

        # Create a NEW DatePicker instance specifically for this edit dialog
        edit_date_picker = ft.DatePicker(
            on_change=lambda e: handle_edit_date_change(e, edit_date_display_field), # Use specific handler
            help_text="Select Completion Date",
            value=initial_picker_date # Set initial displayed date in picker
        )
        page.overlay.append(edit_date_picker) # Add this specific picker instance to overlay

        def handle_edit_date_change(e, target_field_ref):
            """Updates the edit date field when the edit DatePicker changes."""
            selected_date = e.control.value
            if target_field_ref.current and selected_date:
                formatted_date = selected_date.strftime('%Y-%m-%d')
                target_field_ref.current.value = formatted_date
                target_field_ref.current.update()

        def open_edit_date_picker(e):
             """Opens the specific DatePicker for editing."""
             edit_date_picker.open = True
             page.update()
        # --- End Date Picker Setup for Edit ---


        def save_edited_game(e):
            """Validates input and saves the edited game to the database."""
            # Read values from the EDIT fields using their Refs
            name = edit_name_field.current.value.strip()
            platform = edit_platform_field.current.value.strip()
            date_str = edit_date_display_field.current.value.strip()
            score_str = edit_score_dropdown.current.value
            is_replay = edit_replay_check.current.value
            errors = []

            # --- Input Validation (same as add, but use edit refs) ---
            edit_name_field.current.error_text = None
            edit_date_display_field.current.error_text = None
            edit_score_dropdown.current.error_text = None # Reset errors

            if not name: errors.append("Game Title is required."); edit_name_field.current.error_text = "Required"
            if not date_str: errors.append("Completion Date is required."); edit_date_display_field.current.error_text = "Required"
            else:
                try: datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError: errors.append("Invalid date format (YYYY-MM-DD)."); edit_date_display_field.current.error_text = "Invalid Format"

            score_int = None
            if score_str and score_str != "N/A":
                try:
                    score_int = int(score_str)
                    if not (0 <= score_int <= 10): errors.append("Score must be 0-10."); edit_score_dropdown.current.error_text = "0-10"
                except ValueError: errors.append("Invalid score."); edit_score_dropdown.current.error_text = "Invalid"
            # --- End Validation ---

            # Update fields to show potential errors
            edit_name_field.current.update(); edit_platform_field.current.update()
            edit_date_display_field.current.update(); edit_score_dropdown.current.update()

            if errors:
                show_snackbar("Please fix errors: " + " ".join(errors), color=ft.Colors.ERROR_CONTAINER)
                return

            # --- Call the UPDATE database function ---
            update_game_db(game_id, name, platform, date_str, score_int, is_replay)
            # --- ---

            show_snackbar(f"Updated '{name}'")
            # Cleanup: Remove the specific edit date picker from overlay *before* closing dialog
            # Note: close_manual_dialog now handles this cleanup via _edit_date_picker_ref
            close_manual_dialog()
            refresh_current_view()

            # Trigger stats recalculation
            current_stats_filter = "All Time"
            if 'stats_year_filter' in locals() or 'stats_year_filter' in globals():
                 if stats_year_filter.current and stats_year_filter.current.selected:
                      current_stats_filter = list(stats_year_filter.current.selected)[0]
                 elif hasattr(stats_year_filter, 'selected') and stats_year_filter.selected:
                      current_stats_filter = list(stats_year_filter.selected)[0]
            page.run_thread(calculate_and_update_stats_display, current_stats_filter)


        # Assemble dialog content and actions
        content_controls = [
            name_field, platform_field,
            # Use the specific date picker opener for the edit dialog
            ft.Row([date_display, ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=open_edit_date_picker)], alignment=ft.MainAxisAlignment.START),
            score_dropdown, replay_check
        ]
        action_buttons = [
            ft.TextButton("Cancel", on_click=close_manual_dialog),
            ft.ElevatedButton("Save Changes", on_click=save_edited_game), # Changed button text
        ]

        # Create and display the dialog overlay using the generic overlay creator
        # Pass the specific edit_date_picker so it can be cleaned up
        manual_dialog = create_dialog_overlay(
            f"Edit Game: {game_data_to_edit['name']}",
            content_controls,
            action_buttons,
            associated_picker=edit_date_picker # Pass picker for cleanup reference
        )
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            close_manual_dialog() # Close existing dialog first
        main_stack.controls.append(manual_dialog)
        print("Manual edit game dialog added to stack.")
        main_stack.update()
        print("...stack updated to show edit dialog.")


    # --- Stats View ---
    stats_year_filter = ft.SegmentedButton(
        segments=[ft.Segment(value="All Time", label=ft.Text("Overall"))] + [ft.Segment(value=year, label=ft.Text(year)) for year in YEARS],
        selected={"All Time"}, allow_empty_selection=False, show_selected_icon=False,
        # on_change assigned in build_stats_view
    )

    def calculate_and_update_stats_display(filter_year="All Time"):
        """Calculates statistics based on the filter and updates the UI, with platform colors."""
        print(f"Calculating stats for display filter: {filter_year}")
        games_data = []
        total_games, average_score, total_replays, unique_platforms = 0, 0.0, 0, 0 # Sensible defaults
        pie_sections_data, legend_items_data = [], []

        # --- Define Platform Specific Colors (using lowercase keys/checks) ---
        platform_specific_colors = {
            "xbox": ft.Colors.GREEN_600,         # Standard Xbox Green
            "playstation": ft.Colors.INDIGO_500, # PlayStation Blue/Indigo
            "switch": ft.Colors.RED_600,         # Nintendo Red
            "pc": ft.Colors.ORANGE_600,        # Orange for PC
            # Add more specific platforms here if needed (e.g., "mobile", "vr")
        }
        # --- Fallback colors for other platforms ---
        fallback_platform_colors = [
            ft.Colors.BLUE_500, ft.Colors.PURPLE_500, ft.Colors.TEAL_500,
            ft.Colors.PINK_500, ft.Colors.CYAN_500, ft.Colors.LIGHT_BLUE_500,
            ft.Colors.LIME_500, ft.Colors.AMBER_500, ft.Colors.DEEP_ORANGE_500,
            ft.Colors.LIGHT_GREEN_500, ft.Colors.DEEP_PURPLE_500, ft.Colors.BROWN_400,
            ft.Colors.BLUE_GREY_500, ft.Colors.YELLOW_800 # Added a few more
        ]
        # --- ---

        try:
            # Fetch data based on filter
            if filter_year == "All Time":
                games_data = get_all_games_db()
            else:
                try: year_int = int(filter_year); games_data = get_games_by_year_db(year_int)
                except ValueError: print(f"Error: Invalid year '{filter_year}' for stats filter."); games_data = []
            games_data = games_data or [] # Ensure it's a list

            # --- Calculations ---
            total_games = len(games_data)
            total_replays = sum(1 for g in games_data if g.get('is_replay') == 1)
            valid_scores = [g['review_score'] for g in games_data if g.get('review_score') is not None and isinstance(g['review_score'], (int, float))]
            average_score = (sum(valid_scores) / len(valid_scores)) if valid_scores else 0.0
            # Normalize platform names slightly for counting (e.g., handle leading/trailing spaces, 'Unknown')
            platform_counts = Counter((g.get('platform', "Unknown") or "Unknown").strip() for g in games_data)
            unique_platforms = len(platform_counts)

            # --- Prepare Pie Chart Data ---
            fallback_color_index = 0 # Index for the fallback color list
            sorted_platforms = platform_counts.most_common() # Sort for consistent coloring/display

            for platform, count in sorted_platforms:
                percentage = (count / total_games * 100) if total_games > 0 else 0
                platform_lower = platform.lower() # Use lowercase for checks
                assigned_color = None

                # --- Check for specific platform keywords ---
                # Use 'in' for broader matching (e.g., "Xbox Series X", "PlayStation 5")
                if "xbox" in platform_lower:
                    assigned_color = platform_specific_colors["xbox"]
                elif "playstation" in platform_lower or "ps" in platform_lower.split(): # Check for PS too
                     assigned_color = platform_specific_colors["playstation"]
                elif "switch" in platform_lower:
                     assigned_color = platform_specific_colors["switch"]
                # --- ADDED STEAM DECK CHECK ---
                elif "steam deck" in platform_lower: # Check specifically for Steam Deck
                    assigned_color = ft.Colors.PURPLE_500 # Assign purple!
                # --- END ADDED CHECK ---
                elif "pc" == platform_lower or "windows" in platform_lower or "steam" in platform_lower: # Common PC terms (excluding steam deck now)
                     assigned_color = platform_specific_colors["pc"]
                # --- End specific checks ---

                # If no specific color was assigned, use the fallback rotation
                if assigned_color is None:
                    # Use Unknown's color if platform is Unknown, otherwise rotate fallback
                    if platform == "Unknown":
                         assigned_color = ft.Colors.with_opacity(0.5, ft.Colors.ON_SURFACE_VARIANT) # Same as N/A badge
                    else:
                         assigned_color = fallback_platform_colors[fallback_color_index % len(fallback_platform_colors)]
                         fallback_color_index += 1 # IMPORTANT: Only increment index for other fallback colors

                # Create PieChartSection
                pie_sections_data.append( ft.PieChartSection(
                    value=percentage,
                    title=f"{percentage:.0f}%" if percentage >= 5 else "", # Show % only if >= 5%
                    title_style=ft.TextStyle(size=10, color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD),
                    color=assigned_color, # Use the determined color
                    radius=60
                ))
                # Create Legend item
                legend_items_data.append( ft.Row(
                    [ ft.Container(width=16, height=16, bgcolor=assigned_color, border_radius=3),
                      ft.Text(f"{platform} ({count})") ],
                    spacing=10
                ))
            # --- End Pie Chart Prep ---

        except Exception as e:
             # Log detailed error if calculation fails
             print(f"!!!!!!!!! ERROR DURING STATS CALCULATION !!!!!!!!!")
             print(f"Error type: {type(e).__name__}")
             print(f"Error details: {e}")
             import traceback
             traceback.print_exc() # Print full traceback to console
             print(f"!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
             # Set UI elements to show error state
             total_games, average_score, total_replays, unique_platforms = "Error", "N/A", "Error", "Error"
             pie_sections_data, legend_items_data = [], [ft.Text("Error loading platform data.", color=ft.Colors.ERROR)]

        # --- Update UI elements using Refs (must check if .current exists) ---
        if stats_total_games_text.current: stats_total_games_text.current.value = str(total_games); stats_total_games_text.current.update()
        if stats_avg_score_text.current: stats_avg_score_text.current.value = f"{average_score:.1f}" if isinstance(average_score, float) else average_score; stats_avg_score_text.current.update()
        if stats_total_replays_text.current: stats_total_replays_text.current.value = str(total_replays); stats_total_replays_text.current.update()
        if stats_unique_platforms_text.current: stats_unique_platforms_text.current.value = str(unique_platforms); stats_unique_platforms_text.current.update()
        if platform_pie_chart.current: platform_pie_chart.current.sections = pie_sections_data; platform_pie_chart.current.update()
        if platform_legend.current: platform_legend.current.controls = legend_items_data; platform_legend.current.update()
        print(f"Stats UI update complete for {filter_year}.")


    def on_stats_filter_change(e):
        """Callback when the statistics year filter changes."""
        selected_year = list(e.control.selected)[0] if e.control.selected else "All Time"
        print(f"Stats filter changed to: {selected_year}")
        # Recalculate stats in background thread
        if page: page.run_thread(calculate_and_update_stats_display, selected_year)

    def create_summary_card(icon, value_ref, label):
        """Creates a Card widget for displaying a single summary statistic."""
        # Determine primary color safely
        theme_primary = ft.Colors.BLUE # Default
        if page and page.theme and page.theme.color_scheme:
            theme_primary = page.theme.color_scheme.primary

        return ft.Card(
            content=ft.Container(
                padding=15,
                content=ft.Column(
                    [
                        ft.Icon(icon, size=24, color=ft.Colors.with_opacity(0.8, theme_primary)),
                        ft.Text(ref=value_ref, value="...", size=20, weight=ft.FontWeight.BOLD), # Initial placeholder
                        ft.Text(label, size=12, color=ft.Colors.with_opacity(0.7, ft.Colors.ON_SURFACE))
                    ],
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    alignment=ft.MainAxisAlignment.CENTER,
                    spacing=5,
                )
            )
        )

    def build_stats_view():
        """Builds the content for the Statistics view."""
        print("Building stats view")
        # Assign the change handler
        stats_year_filter.on_change = on_stats_filter_change
        # Trigger initial calculation (runs in background)
        initial_filter = list(stats_year_filter.selected)[0] if stats_year_filter.selected else "All Time"
        page.run_thread(calculate_and_update_stats_display, initial_filter)

        # Structure the view
        controls_list = [
            ft.Text("Statistics", style=ft.TextThemeStyle.HEADLINE_MEDIUM),
            stats_year_filter,

            ft.Container(content=ft.Text("Summary", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.GridView( # Use GridView for responsive layout of cards
                runs_count=4, max_extent=180, child_aspect_ratio=1.1,
                spacing=10, run_spacing=10,
                controls=[
                    create_summary_card(ft.icons.VIDEOGAME_ASSET_ROUNDED, stats_total_games_text, "Total Games Logged"),
                    create_summary_card(ft.icons.STAR_RATE_ROUNDED, stats_avg_score_text, "Average Rating"),
                    create_summary_card(ft.icons.REPLAY_ROUNDED, stats_total_replays_text, "Replays Logged"),
                    create_summary_card(ft.icons.DEVICES_OTHER_ROUNDED, stats_unique_platforms_text, "Unique Platforms"),
                ]
            ),

            ft.Container(content=ft.Text("Platform Breakdown", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Card( content=ft.Container( padding=20,
                    content=ft.Row( [
                            # Pie Chart Column
                            ft.Column( [ ft.PieChart( ref=platform_pie_chart, sections=[], center_space_radius=40, expand=True, ) ], expand=3, alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER ),
                            # Legend Column
                            ft.Column( [
                                ft.Text("Platforms", weight=ft.FontWeight.BOLD),
                                ft.Column( ref=platform_legend, controls=[ft.ProgressRing(width=20, height=20)], spacing=8, scroll=ft.ScrollMode.ADAPTIVE, expand=True) # Show progress, expand
                              ], expand=2, # Give legend less space than chart
                                horizontal_alignment=ft.CrossAxisAlignment.START, scroll=ft.ScrollMode.ADAPTIVE, # Allow legend column itself to scroll if needed
                                height=250 # Limit height of legend column
                            ),
                        ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    )
                )
            ),

            ft.Container(content=ft.Text("Import / Export", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Row( [ ft.ElevatedButton("Import from CSV", icon=ft.icons.UPLOAD_FILE_ROUNDED, on_click=open_import_dialog), ], spacing=10 ),
            ft.Text( "CSV Format: Requires header row. Columns: 'Title' (Required), 'Platform' (Optional), 'Rating' (Optional, 0-10 or N/A), 'DateCompleted' (Required, YYYY-MM-DD), 'IsReplay' (Optional, true/false).", italic=True, size=11, color=ft.Colors.with_opacity(0.6, ft.Colors.ON_SURFACE) )
        ]
        # Return a scrollable container for the stats content
        return ft.ListView( expand=True, spacing=20, padding=ft.padding.symmetric(horizontal=20, vertical=10), controls=controls_list )


    # --- Backlog View ---
    def refresh_backlog_view_list():
        """Clears and repopulates the backlog list view."""
        print("Refreshing backlog list view controls")
        if not backlog_list_view_content.current:
            print("Warning: Backlog ListView ref not set yet.")
            return

        list_view = backlog_list_view_content.current
        list_view.controls.clear()
        items = get_backlog_db()
        if not items:
              list_view.controls.append( ft.Container( content=ft.Text("Your backlog is empty. Use the '+' button to add games!", italic=True, text_align=ft.TextAlign.CENTER), padding=20 ) )
        else:
              for item in items:
                  # Pass the delete action handler to the tile
                  list_view.controls.append(create_backlog_tile(item, delete_backlog_action))
        # No list_view.update() here needed for initial load

    def delete_backlog_action(item_id, item_name):
        """Handles deletion of a backlog item."""
        print(f"Attempting to delete backlog item: ID {item_id}, Name {item_name}")
        delete_backlog_item_db(item_id)
        show_snackbar(f"Removed '{item_name}' from backlog")
        refresh_backlog_view_list() # Refresh data model
        if backlog_list_view_content.current:
             backlog_list_view_content.current.update() # Update the UI list

    def create_backlog_tile(item_data, delete_callback):
        """Creates a ListTile widget for a single backlog item."""
        platform_str = item_data.get('platform', 'Any Platform') or 'Any Platform'
        added_date_str = item_data.get('added_date', 'Unknown Date') or 'Unknown Date'
        return ft.ListTile(
            title=ft.Text(item_data['name'], weight=ft.FontWeight.BOLD),
            subtitle=ft.Text(f"Platform: {platform_str} | Added: {added_date_str}"),
            trailing=ft.IconButton(
                icon=ft.icons.DELETE_OUTLINE, # Corrected icon name
                tooltip="Remove from Backlog",
                icon_color=ft.Colors.ERROR,
                # Call the passed delete callback
                on_click=lambda _: delete_callback(item_data['id'], item_data['name'])
            )
        )

    def open_add_backlog_dialog(e=None):
        """Opens the dialog for adding a game to the backlog."""
        print("Opening MANUAL add backlog dialog")
        name_field = ft.TextField(label="Game Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        platform_field = ft.TextField(label="Platform (Optional)", capitalization=ft.TextCapitalization.WORDS)

        def save_new_backlog(e):
            """Validates and saves the new backlog item."""
            name = name_field.value.strip()
            platform = platform_field.value.strip()
            if not name:
                name_field.error_text = "Title is required."; name_field.update()
                show_snackbar("Game Title cannot be empty.", color=ft.Colors.ERROR_CONTAINER)
                return
            else:
                name_field.error_text = None; name_field.update()

            add_backlog_item_db(name, platform if platform else None)
            show_snackbar(f"Added '{name}' to backlog")
            close_manual_dialog()
            refresh_backlog_view_list() # Refresh the data source
            if backlog_list_view_content.current:
                 backlog_list_view_content.current.update() # Update the UI list

        # Assemble dialog
        content_controls = [name_field, platform_field]
        action_buttons = [
            ft.TextButton("Cancel", on_click=close_manual_dialog),
            ft.ElevatedButton("Add to Backlog", on_click=save_new_backlog),
        ]
        manual_dialog = create_dialog_overlay("Add Game to Backlog", content_controls, action_buttons)

        # Display dialog
        if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            close_manual_dialog() # Close existing dialog first
        main_stack.controls.append(manual_dialog)
        print("Manual add backlog dialog added to stack.")
        main_stack.update()

    def build_backlog_view():
        """Builds the content for the Backlog view."""
        print("Building backlog view")
        # Create the ListView with the Ref assigned
        view_content = ft.ListView(
            ref=backlog_list_view_content,
            expand=True, spacing=8,
            padding=ft.padding.only(top=10, bottom=70)
        )
        refresh_backlog_view_list() # Populate initially
        return view_content

    # --- Floating Action Button (FAB) ---
    def fab_clicked(e):
        """Callback for the Floating Action Button click."""
        current_view = app_state["current_view"]
        print(f"FAB clicked on view: {current_view}")
        if current_view in YEARS:
            open_add_game_dialog()
        elif current_view == "Backlog":
            open_add_backlog_dialog()
        else: # Should not happen if visibility is managed correctly
            print(f"Warning: FAB clicked in unexpected view '{current_view}'")
            show_snackbar("No action available here.")

    fab = ft.FloatingActionButton(
        icon=ft.icons.ADD,
        tooltip="Add Item",
        visible=False, # Visibility controlled by update_main_content
        on_click=fab_clicked
    )
    page.floating_action_button = fab
    page.floating_action_button_location = ft.FloatingActionButtonLocation.END_CONTAINED


    # --- Navigation Rail ---
    # Determine initial selected index based on default app_state
    try:
        initial_index = YEARS.index(app_state["current_view"])
    except ValueError:
        if app_state["current_view"] == "Stats": initial_index = len(YEARS)
        elif app_state["current_view"] == "Backlog": initial_index = len(YEARS) + 1
        else: # Default fallback
             initial_index = 0
             app_state["current_view"] = YEARS[0] if YEARS else "Stats"

    rail = ft.NavigationRail(
        selected_index=initial_index,
        label_type=ft.NavigationRailLabelType.ALL,
        min_width=100, min_extended_width=200,
        group_alignment=-0.9, # Align items towards the top
        destinations=(
            [ft.NavigationRailDestination(icon=ft.icons.CALENDAR_MONTH_OUTLINED, selected_icon=ft.icons.CALENDAR_MONTH, label=y) for y in YEARS] +
            [ft.NavigationRailDestination(icon=ft.icons.QUERY_STATS_OUTLINED, selected_icon=ft.icons.QUERY_STATS, label="Stats"),
             ft.NavigationRailDestination(icon=ft.icons.LIST_ALT_OUTLINED, selected_icon=ft.icons.LIST_ALT, label="Backlog")]
        ),
        # on_change assigned after main_stack is defined
    )

    # --- Main Content Area ---
    main_content_area = ft.Column(expand=True, controls=[]) # Area to display the selected view's content

    # ------ Navigation and Content Update Logic -------
    def update_main_content(view_id):
        """Clears the main content area and loads the selected view."""
        print(f"Updating main content to display view: {view_id}")
        app_state["current_view"] = view_id # Update state
        main_content_area.controls.clear() # Clear previous view
        show_fab, fab_tooltip, content = False, "Add Item", None

        # Build the appropriate view content
        if view_id in YEARS:
            content = build_year_view(view_id)
            show_fab = True
            fab_tooltip = f"Add Game to {view_id}"
        elif view_id == "Stats":
            content = build_stats_view()
            show_fab = False
        elif view_id == "Backlog":
            content = build_backlog_view()
            show_fab = True
            fab_tooltip = "Add to Backlog"
        else: # Fallback for unknown view_id
            content = ft.Container(content=ft.Text(f"Error: Unknown view '{view_id}' selected.", color=ft.Colors.ERROR), padding=20)
            show_fab = False

        # Add the new content and update FAB visibility/tooltip
        if content:
            main_content_area.controls.append(content)
        fab.visible = show_fab
        fab.tooltip = fab_tooltip

        # Update the UI parts that changed
        if page:
            main_content_area.update()
            fab.update()
        else:
            print("Warning: Page context lost during view update.")

    def refresh_current_view():
        """Refreshes the content of the currently displayed view."""
        print(f"Refreshing current view: {app_state['current_view']}")
        update_main_content(app_state['current_view'])

    def navigation_change(e):
        """Handles clicks on the NavigationRail."""
        idx = e.control.selected_index
        new_view = "Unknown"
        # Determine the view based on the selected index
        if 0 <= idx < len(YEARS): new_view = YEARS[idx]
        elif idx == len(YEARS): new_view = "Stats"
        elif idx == len(YEARS) + 1: new_view = "Backlog"
        else: print(f"Warning: Invalid navigation index {idx}")

        print(f"Navigation changed. Index: {idx}, New View: {new_view}")

        # Close any open dialog before switching views
        close_manual_dialog()

        # Update the main content if a valid view was selected
        if new_view != "Unknown":
            update_main_content(new_view)
        else:
            show_snackbar(f"Could not navigate to index {idx}.")

    rail.on_change = navigation_change # Assign the handler now

    # ----- Main Layout Structure -----
    main_layout = ft.Row(
        controls=[
            rail, # Navigation on the left
            ft.VerticalDivider(width=1), # Separator line
            main_content_area # Main content takes remaining space
        ],
        expand=True,
        vertical_alignment=ft.CrossAxisAlignment.START # Align rail/content to top
    )
    # main_stack was defined earlier to be accessible by dialog functions
    main_stack.controls.append(main_layout)

    # ----- Add Main Structure to Page -----
    page.add(main_stack)

    # ----- Load Initial View -----
    print(f"Loading initial view: {app_state['current_view']}")
    update_main_content(app_state["current_view"]) # Populate content for the initial view

# --- Entry Point ---
if __name__ == "__main__":
    ft.app(target=main)