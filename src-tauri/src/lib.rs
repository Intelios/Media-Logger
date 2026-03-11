use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn apply_glass_style(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    style: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_liquid_glass::{GlassMaterialVariant, LiquidGlassConfig, LiquidGlassExt};
        use window_vibrancy::{NSVisualEffectMaterial, apply_vibrancy};

        let normalized = style.trim().to_ascii_lowercase();

        // macOS 26+ can switch between native liquid glass variants.
        if app.liquid_glass().is_supported() {
            let variant = if normalized == "clear" {
                GlassMaterialVariant::Clear
            } else {
                GlassMaterialVariant::Sidebar
            };

            app.liquid_glass()
                .set_effect(
                    &window,
                    LiquidGlassConfig {
                        variant,
                        ..Default::default()
                    },
                )
                .map_err(|e| e.to_string())?;
        } else {
            // Older macOS keeps the same vibrancy fallback regardless of selected style.
            apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, window, style);
    }

    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupZipReadResult {
    backup_json: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractBackupAssetsResult {
    assets_restored: usize,
}

struct TempDirGuard {
    path: PathBuf,
}

impl TempDirGuard {
    fn new(prefix: &str) -> Result<Self, String> {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("Failed to create temp path: {error}"))?
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "media-logger-{prefix}-{}-{unique_suffix}",
            std::process::id()
        ));
        fs::create_dir_all(&path).map_err(|error| {
            format!(
                "Failed to create temp directory {}: {error}",
                path.display()
            )
        })?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn zip_command_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "/usr/bin/zip"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "zip"
    }
}

fn unzip_command_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "/usr/bin/unzip"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "unzip"
    }
}

fn path_to_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("Path contains invalid UTF-8: {}", path.display()))
}

fn run_command(command: &str, args: &[&str], current_dir: Option<&Path>) -> Result<String, String> {
    let mut process = Command::new(command);
    process.args(args);

    if let Some(dir) = current_dir {
        process.current_dir(dir);
    }

    let output = process
        .output()
        .map_err(|error| format!("Failed to run {command}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("process exited with status {}", output.status)
        };
        return Err(format!("{command} failed: {detail}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn copy_dir_recursive(source: &Path, destination: &Path, overwrite: bool) -> Result<usize, String> {
    if !source.exists() {
        return Ok(0);
    }

    fs::create_dir_all(destination).map_err(|error| {
        format!(
            "Failed to create destination directory {}: {error}",
            destination.display()
        )
    })?;

    let mut files_copied = 0;
    let entries = fs::read_dir(source)
        .map_err(|error| format!("Failed to read directory {}: {error}", source.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read an entry inside {}: {error}",
                source.display()
            )
        })?;
        let entry_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect {}: {error}", entry.path().display()))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());

        if entry_type.is_dir() {
            files_copied += copy_dir_recursive(&source_path, &destination_path, overwrite)?;
            continue;
        }

        if !entry_type.is_file() {
            continue;
        }

        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create parent directory {}: {error}",
                    parent.display()
                )
            })?;
        }

        if !overwrite && destination_path.exists() {
            continue;
        }

        fs::copy(&source_path, &destination_path).map_err(|error| {
            format!(
                "Failed to copy {} to {}: {error}",
                source_path.display(),
                destination_path.display()
            )
        })?;
        files_copied += 1;
    }

    Ok(files_copied)
}

fn list_zip_entries(file_path: &Path) -> Result<Vec<String>, String> {
    let zip_path = path_to_string(file_path)?;
    let output = run_command(unzip_command_name(), &["-Z1", &zip_path], None)?;

    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

fn archive_path_is_safe(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    let archive_path = Path::new(&normalized);

    !normalized.is_empty()
        && archive_path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

#[tauri::command]
fn create_backup_zip(
    output_path: String,
    backup_json: String,
    data_dir: String,
) -> Result<(), String> {
    let output_path = PathBuf::from(output_path);

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to prepare backup destination {}: {error}",
                parent.display()
            )
        })?;
    }

    if output_path.exists() {
        fs::remove_file(&output_path).map_err(|error| {
            format!(
                "Failed to replace existing backup {}: {error}",
                output_path.display()
            )
        })?;
    }

    let temp_dir = TempDirGuard::new("backup-export")?;
    let backup_json_path = temp_dir.path().join("backup.json");
    fs::write(&backup_json_path, backup_json).map_err(|error| {
        format!(
            "Failed to write temporary backup.json at {}: {error}",
            backup_json_path.display()
        )
    })?;

    let assets_source = Path::new(&data_dir).join("assets");
    if assets_source.is_dir() {
        copy_dir_recursive(&assets_source, &temp_dir.path().join("assets"), true)?;
    }

    let output_path = path_to_string(&output_path)?;
    let mut args = vec!["-rq".to_string(), output_path, "backup.json".to_string()];

    if assets_source.is_dir() {
        args.push("assets".to_string());
    }

    let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    run_command(zip_command_name(), &arg_refs, Some(temp_dir.path()))?;

    Ok(())
}

#[tauri::command]
fn read_backup_zip(file_path: String) -> Result<BackupZipReadResult, String> {
    let zip_path = PathBuf::from(file_path);
    let entries = list_zip_entries(&zip_path)?;

    if !entries.iter().any(|entry| entry == "backup.json") {
        return Err("Backup ZIP is missing backup.json".to_string());
    }

    let zip_path = path_to_string(&zip_path)?;
    let backup_json = run_command(
        unzip_command_name(),
        &["-p", &zip_path, "backup.json"],
        None,
    )?;

    serde_json::from_str::<serde_json::Value>(&backup_json)
        .map_err(|error| format!("backup.json is not valid JSON: {error}"))?;

    Ok(BackupZipReadResult { backup_json })
}

#[tauri::command]
fn extract_backup_assets(
    file_path: String,
    data_dir: String,
    overwrite: bool,
) -> Result<ExtractBackupAssetsResult, String> {
    let zip_path = PathBuf::from(file_path);
    let entries = list_zip_entries(&zip_path)?;
    let asset_entries = entries
        .iter()
        .filter(|entry| entry.starts_with("assets/"))
        .cloned()
        .collect::<Vec<_>>();

    if asset_entries.is_empty() {
        return Ok(ExtractBackupAssetsResult { assets_restored: 0 });
    }

    for entry in &asset_entries {
        if !archive_path_is_safe(entry) {
            return Err(format!("Backup ZIP contains an unsafe asset path: {entry}"));
        }
    }

    for entry in &entries {
        if entry != "backup.json" && !archive_path_is_safe(entry) {
            return Err(format!("Backup ZIP contains an unsafe path: {entry}"));
        }
    }

    let temp_dir = TempDirGuard::new("backup-assets")?;
    let zip_path = path_to_string(&zip_path)?;
    let temp_path = path_to_string(temp_dir.path())?;
    run_command(
        unzip_command_name(),
        &["-qq", &zip_path, "-d", &temp_path],
        None,
    )?;

    let extracted_assets = temp_dir.path().join("assets");
    if !extracted_assets.exists() {
        return Ok(ExtractBackupAssetsResult { assets_restored: 0 });
    }

    let destination_assets = Path::new(&data_dir).join("assets");
    let assets_restored = copy_dir_recursive(&extracted_assets, &destination_assets, overwrite)?;

    Ok(ExtractBackupAssetsResult { assets_restored })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_liquid_glass::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            apply_glass_style,
            create_backup_zip,
            read_backup_zip,
            extract_backup_assets
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Create native macOS menu bar
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_liquid_glass::{
                    GlassMaterialVariant, LiquidGlassConfig, LiquidGlassExt,
                };
                use window_vibrancy::{NSVisualEffectMaterial, apply_vibrancy};

                // macOS 26+ gets Liquid Glass; older macOS keeps the existing vibrancy effect.
                if app.liquid_glass().is_supported() {
                    app.liquid_glass()
                        .set_effect(
                            &window,
                            LiquidGlassConfig {
                                variant: GlassMaterialVariant::Sidebar,
                                ..Default::default()
                            },
                        )
                        .expect("Failed to apply liquid glass");
                } else {
                    apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                        .expect("Failed to apply vibrancy");
                }

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
                    &[&PredefinedMenuItem::fullscreen(
                        app,
                        Some("Toggle Full Screen"),
                    )?],
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
                    &[
                        &app_menu,
                        &file_menu,
                        &edit_menu,
                        &view_menu,
                        &go_menu,
                        &window_menu,
                    ],
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
