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
        
        # --- Backlog table ---
        # The 'source' column is left for backward compatibility. New entries will use 'progress'.
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

        # Awards tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS award_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                year INTEGER NOT NULL,
                created_date TEXT NOT NULL,
                UNIQUE(name, year)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS award_winners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                media_id INTEGER NOT NULL,
                selected_date TEXT NOT NULL,
                FOREIGN KEY (category_id) REFERENCES award_categories (id) ON DELETE CASCADE,
                FOREIGN KEY (media_id) REFERENCES javs (id) ON DELETE CASCADE,
                UNIQUE(category_id)
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
            'artist': "ALTER TABLE javs ADD COLUMN artist TEXT",
            'director': "ALTER TABLE javs ADD COLUMN director TEXT",
            'actress': "ALTER TABLE javs ADD COLUMN actress TEXT",
            'update_version': "ALTER TABLE javs ADD COLUMN update_version TEXT",
        }

        for col, statement in migrations.items():
            if col not in column_names:
                print(f"Applying migration: Adding column '{col}' to 'javs' table.")
                cursor.execute(statement)

        # Migration for backlog table to add the new 'progress' field
        backlog_table_info = cursor.execute("PRAGMA table_info(backlog)").fetchall()
        backlog_column_names = [info[1] for info in backlog_table_info]
        if 'progress' not in backlog_column_names:
            print("Applying migration: Adding column 'progress' to 'backlog' table.")
            cursor.execute("ALTER TABLE backlog ADD COLUMN progress TEXT")

        conn.commit()
        print("Database initialized and migrations checked successfully.")
    except sqlite3.Error as e:
        print(f"Database initialization error: {e}")
        traceback.print_exc()
    finally:
        if conn:
            conn.close()

# --- Backlog DB Functions ---

def add_backlog_item_db(name, entry_type, progress, notes, image_ref_for_db):
    """Adds a new item to the backlog table."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        date_added_str = datetime.now().strftime('%Y-%m-%d')
        
        name_to_db = name.strip()
        entry_type_to_db = entry_type.strip() if entry_type and entry_type.strip() else None
        progress_to_db = progress.strip() if progress and progress.strip() else None
        notes_to_db = notes.strip() if notes and notes.strip() else None
        image_to_db = image_ref_for_db.strip() if image_ref_for_db and image_ref_for_db.strip() else None

        cursor.execute(
            "INSERT INTO backlog (name, entry_type, progress, notes, date_added, image_url) VALUES (?, ?, ?, ?, ?, ?)",
            (name_to_db, entry_type_to_db, progress_to_db, notes_to_db, date_added_str, image_to_db)
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

def update_backlog_item_db(item_id, name, entry_type, progress, notes, image_ref_for_db):
    """Updates an existing item in the backlog table."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        
        name_to_db = name.strip()
        entry_type_to_db = entry_type.strip() if entry_type and entry_type.strip() else None
        progress_to_db = progress.strip() if progress and progress.strip() else None
        notes_to_db = notes.strip() if notes and notes.strip() else None
        image_to_db = image_ref_for_db.strip() if image_ref_for_db and image_ref_for_db.strip() else None

        cursor.execute(
            "UPDATE backlog SET name = ?, entry_type = ?, progress = ?, notes = ?, image_url = ? WHERE id = ?",
            (name_to_db, entry_type_to_db, progress_to_db, notes_to_db, image_to_db, item_id)
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
        artist_to_db = conditional_data.get("artist", "").strip() or None
        director_to_db = conditional_data.get("director", "").strip() or None
        actress_to_db = conditional_data.get("actress", "").strip() or None
        version_to_db = conditional_data.get("update_version", "").strip() or None

        cursor.execute(
            "INSERT INTO javs (name, genre, completion_date, review_score, description, year_completed, is_rewatch, own_local_copy, image_url, entry_type, platform, author, artist, director, actress, update_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, genre_to_db, completion_date_str, score_to_db, description_to_db, year_completed, rewatch_int, own_local_copy_int, image_to_db, entry_type_to_db, platform_to_db, author_to_db, artist_to_db, director_to_db, actress_to_db, version_to_db)
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
        artist_to_db = conditional_data.get("artist", "").strip() or None
        director_to_db = conditional_data.get("director", "").strip() or None
        actress_to_db = conditional_data.get("actress", "").strip() or None
        version_to_db = conditional_data.get("update_version", "").strip() or None

        cursor.execute("""
            UPDATE javs SET name = ?, genre = ?, completion_date = ?, review_score = ?, description = ?, year_completed = ?, is_rewatch = ?, own_local_copy = ?, image_url = ?, entry_type = ?, platform = ?, author = ?, artist = ?, director = ?, actress = ?, update_version = ?
            WHERE id = ?
        """, (name, genre_to_db, completion_date_str, score_to_db, description_to_db, year_completed, rewatch_int, own_local_copy_int, image_to_db, entry_type_to_db, platform_to_db, author_to_db, artist_to_db, director_to_db, actress_to_db, version_to_db, jav_id))
        conn.commit()
        print(f"Entry updated: ID {jav_id} - {name}")
    except sqlite3.Error as e:
        print(f"Database error updating entry ID {jav_id}: {e}")
    finally:
        if conn:
            conn.close()

# --- Paginated Database Functions ---

def get_javs_by_year_paginated_db(year, page=0, page_size=50):
    """
    Retrieves entries for a specific year with pagination.
    Returns tuple of (entries_list, has_more_pages).
    """
    conn = None
    javs = []
    has_more = False
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get one extra record to check if there are more pages
        offset = page * page_size
        limit = page_size + 1
        
        cursor.execute(
            "SELECT * FROM javs WHERE year_completed = ? ORDER BY completion_date ASC, id ASC LIMIT ? OFFSET ?",
            (year, limit, offset)
        )
        results = [dict(row) for row in cursor.fetchall()]
        
        # Check if we have more pages
        if len(results) > page_size:
            has_more = True
            javs = results[:-1]  # Remove the extra record
        else:
            has_more = False
            javs = results
            
    except sqlite3.Error as e:
        print(f"Database Error getting paginated entries for year {year}: {e}")
    finally:
        if conn:
            conn.close()
    
    return javs, has_more

def search_javs_paginated_db(search_term, search_fields, entry_types=None, page=0, page_size=50):
    """
    Searches for entries with pagination based on a term, specific fields, and optional entry types.
    Returns tuple of (entries_list, has_more_pages).
    """
    conn = None
    javs = []
    has_more = False
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if not search_term or not search_term.strip():
            return [], False
        
        search_term_lower = search_term.strip().lower()
        
        where_conditions = []
        params = []
        
        valid_db_columns = {opt["key"] for opt in config.SEARCH_FIELD_OPTIONS}
        
        for field in search_fields:
            if field in valid_db_columns:
                where_conditions.append(f"LOWER(IFNULL({field}, '')) LIKE ?")
                params.append(f"%{search_term_lower}%")
        
        if not where_conditions:
            return [], False
        
        search_where = " OR ".join(where_conditions)
        
        if entry_types:
            entry_type_placeholders = ",".join("?" * len(entry_types))
            full_where = f"({search_where}) AND entry_type IN ({entry_type_placeholders})"
            params.extend(entry_types)
        else:
            full_where = search_where
        
        # Get one extra record to check if there are more pages
        offset = page * page_size
        limit = page_size + 1
        params.extend([limit, offset])
        
        query = f"SELECT * FROM javs WHERE {full_where} ORDER BY completion_date DESC, id DESC LIMIT ? OFFSET ?"
        
        cursor.execute(query, params)
        results = [dict(row) for row in cursor.fetchall()]
        
        # Check if we have more pages
        if len(results) > page_size:
            has_more = True
            javs = results[:-1]  # Remove the extra record
        else:
            has_more = False
            javs = results
        
    except sqlite3.Error as e:
        print(f"Database error during paginated search: {e}")
        traceback.print_exc()
    finally:
        if conn:
            conn.close()
    
    return javs, has_more

def get_collection_stats_db():
    """
    Retrieves collection statistics for the home dashboard.
    Returns dictionary with aggregated statistics.
    """
    conn = None
    stats = {
        "total_entries": 0,
        "average_rating": 0.0,
        "most_common_type": "N/A",
        "most_productive_year": None,
        "total_rated_entries": 0,
        "featured_entry": None
    }
    
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Total entries
        cursor.execute("SELECT COUNT(*) as total FROM javs")
        stats["total_entries"] = cursor.fetchone()["total"]
        
        # Average rating (only for rated entries)
        cursor.execute("SELECT AVG(review_score) as avg_rating, COUNT(*) as rated_count FROM javs WHERE review_score IS NOT NULL")
        rating_result = cursor.fetchone()
        if rating_result["avg_rating"] is not None:
            stats["average_rating"] = round(rating_result["avg_rating"], 1)
            stats["total_rated_entries"] = rating_result["rated_count"]
        
        # Most common entry type
        cursor.execute("""
            SELECT entry_type, COUNT(*) as count 
            FROM javs 
            WHERE entry_type IS NOT NULL 
            GROUP BY entry_type 
            ORDER BY count DESC 
            LIMIT 1
        """)
        type_result = cursor.fetchone()
        if type_result:
            stats["most_common_type"] = type_result["entry_type"]
        
        # Most productive year
        cursor.execute("""
            SELECT year_completed, COUNT(*) as count 
            FROM javs 
            WHERE year_completed IS NOT NULL 
            GROUP BY year_completed 
            ORDER BY count DESC 
            LIMIT 1
        """)
        year_result = cursor.fetchone()
        if year_result:
            stats["most_productive_year"] = year_result["year_completed"]
        
        # Featured entry (random high-rated or recent entry)
        cursor.execute("""
            SELECT * FROM javs 
            WHERE review_score >= 8 OR completion_date >= date('now', '-30 days')
            ORDER BY RANDOM() 
            LIMIT 1
        """)
        featured_result = cursor.fetchone()
        if featured_result:
            stats["featured_entry"] = dict(featured_result)
        else:
            # Fallback to any random entry if no high-rated/recent entries
            cursor.execute("SELECT * FROM javs ORDER BY RANDOM() LIMIT 1")
            fallback_result = cursor.fetchone()
            if fallback_result:
                stats["featured_entry"] = dict(fallback_result)
        
    except sqlite3.Error as e:
        print(f"Database error getting collection stats: {e}")
        traceback.print_exc()
    finally:
        if conn:
            conn.close()
    
    return stats

def get_recent_entries_db(limit=6):
    """
    Retrieves the most recently completed entries.
    Returns list of recent entries.
    """
    conn = None
    entries = []
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT * FROM javs WHERE completion_date IS NOT NULL ORDER BY completion_date DESC, id DESC LIMIT ?",
            (limit,)
        )
        entries = [dict(row) for row in cursor.fetchall()]
        
    except sqlite3.Error as e:
        print(f"Database error getting recent entries: {e}")
        traceback.print_exc()
    finally:
        if conn:
            conn.close()
    
    return entries

# --- Awards Database Functions ---

def create_award_category_db(name, year):
    """Creates a new award category for a specific year."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        created_date_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        name_to_db = name.strip()
        
        cursor.execute(
            "INSERT INTO award_categories (name, year, created_date) VALUES (?, ?, ?)",
            (name_to_db, year, created_date_str)
        )
        conn.commit()
        category_id = cursor.lastrowid
        print(f"Award category created: {name} for year {year}")
        return category_id
    except sqlite3.IntegrityError as e:
        print(f"Award category '{name}' already exists for year {year}")
        return None
    except sqlite3.Error as e:
        print(f"Database error creating award category '{name}': {e}")
        return None
    finally:
        if conn:
            conn.close()

def get_award_categories_by_year_db(year):
    """Retrieves all award categories for a specific year."""
    conn = None
    categories = []
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM award_categories WHERE year = ? ORDER BY created_date ASC, id ASC", 
            (year,)
        )
        categories = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database error getting award categories for year {year}: {e}")
    finally:
        if conn:
            conn.close()
    return categories

def get_all_award_years_db():
    """Retrieves all years that have award categories."""
    conn = None
    years = []
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT DISTINCT year FROM award_categories ORDER BY year DESC"
        )
        years = [row[0] for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database error getting award years: {e}")
    finally:
        if conn:
            conn.close()
    return years

def delete_award_category_db(category_id):
    """Deletes an award category and its associated winner."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        # Enable foreign keys for this connection
        conn.execute("PRAGMA foreign_keys = ON")
        cursor = conn.cursor()
        
        # First, check if the category exists
        cursor.execute("SELECT name FROM award_categories WHERE id = ?", (category_id,))
        category_result = cursor.fetchone()
        if not category_result:
            raise sqlite3.Error(f"Award category with ID {category_id} does not exist")
        
        category_name = category_result[0]
        
        # Check if there's a winner for this category
        cursor.execute("SELECT id FROM award_winners WHERE category_id = ?", (category_id,))
        winner_result = cursor.fetchone()
        
        # Delete the winner first (if exists) to avoid foreign key constraint issues
        if winner_result:
            cursor.execute("DELETE FROM award_winners WHERE category_id = ?", (category_id,))
            print(f"Award winner removed for category ID {category_id}")
        
        # Now delete the category
        cursor.execute("DELETE FROM award_categories WHERE id = ?", (category_id,))
        
        # Verify the deletion was successful
        if cursor.rowcount == 0:
            raise sqlite3.Error(f"Failed to delete award category ID {category_id}")
        
        conn.commit()
        print(f"Award category deleted successfully: ID {category_id} - '{category_name}'")
        return True
        
    except sqlite3.Error as e:
        print(f"Database error deleting award category ID {category_id}: {e}")
        if conn:
            conn.rollback()
        raise e  # Re-raise the exception so the UI can handle it
    finally:
        if conn:
            conn.close()

def set_award_winner_db(category_id, media_id):
    """Sets or updates the winner for an award category."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        selected_date_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        cursor.execute(
            "INSERT OR REPLACE INTO award_winners (category_id, media_id, selected_date) VALUES (?, ?, ?)",
            (category_id, media_id, selected_date_str)
        )
        conn.commit()
        print(f"Award winner set: Category ID {category_id}, Media ID {media_id}")
    except sqlite3.Error as e:
        print(f"Database error setting award winner for category {category_id}: {e}")
    finally:
        if conn:
            conn.close()

def get_award_winner_db(category_id):
    """Retrieves the winner for a specific award category."""
    conn = None
    winner = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM award_winners WHERE category_id = ?", 
            (category_id,)
        )
        result = cursor.fetchone()
        if result:
            winner = dict(result)
    except sqlite3.Error as e:
        print(f"Database error getting award winner for category {category_id}: {e}")
    finally:
        if conn:
            conn.close()
    return winner

def get_award_winner_with_media_db(category_id):
    """Retrieves the winner for a specific award category with media details."""
    conn = None
    winner = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                aw.id as winner_id,
                aw.category_id,
                aw.media_id,
                aw.selected_date,
                j.name as media_name,
                j.entry_type,
                j.image_url,
                j.review_score,
                j.completion_date
            FROM award_winners aw
            JOIN javs j ON aw.media_id = j.id
            WHERE aw.category_id = ?
        """, (category_id,))
        result = cursor.fetchone()
        if result:
            winner = dict(result)
    except sqlite3.Error as e:
        print(f"Database error getting award winner with media for category {category_id}: {e}")
    finally:
        if conn:
            conn.close()
    return winner

def get_awards_with_winners_by_year_db(year):
    """Retrieves all award categories for a year with their winner information."""
    conn = None
    awards = []
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                ac.id as category_id,
                ac.name as category_name,
                ac.year,
                ac.created_date,
                aw.id as winner_id,
                aw.media_id,
                aw.selected_date,
                j.name as media_name,
                j.entry_type,
                j.image_url,
                j.review_score,
                j.completion_date
            FROM award_categories ac
            LEFT JOIN award_winners aw ON ac.id = aw.category_id
            LEFT JOIN javs j ON aw.media_id = j.id
            WHERE ac.year = ?
            ORDER BY ac.created_date ASC, ac.id ASC
        """, (year,))
        awards = [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        print(f"Database error getting awards with winners for year {year}: {e}")
    finally:
        if conn:
            conn.close()
    return awards

def remove_award_winner_db(category_id):
    """Removes the winner from an award category."""
    conn = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM award_winners WHERE category_id = ?", (category_id,))
        conn.commit()
        print(f"Award winner removed from category ID {category_id}")
    except sqlite3.Error as e:
        print(f"Database error removing award winner from category {category_id}: {e}")
    finally:
        if conn:
            conn.close()

def get_award_category_db(category_id):
    """Retrieves a specific award category by ID."""
    conn = None
    category = None
    try:
        conn = sqlite3.connect(config.DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM award_categories WHERE id = ?", (category_id,))
        result = cursor.fetchone()
        if result:
            category = dict(result)
    except sqlite3.Error as e:
        print(f"Database error getting award category ID {category_id}: {e}")
    finally:
        if conn:
            conn.close()
    return category