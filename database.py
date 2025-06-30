import sqlite3
import os
import traceback
from datetime import datetime

# Import the single source of truth for our paths and settings
import config

# --- Database Handling ---

def init_db():
    """
    Initializes the database and its tables. Creates asset directories if they don't exist.
    This function is safe to run every time the application starts.
    """
    conn = None
    try:
        # Ensure the directories for assets and images exist
        if not os.path.exists(config.ASSETS_DIR):
            os.makedirs(config.ASSETS_DIR)
            print(f"Created assets directory: {config.ASSETS_DIR}")
        if not os.path.exists(config.IMAGES_DIR):
            os.makedirs(config.IMAGES_DIR)
            print(f"Created images directory: {config.IMAGES_DIR}")

        print(f"Attempting to connect to database: {config.DB_FILE}")
        conn = sqlite3.connect(config.DB_FILE)
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
        
        # --- NEW: Backlog table ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS backlog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                entry_type TEXT,
                source TEXT,
                notes TEXT,
                date_added TEXT NOT NULL,
                image_url TEXT
            )
        """)

        # --- Migration Logic ---
        # Check for missing columns and add them if necessary for backward compatibility
        table_info = cursor.execute("PRAGMA table_info(javs)").fetchall()
        column_names = [info[1] for info in table_info]

        migrations = {
            'own_local_copy': "ALTER TABLE javs ADD COLUMN own_local_copy INTEGER DEFAULT 0 NOT NULL CHECK(own_local_copy IN (0, 1))",
            'image_url': "ALTER TABLE javs ADD COLUMN image_url TEXT",
            'entry_type': "ALTER TABLE javs ADD COLUMN entry_type TEXT",
            'platform': "ALTER TABLE javs ADD COLUMN platform TEXT",
            'author': "ALTER TABLE javs ADD COLUMN author TEXT",
            'director': "ALTER TABLE javs ADD COLUMN director TEXT",
            'actress': "ALTER TABLE javs ADD COLUMN actress TEXT",
            'update_version': "ALTER TABLE javs ADD COLUMN update_version TEXT",
        }

        for col, statement in migrations.items():
            if col not in column_names:
                print(f"Applying migration: Adding column '{col}' to 'javs' table.")
                cursor.execute(statement)

        conn.commit()
        print("Database initialized and migrations checked successfully.")
    except sqlite3.Error as e:
        print(f"Database initialization error: {e}")
        traceback.print_exc()
    finally:
        if conn:
            conn.close()

# --- Backlog DB Functions ---

def add_backlog_item_db(name, entry_type, source, notes, image_ref_for_db):
    """Adds a new item to the backlog table."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        date_added_str = datetime.now().strftime('%Y-%m-%d')
        
        name_to_db = name.strip()
        entry_type_to_db = entry_type.strip() if entry_type and entry_type.strip() else None
        source_to_db = source.strip() if source and source.strip() else None
        notes_to_db = notes.strip() if notes and notes.strip() else None
        image_to_db = image_ref_for_db.strip() if image_ref_for_db and image_ref_for_db.strip() else None

        cursor.execute(
            "INSERT INTO backlog (name, entry_type, source, notes, date_added, image_url) VALUES (?, ?, ?, ?, ?, ?)",
            (name_to_db, entry_type_to_db, source_to_db, notes_to_db, date_added_str, image_to_db)
        )
        conn.commit()
        print(f"Backlog item added: {name}")
    except sqlite3.Error as e:
        print(f"Database error adding backlog item '{name}': {e}")
    finally:
        if conn:
            conn.close()

def get_all_backlog_items_db():
    """Retrieves all items from the backlog table."""
    conn = None
    items = []
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM backlog ORDER BY date_added DESC, id DESC")
        items = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database Error getting all backlog items: {e}")
    finally:
        if conn:
            conn.close()
    return items

def update_backlog_item_db(item_id, name, entry_type, source, notes, image_ref_for_db):
    """Updates an existing item in the backlog table."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        
        name_to_db = name.strip()
        entry_type_to_db = entry_type.strip() if entry_type and entry_type.strip() else None
        source_to_db = source.strip() if source and source.strip() else None
        notes_to_db = notes.strip() if notes and notes.strip() else None
        image_to_db = image_ref_for_db.strip() if image_ref_for_db and image_ref_for_db.strip() else None

        cursor.execute(
            "UPDATE backlog SET name = ?, entry_type = ?, source = ?, notes = ?, image_url = ? WHERE id = ?",
            (name_to_db, entry_type_to_db, source_to_db, notes_to_db, image_to_db, item_id)
        )
        conn.commit()
        print(f"Backlog item updated: ID {item_id}")
    except sqlite3.Error as e:
        print(f"Database error updating backlog item ID {item_id}: {e}")
    finally:
        if conn:
            conn.close()

def delete_backlog_item_db(item_id):
    """Deletes an item from the backlog table by its ID."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM backlog WHERE id = ?", (item_id,))
        conn.commit()
        print(f"Backlog item deleted: ID {item_id}")
    except sqlite3.Error as e:
        print(f"Database error deleting backlog item ID {item_id}: {e}")
    finally:
        if conn:
            conn.close()

# --- Existing Functions (get_setting_db, set_setting_db, add_jav_db, etc.) ---
# ... (The rest of the database.py file remains the same) ...
def get_setting_db(key, default_value=None):
    """Fetches a specific setting from the app_settings table."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row[0] if row else default_value
    except sqlite3.Error as e:
        print(f"Error getting setting '{key}': {e}")
        return default_value
    finally:
        if conn:
            conn.close()

def set_setting_db(key, value):
    """Saves or updates a specific setting in the app_settings table."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
    except sqlite3.Error as e:
        print(f"Error saving setting '{key}' = '{value}': {e}")
    finally:
        if conn:
            conn.close()

def add_jav_db(name, genre_str, completion_date_str, score, description, is_rewatch, own_local_copy, image_ref_for_db, entry_type, conditional_data: dict):
    """Adds a new entry to the main 'javs' table."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        year_completed = None
        if completion_date_str:
            try:
                year_completed = datetime.strptime(completion_date_str, '%Y-%m-%d').year
            except (ValueError, TypeError):
                pass
        
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
    except sqlite3.Error as e:
        print(f"Database error adding entry '{name}': {e}")
    finally:
        if conn:
            conn.close()

def get_javs_by_year_db(year):
    """Retrieves all entries for a specific year."""
    conn = None
    javs = []
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM javs WHERE year_completed = ? ORDER BY completion_date ASC, id ASC", (year,)
        )
        javs = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database Error getting entries for year {year}: {e}")
    finally:
        if conn:
            conn.close()
    return javs

def get_all_javs_db():
    """Retrieves all entries from the database."""
    conn = None
    javs = []
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM javs ORDER BY completion_date DESC, id DESC"
        )
        javs = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database Error getting all entries: {e}")
    finally:
        if conn:
            conn.close()
    return javs

def search_javs_db(search_term, search_fields, entry_types=None):
    """Searches for entries based on a term, specific fields, and optional entry types."""
    conn = None
    javs = []
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if not search_term or not search_term.strip():
            return []
        
        search_term_lower = search_term.strip().lower()
        
        where_conditions = []
        params = []
        
        valid_db_columns = {opt["key"] for opt in config.SEARCH_FIELD_OPTIONS}
        
        for field in search_fields:
            if field in valid_db_columns:
                where_conditions.append(f"LOWER(IFNULL({field}, '')) LIKE ?")
                params.append(f"%{search_term_lower}%")
        
        if not where_conditions:
            return []
        
        search_where = " OR ".join(where_conditions)
        
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
    """Deletes an entry from the database by its ID."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM javs WHERE id = ?", (jav_id,))
        conn.commit()
        print(f"Entry deleted: ID {jav_id}")
    except sqlite3.Error as e:
        print(f"Database error deleting entry ID {jav_id}: {e}")
    finally:
        if conn:
            conn.close()

def update_jav_db(jav_id, name, genre_str, completion_date_str, score, description, is_rewatch, own_local_copy, image_ref_for_db, entry_type, conditional_data: dict):
    """Updates an existing entry in the 'javs' table."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        year_completed = None
        if completion_date_str:
            try:
                year_completed = datetime.strptime(completion_date_str, '%Y-%m-%d').year
            except (ValueError, TypeError):
                pass
        
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
    except sqlite3.Error as e:
        print(f"Database error updating entry ID {jav_id}: {e}")
    finally:
        if conn:
            conn.close()