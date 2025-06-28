import flet as ft

# Import our new, separated modules
import config
import database
from ui import AppUI

async def main(page: ft.Page):
    """
    The main entry point for the Flet application.
    """
    # 1. Initialize the database and run any necessary migrations.
    #    This is safe to run every time.
    database.init_db()
    print("--- Database Initialized ---")

    # 2. Configure the initial page settings from our config file.
    page.title = config.APP_TITLE
    page.window_width = 1400
    page.window_height = 900

    # 3. Set the initial theme based on saved settings or defaults.
    current_theme_name = database.get_setting_db("current_theme", config.DEFAULT_THEME_NAME)
    selected_theme_config = config.THEMES.get(current_theme_name, config.THEMES[config.DEFAULT_THEME_NAME])
    page.theme_mode = selected_theme_config["mode"]
    page.theme = ft.Theme(color_scheme_seed=selected_theme_config["seed"])
    print(f"--- Theme set to: {current_theme_name} ---")

    # 4. Create an instance of our main UI class.
    #    This class now contains all the application's state and UI logic.
    app_ui = AppUI(page)

    # 5. Build the main layout of the application.
    #    This method will create the navigation rail, content area, etc.
    app_ui.build_main_layout()
    print("--- Main Layout Built ---")

    # 6. Update the page to show the final UI.
    page.update() # <--- THIS IS THE CORRECTED LINE
    print("--- Application Ready ---")


if __name__ == "__main__":
    # This is the standard way to run the Flet application.
    ft.app(target=main, assets_dir="assets")