use serde::Serialize;
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};

#[tauri::command]
fn apply_glass_style(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    style: String,
    mode: String,
) -> Result<(), String> {
    let normalized = style.trim().to_ascii_lowercase();

    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_liquid_glass::{GlassMaterialVariant, LiquidGlassConfig, LiquidGlassExt};
        use window_vibrancy::{NSVisualEffectMaterial, apply_vibrancy};

        let _ = &mode;

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

    #[cfg(target_os = "windows")]
    {
        let _ = (app, normalized);
        apply_windows_backdrop(&window, theme_mode_is_dark(&mode))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, window, normalized, mode);
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn theme_mode_is_dark(mode: &str) -> Option<bool> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "dark" => Some(true),
        "light" => Some(false),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn apply_windows_backdrop(
    window: &tauri::WebviewWindow,
    dark: Option<bool>,
) -> Result<(), String> {
    use window_vibrancy::{apply_blur, apply_mica};

    if let Err(mica_error) = apply_mica(window, dark) {
        let fallback_color = if dark.unwrap_or(true) {
            (18, 18, 18, 125)
        } else {
            (245, 245, 245, 125)
        };

        apply_blur(window, Some(fallback_color)).map_err(|blur_error| {
            format!(
                "Failed to apply Windows Mica ({mica_error}); fallback blur failed: {blur_error}"
            )
        })?;
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

fn zip_options() -> zip::write::SimpleFileOptions {
    zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
}

fn create_zip_archive(file_path: &Path) -> Result<zip::ZipWriter<fs::File>, String> {
    let file = fs::File::create(file_path)
        .map_err(|error| format!("Failed to create ZIP {}: {error}", file_path.display()))?;
    Ok(zip::ZipWriter::new(file))
}

fn open_zip_archive(file_path: &Path) -> Result<zip::ZipArchive<fs::File>, String> {
    let file = fs::File::open(file_path)
        .map_err(|error| format!("Failed to open ZIP {}: {error}", file_path.display()))?;
    zip::ZipArchive::new(file)
        .map_err(|error| format!("Failed to read ZIP {}: {error}", file_path.display()))
}

fn add_file_to_zip<W: Write + Seek>(
    zip: &mut zip::ZipWriter<W>,
    source_path: &Path,
    archive_path: &str,
) -> Result<(), String> {
    zip.start_file(archive_path, zip_options())
        .map_err(|error| format!("Failed to add {archive_path} to ZIP: {error}"))?;

    let mut file = fs::File::open(source_path)
        .map_err(|error| format!("Failed to open {}: {error}", source_path.display()))?;
    std::io::copy(&mut file, zip)
        .map_err(|error| format!("Failed to write {archive_path} to ZIP: {error}"))?;

    Ok(())
}

fn add_dir_to_zip<W: Write + Seek>(
    zip: &mut zip::ZipWriter<W>,
    source_dir: &Path,
    archive_prefix: &str,
) -> Result<(), String> {
    let entries = fs::read_dir(source_dir)
        .map_err(|error| format!("Failed to read directory {}: {error}", source_dir.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read an entry inside {}: {error}",
                source_dir.display()
            )
        })?;
        let entry_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect {}: {error}", entry.path().display()))?;
        let entry_name = entry.file_name().to_string_lossy().replace('\\', "/");
        let archive_path = format!("{archive_prefix}/{entry_name}");

        if entry_type.is_dir() {
            add_dir_to_zip(zip, &entry.path(), &archive_path)?;
        } else if entry_type.is_file() {
            add_file_to_zip(zip, &entry.path(), &archive_path)?;
        }
    }

    Ok(())
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

    let mut zip = create_zip_archive(&output_path)?;
    zip.start_file("backup.json", zip_options())
        .map_err(|error| format!("Failed to add backup.json to ZIP: {error}"))?;
    zip.write_all(backup_json.as_bytes())
        .map_err(|error| format!("Failed to write backup.json to ZIP: {error}"))?;

    let assets_source = Path::new(&data_dir).join("assets");
    if assets_source.is_dir() {
        add_dir_to_zip(&mut zip, &assets_source, "assets")?;
    }

    zip.finish()
        .map_err(|error| format!("Failed to finalize ZIP backup: {error}"))?;

    Ok(())
}

#[tauri::command]
fn read_backup_zip(file_path: String) -> Result<BackupZipReadResult, String> {
    let zip_path = PathBuf::from(file_path);
    let mut archive = open_zip_archive(&zip_path)?;
    let mut backup_file = archive
        .by_name("backup.json")
        .map_err(|_| "Backup ZIP is missing backup.json".to_string())?;
    let mut backup_json = String::new();
    backup_file
        .read_to_string(&mut backup_json)
        .map_err(|error| format!("Failed to read backup.json from ZIP: {error}"))?;

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
    let mut archive = open_zip_archive(&zip_path)?;
    let mut asset_indexes = Vec::new();

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to inspect ZIP entry: {error}"))?;
        let entry = entry.name().to_string();

        if entry != "backup.json" && !archive_path_is_safe(&entry) {
            return Err(format!("Backup ZIP contains an unsafe path: {entry}"));
        }

        if entry.starts_with("assets/") {
            asset_indexes.push(index);
        }
    }

    if asset_indexes.is_empty() {
        return Ok(ExtractBackupAssetsResult { assets_restored: 0 });
    }

    let destination_assets = Path::new(&data_dir).join("assets");
    let mut assets_restored = 0;

    for index in asset_indexes {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read ZIP asset entry: {error}"))?;

        if entry.is_dir() {
            continue;
        }

        let entry_name = entry.name().to_string();
        let relative_path = entry_name.strip_prefix("assets/").unwrap_or_default();
        if relative_path.is_empty() {
            continue;
        }

        let destination_path = destination_assets.join(relative_path);
        if !overwrite && destination_path.exists() {
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

        let mut destination_file = fs::File::create(&destination_path).map_err(|error| {
            format!(
                "Failed to create restored asset {}: {error}",
                destination_path.display()
            )
        })?;
        std::io::copy(&mut entry, &mut destination_file).map_err(|error| {
            format!(
                "Failed to restore asset {}: {error}",
                destination_path.display()
            )
        })?;
        assets_restored += 1;
    }

    Ok(ExtractBackupAssetsResult { assets_restored })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedImage {
    name: String,
    size_bytes: u64,
    modified_ms: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FailedTrash {
    name: String,
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrashImagesResult {
    trashed: Vec<String>,
    skipped: Vec<String>,
    failed: Vec<FailedTrash>,
}

fn image_filename_is_safe(name: &str) -> bool {
    if name.is_empty() || name.starts_with('.') || name.contains('/') || name.contains('\\') {
        return false;
    }

    let mut components = Path::new(name).components();
    matches!(
        (components.next(), components.next()),
        (Some(Component::Normal(_)), None)
    )
}

fn system_time_to_epoch_ms(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
fn list_asset_images(data_dir: String) -> Result<Vec<ScannedImage>, String> {
    let images_dir = Path::new(&data_dir).join("assets").join("images");
    if !images_dir.is_dir() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&images_dir)
        .map_err(|error| format!("Failed to read directory {}: {error}", images_dir.display()))?;

    let mut images = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read an entry inside {}: {error}",
                images_dir.display()
            )
        })?;

        // Non-UTF-8 names cannot appear in the DB and cannot round-trip
        // through the frontend safely, so they are left untouched.
        let name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => continue,
        };
        if name.starts_with('.') {
            continue;
        }

        // symlink_metadata never follows links, so symlinks are skipped
        // instead of being resolved to whatever they point at.
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("Failed to inspect {}: {error}", entry.path().display()))?;
        if !metadata.is_file() {
            continue;
        }

        // If the mtime is unreadable, report "now" so the frontend's
        // recency guard errs on the side of keeping the file.
        let modified_ms = metadata
            .modified()
            .map(system_time_to_epoch_ms)
            .unwrap_or_else(|_| system_time_to_epoch_ms(SystemTime::now()));

        images.push(ScannedImage {
            name,
            size_bytes: metadata.len(),
            modified_ms,
        });
    }

    Ok(images)
}

fn move_path_to_trash(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use trash::TrashContext;
        use trash::macos::{DeleteMethod, TrashContextExtMacos};

        // NsFileManager avoids the "control Finder" automation prompt that
        // the default Finder-scripting method triggers. Files still land in
        // the Trash and are restorable; they only lack the "Put Back" item.
        let mut context = TrashContext::default();
        context.set_delete_method(DeleteMethod::NsFileManager);
        context
            .delete(path)
            .map_err(|error| format!("Failed to move {} to Trash: {error}", path.display()))
    }

    #[cfg(not(target_os = "macos"))]
    {
        trash::delete(path)
            .map_err(|error| format!("Failed to move {} to Trash: {error}", path.display()))
    }
}

#[tauri::command]
fn move_images_to_trash(
    data_dir: String,
    filenames: Vec<String>,
    referenced: Vec<String>,
    min_age_seconds: u64,
) -> Result<TrashImagesResult, String> {
    let images_root = fs::canonicalize(Path::new(&data_dir).join("assets").join("images"))
        .map_err(|error| format!("Failed to resolve the images directory: {error}"))?;
    if !images_root.is_dir() {
        return Err(format!(
            "{} is not a directory",
            images_root.display()
        ));
    }

    // Phase 1: validate every requested file before touching any of them.
    // A single suspicious name aborts the whole batch.
    let mut validated = Vec::with_capacity(filenames.len());
    for name in &filenames {
        if !image_filename_is_safe(name) {
            return Err(format!("Refusing to trash unsafe filename: {name}"));
        }

        let candidate = images_root.join(name);
        let metadata = fs::symlink_metadata(&candidate)
            .map_err(|error| format!("Failed to inspect {}: {error}", candidate.display()))?;
        if !metadata.is_file() {
            return Err(format!("Refusing to trash {name}: not a regular file"));
        }

        let canonical = fs::canonicalize(&candidate)
            .map_err(|error| format!("Failed to resolve {}: {error}", candidate.display()))?;
        if canonical.parent() != Some(images_root.as_path())
            || canonical.file_name() != Some(OsStr::new(name))
        {
            return Err(format!(
                "Refusing to trash {name}: it resolves outside the images directory"
            ));
        }

        validated.push((name.clone(), canonical));
    }

    let referenced: HashSet<String> = referenced
        .into_iter()
        .map(|name| name.to_lowercase())
        .collect();
    let min_age = Duration::from_secs(min_age_seconds);
    let now = SystemTime::now();

    let mut result = TrashImagesResult {
        trashed: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
    };

    // Phase 2: per-file guards, then trash. Never a permanent delete.
    for (name, path) in validated {
        // Backstop against frontend bugs: refuse anything the DB still references.
        if referenced.contains(&name.to_lowercase()) {
            result.skipped.push(name);
            continue;
        }

        // Re-stat: a file written moments ago may belong to an in-flight
        // save whose DB row doesn't exist yet. If the age can't be proven,
        // leave the file alone.
        let is_recent = match fs::symlink_metadata(&path).and_then(|m| m.modified()) {
            Ok(modified) => now
                .duration_since(modified)
                .map(|age| age < min_age)
                .unwrap_or(true),
            Err(_) => true,
        };
        if is_recent {
            result.skipped.push(name);
            continue;
        }

        match move_path_to_trash(&path) {
            Ok(()) => result.trashed.push(name),
            Err(error) => result.failed.push(FailedTrash { name, error }),
        }
    }

    Ok(result)
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
            apply_glass_style,
            create_backup_zip,
            read_backup_zip,
            extract_backup_assets,
            list_asset_images,
            move_images_to_trash
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Apply platform-native backdrop effects.
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
            }

            #[cfg(target_os = "windows")]
            {
                if let Err(error) = apply_windows_backdrop(&window, None) {
                    eprintln!("Failed to apply Windows backdrop: {error}");
                }
            }

            #[cfg(target_os = "macos")]
            {
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
                let go_backlog = MenuItemBuilder::new("Backlog")
                    .id("go_backlog")
                    .accelerator("CmdOrCtrl+8")
                    .build(app)?;
                let go_review = MenuItemBuilder::new("Review")
                    .id("go_review")
                    .accelerator("CmdOrCtrl+9")
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
                        &go_backlog,
                        &go_review,
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
                "go_backlog" => {
                    let _ = app.emit("menu-navigate", "/backlog");
                }
                "go_review" => {
                    let _ = app.emit("menu-navigate", "/review");
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
