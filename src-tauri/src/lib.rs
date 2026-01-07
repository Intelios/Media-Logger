use tauri::Manager;
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::Emitter;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init()) 
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            
            // Create native macOS menu bar
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                    .expect("Failed to apply vibrancy");
                
                // App menu (appears as "Media Logger" in menu bar)
                let app_menu = Submenu::with_items(
                    app,
                    "Media Logger",
                    true,
                    &[
                        &PredefinedMenuItem::about(app, Some("About Media Logger"), None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::services(app, Some("Services"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::hide(app, Some("Hide Media Logger"))?,
                        &PredefinedMenuItem::hide_others(app, Some("Hide Others"))?,
                        &PredefinedMenuItem::show_all(app, Some("Show All"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::quit(app, Some("Quit Media Logger"))?,
                    ],
                )?;

                // File menu with New Entry
                let new_entry_item = MenuItemBuilder::new("New Entry")
                    .id("new_entry")
                    .accelerator("CmdOrCtrl+N")
                    .build(app)?;
                
                let file_menu = Submenu::with_items(
                    app,
                    "File",
                    true,
                    &[
                        &new_entry_item,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::close_window(app, Some("Close Window"))?,
                    ],
                )?;

                // Edit menu with standard shortcuts
                let edit_menu = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, Some("Undo"))?,
                        &PredefinedMenuItem::redo(app, Some("Redo"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::cut(app, Some("Cut"))?,
                        &PredefinedMenuItem::copy(app, Some("Copy"))?,
                        &PredefinedMenuItem::paste(app, Some("Paste"))?,
                        &PredefinedMenuItem::select_all(app, Some("Select All"))?,
                    ],
                )?;

                // View menu
                let view_menu = Submenu::with_items(
                    app,
                    "View",
                    true,
                    &[
                        &PredefinedMenuItem::fullscreen(app, Some("Toggle Full Screen"))?,
                    ],
                )?;

                // Go menu for quick navigation
                let go_dashboard = MenuItemBuilder::new("Dashboard")
                    .id("go_dashboard")
                    .accelerator("CmdOrCtrl+1")
                    .build(app)?;
                let go_year = MenuItemBuilder::new("Year View")
                    .id("go_year")
                    .accelerator("CmdOrCtrl+2")
                    .build(app)?;
                let go_search = MenuItemBuilder::new("Search")
                    .id("go_search")
                    .accelerator("CmdOrCtrl+3")
                    .build(app)?;
                let go_stats = MenuItemBuilder::new("Stats")
                    .id("go_stats")
                    .accelerator("CmdOrCtrl+4")
                    .build(app)?;
                let go_profiles = MenuItemBuilder::new("Profiles")
                    .id("go_profiles")
                    .accelerator("CmdOrCtrl+5")
                    .build(app)?;
                let go_awards = MenuItemBuilder::new("Awards")
                    .id("go_awards")
                    .accelerator("CmdOrCtrl+6")
                    .build(app)?;
                let go_collections = MenuItemBuilder::new("Collections")
                    .id("go_collections")
                    .accelerator("CmdOrCtrl+7")
                    .build(app)?;
                let go_settings = MenuItemBuilder::new("Settings")
                    .id("go_settings")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?;

                let go_menu = Submenu::with_items(
                    app,
                    "Go",
                    true,
                    &[
                        &go_dashboard,
                        &go_year,
                        &go_search,
                        &go_stats,
                        &PredefinedMenuItem::separator(app)?,
                        &go_profiles,
                        &go_awards,
                        &go_collections,
                        &PredefinedMenuItem::separator(app)?,
                        &go_settings,
                    ],
                )?;

                // Window menu
                let window_menu = Submenu::with_items(
                    app,
                    "Window",
                    true,
                    &[
                        &PredefinedMenuItem::minimize(app, Some("Minimize"))?,
                        &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
                    ],
                )?;

                // Build the menu bar
                let menu = Menu::with_items(
                    app,
                    &[&app_menu, &file_menu, &edit_menu, &view_menu, &go_menu, &window_menu],
                )?;

                app.set_menu(menu)?;
            }
            
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "new_entry" => {
                    let _ = app.emit("menu-new-entry", ());
                }
                "go_dashboard" => {
                    let _ = app.emit("menu-navigate", "/");
                }
                "go_year" => {
                    // Navigate to current year
                    let current_year = chrono::Local::now().format("%Y").to_string();
                    let _ = app.emit("menu-navigate", format!("/year/{}", current_year));
                }
                "go_search" => {
                    let _ = app.emit("menu-navigate", "/search");
                }
                "go_stats" => {
                    let _ = app.emit("menu-navigate", "/stats");
                }
                "go_profiles" => {
                    let _ = app.emit("menu-navigate", "/profiles");
                }
                "go_awards" => {
                    let _ = app.emit("menu-navigate", "/awards");
                }
                "go_collections" => {
                    let _ = app.emit("menu-navigate", "/collections");
                }
                "go_settings" => {
                    let _ = app.emit("menu-navigate", "/settings");
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
