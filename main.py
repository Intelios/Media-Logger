# main.py (Corrected based on Traceback)
import flet as ft
import sqlite3
import csv
from datetime import datetime
import os
from collections import Counter
import math
# import time # Not used

# --- Constants ---
DB_FILE = "game_log.db"
APP_TITLE = "My Game Logger"
YEARS = ["2023", "2024", "2025"]

# --- Database Handling ---
# (No changes needed in DB functions based on traceback)
def init_db():
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
    conn = None
    games = []
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, platform, completion_date, review_score, is_replay FROM games WHERE year_completed = ? ORDER BY completion_date DESC, id DESC",
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

def add_backlog_item_db(name, platform):
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
    score_text = "N/A"
    # <--- FIX: Use ft.Colors (uppercase C)
    bgcolor = ft.Colors.with_opacity(0.5, ft.Colors.SURFACE)

    if score is not None:
        try:
            score_val = int(score)
            score_text = str(score_val)
            if score_val >= 9:
                bgcolor = ft.Colors.with_opacity(0.8, ft.Colors.GREEN_ACCENT_700)
            elif score_val >= 7:
                bgcolor = ft.Colors.with_opacity(0.7, ft.Colors.LIGHT_GREEN)
            elif score_val >= 5:
                bgcolor = ft.Colors.with_opacity(0.7, ft.Colors.YELLOW_ACCENT_700)
            elif score_val >= 3:
                bgcolor = ft.Colors.with_opacity(0.7, ft.Colors.ORANGE)
            else:
                bgcolor = ft.Colors.with_opacity(0.7, ft.Colors.RED_ACCENT_700)
        except (ValueError, TypeError):
             pass

    text_color = ft.Colors.BLACK if score is not None and isinstance(score, (int, float)) and score >= 5 else ft.Colors.WHITE

    return ft.Container(
        content=ft.Text(
            score_text,
            size=12,
            weight=ft.FontWeight.BOLD,
            color=text_color
        ),
        width=30,
        height=30,
        shape=ft.BoxShape.CIRCLE,
        bgcolor=bgcolor,
        alignment=ft.alignment.center,
        tooltip=f"Score: {score_text}" if score is not None else "Score: Not Rated"
    )

# --- Main Application ---
def main(page: ft.Page):
    page.title = APP_TITLE
    page.theme_mode = ft.ThemeMode.DARK
    page.theme = ft.Theme(color_scheme_seed=ft.Colors.BLUE_GREY) # <--- FIX: Use ft.Colors
    page.window_width = 1100
    page.window_height = 800

    init_db()
    current_view = "2024"

    add_game_date_display_field = ft.Ref[ft.TextField]()
    manual_dialog_container = ft.Ref[ft.Container]()

    # -------------- DatePicker Setup --------------------------------------------
    def handle_date_change(e):
        selected_date = e.control.value
        if add_game_date_display_field.current and selected_date:
            formatted_date = selected_date.strftime('%Y-%m-%d')
            add_game_date_display_field.current.value = formatted_date
            add_game_date_display_field.current.update()

    date_picker = ft.DatePicker(
        on_change=handle_date_change,
        help_text="Select Completion Date",
    )
    page.overlay.append(date_picker)

    # --- File Picker for CSV Import ---
    def handle_import_result(e: ft.FilePickerResultEvent):
        page.dialog = None
        if e.files and e.files[0].path:
            selected_file = e.files[0].path
            print(f"CSV file selected: {selected_file}")

            progress_dialog = ft.AlertDialog(
                modal=True,
                title=ft.Text("Importing CSV"),
                content=ft.Row([ft.ProgressRing(), ft.Text("Processing...")], alignment=ft.MainAxisAlignment.CENTER)
            )
            page.dialog = progress_dialog
            progress_dialog.open = True
            page.update()

            page.run_thread(import_csv_data, selected_file)
        else:
            page.show_snack_bar(ft.SnackBar(ft.Text("CSV Import Cancelled or No File Selected"), open=True))

    import_dialog = ft.FilePicker(on_result=handle_import_result)
    page.overlay.append(import_dialog)

    def open_import_dialog(e):
        import_dialog.pick_files(
            dialog_title="Select CSV Game Log",
            allow_multiple=False,
            allowed_extensions=["csv"]
        )

    def import_csv_data(file_path):
        # (Import logic - No changes needed based on traceback)
        expected_headers_lower = ["title", "platform", "rating", "datecompleted", "isreplay"]
        header_map = {
            "title": "name",
            "platform": "platform",
            "rating": "score",
            "datecompleted": "completion_date_str",
            "isreplay": "is_replay"
        }
        added_count, skipped_count = 0, 0
        error_messages, warning_messages = [], []

        try:
            with open(file_path, mode='r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                if not reader.fieldnames: raise ValueError("CSV file is empty or has no header row.")
                csv_headers_lower = [h.lower().strip() for h in reader.fieldnames]
                if "title" not in csv_headers_lower or "datecompleted" not in csv_headers_lower: raise ValueError("CSV Header Missing Required Columns: 'Title' and 'DateCompleted' are mandatory.")
                missing_optional = [eh for eh in expected_headers_lower if eh not in csv_headers_lower and eh not in ["title", "datecompleted"]]
                if missing_optional: warning_messages.append(f"Info: Missing optional columns: {', '.join(missing_optional)}. Defaults will be used.")
                original_header_lookup = { h.lower().strip(): h for h in reader.fieldnames }
                current_header_map = { eh_lower: header_map[eh_lower] for eh_lower in expected_headers_lower if eh_lower in csv_headers_lower }

                for row_num, row in enumerate(reader, start=2):
                    game_data = {}
                    valid_row = True
                    row_errors, row_warnings = [], []
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
                            except ValueError: row_errors.append(f"Invalid Date Format '{date_str}' (use YYYY-MM-DD)"); valid_row = False
                        score_int = None
                        if score_str and score_str.lower() != 'n/a' and score_str.strip() != '':
                            try:
                                score_float = float(score_str); score_int = int(round(score_float))
                                if not (0 <= score_int <= 10): row_warnings.append(f"Score '{score_str}' rounded to {score_int}, which is outside 0-10 range. Setting to N/A."); score_int = None
                            except (ValueError, TypeError): row_warnings.append(f"Invalid Score '{score_str}'. Setting to N/A."); score_int = None
                        is_replay = replay_str.lower() in ['true', '1', 'yes', 't', 'y']
                        if valid_row:
                            add_game_db(name, platform, date_str, score_int, is_replay); added_count += 1
                            if row_warnings: warning_messages.extend([f"Row {row_num} ('{name}'): {w}" for w in row_warnings])
                        else: skipped_count += 1; error_messages.append(f"Row {row_num} ('{name or '<?>'}'): Skipped - {' | '.join(row_errors)}")
                    except Exception as e: skipped_count += 1; error_messages.append(f"Row {row_num}: Skipped - Unexpected error processing row: {e}")
        except FileNotFoundError: error_messages.append(f"Error: File not found at path: {file_path}")
        except ValueError as ve: error_messages.append(f"Error reading CSV structure: {ve}")
        except Exception as e: error_messages.append(f"Error reading or processing CSV file: {e}")
        summary_lines = [f"CSV Import Finished. Added: {added_count}, Skipped: {skipped_count}."]
        if warning_messages:
            summary_lines.append("\nWarnings (Max 5 shown):"); summary_lines.extend(warning_messages[:5])
            if len(warning_messages) > 5: summary_lines.append("...")
            print("\n--- Import Warnings ---\n" + "\n".join(warning_messages) + "\n-----------------------\n")
        if error_messages:
            summary_lines.append("\nErrors (Max 5 shown):"); summary_lines.extend(error_messages[:5])
            if len(error_messages) > 5: summary_lines.append("...")
            print("\n--- Import Errors ---\n" + "\n".join(error_messages) + "\n---------------------\n")
        if page: page.run_thread(show_import_summary_and_refresh, "\n".join(summary_lines), bool(error_messages))
        else: print("Import process finished, but page context was lost. UI not updated.")

    def show_import_summary_and_refresh(message, had_errors):
        if not page: return

        if page.dialog: page.dialog.open = False; page.update()

        snackbar_color = ft.Colors.ERROR_CONTAINER if had_errors else ft.Colors.GREEN_700 # <--- FIX: Use ft.Colors
        try:
            page.show_snack_bar( ft.SnackBar( content=ft.Text(message, max_lines=10, overflow=ft.TextOverflow.ELLIPSIS), open=True, bgcolor=snackbar_color, duration=10000 ) )
        except Exception as e: print(f"Error showing SnackBar after import: {e}")
        print("Refreshing views after import...")
        refresh_current_view()
        if 'stats_year_filter' in locals() or 'stats_year_filter' in globals():
             current_stats_filter = stats_year_filter.value if stats_year_filter.selected else "All Time"
             print(f"Triggering stats recalculation for: {current_stats_filter}")
             page.run_thread(calculate_and_update_stats_display, current_stats_filter)
        page.update()

    # --- Manual Dialog Creation/Management ---
    def close_manual_dialog(e=None):
        print("Attempting to close manual dialog...")
        if 'main_stack' in locals() and manual_dialog_container.current and manual_dialog_container.current in main_stack.controls:
            try:
                main_stack.controls.remove(manual_dialog_container.current)
                manual_dialog_container.current = None
                print("Manual dialog container removed.")
                main_stack.update()
            except Exception as remove_e:
                print(f"Error removing manual dialog from stack: {remove_e}")
        else:
            print("Could not close manual dialog: Stack not ready, dialog not open, or ref is broken.")

    def create_dialog_overlay(title_text, content_controls, action_buttons):
        dialog_content = ft.Container(
            content=ft.Column(
                [
                    ft.Text(title_text, style=ft.TextThemeStyle.TITLE_LARGE),
                    ft.Divider(height=10, thickness=1),
                    ft.Container(
                        content=ft.Column(content_controls, spacing=15, tight=True),
                        expand=True,
                    ),
                    ft.Divider(height=10, thickness=1),
                    ft.Row(action_buttons, alignment=ft.MainAxisAlignment.END)
                ],
                spacing=10,
                tight=True,
            ),
            width=450,
            padding=20,
             # <--- FIX: Use ft.Colors instead of ft.theme
            bgcolor=ft.Colors.with_opacity(0.98, ft.Colors.SURFACE), # <--- Use SURFACE instead
            border_radius=10,
             # <--- FIX: Use ft.Colors
            border=ft.border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.OUTLINE)),
            shadow=ft.BoxShadow(
                spread_radius=1,
                blur_radius=15,
                # <--- FIX: Use ft.Colors
                color=ft.Colors.with_opacity(0.2, ft.Colors.BLACK),
                offset=ft.Offset(0, 5),
            ),
        )

        overlay_scrim = ft.Container(
            ref=manual_dialog_container,
            content=dialog_content,
            alignment=ft.alignment.center,
            # <--- FIX: Use ft.Colors
            bgcolor=ft.Colors.with_opacity(0.6, ft.Colors.BLACK),
            expand=True,
        )
        return overlay_scrim

    # --- View Building Functions ---

    # --- Year View ---
    def build_year_view(year_str):
        print(f"Building year view for: {year_str}")
        year_list_view = ft.ListView(expand=True, spacing=8, padding=ft.padding.only(top=10, bottom=70))

        def refresh_list_content():
            print(f"Refreshing year list controls for {year_str}")
            year_list_view.controls.clear()
            try:
                games = get_games_by_year_db(int(year_str))
                if not games:
                    year_list_view.controls.append(
                        ft.Container(
                            content=ft.Text(f"No games logged for {year_str} yet. Use the '+' button to add one!", italic=True, text_align=ft.TextAlign.CENTER),
                            padding=20
                        )
                    )
                else:
                    for game in games:
                        year_list_view.controls.append(create_game_log_tile(game, refresh_list_content))
            except ValueError:
                year_list_view.controls.append(ft.Text(f"Invalid year: {year_str}", color=ft.Colors.ERROR)) # <--- FIX: Use ft.Colors
            except Exception as e:
                print(f"Error loading games for {year_str}: {e}")
                year_list_view.controls.append(ft.Text(f"Error loading games: {e}", color=ft.Colors.ERROR)) # <--- FIX: Use ft.Colors

            # <--- FIX: Remove page check, update anyway
            # if year_list_view.page:
            # year_list_view.update()
            # else:
            #      print(f"Warning: Tried to update year list for {year_str}, but it's not on the page.")


        def delete_game_action(game_id, game_name):
            print(f"Attempting to delete game: ID {game_id}, Name {game_name}")
            delete_game_db(game_id)
            page.show_snack_bar(ft.SnackBar(ft.Text(f"Deleted '{game_name}'"), open=True))
            refresh_list_content()

            if 'stats_year_filter' in locals() or 'stats_year_filter' in globals():
                current_stats_filter = stats_year_filter.value if stats_year_filter.selected else "All Time"
                page.run_thread(calculate_and_update_stats_display, current_stats_filter)

        def create_game_log_tile(game_data, refresh_callback):
            platform_str = game_data.get('platform', 'N/A') or 'N/A'
            date_str = game_data.get('completion_date', 'Unknown Date') or 'Unknown Date'
            score = game_data.get('review_score')
            is_replay = game_data.get('is_replay') == 1

            return ft.ListTile(
                leading=create_rating_badge(score),
                title=ft.Text(f"{game_data['name']}{' (Replay)' if is_replay else ''}", weight=ft.FontWeight.BOLD),
                subtitle=ft.Text(f"{platform_str}  |  Completed: {date_str}"),
                trailing=ft.PopupMenuButton(
                    icon=ft.icons.MORE_VERT,
                    tooltip="Options",
                    items=[
                        ft.PopupMenuItem(),
                        ft.PopupMenuItem(
                            text="Delete",
                            icon=ft.icons.DELETE_OUTLINE,
                            on_click=lambda _: delete_game_action(game_data['id'], game_data['name'])
                        ),
                    ]
                ),
            )

        refresh_list_content()
        return year_list_view

    def open_add_game_dialog(e=None):
        target_year = current_view if current_view in YEARS else str(datetime.now().year)
        print(f"Opening MANUAL add game dialog for target year: {target_year}")

        name_field = ft.TextField(label="Game Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        platform_field = ft.TextField(label="Platform", capitalization=ft.TextCapitalization.WORDS)
        date_display = ft.TextField(
            ref=add_game_date_display_field,
            label="Completion Date",
            read_only=True,
            hint_text="Click calendar to select..."
        )
        score_dropdown = ft.Dropdown(
            label="Score",
            width=110,
            options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)],
            value="N/A"
        )
        replay_check = ft.Checkbox(label="This was a Replay", value=False)

        def save_new_game(e):
            name = name_field.value.strip()
            platform = platform_field.value.strip()
            date_str = add_game_date_display_field.current.value.strip() if add_game_date_display_field.current else ""
            score_str = score_dropdown.value
            is_replay = replay_check.value
            errors = []

            if not name: errors.append("Game Title is required."); name_field.error_text = "Required"
            else: name_field.error_text = None

            if not date_str: errors.append("Completion Date is required."); date_display.error_text = "Required"
            else:
                try:
                    completion_dt = datetime.strptime(date_str, '%Y-%m-%d')
                    if str(completion_dt.year) != target_year:
                         print(f"Warning: Date '{date_str}' has year {completion_dt.year}, adding to target year {target_year} view.")
                    date_display.error_text = None
                except ValueError: errors.append("Invalid date format (should be YYYY-MM-DD)."); date_display.error_text = "Invalid Format"

            score_int = None
            if score_str and score_str != "N/A":
                try:
                    score_int = int(score_str)
                    if not (0 <= score_int <= 10): errors.append("Score must be between 0 and 10."); score_dropdown.error_text = "0-10"
                    else: score_dropdown.error_text = None
                except ValueError: errors.append("Invalid score value."); score_dropdown.error_text = "Invalid"
            else: score_dropdown.error_text = None

            name_field.update(); platform_field.update(); date_display.update(); score_dropdown.update()

            if errors:
                error_message = "Please fix errors: " + " ".join(errors)
                page.show_snack_bar(ft.SnackBar(ft.Text(error_message), open=True, bgcolor=ft.Colors.ERROR_CONTAINER)) # <--- FIX: Use ft.Colors
                return

            add_game_db(name, platform, date_str, score_int, is_replay)
            page.show_snack_bar(ft.SnackBar(ft.Text(f"Added '{name}' to {target_year}"), open=True))

            close_manual_dialog()
            refresh_current_view()

            if 'stats_year_filter' in locals() or 'stats_year_filter' in globals():
                 current_stats_filter = stats_year_filter.value if stats_year_filter.selected else "All Time"
                 page.run_thread(calculate_and_update_stats_display, current_stats_filter)

        content_controls = [
            name_field, platform_field,
            ft.Row( [ date_display, ft.IconButton( icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=lambda _: date_picker.pick_date(), ) ], alignment=ft.MainAxisAlignment.START ),
            score_dropdown, replay_check
        ]
        action_buttons = [ ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Save Game", on_click=save_new_game), ]

        manual_dialog = create_dialog_overlay(f"Add Game to {target_year}", content_controls, action_buttons)

        if 'main_stack' in locals() and main_stack:
            if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog()
            main_stack.controls.append(manual_dialog); print("Manual add game dialog added to stack.")
            main_stack.update(); print("...stack updated to show dialog.")
        else:
            print("ERROR: Main stack UI element not found. Cannot display dialog.")
            page.show_snack_bar(ft.SnackBar(ft.Text("Error: Could not open dialog window."), open=True, bgcolor=ft.Colors.ERROR)) # <--- FIX: Use ft.Colors


    # --- Stats View ---
    stats_year_filter = ft.SegmentedButton(
        segments=[ft.Segment(value="All Time", label=ft.Text("Overall"))] + [ft.Segment(value=year, label=ft.Text(year)) for year in YEARS],
        selected={"All Time"}, allow_empty_selection=False, show_selected_icon=False,
    )
    stats_total_games_text = ft.Ref[ft.Text]()
    stats_avg_score_text = ft.Ref[ft.Text]()
    stats_total_replays_text = ft.Ref[ft.Text]()
    stats_unique_platforms_text = ft.Ref[ft.Text]()
    platform_pie_chart = ft.Ref[ft.PieChart]()
    platform_legend = ft.Ref[ft.Column]()


    def calculate_and_update_stats_display(filter_year="All Time"):
        print(f"Calculating stats for display filter: {filter_year}")
        games_data = []
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
            platform_counts = Counter((g.get('platform', "Unknown") or "Unknown").strip() for g in games_data)
            unique_platforms = len(platform_counts)
            pie_sections_data = []
            legend_items_data = []
             # <--- FIX: Use ft.Colors (uppercase C)
            platform_colors = [
                ft.Colors.BLUE_500, ft.Colors.GREEN_500, ft.Colors.RED_500, ft.Colors.ORANGE_500,
                ft.Colors.PURPLE_500, ft.Colors.TEAL_500, ft.Colors.PINK_500, ft.Colors.CYAN_500,
                ft.Colors.LIGHT_BLUE_500, ft.Colors.LIME_500, ft.Colors.AMBER_500, ft.Colors.INDIGO_500,
                ft.Colors.DEEP_ORANGE_500, ft.Colors.LIGHT_GREEN_500, ft.Colors.DEEP_PURPLE_500
            ]
            color_index = 0
            sorted_platforms = platform_counts.most_common()
            for platform, count in sorted_platforms:
                percentage = (count / total_games * 100) if total_games > 0 else 0
                color = platform_colors[color_index % len(platform_colors)]
                pie_sections_data.append( ft.PieChartSection( value=percentage, title=f"{percentage:.0f}%" if percentage >= 5 else "", title_style=ft.TextStyle(size=10, color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD), color=color, radius=60, tooltip=f"{platform}: {count} ({percentage:.1f}%)" ) )
                legend_items_data.append( ft.Row( [ ft.Container(width=16, height=16, bgcolor=color, border_radius=3), ft.Text(f"{platform} ({count})") ], spacing=10 ) )
                color_index += 1
        except Exception as e:
             print(f"Error during stats calculation: {e}")
             total_games, average_score, total_replays, unique_platforms = "Error", "N/A", "Error", "Error"
             pie_sections_data, legend_items_data = [], [ft.Text("Error loading platform data.", color=ft.Colors.ERROR)] # <--- FIX: Use ft.Colors

        if stats_total_games_text.current: stats_total_games_text.current.value = str(total_games); stats_total_games_text.current.update()
        if stats_avg_score_text.current: stats_avg_score_text.current.value = f"{average_score:.1f}" if isinstance(average_score, float) else average_score; stats_avg_score_text.current.update()
        if stats_total_replays_text.current: stats_total_replays_text.current.value = str(total_replays); stats_total_replays_text.current.update()
        if stats_unique_platforms_text.current: stats_unique_platforms_text.current.value = str(unique_platforms); stats_unique_platforms_text.current.update()
        if platform_pie_chart.current: platform_pie_chart.current.sections = pie_sections_data; platform_pie_chart.current.update()
        if platform_legend.current: platform_legend.current.controls = legend_items_data; platform_legend.current.update()
        print(f"Stats UI update complete for {filter_year}.")

    def on_stats_filter_change(e):
        selected_year = list(e.control.selected)[0] if e.control.selected else "All Time"
        print(f"Stats filter changed to: {selected_year}")
        if page: page.run_thread(calculate_and_update_stats_display, selected_year)

    def create_summary_card(icon, value_ref, label):
        return ft.Card(
            content=ft.Container(
                padding=15,
                content=ft.Column(
                    [
                        # <--- FIX: Use ft.Colors
                        ft.Icon(icon, size=24, color=ft.Colors.with_opacity(0.8, ft.Theme().color_scheme.primary if page.theme else ft.Colors.BLUE)), # Try to get theme primary color
                        ft.Text(ref=value_ref, value="...", size=20, weight=ft.FontWeight.BOLD),
                        # <--- FIX: Use ft.Colors
                        ft.Text(label, size=12, color=ft.Colors.with_opacity(0.7, ft.Colors.ON_SURFACE))
                    ],
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    alignment=ft.MainAxisAlignment.CENTER,
                    spacing=5,
                )
            )
        )

    def build_stats_view():
        print("Building stats view")
        stats_year_filter.on_change = on_stats_filter_change
        page.run_thread(calculate_and_update_stats_display, list(stats_year_filter.selected)[0] if stats_year_filter.selected else "All Time")

        controls_list = [
            ft.Text("Statistics", style=ft.TextThemeStyle.HEADLINE_MEDIUM),
            stats_year_filter,

             # <--- FIX: Wrap Text with margin in Container
            ft.Container(content=ft.Text("Summary", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.GridView( runs_count=4, max_extent=180, child_aspect_ratio=1.1, spacing=10, run_spacing=10,
                controls=[
                    create_summary_card(ft.icons.VIDEOGAME_ASSET_ROUNDED, stats_total_games_text, "Total Games Logged"),
                    create_summary_card(ft.icons.STAR_RATE_ROUNDED, stats_avg_score_text, "Average Rating"),
                    create_summary_card(ft.icons.REPLAY_ROUNDED, stats_total_replays_text, "Replays Logged"),
                    create_summary_card(ft.icons.DEVICES_OTHER_ROUNDED, stats_unique_platforms_text, "Unique Platforms"),
                ]
            ),

             # <--- FIX: Wrap Text with margin in Container
            ft.Container(content=ft.Text("Platform Breakdown", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Card( content=ft.Container( padding=20,
                    content=ft.Row( [
                            ft.Column( [ ft.PieChart( ref=platform_pie_chart, sections=[], center_space_radius=40, expand=True, ) ], expand=3, alignment=ft.MainAxisAlignment.CENTER, ),
                            ft.Column( [ ft.Text("Platforms", weight=ft.FontWeight.BOLD), ft.Column( ref=platform_legend, controls=[], spacing=8, scroll=ft.ScrollMode.ADAPTIVE, ) ], expand=2, horizontal_alignment=ft.CrossAxisAlignment.START, scroll=ft.ScrollMode.ADAPTIVE, height=250 ),
                        ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    )
                )
            ),

             # <--- FIX: Wrap Text with margin in Container
            ft.Container(content=ft.Text("Import / Export", style=ft.TextThemeStyle.TITLE_MEDIUM), margin=ft.margin.only(top=15)),
            ft.Row( [ ft.ElevatedButton("Import from CSV", icon=ft.icons.UPLOAD_FILE_ROUNDED, on_click=open_import_dialog), ], spacing=10 ),
            ft.Text( "CSV Format: Requires header row. Columns: 'Title' (Required), 'Platform' (Optional), 'Rating' (Optional, 0-10 or N/A), 'DateCompleted' (Required, YYYY-MM-DD), 'IsReplay' (Optional, true/false).", italic=True, size=11, color=ft.Colors.with_opacity(0.6, ft.Colors.ON_SURFACE) ) # <--- FIX: Use ft.Colors
        ]
        return ft.ListView( expand=True, spacing=20, padding=ft.padding.symmetric(horizontal=20, vertical=10), controls=controls_list )


    # --- Backlog View ---
    backlog_list_view_content = ft.Ref[ft.ListView]()

    def refresh_backlog_view_list():
         print("Refreshing backlog list view controls")
         if not backlog_list_view_content.current: print("Warning: Backlog ListView ref not set yet."); return

         list_view = backlog_list_view_content.current
         list_view.controls.clear()
         items = get_backlog_db()
         if not items:
              list_view.controls.append( ft.Container( content=ft.Text("Your backlog is empty. Use the '+' button to add games!", italic=True, text_align=ft.TextAlign.CENTER), padding=20 ) )
         else:
              for item in items: list_view.controls.append(create_backlog_tile(item, refresh_backlog_view_list))

         # <--- FIX: Remove page check, update anyway
         # if list_view.page:
         # list_view.update()
         # else: print("Warning: Tried to update backlog list, but it's not on the page.")


    def delete_backlog_action(item_id, item_name):
        print(f"Attempting to delete backlog item: ID {item_id}, Name {item_name}")
        delete_backlog_item_db(item_id)
        page.show_snack_bar(ft.SnackBar(ft.Text(f"Removed '{item_name}' from backlog"), open=True))
        refresh_backlog_view_list()


    def create_backlog_tile(item_data, refresh_callback):
        platform_str = item_data.get('platform', 'Any Platform') or 'Any Platform'
        added_date_str = item_data.get('added_date', 'Unknown Date') or 'Unknown Date'
        return ft.ListTile(
            title=ft.Text(item_data['name'], weight=ft.FontWeight.BOLD),
            subtitle=ft.Text(f"Platform: {platform_str} | Added: {added_date_str}"),
            trailing=ft.IconButton( icon=ft.icons.DELETE_SWEEP_OUTLINE, tooltip="Remove from Backlog", icon_color=ft.Colors.ERROR, on_click=lambda _: delete_backlog_action(item_data['id'], item_data['name']) ) # <--- FIX: Use ft.Colors
        )

    def open_add_backlog_dialog(e=None):
        print("Opening MANUAL add backlog dialog")
        name_field = ft.TextField(label="Game Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS)
        platform_field = ft.TextField(label="Platform (Optional)", capitalization=ft.TextCapitalization.WORDS)

        def save_new_backlog(e):
            name = name_field.value.strip()
            platform = platform_field.value.strip()
            if not name:
                name_field.error_text = "Title is required."; name_field.update()
                page.show_snack_bar(ft.SnackBar(ft.Text("Game Title cannot be empty."), open=True, bgcolor=ft.Colors.ERROR_CONTAINER)) # <--- FIX: Use ft.Colors
                return
            else: name_field.error_text = None; name_field.update()
            add_backlog_item_db(name, platform if platform else None)
            page.show_snack_bar(ft.SnackBar(ft.Text(f"Added '{name}' to backlog"), open=True))
            close_manual_dialog()
            refresh_backlog_view_list()

        content_controls = [name_field, platform_field]
        action_buttons = [ ft.TextButton("Cancel", on_click=close_manual_dialog), ft.ElevatedButton("Add to Backlog", on_click=save_new_backlog), ]
        manual_dialog = create_dialog_overlay("Add Game to Backlog", content_controls, action_buttons)
        if 'main_stack' in locals() and main_stack:
            if manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog()
            main_stack.controls.append(manual_dialog); print("Manual add backlog dialog added to stack.")
            main_stack.update(); print("...stack updated to show dialog.")
        else:
            print("ERROR: Main stack UI element not found. Cannot display backlog dialog.")
            page.show_snack_bar(ft.SnackBar(ft.Text("Error: Could not open dialog window."), open=True, bgcolor=ft.Colors.ERROR)) # <--- FIX: Use ft.Colors


    def build_backlog_view():
        print("Building backlog view")
        view_content = ft.ListView( ref=backlog_list_view_content, expand=True, spacing=8, padding=ft.padding.only(top=10, bottom=70) )
        refresh_backlog_view_list()
        return view_content

    # --- Floating Action Button (FAB) ---
    def fab_clicked(e):
        print(f"FAB clicked on view: {current_view}")
        if current_view in YEARS: open_add_game_dialog()
        elif current_view == "Backlog": open_add_backlog_dialog()
        else: print(f"Warning: FAB clicked in an unexpected view '{current_view}' where it should be hidden."); page.show_snack_bar(ft.SnackBar(ft.Text("No action available here."), open=True))

    fab = ft.FloatingActionButton( icon=ft.icons.ADD, tooltip="Add Item", visible=False, on_click=fab_clicked )
    page.floating_action_button = fab
    page.floating_action_button_location = ft.FloatingActionButtonLocation.END_CONTAINED


    # --- Navigation Rail ---
    try: initial_index = YEARS.index(current_view)
    except ValueError:
        if current_view == "Stats": initial_index = len(YEARS)
        elif current_view == "Backlog": initial_index = len(YEARS) + 1
        else: initial_index = 0

    rail = ft.NavigationRail(
        selected_index=initial_index, label_type=ft.NavigationRailLabelType.ALL, min_width=100, min_extended_width=200, group_alignment=-0.9,
        destinations=(
            [ft.NavigationRailDestination(icon=ft.icons.CALENDAR_MONTH_OUTLINED, selected_icon=ft.icons.CALENDAR_MONTH, label=y) for y in YEARS] +
            [ft.NavigationRailDestination(icon=ft.icons.QUERY_STATS_OUTLINED, selected_icon=ft.icons.QUERY_STATS, label="Stats"),
             ft.NavigationRailDestination(icon=ft.icons.LIST_ALT_OUTLINED, selected_icon=ft.icons.LIST_ALT, label="Backlog")]
        ),
    )

    # --- Main Content Area ---
    main_content_area = ft.Column( expand=True, controls=[] )

    # ------ Navigation and Content Update Logic -------
    def update_main_content(view_id):
        nonlocal current_view
        print(f"Updating main content to display view: {view_id}")
        current_view = view_id
        main_content_area.controls.clear()
        show_fab, fab_tooltip, content = False, "Add Item", None

        if view_id in YEARS: content = build_year_view(view_id); show_fab = True; fab_tooltip = f"Add Game to {view_id}"
        elif view_id == "Stats": content = build_stats_view(); show_fab = False
        elif view_id == "Backlog": content = build_backlog_view(); show_fab = True; fab_tooltip = "Add to Backlog"
        else: content = ft.Container(content=ft.Text(f"Error: Unknown view '{view_id}' selected.", color=ft.Colors.ERROR), padding=20); show_fab = False # <--- FIX: Use ft.Colors

        if content: main_content_area.controls.append(content)
        fab.visible = show_fab; fab.tooltip = fab_tooltip
        if page: main_content_area.update(); fab.update()
        else: print("Warning: Page context lost during view update.")

    def refresh_current_view():
        print(f"Refreshing current view: {current_view}")
        update_main_content(current_view)

    def navigation_change(e):
        idx = e.control.selected_index
        new_view = "Unknown"
        if 0 <= idx < len(YEARS): new_view = YEARS[idx]
        elif idx == len(YEARS): new_view = "Stats"
        elif idx == len(YEARS) + 1: new_view = "Backlog"
        else: print(f"Warning: Invalid navigation index {idx}")
        print(f"Navigation changed. Index: {idx}, New View: {new_view}")
        if 'main_stack' in locals() and manual_dialog_container.current and manual_dialog_container.current in main_stack.controls: close_manual_dialog()
        if new_view != "Unknown": update_main_content(new_view)
        else: page.show_snack_bar(ft.SnackBar(ft.Text(f"Could not navigate to index {idx}."), open=True))

    rail.on_change = navigation_change

    # ----- Main layout Structure -----
    main_layout = ft.Row( controls=[ rail, ft.VerticalDivider(width=1), main_content_area ], expand=True, vertical_alignment=ft.CrossAxisAlignment.START )
    main_stack = ft.Stack( controls=[ main_layout ], expand=True )
    page.add(main_stack)

    # ----- Load initial view -----
    print(f"Loading initial view: {current_view}")
    update_main_content(current_view)
    page.update()

# --- Entry Point ---
if __name__ == "__main__":
    ft.app(target=main)