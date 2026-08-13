//! Synthetic performance corpus generation for the isolated performance app.
//!
//! This command deliberately has several independent safety gates. It derives
//! the destination from Tauri's `AppLocalData` resolver, refuses every bundle
//! identifier except the performance lab, validates the already-open database
//! against that exact directory, and has no caller-controlled output path.

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_sql::DbInstances;

const PERFORMANCE_IDENTIFIER: &str = "com.medialogger.perf";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceFixtureResult {
    preset: String,
    entries: usize,
    distinct_covers: usize,
    local_image_files: usize,
    missing_images: usize,
    corrupt_images: usize,
    profiles: usize,
    collections: usize,
    collection_items: usize,
    award_categories: usize,
    backlog_items: usize,
    bytes_written: u64,
    elapsed_ms: u128,
}

/// Build a deterministic corpus in the performance lab's own database.
///
/// `database_url` is not a destination. It is only accepted so the command can
/// use the pool already loaded by `tauri-plugin-sql`, and is rejected unless it
/// canonicalizes to `<appLocalDataDir>/media_logger.db` exactly.
#[tauri::command]
pub async fn generate_performance_fixture(
    app: AppHandle,
    preset: String,
    database_url: String,
    instances: State<'_, DbInstances>,
) -> Result<PerformanceFixtureResult, String> {
    if app.config().identifier != PERFORMANCE_IDENTIFIER {
        return Err(
            "Performance fixtures are available only in the isolated performance lab".to_string(),
        );
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = (preset, database_url, instances);
        Err("Performance fixture generation is disabled in release builds".to_string())
    }

    #[cfg(debug_assertions)]
    {
        implementation::generate(app, preset, database_url, &instances).await
    }
}

#[cfg(debug_assertions)]
mod implementation {
    use super::{PERFORMANCE_IDENTIFIER, PerformanceFixtureResult, generate_performance_fixture};
    use image::codecs::gif::{GifEncoder, Repeat};
    use image::codecs::jpeg::JpegEncoder;
    use image::codecs::png::PngEncoder;
    use image::codecs::webp::WebPEncoder;
    use image::{Delay, ExtendedColorType, Frame, ImageEncoder, Rgba, RgbaImage};
    use serde::Serialize;
    use sqlx::{QueryBuilder, Sqlite, SqlitePool};
    use std::collections::HashMap;
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::path::{Component, Path, PathBuf};
    use std::time::Instant;
    use tauri::{AppHandle, Emitter, Manager, State};
    use tauri_plugin_sql::{DbInstances, DbPool};

    const DATABASE_FILENAME: &str = "media_logger.db";
    const FIXTURE_PREFIX: &str = "__media_logger_perf_fixture_v1__";
    const SCHEMA_VERSION: i64 = 3;
    const ENTRY_INSERT_BATCH: usize = 32;
    const IMAGE_PROGRESS_BATCH: usize = 50;
    static FIXTURE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    #[derive(Debug, Clone, Copy)]
    enum FixturePreset {
        Small,
        Large,
    }

    impl FixturePreset {
        fn parse(value: &str) -> Result<Self, String> {
            match value.trim().to_ascii_lowercase().as_str() {
                "small" => Ok(Self::Small),
                "large" => Ok(Self::Large),
                _ => Err("Fixture preset must be exactly 'small' or 'large'".to_string()),
            }
        }

        fn name(self) -> &'static str {
            match self {
                Self::Small => "small",
                Self::Large => "large",
            }
        }

        fn entries(self) -> usize {
            match self {
                Self::Small => 1_000,
                Self::Large => 10_000,
            }
        }

        fn covers(self) -> usize {
            match self {
                Self::Small => 500,
                Self::Large => 5_000,
            }
        }

        fn collections(self) -> usize {
            match self {
                Self::Small => 12,
                Self::Large => 64,
            }
        }

        fn collection_items_per_collection(self) -> usize {
            match self {
                Self::Small => 90,
                Self::Large => 180,
            }
        }

        fn backlog_items(self) -> usize {
            match self {
                Self::Small => 200,
                Self::Large => 2_000,
            }
        }
    }

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureProgress {
        phase: &'static str,
        completed: usize,
        total: usize,
        message: &'static str,
    }

    #[derive(Default)]
    struct GeneratedAssets {
        files: usize,
        missing: usize,
        corrupt: usize,
        bytes: u64,
    }

    #[derive(Default)]
    struct DatabaseCounts {
        profiles: usize,
        collections: usize,
        collection_items: usize,
        award_categories: usize,
        backlog_items: usize,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    enum TemplateKind {
        Jpeg,
        AlphaPng,
        WebP,
        AnimatedGif,
        LargeJpeg,
        LargeAlphaPng,
        LargeWebP,
    }

    #[derive(Debug, Clone, Copy)]
    enum AssetCase {
        Missing,
        Corrupt,
        Image(TemplateKind),
    }

    struct FixturePaths {
        database: PathBuf,
        images: PathBuf,
    }

    struct EntryFixture {
        id: i64,
        name: String,
        genre: String,
        completion_date: String,
        review_score: Option<f64>,
        description: String,
        notes: String,
        year_completed: i64,
        is_rewatch: i64,
        own_local_copy: i64,
        has_subtitles: i64,
        is_platinum: i64,
        is_completed: i64,
        is_early_access: i64,
        early_access_version: Option<String>,
        image_url: String,
        entry_type: &'static str,
        platform: String,
        author: String,
        artist: String,
        director: String,
        actress: String,
        update_version: String,
        franchise: String,
        series: String,
    }

    pub(super) async fn generate(
        app: AppHandle,
        preset_value: String,
        database_url: String,
        instances: &State<'_, DbInstances>,
    ) -> Result<PerformanceFixtureResult, String> {
        let _guard = FIXTURE_LOCK.lock().await;
        let started = Instant::now();
        let preset = FixturePreset::parse(&preset_value)?;
        let paths = resolve_and_validate_paths(&app, &database_url)?;
        let pool = loaded_sqlite_pool(instances, &database_url).await?;
        verify_schema(&pool).await?;

        emit_progress(
            &app,
            "prepare",
            0,
            preset.covers(),
            "Preparing isolated fixture assets",
        );
        let image_app = app.clone();
        let image_root = paths.images.clone();
        let cover_count = preset.covers();
        let assets = tauri::async_runtime::spawn_blocking(move || {
            generate_assets(&image_app, &image_root, cover_count)
        })
        .await
        .map_err(|error| format!("The performance image worker failed: {error}"))??;

        // Revalidate the database after blocking work. A caller cannot redirect
        // the command, and replacing the expected file while generation runs is
        // treated as a hard failure rather than opening a new location.
        validate_database_url(&database_url, &paths.database)?;
        emit_progress(
            &app,
            "database",
            0,
            preset.entries(),
            "Writing the synthetic database",
        );
        let counts = populate_database(&app, &pool, preset).await?;

        emit_progress(
            &app,
            "complete",
            preset.entries(),
            preset.entries(),
            "Performance fixture is ready",
        );
        Ok(PerformanceFixtureResult {
            preset: preset.name().to_string(),
            entries: preset.entries(),
            distinct_covers: preset.covers(),
            local_image_files: assets.files,
            missing_images: assets.missing,
            corrupt_images: assets.corrupt,
            profiles: counts.profiles,
            collections: counts.collections,
            collection_items: counts.collection_items,
            award_categories: counts.award_categories,
            backlog_items: counts.backlog_items,
            bytes_written: assets.bytes,
            elapsed_ms: started.elapsed().as_millis(),
        })
    }

    fn emit_progress(
        app: &AppHandle,
        phase: &'static str,
        completed: usize,
        total: usize,
        message: &'static str,
    ) {
        let _ = app.emit(
            "performance-fixture-progress",
            FixtureProgress {
                phase,
                completed,
                total,
                message,
            },
        );
    }

    fn resolve_and_validate_paths(
        app: &AppHandle,
        database_url: &str,
    ) -> Result<FixturePaths, String> {
        if app.config().identifier != PERFORMANCE_IDENTIFIER {
            return Err("The active application is not the performance lab".to_string());
        }

        let requested_root = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("Failed to resolve performance app data: {error}"))?;
        fs::create_dir_all(&requested_root)
            .map_err(|error| format!("Failed to prepare performance app data: {error}"))?;
        reject_symlink_directory(&requested_root, "performance app data")?;
        let root = fs::canonicalize(&requested_root)
            .map_err(|error| format!("Failed to validate performance app data: {error}"))?;

        if root.file_name().and_then(|name| name.to_str()) != Some(PERFORMANCE_IDENTIFIER)
            || root
                .components()
                .any(|part| part.as_os_str() == "com.medialogger.data")
        {
            return Err(
                "Resolved appLocalDataDir does not belong exclusively to the performance lab"
                    .to_string(),
            );
        }

        let assets = root.join("assets");
        let images = assets.join("images");
        fs::create_dir_all(&images)
            .map_err(|error| format!("Failed to prepare fixture image storage: {error}"))?;
        reject_symlink_directory(&assets, "performance assets")?;
        reject_symlink_directory(&images, "performance fixture images")?;
        let canonical_images = fs::canonicalize(&images)
            .map_err(|error| format!("Failed to validate fixture image storage: {error}"))?;
        if !canonical_images.starts_with(&root) {
            return Err("Fixture image storage escapes the performance app directory".to_string());
        }

        let database = root.join(DATABASE_FILENAME);
        validate_database_url(database_url, &database)?;
        Ok(FixturePaths {
            database,
            images: canonical_images,
        })
    }

    fn reject_symlink_directory(path: &Path, label: &str) -> Result<(), String> {
        let metadata = fs::symlink_metadata(path)
            .map_err(|error| format!("Failed to inspect {label}: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
            return Err(format!(
                "{label} must be a regular directory, not a symlink"
            ));
        }
        Ok(())
    }

    fn validate_database_url(database_url: &str, expected: &Path) -> Result<(), String> {
        let raw_path = database_url
            .strip_prefix("sqlite:")
            .ok_or_else(|| "Performance database URL must use sqlite:".to_string())?;
        if raw_path.is_empty() || raw_path.contains('?') || raw_path.contains('#') {
            return Err("Performance database URL is not a canonical file URL".to_string());
        }
        let supplied = PathBuf::from(raw_path);
        if !supplied.is_absolute()
            || supplied
                .components()
                .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
        {
            return Err("Performance database path must be absolute and normalized".to_string());
        }

        let expected_metadata = fs::symlink_metadata(expected)
            .map_err(|_| "The migrated performance database must be loaded first".to_string())?;
        if !expected_metadata.file_type().is_file() || expected_metadata.file_type().is_symlink() {
            return Err("The performance database must be a regular, non-symlink file".to_string());
        }
        let supplied_metadata = fs::symlink_metadata(&supplied)
            .map_err(|_| "The supplied performance database is unavailable".to_string())?;
        if !supplied_metadata.file_type().is_file() || supplied_metadata.file_type().is_symlink() {
            return Err("The supplied performance database is not a regular file".to_string());
        }

        let expected_canonical = fs::canonicalize(expected)
            .map_err(|error| format!("Failed to validate the performance database: {error}"))?;
        let supplied_canonical = fs::canonicalize(&supplied)
            .map_err(|error| format!("Failed to validate the supplied database: {error}"))?;
        if supplied_canonical != expected_canonical || supplied != expected {
            return Err(
                "The loaded database is not the performance lab's canonical database".to_string(),
            );
        }
        Ok(())
    }

    async fn loaded_sqlite_pool(
        instances: &State<'_, DbInstances>,
        database_url: &str,
    ) -> Result<SqlitePool, String> {
        let databases = instances.0.read().await;
        match databases.get(database_url) {
            Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
            #[allow(unreachable_patterns)]
            Some(_) => Err("The performance database is not SQLite".to_string()),
            None => Err("The validated performance database is not loaded".to_string()),
        }
    }

    async fn verify_schema(pool: &SqlitePool) -> Result<(), String> {
        let version = sqlx::query_scalar::<_, i64>("PRAGMA user_version")
            .fetch_one(pool)
            .await
            .map_err(|error| format!("Failed to inspect fixture schema: {error}"))?;
        if version != SCHEMA_VERSION {
            return Err(format!(
                "Performance database schema must be migrated to v{SCHEMA_VERSION} before generating fixtures"
            ));
        }

        let fts_table = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'entries_fts'",
        )
        .fetch_one(pool)
        .await
        .map_err(|error| format!("Failed to inspect the FTS table: {error}"))?;
        let fts_triggers = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name IN ('entries_fts_ai', 'entries_fts_ad', 'entries_fts_au')",
        )
        .fetch_one(pool)
        .await
        .map_err(|error| format!("Failed to inspect FTS triggers: {error}"))?;
        if fts_table != 1 || fts_triggers != 3 {
            return Err("Performance database FTS5 migration is incomplete".to_string());
        }
        Ok(())
    }

    fn asset_case(index: usize) -> AssetCase {
        if index.is_multiple_of(997) {
            AssetCase::Missing
        } else if index.is_multiple_of(499) {
            AssetCase::Corrupt
        } else if index.is_multiple_of(263) {
            AssetCase::Image(TemplateKind::LargeWebP)
        } else if index.is_multiple_of(257) {
            AssetCase::Image(TemplateKind::LargeAlphaPng)
        } else if index.is_multiple_of(251) {
            AssetCase::Image(TemplateKind::LargeJpeg)
        } else {
            match index % 4 {
                0 => AssetCase::Image(TemplateKind::Jpeg),
                1 => AssetCase::Image(TemplateKind::AlphaPng),
                2 => AssetCase::Image(TemplateKind::WebP),
                _ => AssetCase::Image(TemplateKind::AnimatedGif),
            }
        }
    }

    fn asset_extension(case: AssetCase) -> &'static str {
        match case {
            AssetCase::Missing => "png",
            AssetCase::Corrupt => "jpg",
            AssetCase::Image(TemplateKind::Jpeg | TemplateKind::LargeJpeg) => "jpg",
            AssetCase::Image(TemplateKind::AlphaPng | TemplateKind::LargeAlphaPng) => "png",
            AssetCase::Image(TemplateKind::WebP | TemplateKind::LargeWebP) => "webp",
            AssetCase::Image(TemplateKind::AnimatedGif) => "gif",
        }
    }

    fn relative_cover_path(index: usize) -> String {
        let extension = asset_extension(asset_case(index));
        format!("images/{FIXTURE_PREFIX}cover-{index:05}.{extension}")
    }

    fn cleanup_prior_assets(images: &Path) -> Result<(), String> {
        for entry in fs::read_dir(images)
            .map_err(|error| format!("Failed to inspect prior fixture images: {error}"))?
        {
            let entry = entry
                .map_err(|error| format!("Failed to inspect a prior fixture image: {error}"))?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if !name.starts_with(FIXTURE_PREFIX) {
                continue;
            }
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("Failed to validate a prior fixture asset: {error}"))?;
            if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
                return Err(
                    "Refusing to remove an unexpected prefixed fixture filesystem entry"
                        .to_string(),
                );
            }
            fs::remove_file(entry.path())
                .map_err(|error| format!("Failed to remove a prior fixture asset: {error}"))?;
        }
        Ok(())
    }

    fn generate_assets(
        app: &AppHandle,
        images: &Path,
        cover_count: usize,
    ) -> Result<GeneratedAssets, String> {
        cleanup_prior_assets(images)?;
        let mut output = GeneratedAssets::default();
        let mut templates: HashMap<(TemplateKind, u8), Vec<u8>> = HashMap::new();

        for index in 0..cover_count {
            let case = asset_case(index);
            match case {
                AssetCase::Missing => output.missing += 1,
                AssetCase::Corrupt => {
                    let relative = relative_cover_path(index);
                    let filename = Path::new(&relative)
                        .file_name()
                        .ok_or_else(|| "Fixture image name is invalid".to_string())?;
                    let path = images.join(filename);
                    let bytes = format!(
                        "MEDIA LOGGER PERFORMANCE FIXTURE - INTENTIONALLY CORRUPT - {index:05}"
                    );
                    write_new_file(&path, bytes.as_bytes())?;
                    output.files += 1;
                    output.corrupt += 1;
                    output.bytes += bytes.len() as u64;
                }
                AssetCase::Image(kind) => {
                    let seed = if matches!(
                        kind,
                        TemplateKind::LargeJpeg
                            | TemplateKind::LargeAlphaPng
                            | TemplateKind::LargeWebP
                    ) {
                        0
                    } else {
                        (index % 8) as u8
                    };
                    let bytes = match templates.get(&(kind, seed)) {
                        Some(existing) => existing.clone(),
                        None => {
                            let encoded = encode_template(kind, seed)?;
                            templates.insert((kind, seed), encoded.clone());
                            encoded
                        }
                    };
                    let relative = relative_cover_path(index);
                    let filename = Path::new(&relative)
                        .file_name()
                        .ok_or_else(|| "Fixture image name is invalid".to_string())?;
                    write_new_file(&images.join(filename), &bytes)?;
                    output.files += 1;
                    output.bytes += bytes.len() as u64;
                }
            }

            let completed = index + 1;
            if completed % IMAGE_PROGRESS_BATCH == 0 || completed == cover_count {
                emit_progress(
                    app,
                    "images",
                    completed,
                    cover_count,
                    "Generating deterministic source images",
                );
            }
        }
        Ok(output)
    }

    fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|error| format!("Failed to create a fixture image: {error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("Failed to write a fixture image: {error}"))?;
        Ok(())
    }

    fn patterned_rgba(width: u32, height: u32, seed: u8, alpha: bool) -> RgbaImage {
        RgbaImage::from_fn(width, height, |x, y| {
            let band = ((x / 64) + (y / 96) + u32::from(seed)) % 6;
            let accent = ((x.wrapping_mul(3) + y.wrapping_mul(5)) % 71) as u8;
            let base = u16::from(seed) * 23;
            let red = ((base + u16::from(accent) + band as u16 * 29) % 256) as u8;
            let green = ((42 + base * 2 + band as u16 * 37) % 256) as u8;
            let blue = ((91 + base * 3 + u16::from(accent) * 2) % 256) as u8;
            let opacity = if alpha {
                if (x / 80 + y / 80) % 5 == 0 { 72 } else { 220 }
            } else {
                255
            };
            Rgba([red, green, blue, opacity])
        })
    }

    fn encode_template(kind: TemplateKind, seed: u8) -> Result<Vec<u8>, String> {
        let (width, height, alpha) = match kind {
            TemplateKind::Jpeg | TemplateKind::WebP => (768, 1_152, false),
            TemplateKind::AlphaPng => (768, 1_152, true),
            TemplateKind::AnimatedGif => (384, 576, true),
            TemplateKind::LargeJpeg | TemplateKind::LargeWebP => (1_800, 2_700, false),
            TemplateKind::LargeAlphaPng => (1_600, 2_400, true),
        };
        let pixels = patterned_rgba(width, height, seed, alpha);
        let mut encoded = Vec::new();
        match kind {
            TemplateKind::Jpeg | TemplateKind::LargeJpeg => {
                let rgb = image::DynamicImage::ImageRgba8(pixels).to_rgb8();
                JpegEncoder::new_with_quality(&mut encoded, 92)
                    .write_image(rgb.as_raw(), width, height, ExtendedColorType::Rgb8)
                    .map_err(|error| format!("Failed to encode fixture JPEG: {error}"))?;
            }
            TemplateKind::AlphaPng | TemplateKind::LargeAlphaPng => {
                PngEncoder::new(&mut encoded)
                    .write_image(pixels.as_raw(), width, height, ExtendedColorType::Rgba8)
                    .map_err(|error| format!("Failed to encode fixture PNG: {error}"))?;
            }
            TemplateKind::WebP | TemplateKind::LargeWebP => {
                WebPEncoder::new_lossless(&mut encoded)
                    .write_image(pixels.as_raw(), width, height, ExtendedColorType::Rgba8)
                    .map_err(|error| format!("Failed to encode fixture WebP: {error}"))?;
            }
            TemplateKind::AnimatedGif => {
                let mut second = pixels.clone();
                for pixel in second.pixels_mut() {
                    pixel.0.swap(0, 2);
                }
                let mut encoder = GifEncoder::new(&mut encoded);
                encoder
                    .set_repeat(Repeat::Infinite)
                    .map_err(|error| format!("Failed to configure fixture GIF: {error}"))?;
                encoder
                    .encode_frames([
                        Frame::from_parts(pixels, 0, 0, Delay::from_numer_denom_ms(140, 1)),
                        Frame::from_parts(second, 0, 0, Delay::from_numer_denom_ms(140, 1)),
                    ])
                    .map_err(|error| format!("Failed to encode fixture GIF: {error}"))?;
            }
        }
        Ok(encoded)
    }

    fn long_payload(label: &str, index: usize) -> String {
        let sentence = format!(
            "Synthetic {label} segment {index:05} exercises long text rendering, wrapping, searching, and dialog layout without containing user data. "
        );
        sentence.repeat(18)
    }

    fn entry_fixture(index: usize, cover_count: usize) -> EntryFixture {
        const TYPES: [&str; 11] = [
            "Movie",
            "Show",
            "Anime",
            "Book",
            "Album",
            "K-Drama",
            "JAV",
            "Hentai",
            "Game",
            "Adult Visual Novel",
            "Other",
        ];
        const GENRES: [&str; 8] = [
            "Drama, Mystery",
            "Action, Adventure",
            "Science Fiction, Thriller",
            "Comedy, Slice of Life",
            "Fantasy, Romance",
            "Documentary",
            "Horror, Psychological",
            "Strategy, Simulation",
        ];
        let year = 2017 + (index % 10) as i64;
        let month = 1 + ((index / 28) % 12);
        let day = 1 + (index % 28);
        let description = if index.is_multiple_of(17) {
            long_payload("description", index)
        } else {
            format!("Deterministic synthetic description for performance entry {index:05}.")
        };
        let notes = if index.is_multiple_of(29) {
            long_payload("notes", index)
        } else {
            format!("Synthetic fixture note {index:05}; safe to copy and discard.")
        };
        EntryFixture {
            id: (index + 1) as i64,
            name: if index.is_multiple_of(43) {
                format!(
                    "Performance Fixture Entry {index:05} — An Intentionally Very Long Media Title for Truncation and Layout Measurement"
                )
            } else {
                format!("Performance Fixture Entry {index:05}")
            },
            genre: GENRES[index % GENRES.len()].to_string(),
            completion_date: format!("{year:04}-{month:02}-{day:02}"),
            review_score: (!index.is_multiple_of(9)).then(|| 3.0 + (index % 71) as f64 / 10.0),
            description,
            notes,
            year_completed: year,
            is_rewatch: i64::from(index.is_multiple_of(7)),
            own_local_copy: i64::from(index.is_multiple_of(3)),
            has_subtitles: i64::from(index.is_multiple_of(2)),
            is_platinum: i64::from(index.is_multiple_of(41)),
            is_completed: i64::from(!index.is_multiple_of(23)),
            is_early_access: i64::from(index.is_multiple_of(37)),
            early_access_version: index
                .is_multiple_of(37)
                .then(|| format!("0.{}.{}", index % 10, index % 7)),
            image_url: relative_cover_path(index % cover_count),
            entry_type: TYPES[index % TYPES.len()],
            platform: format!("Platform {:02}", index % 12),
            author: format!("Author {:02}", index % 30),
            artist: format!("Artist {:02}", index % 35),
            director: format!("Director {:02}", index % 40),
            actress: format!(
                "Performer {:02}, Performer {:02}",
                index % 70,
                (index + 13) % 70
            ),
            update_version: format!("4.0.{}", index % 12),
            franchise: format!("Franchise {:02}", index % 24),
            series: format!("Series {:02}", index % 28),
        }
    }

    async fn populate_database(
        app: &AppHandle,
        pool: &SqlitePool,
        preset: FixturePreset,
    ) -> Result<DatabaseCounts, String> {
        let mut tx = pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(|error| format!("Failed to begin fixture transaction: {error}"))?;
        let result = async {
            for table in [
                "profile_avg_history",
                "hidden_profiles",
                "profiles",
                "award_winners",
                "award_categories",
                "award_years",
                "award_templates",
                "collection_items",
                "collection_eras",
                "collections",
                "backlog_items",
                "entries",
            ] {
                let query = format!("DELETE FROM {table}");
                sqlx::query(&query)
                    .execute(&mut *tx)
                    .await
                    .map_err(|error| format!("Failed to reset fixture table {table}: {error}"))?;
            }
            sqlx::query(
                "DELETE FROM sqlite_sequence WHERE name IN ('entries','collections','collection_items','collection_eras','award_templates','award_categories','backlog_items')",
            )
            .execute(&mut *tx)
            .await
            .map_err(|error| format!("Failed to reset fixture identifiers: {error}"))?;

            insert_entries(app, &mut tx, preset).await?;
            let profiles = insert_profiles(&mut tx, preset).await?;
            let (collections, collection_items) = insert_collections(&mut tx, preset).await?;
            let award_categories = insert_awards(&mut tx, preset).await?;
            let backlog_items = insert_backlog(&mut tx, preset).await?;

            // The insert/delete triggers maintain FTS incrementally. Rebuild once
            // inside the same transaction as a consistency assertion for a corpus
            // intended specifically to benchmark search.
            sqlx::query("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")
                .execute(&mut *tx)
                .await
                .map_err(|error| format!("Failed to rebuild fixture search index: {error}"))?;

            Ok::<DatabaseCounts, String>(DatabaseCounts {
                profiles,
                collections,
                collection_items,
                award_categories,
                backlog_items,
            })
        }
        .await;

        let counts = match result {
            Ok(counts) => counts,
            Err(error) => {
                return match tx.rollback().await {
                    Ok(()) => Err(error),
                    Err(rollback_error) => Err(format!(
                        "{error}; fixture rollback also failed: {rollback_error}"
                    )),
                };
            }
        };
        tx.commit()
            .await
            .map_err(|error| format!("Failed to commit fixture transaction: {error}"))?;

        // Recommended after a bulk import; this does not change durability.
        sqlx::query("PRAGMA optimize")
            .execute(pool)
            .await
            .map_err(|error| format!("Failed to optimize the fixture database: {error}"))?;
        Ok(counts)
    }

    async fn insert_entries(
        app: &AppHandle,
        tx: &mut sqlx::Transaction<'_, Sqlite>,
        preset: FixturePreset,
    ) -> Result<(), String> {
        let entry_count = preset.entries();
        for start in (0..entry_count).step_by(ENTRY_INSERT_BATCH) {
            let end = (start + ENTRY_INSERT_BATCH).min(entry_count);
            let fixtures = (start..end)
                .map(|index| entry_fixture(index, preset.covers()))
                .collect::<Vec<_>>();
            let mut query = QueryBuilder::<Sqlite>::new(
                "INSERT INTO entries (id,name,genre,completion_date,review_score,description,notes,year_completed,is_rewatch,own_local_copy,has_subtitles,is_platinum,is_completed,is_early_access,early_access_version,image_url,entry_type,platform,author,artist,director,actress,update_version,franchise,series) ",
            );
            query.push_values(fixtures, |mut row, entry| {
                row.push_bind(entry.id)
                    .push_bind(entry.name)
                    .push_bind(entry.genre)
                    .push_bind(entry.completion_date)
                    .push_bind(entry.review_score)
                    .push_bind(entry.description)
                    .push_bind(entry.notes)
                    .push_bind(entry.year_completed)
                    .push_bind(entry.is_rewatch)
                    .push_bind(entry.own_local_copy)
                    .push_bind(entry.has_subtitles)
                    .push_bind(entry.is_platinum)
                    .push_bind(entry.is_completed)
                    .push_bind(entry.is_early_access)
                    .push_bind(entry.early_access_version)
                    .push_bind(entry.image_url)
                    .push_bind(entry.entry_type)
                    .push_bind(entry.platform)
                    .push_bind(entry.author)
                    .push_bind(entry.artist)
                    .push_bind(entry.director)
                    .push_bind(entry.actress)
                    .push_bind(entry.update_version)
                    .push_bind(entry.franchise)
                    .push_bind(entry.series);
            });
            query
                .build()
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert fixture entries: {error}"))?;
            if end.is_multiple_of(320) || end == entry_count {
                emit_progress(
                    app,
                    "database",
                    end,
                    entry_count,
                    "Writing synthetic media entries",
                );
            }
        }
        Ok(())
    }

    async fn insert_profiles(
        tx: &mut sqlx::Transaction<'_, Sqlite>,
        preset: FixturePreset,
    ) -> Result<usize, String> {
        let groups = [
            ("director", "Director", 40_usize),
            ("actress", "Performer", 70),
            ("artist", "Artist", 35),
            ("author", "Author", 30),
            ("platform", "Platform", 12),
            ("franchise", "Franchise", 24),
            ("series", "Series", 28),
        ];
        let mut inserted = 0;
        for (profile_type, label, count) in groups {
            for index in 0..count {
                let name = format!("{label} {index:02}");
                let crop = index.is_multiple_of(4).then(|| {
                    format!(
                        "{{\"x\":{},\"y\":{},\"scale\":1.{},\"fit\":\"cover\"}}",
                        35 + index % 30,
                        40 + index % 20,
                        index % 5
                    )
                });
                let tracked = i64::from(index.is_multiple_of(5));
                sqlx::query(
                    "INSERT INTO profiles (type,name,image_url,crop_data,track_avg_history) VALUES (?,?,?,?,?)",
                )
                .bind(profile_type)
                .bind(&name)
                .bind(relative_cover_path((inserted * 19) % preset.covers()))
                .bind(crop)
                .bind(tracked)
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert fixture profiles: {error}"))?;

                if tracked == 1 {
                    for point in 0..3 {
                        sqlx::query(
                            "INSERT INTO profile_avg_history (type,name,captured_at,average_score,rated_count,total_count,source) VALUES (?,?,?,?,?,?,?)",
                        )
                        .bind(profile_type)
                        .bind(&name)
                        .bind(format!("202{}-0{}-15T12:00:00Z", 4 + point, point + 1))
                        .bind(6.5 + point as f64 * 0.35 + (index % 4) as f64 * 0.1)
                        .bind(12 + point as i64 * 5)
                        .bind(15 + point as i64 * 6)
                        .bind("performance_fixture")
                        .execute(&mut **tx)
                        .await
                        .map_err(|error| {
                            format!("Failed to insert fixture profile history: {error}")
                        })?;
                    }
                }
                inserted += 1;
            }
        }

        for (profile_type, name) in [
            ("director", "Director 39"),
            ("actress", "Performer 69"),
            ("artist", "Artist 34"),
        ] {
            sqlx::query("INSERT INTO hidden_profiles (type,name,hidden_date) VALUES (?,?,?)")
                .bind(profile_type)
                .bind(name)
                .bind("2026-01-02T12:00:00Z")
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert hidden fixture profiles: {error}"))?;
        }
        Ok(inserted)
    }

    async fn insert_collections(
        tx: &mut sqlx::Transaction<'_, Sqlite>,
        preset: FixturePreset,
    ) -> Result<(usize, usize), String> {
        let collection_count = preset.collections();
        let items_per_collection = preset.collection_items_per_collection();
        let mut era_id = 1_i64;
        let mut item_id = 1_i64;
        for collection_index in 0..collection_count {
            let collection_id = (collection_index + 1) as i64;
            sqlx::query(
                "INSERT INTO collections (id,name,description,created_date,sort_order) VALUES (?,?,?,?,?)",
            )
            .bind(collection_id)
            .bind(format!(
                "Performance Collection {:02}",
                collection_index + 1
            ))
            .bind(if collection_index.is_multiple_of(7) {
                long_payload("collection description", collection_index)
            } else {
                "Synthetic collection for virtualization and mosaic loading.".to_string()
            })
            .bind("2026-01-01T09:00:00Z")
            .bind(collection_index as i64)
            .execute(&mut **tx)
            .await
            .map_err(|error| format!("Failed to insert fixture collections: {error}"))?;

            let first_era_id = era_id;
            for era_index in 0..4 {
                sqlx::query(
                    "INSERT INTO collection_eras (id,collection_id,name,color,sort_order,created_date) VALUES (?,?,?,?,?,?)",
                )
                .bind(era_id)
                .bind(collection_id)
                .bind(format!("Era {}", era_index + 1))
                .bind(["#f59e0b", "#8b5cf6", "#06b6d4", "#ef4444"][era_index])
                .bind(era_index as i64)
                .bind("2026-01-01T09:00:00Z")
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert fixture collection eras: {error}"))?;
                era_id += 1;
            }

            for position in 0..items_per_collection {
                let media_index = (collection_index * 137 + position * 17) % preset.entries();
                let bracket = position * 4 / items_per_collection;
                sqlx::query(
                    "INSERT INTO collection_items (id,collection_id,media_id,sort_order,era_id) VALUES (?,?,?,?,?)",
                )
                .bind(item_id)
                .bind(collection_id)
                .bind((media_index + 1) as i64)
                .bind(position as i64)
                .bind(first_era_id + bracket as i64)
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert fixture collection items: {error}"))?;
                item_id += 1;
            }
        }
        Ok((collection_count, collection_count * items_per_collection))
    }

    async fn insert_awards(
        tx: &mut sqlx::Transaction<'_, Sqlite>,
        preset: FixturePreset,
    ) -> Result<usize, String> {
        const CATEGORIES: [&str; 12] = [
            "Best Picture",
            "Best Direction",
            "Best Performance",
            "Best Writing",
            "Best Art",
            "Best Music",
            "Best Game",
            "Best Series",
            "Best Debut",
            "Best Rewatch",
            "Biggest Surprise",
            "Personal Favourite",
        ];
        for (index, category) in CATEGORIES.iter().enumerate() {
            sqlx::query("INSERT INTO award_templates (id,name,created_date) VALUES (?,?,?)")
                .bind((index + 1) as i64)
                .bind(category)
                .bind("2026-01-01T10:00:00Z")
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert fixture award templates: {error}"))?;
        }

        let mut category_id = 1_i64;
        for year in 2017_i64..=2026 {
            sqlx::query("INSERT INTO award_years (year,created_date) VALUES (?,?)")
                .bind(year)
                .bind("2026-01-01T10:00:00Z")
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert fixture award years: {error}"))?;
            for (order, category) in CATEGORIES.iter().enumerate() {
                sqlx::query(
                    "INSERT INTO award_categories (id,year,name,created_date,sort_order,template_id) VALUES (?,?,?,?,?,?)",
                )
                .bind(category_id)
                .bind(year)
                .bind(category)
                .bind("2026-01-01T10:00:00Z")
                .bind(order as i64)
                .bind((order + 1) as i64)
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert fixture award categories: {error}"))?;
                let media_id =
                    1 + (((year as usize - 2017) * 97 + order * 31) % preset.entries()) as i64;
                sqlx::query(
                    "INSERT INTO award_winners (category_id,media_id,selected_date) VALUES (?,?,?)",
                )
                .bind(category_id)
                .bind(media_id)
                .bind(format!("{year}-12-31T20:00:00Z"))
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("Failed to insert fixture award winners: {error}"))?;
                category_id += 1;
            }
        }
        Ok((category_id - 1) as usize)
    }

    async fn insert_backlog(
        tx: &mut sqlx::Transaction<'_, Sqlite>,
        preset: FixturePreset,
    ) -> Result<usize, String> {
        const STATUSES: [&str; 3] = ["planning", "in_progress", "unreleased"];
        const TYPES: [&str; 8] = [
            "Movie", "Show", "Anime", "Book", "Album", "K-Drama", "Game", "Other",
        ];
        let count = preset.backlog_items();
        for index in 0..count {
            let status = STATUSES[index % STATUSES.len()];
            sqlx::query(
                "INSERT INTO backlog_items (id,name,entry_type,genre,image_url,status,added_date,sort_order,release_date) VALUES (?,?,?,?,?,?,?,?,?)",
            )
            .bind((index + 1) as i64)
            .bind(format!("Performance Backlog Item {index:05}"))
            .bind(TYPES[index % TYPES.len()])
            .bind(if index.is_multiple_of(2) { "Drama" } else { "Adventure" })
            .bind(if index.is_multiple_of(127) {
                Some(format!("https://example.invalid/performance-cover-{index}.jpg"))
            } else {
                Some(relative_cover_path((index * 23) % preset.covers()))
            })
            .bind(status)
            .bind(format!("2026-{:02}-{:02}T12:00:00Z", 1 + index % 8, 1 + index % 28))
            .bind((index / STATUSES.len()) as i64)
            .bind((status == "unreleased").then(|| {
                format!("2027-{:02}-{:02}", 1 + index % 12, 1 + index % 28)
            }))
            .execute(&mut **tx)
            .await
            .map_err(|error| format!("Failed to insert fixture backlog: {error}"))?;
        }
        Ok(count)
    }

    // Keep the generated Tauri command module referenced in debug builds. This
    // makes accidental command renames a compile error when the handler is wired.
    #[allow(dead_code)]
    fn command_symbol_check() {
        let _ = generate_performance_fixture;
    }
}
