# main.py
import flet as ft
import sqlite3
import csv
from datetime import datetime
import os
from collections import Counter

# --- Constants ---
DB_FILE = "game_log.db"
APP_TITLE = "My Game Logger"
YEARS = ["2023", "2024", "2025"]

# --- Database Handling ---
# (No changes needed in DB functions themselves)
def init_db():
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
            is_replay INTEGER DEFAULT 0 NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS backlog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            platform TEXT,
            added_date TEXT
        )
    """)
    conn.commit()
    conn.close()

def add_game_db(name, platform, completion_date_str, score, is_replay):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    year_completed = None
    try:
        completion_dt = datetime.strptime(completion_date_str, '%Y-%m-%d')
        year_completed = completion_dt.year
    except (ValueError, TypeError):
        print(f"Warning: Invalid date format for '{name}'. Could not extract year.")
    replay_int = 1 if is_replay else 0
    try:
        cursor.execute(
            """INSERT INTO games
               (name, platform, completion_date, review_score, year_completed, is_replay)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, platform, completion_date_str, score, year_completed, replay_int)
        )
        conn.commit()
    except sqlite3.Error as e:
        print(f"Database error adding game: {e}")
    finally:
        conn.close()

def get_games_by_year_db(year):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Ensure DB operation is wrapped in try/except if schema issues persist
    try:
        cursor.execute("""
            SELECT id, name, platform, completion_date, review_score, is_replay
            FROM games
            WHERE year_completed = ?
            ORDER BY completion_date DESC, id DESC
        """, (year,))
        games = cursor.fetchall()
    except sqlite3.Error as e:
        print(f"DB Error getting games for {year}: {e}") # More specific error log
        games = [] # Return empty list on error
    finally:
        conn.close()
    return [dict(game) for game in games]

def get_all_games_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, name, platform, completion_date, review_score, year_completed, is_replay
            FROM games
            ORDER BY completion_date DESC, id DESC
        """)
        games = cursor.fetchall()
    except sqlite3.Error as e:
        print(f"DB Error getting all games: {e}")
        games = []
    finally:
        conn.close()
    return [dict(game) for game in games]

def delete_game_db(game_id):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM games WHERE id = ?", (game_id,))
        conn.commit()
    except sqlite3.Error as e:
        print(f"Database error deleting game: {e}")
    finally:
        conn.close()

def add_backlog_item_db(name, platform):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    added_date = datetime.now().strftime('%Y-%m-%d')
    try:
        cursor.execute(
            "INSERT INTO backlog (name, platform, added_date) VALUES (?, ?, ?)",
            (name, platform, added_date)
        )
        conn.commit()
    except sqlite3.Error as e:
        print(f"Database error adding backlog item: {e}")
    finally:
        conn.close()

def get_backlog_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, platform, added_date FROM backlog ORDER BY name ASC")
        items = cursor.fetchall()
    except sqlite3.Error as e:
        print(f"DB Error getting backlog: {e}")
        items = []
    finally:
        conn.close()
    return [dict(item) for item in items]

def delete_backlog_item_db(item_id):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM backlog WHERE id = ?", (item_id,))
        conn.commit()
    except sqlite3.Error as e:
        print(f"Database error deleting backlog item: {e}")
    finally:
        conn.close()


# --- Flet Application ---
def main(page: ft.Page):
    page.title = APP_TITLE
    page.vertical_alignment = ft.MainAxisAlignment.START
    page.window_width = 900
    page.window_height = 750
    page.theme_mode = ft.ThemeMode.SYSTEM

    # Initialize DB *before* creating UI elements that depend on it
    init_db()

    # --- State Management ---
    game_lists = {year: ft.ListView(expand=True, spacing=10, auto_scroll=False) for year in YEARS}
    backlog_list_view = ft.ListView(expand=True, spacing=10, auto_scroll=False)

    # --- UI Building Functions ---

    def build_game_entry_row(game_data, year_str, refresh_func):
        def delete_clicked(e):
            game_id_to_delete = game_data['id']
            game_name = game_data['name']
            delete_game_db(game_id_to_delete)
            # Use page reference directly for snackbar
            page.show_snack_bar(ft.SnackBar(ft.Text(f"Deleted {game_name}"), open=True))
            refresh_func(year_str)
            current_stats_filter = stats_year_filter.value # Get value before thread
            page.run_thread(calculate_and_display_stats, current_stats_filter)
            page.update()

        score_val = game_data.get('review_score')
        score_text = f"{score_val}/10" if score_val is not None else "N/A"
        replay_indicator = " (Replay)" if game_data.get('is_replay') == 1 else ""
        game_name_text = ft.Text(f"{game_data['name']}{replay_indicator}")

        return ft.Row(
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
            controls=[
                ft.Column([
                    game_name_text,
                    ft.Text(f"Platform: {game_data.get('platform', 'N/A')}", size=12, color=ft.Colors.ON_SURFACE_VARIANT) # Updated syntax
                ]),
                ft.Row(
                    [
                        ft.Text(f"Completed: {game_data.get('completion_date', 'Unknown')}", italic=True, color=ft.Colors.ON_SURFACE_VARIANT), # Updated syntax
                        ft.Container(width=10),
                        ft.Text(f"Score: {score_text}", weight=ft.FontWeight.BOLD),
                        ft.IconButton(
                            icon=ft.Icons.DELETE_OUTLINE, # Updated syntax
                            tooltip="Delete Game",
                            on_click=delete_clicked,
                            icon_color=ft.Colors.ERROR, # Updated syntax
                            data=game_data['id']
                        )
                    ],
                    alignment=ft.MainAxisAlignment.END,
                    vertical_alignment=ft.CrossAxisAlignment.CENTER,
                )
            ]
        )

    def refresh_year_list(year_str):
        print(f"Refreshing list controls for {year_str}")
        try:
             year_int = int(year_str)
             games = get_games_by_year_db(year_int) # This now handles DB errors internally
             list_view = game_lists[year_str]
             list_view.controls.clear()
             if not games:
                 list_view.controls.append(ft.Text(f"No games logged for {year_str} yet.", italic=True))
             else:
                 for game in games:
                     list_view.controls.append(build_game_entry_row(game, year_str, refresh_year_list))
        except ValueError:
             print(f"Error: Invalid year string '{year_str}' for refresh.")
        except Exception as e:
            # Catch potential errors during control creation
            print(f"Error building game rows for {year_str}: {e}")


    def build_year_tab_content(year_str):
        new_game_name = ft.TextField(label="Game Title", expand=True)
        new_game_platform = ft.TextField(label="Platform", width=150)
        new_game_date = ft.TextField(label="Completion Date", hint_text="YYYY-MM-DD", width=130)
        new_game_score = ft.Dropdown(
            label="Score", width=90,
            options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)],
        )
        new_game_is_replay = ft.Checkbox(label="Replay?", value=False)

        def add_game_clicked(e):
            # This function context should always have access to 'page'
            name = new_game_name.value.strip()
            platform = new_game_platform.value.strip()
            date_str = new_game_date.value.strip()
            score_str = new_game_score.value
            is_replay = new_game_is_replay.value

            errors = []
            if not name: errors.append("Game Title required"); new_game_name.error_text = "Required"
            else: new_game_name.error_text = None
            if not date_str: errors.append("Date required"); new_game_date.error_text = "Required"
            else:
                try:
                    completion_dt = datetime.strptime(date_str, '%Y-%m-%d')
                    if str(completion_dt.year) != year_str: errors.append(f"Date not in {year_str}"); new_game_date.error_text = f"Not in {year_str}"
                    else: new_game_date.error_text = None
                except ValueError: errors.append("Use YYYY-MM-DD"); new_game_date.error_text = "Use YYYY-MM-DD"

            score_int = None
            if score_str and score_str != "N/A":
                try:
                    score_int = int(score_str)
                    if not 0 <= score_int <= 10: errors.append("Score must be 0-10."); new_game_score.error_text = "0-10"
                    else: new_game_score.error_text = None
                except ValueError: errors.append("Invalid score"); new_game_score.error_text = "Error"
            else: new_game_score.error_text = None

            if errors:
                # Use page reference directly
                try:
                    page.show_snack_bar(ft.SnackBar(ft.Text("Please fix errors:\n" + "\n".join(errors)), open=True, bgcolor=ft.Colors.ERROR_CONTAINER)) # Updated syntax
                except Exception as snack_e:
                    print(f"Error showing snackbar: {snack_e}") # Log if snackbar fails
                page.update()
                return

            add_game_db(name, platform, date_str, score_int, is_replay)

            new_game_name.value = ""; new_game_platform.value = ""; new_game_date.value = ""
            new_game_score.value = None; new_game_is_replay.value = False
            new_game_name.error_text = None; new_game_date.error_text = None; new_game_score.error_text = None

            try:
                page.show_snack_bar(ft.SnackBar(ft.Text(f"Added '{name}'"), open=True))
            except Exception as snack_e:
                 print(f"Error showing snackbar: {snack_e}")

            refresh_year_list(year_str)
            current_stats_filter = stats_year_filter.value
            if current_stats_filter == year_str or current_stats_filter == "All Time":
                 page.run_thread(calculate_and_display_stats, current_stats_filter)
            page.update()

        add_game_button = ft.ElevatedButton("Add Game", icon=ft.Icons.ADD, on_click=add_game_clicked) # Updated syntax

        content_column = ft.Column(
            [
                ft.Text(f"Games Completed in {year_str}", style=ft.TextThemeStyle.HEADLINE_MEDIUM),
                ft.Row(
                    [ new_game_name, new_game_platform, new_game_date,
                      new_game_score, new_game_is_replay, add_game_button ],
                    alignment=ft.MainAxisAlignment.START, vertical_alignment=ft.CrossAxisAlignment.START, wrap=False
                ),
                ft.Divider(height=20),
                game_lists[year_str]
            ], scroll=ft.ScrollMode.ADAPTIVE, expand=True
        )
        refresh_year_list(year_str)
        return content_column

    # --- Backlog UI Functions ---
    def build_backlog_entry_row(item_data, refresh_func):
        def delete_clicked(e):
            delete_backlog_item_db(item_data['id'])
            page.show_snack_bar(ft.SnackBar(ft.Text(f"Removed '{item_data['name']}' from backlog"), open=True))
            refresh_func()
            page.update()

        return ft.Row(
             alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER,
             controls=[
                ft.Column([
                     ft.Text(f"{item_data['name']}"),
                     ft.Text(f"Platform: {item_data.get('platform', 'Any')}", size=12, color=ft.Colors.ON_SURFACE_VARIANT), # Updated syntax
                ]),
                 ft.Row([
                    ft.Text(f"Added: {item_data.get('added_date', 'Unknown')}", italic=True, color=ft.Colors.ON_SURFACE_VARIANT), # Updated syntax
                    ft.IconButton(
                        icon=ft.Icons.DELETE_SWEEP_OUTLINE, # Updated syntax
                        tooltip="Remove from Backlog",
                        on_click=delete_clicked,
                        icon_color=ft.Colors.ERROR # Updated syntax
                    )
                 ], vertical_alignment=ft.CrossAxisAlignment.CENTER)
             ]
        )

    def refresh_backlog_list():
        """Fetches backlog items and updates the ListView's controls list."""
        # *** NO backlog_list_view.update() here ***
        print("Refreshing backlog list controls")
        items = get_backlog_db() # Handles DB errors internally
        backlog_list_view.controls.clear()
        if not items:
             backlog_list_view.controls.append(ft.Text("Your backlog is empty. Add some games below!", italic=True))
        else:
            try:
                for item in items:
                    backlog_list_view.controls.append(build_backlog_entry_row(item, refresh_backlog_list))
            except Exception as e:
                print(f"Error building backlog rows: {e}")


    def build_backlog_tab_content():
        new_backlog_name = ft.TextField(label="Game Title", expand=True)
        new_backlog_platform = ft.TextField(label="Platform (Optional)", width=200)

        def add_backlog_clicked(e):
            name = new_backlog_name.value.strip()
            platform = new_backlog_platform.value.strip()

            if not name:
                new_backlog_name.error_text = "Required"
                page.show_snack_bar(ft.SnackBar(ft.Text("Game Title cannot be empty!"), open=True, bgcolor=ft.Colors.ERROR_CONTAINER)) # Updated syntax
                page.update()
                return

            new_backlog_name.error_text = None
            add_backlog_item_db(name, platform if platform else None)

            new_backlog_name.value = ""; new_backlog_platform.value = ""
            page.show_snack_bar(ft.SnackBar(ft.Text(f"Added '{name}' to backlog"), open=True))
            refresh_backlog_list()
            page.update()

        add_button = ft.ElevatedButton("Add to Backlog", icon=ft.Icons.ADD_TASK, on_click=add_backlog_clicked) # Updated syntax

        content_column = ft.Column(
            [   ft.Text("Games To Play", style=ft.TextThemeStyle.HEADLINE_MEDIUM),
                ft.Row( [new_backlog_name, new_backlog_platform, add_button],
                    alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.START ),
                ft.Divider(height=20),
                backlog_list_view ],
            scroll=ft.ScrollMode.ADAPTIVE, expand=True
        )
        refresh_backlog_list()
        return content_column

    # --- Stats UI Functions ---
    stats_year_filter = ft.Dropdown(
        label="Filter by Year",
        options=[ft.dropdown.Option("All Time")] + [ft.dropdown.Option(year) for year in YEARS],
        value="All Time", width=200 )
    stats_total_games = ft.Text("Total Games Completed: -", size=16)
    stats_avg_score = ft.Text("Average Score: -", size=16)
    stats_total_replays = ft.Text("Total Replays: -", size=16)
    stats_platform_breakdown = ft.Column([])

    def calculate_and_display_stats(filter_year="All Time"):
        print(f"Calculating stats for: {filter_year}")
        if filter_year == "All Time": games_data = get_all_games_db()
        else:
            try: year_int = int(filter_year); games_data = get_games_by_year_db(year_int)
            except ValueError: games_data = []

        # Perform calculations (ensure games_data is valid list even if DB failed)
        games_data = games_data or []
        total_games = len(games_data)
        total_replays = sum(1 for g in games_data if g.get('is_replay') == 1)
        valid_scores = [g['review_score'] for g in games_data if g.get('review_score') is not None]
        average_score = (sum(valid_scores) / len(valid_scores)) if valid_scores else 0
        platform_counts = Counter(g.get('platform', "Unknown").strip() or "Unknown" for g in games_data)

        # Schedule UI update back on the main thread context if possible
        if page: # Check if page context is still valid
             page.run_thread(update_stats_ui, total_games, average_score, total_replays, platform_counts, valid_scores)
        else:
            print("Warning: Page context lost, cannot update stats UI from thread.")


    def update_stats_ui(total_games, average_score, total_replays, platform_counts, valid_scores):
        """Updates the stats UI controls. Should run on main thread."""
        try:
            stats_total_games.value = f"Total Games Completed: {total_games}"
            stats_avg_score.value = f"Average Score: {average_score:.1f}/10" if valid_scores else "Average Score: N/A"
            stats_total_replays.value = f"Total Replays: {total_replays}"

            stats_platform_breakdown.controls.clear()
            stats_platform_breakdown.controls.append(ft.Text("Platform Breakdown:", weight=ft.FontWeight.BOLD, size=14))
            if not platform_counts:
                 stats_platform_breakdown.controls.append(ft.Text("No platform data available.", italic=True))
            else:
                sorted_platforms = platform_counts.most_common()
                for platform, count in sorted_platforms:
                    stats_platform_breakdown.controls.append(
                        ft.Text(f"- {platform}: {count} game{'s' if count > 1 else ''}")
                    )

            # Update individual controls if possible
            if stats_total_games.page: stats_total_games.update()
            if stats_avg_score.page: stats_avg_score.update()
            if stats_total_replays.page: stats_total_replays.update()
            if stats_platform_breakdown.page: stats_platform_breakdown.update()
            # If individual updates fail, fall back to page update
            # page.update()
        except Exception as e:
            print(f"Error updating stats UI: {e}")


    def on_stats_filter_change(e):
        page.run_thread(calculate_and_display_stats, stats_year_filter.value)

    stats_year_filter.on_change = on_stats_filter_change

    # --- CSV Import Logic ---
    # (CSV functions remain largely the same, ensure correct headers/validation)
    def handle_import_result(e: ft.FilePickerResultEvent):
        page.dialog = None
        if e.files:
            selected_file = e.files[0].path
            progress_dialog = ft.AlertDialog(
                modal=True, title=ft.Text("Importing CSV"),
                content=ft.Row([ft.ProgressRing(), ft.Text("Processing...")]) )
            page.dialog = progress_dialog
            progress_dialog.open = True
            page.update()
            page.run_thread(import_csv_data, selected_file)
        else:
            page.show_snack_bar(ft.SnackBar(ft.Text("CSV Import Cancelled"), open=True))
            page.update()

    import_dialog = ft.FilePicker(on_result=handle_import_result)
    page.overlay.append(import_dialog)

    def open_import_dialog(e):
        import_dialog.pick_files( dialog_title="Select CSV Game Log",
            allow_multiple=False, allowed_extensions=["csv"] )

    def import_csv_data(file_path):
        expected_headers = ["title", "platform", "rating", "datecompleted", "isreplay"]
        header_map = { "title": "name", "platform": "platform", "rating": "score",
                       "datecompleted": "completion_date_str", "isreplay": "is_replay" }
        added_count, skipped_count = 0, 0
        error_messages, warning_messages = [], []

        try:
            with open(file_path, mode='r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                if not reader.fieldnames:
                    error_messages.append("Error: CSV file appears to be empty or has no header.")
                    raise ValueError("Empty CSV or no header")

                csv_headers_lower = [h.lower().strip() for h in reader.fieldnames]
                print(f"CSV Headers found: {csv_headers_lower}")

                if "title" not in csv_headers_lower or "datecompleted" not in csv_headers_lower:
                     error_messages.append("Critical Error: Missing 'Title' or 'DateCompleted'. Import aborted.")
                     raise ValueError("CSV Header Missing Critical Columns")

                missing_headers = [eh for eh in expected_headers if eh not in csv_headers_lower]
                if missing_headers: warning_messages.append(f"Warning: Missing optional columns: {', '.join(missing_headers)}.")

                original_header_lookup = { csv_h.lower().strip(): csv_h for csv_h in reader.fieldnames}
                current_header_map = { eh: header_map[eh] for eh in expected_headers if eh in csv_headers_lower }

                for row_num, row in enumerate(reader, start=2):
                    game_data = {}
                    valid_row = True
                    row_errors, row_warnings = [], []
                    try:
                        for csv_key_lower, db_arg in current_header_map.items():
                             original_header = original_header_lookup.get(csv_key_lower)
                             if original_header: game_data[db_arg] = row.get(original_header, "").strip()

                        name = game_data.get("name")
                        date_str = game_data.get("completion_date_str")
                        score_str = game_data.get("score")
                        replay_str = game_data.get("is_replay", "false")
                        platform = game_data.get("platform")

                        if not name: row_errors.append("Missing 'Title'"); valid_row = False
                        if not date_str: row_errors.append("Missing 'DateCompleted'"); valid_row = False
                        else:
                            try: datetime.strptime(date_str, '%Y-%m-%d')
                            except ValueError: row_errors.append(f"Invalid Date '{date_str}'"); valid_row = False

                        score_int = None
                        if score_str:
                            try:
                                score_int = int(float(score_str))
                                if not 0 <= score_int <= 10: row_warnings.append(f"Score '{score_str}' out of range (0-10). Set N/A."); score_int = None
                            except ValueError: row_warnings.append(f"Invalid Score '{score_str}'. Set N/A."); score_int = None

                        is_replay = replay_str.lower() in ['true', '1', 'yes', 't']

                        if valid_row:
                            add_game_db(name, platform, date_str, score_int, is_replay)
                            added_count += 1
                            if row_warnings: warning_messages.extend([f"Row {row_num} ('{name}'): {w}" for w in row_warnings])
                        else:
                            skipped_count += 1
                            error_messages.append(f"Row {row_num} ('{name}'): Skipped - {' | '.join(row_errors)}")

                    except Exception as e:
                         skipped_count += 1
                         error_messages.append(f"Row {row_num}: Skipped - Error processing row: {e}")

        except FileNotFoundError: error_messages.append(f"Error: File not found: {file_path}")
        except ValueError as e: error_messages.append(f"Error: {e}") # Header/empty file error
        except Exception as e: error_messages.append(f"Error reading CSV: {e}")

        summary_lines = [f"CSV Import Complete. Added: {added_count}, Skipped: {skipped_count}."]
        if warning_messages: summary_lines.extend(["\nWarnings:"] + warning_messages[:5] + (["..."] if len(warning_messages) > 5 else []))
        if error_messages: summary_lines.extend(["\nErrors:"] + error_messages[:5] + (["..."] if len(error_messages) > 5 else []))
        summary_message = "\n".join(summary_lines)

        if warning_messages: print("--- Import Warnings ---\n" + "\n".join(warning_messages) + "\n-----------------------")
        if error_messages: print("--- Import Errors ---\n" + "\n".join(error_messages) + "\n--------------------")

        page.run_thread(show_import_summary_and_refresh, summary_message, bool(error_messages))

    def show_import_summary_and_refresh(message, had_errors):
        if page.dialog: page.dialog.open = False

        page.show_snack_bar(ft.SnackBar(
            content=ft.Text(message, max_lines=10, overflow=ft.TextOverflow.ELLIPSIS), open=True,
            bgcolor=ft.Colors.ERROR_CONTAINER if had_errors else ft.Colors.GREEN_700, duration=8000 )) # Updated syntax

        print("Refreshing lists and stats after import...")
        for year in YEARS: refresh_year_list(year)
        page.run_thread(calculate_and_display_stats, stats_year_filter.value)
        page.update()

    def build_stats_tab_content():
        refresh_button = ft.IconButton( icon=ft.Icons.REFRESH, tooltip="Refresh Stats", # Updated syntax
            on_click=lambda e: page.run_thread(calculate_and_display_stats, stats_year_filter.value) )
        import_button = ft.ElevatedButton( "Import from CSV", icon=ft.Icons.UPLOAD_FILE, # Updated syntax
            tooltip="Import games from a CSV file", on_click=open_import_dialog )
        csv_format_info = ft.Text(
            "CSV Format: Header row required. Columns: 'Title'(req), 'Platform', 'Rating'(0-10 or blank/NA), 'DateCompleted'(req, YYYY-MM-DD), 'IsReplay'(true/false).",
            italic=True, size=12, color=ft.Colors.ON_SURFACE_VARIANT ) # Updated syntax

        content_column = ft.Column(
            [   ft.Text("Game Statistics", style=ft.TextThemeStyle.HEADLINE_MEDIUM),
                ft.Row([stats_year_filter, refresh_button], alignment=ft.MainAxisAlignment.START),
                ft.Divider(), stats_total_games, stats_avg_score, stats_total_replays,
                ft.Divider(), stats_platform_breakdown,
                ft.Divider(height=30, color=ft.Colors.TRANSPARENT), # Updated syntax
                import_button, csv_format_info
            ], scroll=ft.ScrollMode.ADAPTIVE, expand=True, spacing=15 )

        page.run_thread(calculate_and_display_stats, stats_year_filter.value)
        return content_column

    # --- Create Tabs ---
    # Build tab content *after* DB init and state vars are ready
    year_tabs = [ ft.Tab(text=year, content=build_year_tab_content(year)) for year in YEARS ]
    stats_tab = ft.Tab(text="Stats", content=build_stats_tab_content())
    backlog_tab = ft.Tab(text="Backlog", content=build_backlog_tab_content())
    all_tabs = year_tabs + [stats_tab, backlog_tab]

    tabs_control = ft.Tabs(
        selected_index=YEARS.index("2024") if "2024" in YEARS else 0,
        animation_duration=300, tabs=all_tabs, expand=True )

    # --- Add Controls to Page ---
    page.add(tabs_control)
    page.update() # Initial page render


# --- Run the App ---
if __name__ == "__main__":
    ft.app( target=main, view=ft.AppView.FLET_APP )