#[cfg(target_os = "macos")]
mod glass;
mod mcp;

use same_file::Handle;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};

#[tauri::command]
fn apply_glass_style(
    window: tauri::WebviewWindow,
    style: String,
    mode: String,
) -> Result<(), String> {
    let normalized = style.trim().to_ascii_lowercase();

    #[cfg(target_os = "macos")]
    {
        use glass::GlassStyle;
        use window_vibrancy::{NSVisualEffectMaterial, apply_vibrancy};

        let _ = &mode;

        // macOS 26+ can switch between native liquid glass variants.
        if glass::is_supported() {
            let variant = if normalized == "clear" {
                GlassStyle::Clear
            } else {
                GlassStyle::Sidebar
            };

            glass::apply(&window, variant)?;
        } else {
            // Older macOS keeps the same vibrancy fallback regardless of selected style.
            apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = normalized;
        apply_windows_backdrop(&window, theme_mode_is_dark(&mode))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (window, normalized, mode);
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
fn apply_windows_backdrop(window: &tauri::WebviewWindow, dark: Option<bool>) -> Result<(), String> {
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
    cleanup_warnings: Vec<String>,
}

#[derive(Clone)]
struct ValidatedAssetEntry {
    index: usize,
    relative_path: PathBuf,
    is_dir: bool,
}

struct InspectedBackupArchive {
    backup_json_index: usize,
    assets: Vec<ValidatedAssetEntry>,
}

struct TemporaryDirectory {
    path: PathBuf,
    cleanup_on_drop: bool,
}

struct TemporaryBackupFile {
    path: PathBuf,
    file: Option<fs::File>,
    cleanup_on_drop: bool,
}

impl TemporaryBackupFile {
    fn new(parent: &Path) -> Result<Self, String> {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);

        for attempt in 0..1000_u16 {
            let path = parent.join(format!(
                ".media-logger-backup-{}-{nonce}-{attempt}.tmp",
                std::process::id()
            ));
            match fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create_new(true)
                .open(&path)
            {
                Ok(file) => {
                    return Ok(Self {
                        path,
                        file: Some(file),
                        cleanup_on_drop: true,
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    return Err(format!(
                        "Failed to create a temporary backup in {}: {error}",
                        parent.display()
                    ));
                }
            }
        }

        Err(format!(
            "Failed to allocate a temporary backup in {}",
            parent.display()
        ))
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn file(&self) -> &fs::File {
        self.file.as_ref().expect("temporary backup file is open")
    }

    fn file_mut(&mut self) -> &mut fs::File {
        self.file.as_mut().expect("temporary backup file is open")
    }

    fn persist(mut self, output_path: &Path) -> Result<(), String> {
        self.file.take();

        #[cfg(windows)]
        match fs::symlink_metadata(output_path) {
            Ok(metadata) if metadata.is_dir() => {
                return Err(format!(
                    "Backup destination is a directory: {}",
                    output_path.display()
                ));
            }
            Ok(_) => fs::remove_file(output_path).map_err(|error| {
                format!(
                    "Failed to replace existing backup {}: {error}",
                    output_path.display()
                )
            })?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Failed to inspect backup destination {}: {error}",
                    output_path.display()
                ));
            }
        }

        fs::rename(&self.path, output_path).map_err(|error| {
            format!(
                "Failed to publish ZIP backup to {}: {error}",
                output_path.display()
            )
        })?;
        self.cleanup_on_drop = false;
        Ok(())
    }
}

impl Drop for TemporaryBackupFile {
    fn drop(&mut self) {
        if self.cleanup_on_drop {
            let _ = fs::remove_file(&self.path);
        }
    }
}

impl TemporaryDirectory {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            cleanup_on_drop: true,
        }
    }

    fn disarm(&mut self) {
        self.cleanup_on_drop = false;
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        if self.cleanup_on_drop {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

static BACKUP_ASSET_EXTRACTION_LOCK: Mutex<()> = Mutex::new(());

fn zip_options() -> zip::write::SimpleFileOptions {
    zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated)
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
    excluded_files: &[PathBuf],
) -> Result<(), String> {
    let mut file = fs::File::open(source_path)
        .map_err(|error| format!("Failed to open {}: {error}", source_path.display()))?;
    let source_handle = Handle::from_file(file.try_clone().map_err(|error| {
        format!(
            "Failed to inspect the identity of {}: {error}",
            source_path.display()
        )
    })?)
    .map_err(|error| {
        format!(
            "Failed to inspect the identity of {}: {error}",
            source_path.display()
        )
    })?;

    for excluded_path in excluded_files {
        let excluded_handle = Handle::from_path(excluded_path).map_err(|error| {
            format!(
                "Failed to inspect excluded backup file {}: {error}",
                excluded_path.display()
            )
        })?;
        if source_handle == excluded_handle {
            return Ok(());
        }
    }

    zip.start_file(archive_path, zip_options())
        .map_err(|error| format!("Failed to add {archive_path} to ZIP: {error}"))?;
    std::io::copy(&mut file, zip)
        .map_err(|error| format!("Failed to write {archive_path} to ZIP: {error}"))?;

    Ok(())
}

fn add_dir_to_zip<W: Write + Seek>(
    zip: &mut zip::ZipWriter<W>,
    source_dir: &Path,
    archive_prefix: &str,
    excluded_files: &[PathBuf],
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
            add_dir_to_zip(zip, &entry.path(), &archive_path, excluded_files)?;
        } else if entry_type.is_file() {
            add_file_to_zip(zip, &entry.path(), &archive_path, excluded_files)?;
        }
    }

    Ok(())
}

fn archive_entry_name_is_canonical(name: &str, is_dir: bool) -> bool {
    if name.is_empty() || name.contains('\0') || name.contains('\\') || name.starts_with('/') {
        return false;
    }

    let path_without_directory_marker = if is_dir {
        match name.strip_suffix('/') {
            Some(path) if !path.is_empty() => path,
            _ => return false,
        }
    } else {
        name
    };

    path_without_directory_marker
        .split('/')
        .all(|component| !component.is_empty() && component != "." && component != "..")
}

fn zip_entry_is_expected_type(entry: &zip::read::ZipFile<'_>, is_dir: bool) -> bool {
    const UNIX_FILE_TYPE_MASK: u32 = 0o170000;
    const UNIX_DIRECTORY: u32 = 0o040000;
    const UNIX_REGULAR_FILE: u32 = 0o100000;

    if entry.is_symlink() {
        return false;
    }

    match entry.unix_mode().map(|mode| mode & UNIX_FILE_TYPE_MASK) {
        None | Some(0) => true,
        Some(UNIX_DIRECTORY) => is_dir,
        Some(UNIX_REGULAR_FILE) => !is_dir,
        Some(_) => false,
    }
}

fn register_asset_destination(
    destinations: &mut HashMap<PathBuf, bool>,
    relative_path: &Path,
    is_dir: bool,
) -> Result<(), String> {
    if destinations.contains_key(relative_path) {
        return Err(format!(
            "Backup ZIP contains duplicate asset path: {}",
            relative_path.display()
        ));
    }

    for ancestor in relative_path.ancestors().skip(1) {
        if ancestor.as_os_str().is_empty() {
            break;
        }
        if destinations.get(ancestor) == Some(&false) {
            return Err(format!(
                "Backup ZIP contains a file/directory conflict at {}",
                relative_path.display()
            ));
        }
    }

    if !is_dir
        && destinations
            .keys()
            .any(|existing| existing != relative_path && existing.starts_with(relative_path))
    {
        return Err(format!(
            "Backup ZIP contains a file/directory conflict at {}",
            relative_path.display()
        ));
    }

    destinations.insert(relative_path.to_path_buf(), is_dir);
    Ok(())
}

fn inspect_backup_archive<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
) -> Result<InspectedBackupArchive, String> {
    let mut backup_json_index = None;
    let mut assets = Vec::new();
    let mut destinations = HashMap::new();

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to inspect ZIP entry: {error}"))?;
        let name = entry.name();
        let is_dir = entry.is_dir();

        if !archive_entry_name_is_canonical(name, is_dir) {
            return Err(format!("Backup ZIP contains an unsafe path: {name:?}"));
        }
        if !zip_entry_is_expected_type(&entry, is_dir) {
            return Err(format!(
                "Backup ZIP contains a symlink or unsupported entry type: {name:?}"
            ));
        }

        let enclosed_path = entry
            .enclosed_name()
            .ok_or_else(|| format!("Backup ZIP contains an unsafe path: {name:?}"))?;

        if enclosed_path == Path::new("backup.json") {
            if is_dir {
                return Err("backup.json must be a regular file".to_string());
            }
            if backup_json_index.replace(index).is_some() {
                return Err("Backup ZIP contains more than one backup.json".to_string());
            }
            continue;
        }

        let relative_path = enclosed_path
            .strip_prefix(Path::new("assets"))
            .map_err(|_| format!("Backup ZIP contains an unexpected entry: {name:?}"))?;
        if relative_path.as_os_str().is_empty()
            || !relative_path
                .components()
                .all(|component| matches!(component, Component::Normal(_)))
        {
            return Err(format!(
                "Backup ZIP contains an unsafe asset path: {name:?}"
            ));
        }

        register_asset_destination(&mut destinations, relative_path, is_dir)?;
        assets.push(ValidatedAssetEntry {
            index,
            relative_path: relative_path.to_path_buf(),
            is_dir,
        });
    }

    let backup_json_index =
        backup_json_index.ok_or_else(|| "Backup ZIP is missing backup.json".to_string())?;

    Ok(InspectedBackupArchive {
        backup_json_index,
        assets,
    })
}

fn create_unique_staging_directory(data_root: &Path) -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    for attempt in 0..1000_u16 {
        let path = data_root.join(format!(
            ".media-logger-assets-staging-{}-{nonce}-{attempt}",
            std::process::id()
        ));
        match fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Failed to create asset staging directory {}: {error}",
                    path.display()
                ));
            }
        }
    }

    Err("Failed to allocate a unique asset staging directory".to_string())
}

fn ensure_canonical_containment(root: &Path, path: &Path) -> Result<(), String> {
    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("Failed to resolve {}: {error}", path.display()))?;
    if !canonical.starts_with(root) {
        return Err(format!(
            "Refusing a path outside its approved asset root: {}",
            path.display()
        ));
    }
    Ok(())
}

fn copy_regular_tree(
    source: &Path,
    destination: &Path,
    containment_root: &Path,
) -> Result<(), String> {
    let entries = fs::read_dir(source)
        .map_err(|error| format!("Failed to read directory {}: {error}", source.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read an entry inside {}: {error}",
                source.display()
            )
        })?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path)
            .map_err(|error| format!("Failed to inspect {}: {error}", source_path.display()))?;

        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Refusing to import while the existing assets tree contains a symlink: {}",
                source_path.display()
            ));
        }

        if metadata.is_dir() {
            fs::create_dir(&destination_path).map_err(|error| {
                format!(
                    "Failed to create staged directory {}: {error}",
                    destination_path.display()
                )
            })?;
            ensure_canonical_containment(containment_root, &destination_path)?;
            copy_regular_tree(&source_path, &destination_path, containment_root)?;
        } else if metadata.is_file() {
            let mut source_file = fs::File::open(&source_path)
                .map_err(|error| format!("Failed to open {}: {error}", source_path.display()))?;
            let mut destination_file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&destination_path)
                .map_err(|error| {
                    format!(
                        "Failed to create staged asset {}: {error}",
                        destination_path.display()
                    )
                })?;
            std::io::copy(&mut source_file, &mut destination_file).map_err(|error| {
                format!(
                    "Failed to copy existing asset {}: {error}",
                    source_path.display()
                )
            })?;
            ensure_canonical_containment(containment_root, &destination_path)?;
        } else {
            return Err(format!(
                "Refusing unsupported entry in the existing assets tree: {}",
                source_path.display()
            ));
        }
    }

    Ok(())
}

fn ensure_staged_directory(staging_root: &Path, relative_path: &Path) -> Result<PathBuf, String> {
    let mut current = staging_root.to_path_buf();

    for component in relative_path.components() {
        let Component::Normal(component) = component else {
            return Err(format!(
                "Refusing unsafe staged directory: {}",
                relative_path.display()
            ));
        };
        current.push(component);

        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!(
                    "Refusing staged symlink component: {}",
                    current.display()
                ));
            }
            Ok(metadata) if metadata.is_dir() => {}
            Ok(_) => {
                return Err(format!(
                    "A staged asset file conflicts with directory {}",
                    current.display()
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|create_error| {
                    format!(
                        "Failed to create staged directory {}: {create_error}",
                        current.display()
                    )
                })?;
            }
            Err(error) => {
                return Err(format!("Failed to inspect {}: {error}", current.display()));
            }
        }

        ensure_canonical_containment(staging_root, &current)?;
    }

    Ok(current)
}

fn validate_regular_tree(root: &Path, current: &Path) -> Result<(), String> {
    let entries = fs::read_dir(current)
        .map_err(|error| format!("Failed to read directory {}: {error}", current.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read an entry inside {}: {error}",
                current.display()
            )
        })?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;

        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Refusing symlink in asset tree: {}",
                path.display()
            ));
        }
        if !metadata.is_dir() && !metadata.is_file() {
            return Err(format!(
                "Refusing unsupported entry in asset tree: {}",
                path.display()
            ));
        }

        ensure_canonical_containment(root, &path)?;
        if metadata.is_dir() {
            validate_regular_tree(root, &path)?;
        }
    }

    Ok(())
}

fn overlay_backup_assets<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    assets: &[ValidatedAssetEntry],
    staging_root: &Path,
) -> Result<usize, String> {
    let mut assets_restored = 0;

    for asset in assets {
        if asset.is_dir {
            ensure_staged_directory(staging_root, &asset.relative_path)?;
            continue;
        }

        let parent = asset
            .relative_path
            .parent()
            .unwrap_or_else(|| Path::new(""));
        ensure_staged_directory(staging_root, parent)?;
        let destination_path = staging_root.join(&asset.relative_path);

        match fs::symlink_metadata(&destination_path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!(
                    "Refusing staged symlink destination: {}",
                    destination_path.display()
                ));
            }
            Ok(metadata) if metadata.is_file() => {
                fs::remove_file(&destination_path).map_err(|error| {
                    format!(
                        "Failed to replace staged asset {}: {error}",
                        destination_path.display()
                    )
                })?;
            }
            Ok(_) => {
                return Err(format!(
                    "A backup asset conflicts with existing directory {}",
                    destination_path.display()
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Failed to inspect staged asset {}: {error}",
                    destination_path.display()
                ));
            }
        }

        let mut destination_file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination_path)
            .map_err(|error| {
                format!(
                    "Failed to create staged asset {}: {error}",
                    destination_path.display()
                )
            })?;
        let mut entry = archive
            .by_index(asset.index)
            .map_err(|error| format!("Failed to read ZIP asset entry: {error}"))?;
        std::io::copy(&mut entry, &mut destination_file).map_err(|error| {
            format!(
                "Failed to stage backup asset {}: {error}",
                asset.relative_path.display()
            )
        })?;
        destination_file.flush().map_err(|error| {
            format!(
                "Failed to flush staged asset {}: {error}",
                destination_path.display()
            )
        })?;
        ensure_canonical_containment(staging_root, &destination_path)?;
        assets_restored += 1;
    }

    Ok(assets_restored)
}

fn inspect_existing_assets_root(data_root: &Path, assets_path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(assets_path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(format!(
            "Refusing symlink at the live assets root: {}",
            assets_path.display()
        )),
        Ok(metadata) if metadata.is_dir() => {
            ensure_canonical_containment(data_root, assets_path)?;
            let canonical_assets = fs::canonicalize(assets_path).map_err(|error| {
                format!(
                    "Failed to resolve the live assets directory {}: {error}",
                    assets_path.display()
                )
            })?;
            validate_regular_tree(&canonical_assets, &canonical_assets)?;
            Ok(true)
        }
        Ok(_) => Err(format!(
            "The live assets path is not a directory: {}",
            assets_path.display()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Failed to inspect the live assets path {}: {error}",
            assets_path.display()
        )),
    }
}

fn prepare_backup_destination(
    output_path: &Path,
) -> Result<(PathBuf, PathBuf, Option<PathBuf>), String> {
    let file_name = output_path.file_name().ok_or_else(|| {
        format!(
            "Backup destination must include a file name: {}",
            output_path.display()
        )
    })?;
    let requested_parent = output_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));

    fs::create_dir_all(requested_parent).map_err(|error| {
        format!(
            "Failed to prepare backup destination {}: {error}",
            requested_parent.display()
        )
    })?;
    let canonical_parent = fs::canonicalize(requested_parent).map_err(|error| {
        format!(
            "Failed to resolve backup destination {}: {error}",
            requested_parent.display()
        )
    })?;

    let canonical_output = canonical_parent.join(file_name);
    let resolved_existing_output = match fs::symlink_metadata(output_path) {
        Ok(_) => Some(fs::canonicalize(output_path).map_err(|error| {
            format!(
                "Failed to resolve existing backup destination {}: {error}",
                output_path.display()
            )
        })?),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return Err(format!(
                "Failed to inspect backup destination {}: {error}",
                output_path.display()
            ));
        }
    };

    Ok((canonical_parent, canonical_output, resolved_existing_output))
}

fn existing_file_is_regular(path: &Path) -> Result<bool, String> {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => Ok(true),
        Ok(_) => Err(format!(
            "Backup destination is not a regular file: {}",
            path.display()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Failed to inspect existing backup {}: {error}",
            path.display()
        )),
    }
}

#[tauri::command]
fn create_backup_zip(
    output_path: String,
    backup_json: String,
    data_dir: String,
) -> Result<(), String> {
    let output_path = PathBuf::from(output_path);
    let requested_data_root = PathBuf::from(data_dir);
    fs::create_dir_all(&requested_data_root).map_err(|error| {
        format!(
            "Failed to prepare data directory {}: {error}",
            requested_data_root.display()
        )
    })?;
    let canonical_data_root = fs::canonicalize(&requested_data_root).map_err(|error| {
        format!(
            "Failed to resolve data directory {}: {error}",
            requested_data_root.display()
        )
    })?;
    if !canonical_data_root.is_dir() {
        return Err(format!(
            "Data path is not a directory: {}",
            canonical_data_root.display()
        ));
    }

    let canonical_assets_location = canonical_data_root.join("assets");
    let canonical_assets_source = if canonical_assets_location.is_dir() {
        Some(
            fs::canonicalize(&canonical_assets_location).map_err(|error| {
                format!(
                    "Failed to resolve assets directory {}: {error}",
                    canonical_assets_location.display()
                )
            })?,
        )
    } else {
        None
    };
    let (canonical_output_parent, canonical_output, resolved_existing_output) =
        prepare_backup_destination(&output_path)?;
    let path_is_inside_assets = |path: &Path| {
        path.starts_with(&canonical_assets_location)
            || canonical_assets_source
                .as_ref()
                .is_some_and(|assets| path.starts_with(assets))
    };

    if path_is_inside_assets(&canonical_output)
        || resolved_existing_output
            .as_ref()
            .is_some_and(|output| path_is_inside_assets(output))
    {
        return Err(format!(
            "Refusing to save a backup inside the assets directory: {}",
            output_path.display()
        ));
    }

    let mut excluded_files = Vec::new();
    if existing_file_is_regular(&canonical_output)? {
        excluded_files.push(canonical_output.clone());
    }

    let mut temporary_backup = TemporaryBackupFile::new(&canonical_output_parent)?;
    let canonical_temporary_path = fs::canonicalize(temporary_backup.path()).map_err(|error| {
        format!(
            "Failed to resolve temporary backup {}: {error}",
            temporary_backup.path().display()
        )
    })?;
    if path_is_inside_assets(&canonical_temporary_path) {
        return Err(format!(
            "Refusing to create a temporary backup inside the assets directory: {}",
            temporary_backup.path().display()
        ));
    }
    excluded_files.push(temporary_backup.path().to_path_buf());

    {
        let mut zip = zip::ZipWriter::new(temporary_backup.file_mut());
        zip.start_file("backup.json", zip_options())
            .map_err(|error| format!("Failed to add backup.json to ZIP: {error}"))?;
        zip.write_all(backup_json.as_bytes())
            .map_err(|error| format!("Failed to write backup.json to ZIP: {error}"))?;

        if let Some(assets) = &canonical_assets_source {
            add_dir_to_zip(&mut zip, assets, "assets", &excluded_files)?;
        }

        zip.finish()
            .map_err(|error| format!("Failed to finalize ZIP backup: {error}"))?;
    }
    temporary_backup
        .file()
        .sync_all()
        .map_err(|error| format!("Failed to flush ZIP backup to disk: {error}"))?;
    temporary_backup.persist(&canonical_output)?;

    Ok(())
}

#[tauri::command]
fn read_backup_zip(file_path: String) -> Result<BackupZipReadResult, String> {
    let zip_path = PathBuf::from(file_path);
    let mut archive = open_zip_archive(&zip_path)?;
    let inspected = inspect_backup_archive(&mut archive)?;
    let mut backup_file = archive
        .by_index(inspected.backup_json_index)
        .map_err(|error| format!("Failed to read backup.json from ZIP: {error}"))?;
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
) -> Result<ExtractBackupAssetsResult, String> {
    let _extraction_guard = BACKUP_ASSET_EXTRACTION_LOCK
        .lock()
        .map_err(|_| "Backup asset extraction lock is unavailable".to_string())?;
    let zip_path = PathBuf::from(file_path);
    let mut archive = open_zip_archive(&zip_path)?;
    let inspected = inspect_backup_archive(&mut archive)?;

    if inspected.assets.is_empty() {
        return Ok(ExtractBackupAssetsResult {
            assets_restored: 0,
            cleanup_warnings: Vec::new(),
        });
    }

    let requested_data_root = PathBuf::from(data_dir);
    fs::create_dir_all(&requested_data_root).map_err(|error| {
        format!(
            "Failed to prepare data directory {}: {error}",
            requested_data_root.display()
        )
    })?;
    let data_root = fs::canonicalize(&requested_data_root).map_err(|error| {
        format!(
            "Failed to resolve data directory {}: {error}",
            requested_data_root.display()
        )
    })?;
    let data_root_metadata = fs::metadata(&data_root)
        .map_err(|error| format!("Failed to inspect {}: {error}", data_root.display()))?;
    if !data_root_metadata.is_dir() {
        return Err(format!(
            "Data path is not a directory: {}",
            data_root.display()
        ));
    }

    let destination_assets = data_root.join("assets");
    let assets_existed = inspect_existing_assets_root(&data_root, &destination_assets)?;

    let staging_path = create_unique_staging_directory(&data_root)?;
    let mut staging_guard = TemporaryDirectory::new(staging_path.clone());
    let staging_root = fs::canonicalize(&staging_path).map_err(|error| {
        format!(
            "Failed to resolve asset staging directory {}: {error}",
            staging_path.display()
        )
    })?;
    ensure_canonical_containment(&data_root, &staging_root)?;

    if assets_existed {
        copy_regular_tree(&destination_assets, &staging_root, &staging_root)?;
    }

    let assets_restored = overlay_backup_assets(&mut archive, &inspected.assets, &staging_root)?;
    validate_regular_tree(&staging_root, &staging_root)?;

    let mut cleanup_warnings = Vec::new();
    if assets_existed {
        // Revalidate immediately before publication. The live tree is never opened for
        // writing; it is moved aside as one directory and restored on publish failure.
        if !inspect_existing_assets_root(&data_root, &destination_assets)? {
            return Err("The live assets directory changed during backup import".to_string());
        }

        let mut rollback_name = staging_path
            .file_name()
            .ok_or_else(|| "Asset staging directory has no filename".to_string())?
            .to_os_string();
        rollback_name.push("-rollback");
        let rollback_path = data_root.join(rollback_name);
        match fs::symlink_metadata(&rollback_path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Ok(_) => {
                return Err(format!(
                    "Refusing occupied asset rollback path: {}",
                    rollback_path.display()
                ));
            }
            Err(error) => {
                return Err(format!(
                    "Failed to inspect asset rollback path {}: {error}",
                    rollback_path.display()
                ));
            }
        }

        fs::rename(&destination_assets, &rollback_path).map_err(|error| {
            format!("Failed to move the live assets tree to rollback storage: {error}")
        })?;

        if let Err(publish_error) = fs::rename(&staging_root, &destination_assets) {
            let restore_result = fs::rename(&rollback_path, &destination_assets);
            return match restore_result {
                Ok(()) => Err(format!(
                    "Failed to publish restored assets; the original assets were restored: {publish_error}"
                )),
                Err(restore_error) => Err(format!(
                    "Failed to publish restored assets ({publish_error}) and failed to restore the original assets from {} ({restore_error})",
                    rollback_path.display()
                )),
            };
        }
        staging_guard.disarm();

        if let Err(error) = fs::remove_dir_all(&rollback_path) {
            cleanup_warnings.push(format!(
                "Assets were restored, but the previous asset tree could not be removed from {}: {error}",
                rollback_path.display()
            ));
        }
    } else {
        match fs::symlink_metadata(&destination_assets) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Ok(_) => {
                return Err("The live assets path appeared during backup import".to_string());
            }
            Err(error) => {
                return Err(format!(
                    "Failed to recheck the live assets path {}: {error}",
                    destination_assets.display()
                ));
            }
        }

        fs::rename(&staging_root, &destination_assets).map_err(|error| {
            format!(
                "Failed to publish restored assets to {}: {error}",
                destination_assets.display()
            )
        })?;
        staging_guard.disarm();
    }

    Ok(ExtractBackupAssetsResult {
        assets_restored,
        cleanup_warnings,
    })
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

fn move_images_to_trash_blocking(
    data_dir: String,
    filenames: Vec<String>,
    referenced: Vec<String>,
    min_age_seconds: u64,
) -> Result<TrashImagesResult, String> {
    let images_root = fs::canonicalize(Path::new(&data_dir).join("assets").join("images"))
        .map_err(|error| format!("Failed to resolve the images directory: {error}"))?;
    if !images_root.is_dir() {
        return Err(format!("{} is not a directory", images_root.display()));
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

#[tauri::command]
async fn move_images_to_trash(
    data_dir: String,
    filenames: Vec<String>,
    referenced: Vec<String>,
    min_age_seconds: u64,
) -> Result<TrashImagesResult, String> {
    // Windows' Recycle Bin API is a blocking COM operation. Running it in a
    // synchronous Tauri command blocks the main event loop and can deadlock
    // the confirmation UI even after Explorer has moved the files.
    tauri::async_runtime::spawn_blocking(move || {
        move_images_to_trash_blocking(data_dir, filenames, referenced, min_age_seconds)
    })
    .await
    .map_err(|error| format!("The image cleanup worker failed: {error}"))?
}

// While the window is unfocused, WindowServer continuously recomposites a
// transparent window (~25-40% GPU utilization measured on macOS 26 even with
// fully static content). Making the window opaque whenever it loses focus
// stops that; transparency (and the glass look) is restored on focus.
#[cfg(target_os = "macos")]
fn set_native_window_opaque(window: &tauri::Window, opaque: bool) {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};

    let Ok(ns_ptr) = window.ns_window() else {
        return;
    };
    if ns_ptr.is_null() {
        return;
    }
    let ns_window = ns_ptr as *mut AnyObject;
    unsafe {
        let color: *mut AnyObject = if opaque {
            msg_send![class!(NSColor), blackColor]
        } else {
            msg_send![class!(NSColor), clearColor]
        };
        let _: () = msg_send![ns_window, setBackgroundColor: color];
        let _: () = msg_send![ns_window, setOpaque: opaque];
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            apply_glass_style,
            create_backup_zip,
            read_backup_zip,
            extract_backup_assets,
            list_asset_images,
            move_images_to_trash,
            mcp::mcp_get_status,
            mcp::mcp_sync_runtime,
            mcp::mcp_set_enabled,
            mcp::mcp_set_adult_opt_in,
            mcp::mcp_set_global_adult_policy,
            mcp::mcp_create_credential,
            mcp::mcp_revoke_credential,
            mcp::mcp_get_access_log,
            mcp::mcp_clear_access_log,
            mcp::mcp_suspend_runtime,
            mcp::mcp_choose_new_endpoint
        ])
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::Focused(focused) = event {
                set_native_window_opaque(window, !focused);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .setup(|app| {
            let mcp_config_dir = app.path().app_config_dir()?;
            let mcp_state =
                mcp::McpState::from_config_dir(mcp_config_dir).map_err(std::io::Error::other)?;
            app.manage(mcp_state);

            let window = app.get_webview_window("main").unwrap();

            // Apply platform-native backdrop effects.
            #[cfg(target_os = "macos")]
            {
                use glass::GlassStyle;
                use window_vibrancy::{NSVisualEffectMaterial, apply_vibrancy};

                // macOS 26+ gets Liquid Glass; older macOS keeps the existing vibrancy effect.
                if glass::is_supported() {
                    glass::apply(&window, GlassStyle::Sidebar)
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
