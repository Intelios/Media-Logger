use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use image::{
    DynamicImage, ExtendedColorType, ImageDecoder, ImageEncoder, ImageFormat, ImageReader, Limits,
    imageops::FilterType,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, BufWriter, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock, Weak};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::http::{
    Method, Request, Response, StatusCode,
    header::{
        ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE, ETAG,
        IF_NONE_MATCH,
    },
};
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex as AsyncMutex, Semaphore};
use uuid::Uuid;

const PROTOCOL_VERSION: &str = "v1";
const RECIPE_VERSION: u32 = 1;
const GENERATION_CONCURRENCY: usize = 2;
const DEFAULT_MEMORY_LIMIT_BYTES: u64 = 128 * 1024 * 1024;
const DEFAULT_DISK_LIMIT_BYTES: u64 = 3 * 1024 * 1024 * 1024;
const DISK_CLEANUP_TARGET_PERCENT: u64 = 90;
const MAX_IMAGE_DIMENSION: u32 = 32_768;
const MAX_IMAGE_PIXELS: u64 = 100_000_000;
const MAX_DECODE_ALLOCATION: u64 = 512 * 1024 * 1024;
const LEGACY_THUMBNAIL_NAMESPACE: &str = "cover-thumbnails";

/// Bumped whenever the palette recipe changes, so cached colours from an older
/// clustering or clamping pass are ignored rather than re-served.
const PALETTE_VERSION: u32 = 1;
/// The palette is clustered from a thumbnail of the `small` derivative. 32x48
/// is ~1.5k pixels: enough for k-means to find the real print colours, small
/// enough that a whole backlog costs less than one full-size decode.
const PALETTE_SAMPLE_WIDTH: u32 = 32;
const PALETTE_SAMPLE_HEIGHT: u32 = 48;
const PALETTE_CLUSTERS: usize = 5;
const PALETTE_ITERATIONS: usize = 12;

#[derive(Clone)]
pub struct ImageService {
    inner: Arc<ImageServiceInner>,
}

struct ImageServiceInner {
    cache_root: PathBuf,
    legacy_thumbnail_root: PathBuf,
    state: RwLock<ServiceState>,
    transition: AsyncMutex<()>,
    generation_slots: Arc<Semaphore>,
    in_flight: Mutex<HashMap<String, Weak<AsyncMutex<()>>>>,
    memory: Mutex<EncodedMemoryCache>,
    /// Extracted cover palettes, keyed by palette cache key. A palette is three
    /// hex strings, so this is unbounded on purpose — an entire library of them
    /// is a few tens of kilobytes.
    palettes: Mutex<HashMap<String, CoverPalette>>,
    staged: Mutex<HashMap<String, StagedImport>>,
    disk_entries: AtomicU64,
    disk_bytes: AtomicU64,
    cleanup_running: AtomicBool,
    legacy_thumbnail_cleanup_started: AtomicBool,
}

#[derive(Clone)]
struct ConfiguredRoot {
    data_root: PathBuf,
    assets_root: PathBuf,
    staging_root: PathBuf,
    generation: u64,
    disk_limit_bytes: u64,
}

#[derive(Default)]
struct ServiceState {
    configured: Option<ConfiguredRoot>,
    last_generation: u64,
}

struct EncodedMemoryCache {
    entries: HashMap<String, MemoryEntry>,
    bytes: u64,
    limit_bytes: u64,
    clock: u64,
}

struct MemoryEntry {
    bytes: Arc<Vec<u8>>,
    content_type: &'static str,
    etag: String,
    last_used: u64,
}

#[derive(Clone)]
struct LoadedAsset {
    bytes: Arc<Vec<u8>>,
    content_type: &'static str,
    etag: String,
    generated: bool,
}

#[derive(Clone)]
struct PreparedSource {
    source: PathBuf,
    cache_key: String,
    etag: String,
}

struct GeneratedDerivative {
    bytes: Vec<u8>,
    content_type: &'static str,
    etag: String,
    created_new_file: bool,
}

#[derive(Clone)]
struct StagedImport {
    generation: u64,
    staged_path: PathBuf,
    relative_path: String,
    size_bytes: u64,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ImageVariant {
    Small,
    Card,
    Hero,
    Original,
}

impl ImageVariant {
    fn from_protocol(value: &str) -> Option<Self> {
        match value {
            "small" => Some(Self::Small),
            "card" => Some(Self::Card),
            "hero" => Some(Self::Hero),
            "original" => Some(Self::Original),
            _ => None,
        }
    }

    fn as_protocol(self) -> &'static str {
        match self {
            Self::Small => "small",
            Self::Card => "card",
            Self::Hero => "hero",
            Self::Original => "original",
        }
    }

    fn dimensions(self) -> Option<(u32, u32)> {
        match self {
            Self::Small => Some((384, 576)),
            Self::Card => Some((768, 1_152)),
            Self::Hero => Some((1_600, 2_400)),
            Self::Original => None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageServiceStatus {
    configured: bool,
    protocol_base: String,
    recipe_version: u32,
    generation: u64,
    generation_limit: usize,
    memory_entries: usize,
    memory_bytes: u64,
    memory_limit_bytes: u64,
    disk_entries: u64,
    disk_bytes: u64,
    disk_limit_bytes: u64,
    staged_imports: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrewarmRequest {
    image_path: String,
    variant: ImageVariant,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrewarmFailure {
    image_path: String,
    variant: ImageVariant,
    error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrewarmResult {
    requested: usize,
    generated: usize,
    cached: usize,
    failed: usize,
    failures: Vec<PrewarmFailure>,
}

/// Three hex colours derived from a cover's own print, ready to drop straight
/// into CSS. The lightness of each is clamped by `compute_palette`, so every
/// palette in a library carries white type at roughly the same contrast — raw
/// dominant colours produce an unreadable, wildly uneven shelf.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverPalette {
    /// Darkest stop, for the head of a gradient.
    shadow: String,
    /// Mid stop, the colour the cover actually reads as.
    base: String,
    /// Bright stop, for small accents (pips, hairlines) against the other two.
    accent: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverPaletteEntry {
    image_path: String,
    /// None when the cover could not be read; the caller keeps its fallback.
    palette: Option<CoverPalette>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearImageServiceCacheResult {
    files_removed: usize,
    bytes_removed: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedCoverImportResult {
    token: String,
    preview_url: String,
    image_path: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommittedCoverImportResult {
    image_path: String,
}

#[derive(Default)]
struct DiskScan {
    entries: u64,
    bytes: u64,
    files: Vec<DiskFile>,
}

struct DiskFile {
    path: PathBuf,
    bytes: u64,
    modified: SystemTime,
}

impl EncodedMemoryCache {
    fn new(limit_bytes: u64) -> Self {
        Self {
            entries: HashMap::new(),
            bytes: 0,
            limit_bytes,
            clock: 0,
        }
    }

    fn get(&mut self, key: &str) -> Option<LoadedAsset> {
        let entry = self.entries.get_mut(key)?;
        self.clock = self.clock.wrapping_add(1);
        entry.last_used = self.clock;
        Some(LoadedAsset {
            bytes: Arc::clone(&entry.bytes),
            content_type: entry.content_type,
            etag: entry.etag.clone(),
            generated: false,
        })
    }

    fn insert(&mut self, key: String, asset: LoadedAsset) {
        let entry_bytes = asset.bytes.len() as u64;
        if entry_bytes > self.limit_bytes {
            return;
        }

        if let Some(previous) = self.entries.remove(&key) {
            self.bytes = self.bytes.saturating_sub(previous.bytes.len() as u64);
        }

        self.clock = self.clock.wrapping_add(1);
        self.bytes = self.bytes.saturating_add(entry_bytes);
        self.entries.insert(
            key,
            MemoryEntry {
                bytes: asset.bytes,
                content_type: asset.content_type,
                etag: asset.etag,
                last_used: self.clock,
            },
        );

        while self.bytes > self.limit_bytes {
            let Some(oldest_key) = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            if let Some(removed) = self.entries.remove(&oldest_key) {
                self.bytes = self.bytes.saturating_sub(removed.bytes.len() as u64);
            }
        }
    }

    fn clear(&mut self) {
        self.entries.clear();
        self.bytes = 0;
    }
}

impl ImageService {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let app_cache_root = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("Failed to resolve application cache directory: {error}"))?;
        let cache_root = app_cache_root.join("media-images").join(PROTOCOL_VERSION);
        let legacy_thumbnail_root = app_cache_root.join(LEGACY_THUMBNAIL_NAMESPACE);

        Ok(Self {
            inner: Arc::new(ImageServiceInner {
                cache_root,
                legacy_thumbnail_root,
                state: RwLock::new(ServiceState::default()),
                transition: AsyncMutex::new(()),
                generation_slots: Arc::new(Semaphore::new(GENERATION_CONCURRENCY)),
                in_flight: Mutex::new(HashMap::new()),
                memory: Mutex::new(EncodedMemoryCache::new(DEFAULT_MEMORY_LIMIT_BYTES)),
                palettes: Mutex::new(HashMap::new()),
                staged: Mutex::new(HashMap::new()),
                disk_entries: AtomicU64::new(0),
                disk_bytes: AtomicU64::new(0),
                cleanup_running: AtomicBool::new(false),
                legacy_thumbnail_cleanup_started: AtomicBool::new(false),
            }),
        })
    }

    async fn configure(
        &self,
        data_dir: String,
        requested_disk_limit: Option<u64>,
    ) -> Result<ImageServiceStatus, String> {
        let _transition_guard = self.inner.transition.lock().await;
        let disk_limit_bytes = requested_disk_limit
            .filter(|limit| *limit > 0)
            .unwrap_or(DEFAULT_DISK_LIMIT_BYTES);
        let prepared = tauri::async_runtime::spawn_blocking(move || {
            prepare_configured_root(PathBuf::from(data_dir), disk_limit_bytes)
        })
        .await
        .map_err(|error| format!("Image-service configuration worker failed: {error}"))??;

        // Waiting for every generation permit makes a live data-root switch atomic
        // with respect to derivative generation. Reads perform a final generation
        // check before responding as a second guard.
        let _transition_guard = Arc::clone(&self.inner.generation_slots)
            .acquire_many_owned(GENERATION_CONCURRENCY as u32)
            .await
            .map_err(|_| "Image generation is shutting down".to_string())?;

        let (configured, root_changed) = {
            let mut state = self
                .inner
                .state
                .write()
                .map_err(|_| "Image-service configuration lock is unavailable".to_string())?;
            let root_changed = state
                .configured
                .as_ref()
                .is_none_or(|current| current.data_root != prepared.data_root);
            if root_changed {
                state.last_generation = state.last_generation.saturating_add(1).max(1);
            }
            let configured = ConfiguredRoot {
                data_root: prepared.data_root,
                assets_root: prepared.assets_root,
                staging_root: prepared.staging_root,
                generation: state.last_generation.max(1),
                disk_limit_bytes: prepared.disk_limit_bytes,
            };
            state.last_generation = configured.generation;
            state.configured = Some(configured.clone());
            (configured, root_changed)
        };

        if root_changed {
            self.inner
                .memory
                .lock()
                .map_err(|_| "Image memory-cache lock is unavailable".to_string())?
                .clear();
            let old_staged = self
                .inner
                .staged
                .lock()
                .map_err(|_| "Image import lock is unavailable".to_string())?
                .drain()
                .map(|(_, staged)| staged)
                .collect::<Vec<_>>();
            let new_staging_root = configured.staging_root.clone();
            tauri::async_runtime::spawn_blocking(move || {
                for staged in old_staged {
                    let _ = fs::remove_file(staged.staged_path);
                }
                clear_staging_directory(&new_staging_root)
            })
            .await
            .map_err(|error| format!("Image staging cleanup worker failed: {error}"))??;
        }

        self.refresh_and_enforce_disk_limit(&configured).await?;
        let status = self.status().await?;
        if let Err(error) = self.cleanup_legacy_thumbnail_cache_once().await {
            eprintln!("[image-service] legacy thumbnail cleanup skipped: {error}");
        }
        Ok(status)
    }

    async fn cleanup_legacy_thumbnail_cache_once(&self) -> Result<(), String> {
        if self
            .inner
            .legacy_thumbnail_cleanup_started
            .swap(true, Ordering::AcqRel)
        {
            return Ok(());
        }

        let legacy_thumbnail_root = self.inner.legacy_thumbnail_root.clone();
        tauri::async_runtime::spawn_blocking(move || {
            remove_legacy_thumbnail_namespace(&legacy_thumbnail_root)
        })
        .await
        .map_err(|error| format!("Legacy thumbnail cleanup worker failed: {error}"))?
    }

    fn configured_root(&self) -> Result<ConfiguredRoot, String> {
        self.inner
            .state
            .read()
            .map_err(|_| "Image-service configuration lock is unavailable".to_string())?
            .configured
            .clone()
            .ok_or_else(|| "Image service has not been configured".to_string())
    }

    fn generation_is_current(&self, generation: u64) -> bool {
        self.inner
            .state
            .read()
            .ok()
            .and_then(|state| state.configured.as_ref().map(|root| root.generation))
            == Some(generation)
    }

    async fn status(&self) -> Result<ImageServiceStatus, String> {
        let configured = self
            .inner
            .state
            .read()
            .map_err(|_| "Image-service configuration lock is unavailable".to_string())?
            .configured
            .clone();
        let (memory_entries, memory_bytes, memory_limit_bytes) = {
            let memory = self
                .inner
                .memory
                .lock()
                .map_err(|_| "Image memory-cache lock is unavailable".to_string())?;
            (memory.entries.len(), memory.bytes, memory.limit_bytes)
        };
        let staged_imports = self
            .inner
            .staged
            .lock()
            .map_err(|_| "Image import lock is unavailable".to_string())?
            .len();
        let (generation, disk_limit_bytes, protocol_base) = configured
            .as_ref()
            .map(|root| {
                (
                    root.generation,
                    root.disk_limit_bytes,
                    protocol_base(root.generation),
                )
            })
            .unwrap_or((0, DEFAULT_DISK_LIMIT_BYTES, String::new()));

        Ok(ImageServiceStatus {
            configured: configured.is_some(),
            protocol_base,
            recipe_version: RECIPE_VERSION,
            generation,
            generation_limit: GENERATION_CONCURRENCY,
            memory_entries,
            memory_bytes,
            memory_limit_bytes,
            disk_entries: self.inner.disk_entries.load(Ordering::Relaxed),
            disk_bytes: self.inner.disk_bytes.load(Ordering::Relaxed),
            disk_limit_bytes,
            staged_imports,
        })
    }

    async fn refresh_and_enforce_disk_limit(
        &self,
        configured: &ConfiguredRoot,
    ) -> Result<(), String> {
        let derivative_root = self.derivative_root();
        let limit = configured.disk_limit_bytes;
        let scan = tauri::async_runtime::spawn_blocking(move || {
            enforce_disk_limit(&derivative_root, limit)
        })
        .await
        .map_err(|error| format!("Image cache cleanup worker failed: {error}"))??;
        self.inner
            .disk_entries
            .store(scan.entries, Ordering::Relaxed);
        self.inner.disk_bytes.store(scan.bytes, Ordering::Relaxed);
        Ok(())
    }

    fn derivative_root(&self) -> PathBuf {
        self.inner.cache_root.join("derivatives")
    }

    /// Palettes live beside the derivatives but are deliberately left out of the
    /// disk-limit accounting: a whole library of them is a few tens of KiB, and
    /// evicting one would only force an identical recompute.
    fn palette_root(&self) -> PathBuf {
        self.inner.cache_root.join("palettes")
    }

    fn lock_for_key(&self, key: &str) -> Result<Arc<AsyncMutex<()>>, String> {
        let mut locks = self
            .inner
            .in_flight
            .lock()
            .map_err(|_| "Image in-flight lock is unavailable".to_string())?;
        locks.retain(|_, lock| lock.strong_count() > 0);
        if let Some(lock) = locks.get(key).and_then(Weak::upgrade) {
            return Ok(lock);
        }
        let lock = Arc::new(AsyncMutex::new(()));
        locks.insert(key.to_string(), Arc::downgrade(&lock));
        Ok(lock)
    }

    async fn load_asset(
        &self,
        configured: ConfiguredRoot,
        image_path: String,
        variant: ImageVariant,
    ) -> Result<LoadedAsset, String> {
        let configured_for_prepare = configured.clone();
        let path_for_prepare = image_path.clone();
        let prepared = tauri::async_runtime::spawn_blocking(move || {
            prepare_source(&configured_for_prepare, &path_for_prepare, variant)
        })
        .await
        .map_err(|error| format!("Image metadata worker failed: {error}"))??;

        if variant == ImageVariant::Original {
            let source = prepared.source;
            let etag = prepared.etag;
            let asset = tauri::async_runtime::spawn_blocking(move || {
                let bytes = fs::read(&source).map_err(|error| {
                    format!("Failed to read cover {}: {error}", source.display())
                })?;
                let content_type = detect_original_content_type(&source, &bytes);
                Ok::<_, String>(LoadedAsset {
                    bytes: Arc::new(bytes),
                    content_type,
                    etag,
                    generated: false,
                })
            })
            .await
            .map_err(|error| format!("Image read worker failed: {error}"))??;
            self.ensure_generation(configured.generation)?;
            return Ok(asset);
        }

        if let Some(asset) = self
            .inner
            .memory
            .lock()
            .map_err(|_| "Image memory-cache lock is unavailable".to_string())?
            .get(&prepared.cache_key)
        {
            self.ensure_generation(configured.generation)?;
            return Ok(asset);
        }

        let derivative_root = self.derivative_root();
        if let Some(asset) =
            read_existing_derivative_async(derivative_root.clone(), prepared.clone()).await?
        {
            self.insert_memory(prepared.cache_key.clone(), asset.clone())?;
            self.ensure_generation(configured.generation)?;
            return Ok(asset);
        }

        let key_lock = self.lock_for_key(&prepared.cache_key)?;
        let _key_guard = key_lock.lock().await;

        if let Some(asset) = self
            .inner
            .memory
            .lock()
            .map_err(|_| "Image memory-cache lock is unavailable".to_string())?
            .get(&prepared.cache_key)
        {
            self.ensure_generation(configured.generation)?;
            return Ok(asset);
        }
        if let Some(asset) =
            read_existing_derivative_async(derivative_root.clone(), prepared.clone()).await?
        {
            self.insert_memory(prepared.cache_key.clone(), asset.clone())?;
            self.ensure_generation(configured.generation)?;
            return Ok(asset);
        }

        let _generation_permit = Arc::clone(&self.inner.generation_slots)
            .acquire_owned()
            .await
            .map_err(|_| "Image generation is shutting down".to_string())?;
        self.ensure_generation(configured.generation)?;

        let prepared_key = prepared.cache_key.clone();
        let prepared_for_generation = prepared;
        let derivative_root_for_generation = derivative_root.clone();
        let generated = tauri::async_runtime::spawn_blocking(move || {
            generate_derivative(
                &derivative_root_for_generation,
                prepared_for_generation,
                variant,
            )
        })
        .await
        .map_err(|error| format!("Image generation worker failed: {error}"))??;
        self.ensure_generation(configured.generation)?;

        if generated.created_new_file {
            self.inner.disk_entries.fetch_add(1, Ordering::Relaxed);
            self.inner
                .disk_bytes
                .fetch_add(generated.bytes.len() as u64, Ordering::Relaxed);
        }
        let asset = LoadedAsset {
            bytes: Arc::new(generated.bytes),
            content_type: generated.content_type,
            etag: generated.etag,
            generated: generated.created_new_file,
        };
        self.insert_memory(prepared_key, asset.clone())?;
        self.schedule_cleanup_if_needed(configured);
        Ok(asset)
    }

    fn ensure_generation(&self, generation: u64) -> Result<(), String> {
        if self.generation_is_current(generation) {
            Ok(())
        } else {
            Err("Image service data root changed while the image was loading".to_string())
        }
    }

    fn insert_memory(&self, key: String, asset: LoadedAsset) -> Result<(), String> {
        self.inner
            .memory
            .lock()
            .map_err(|_| "Image memory-cache lock is unavailable".to_string())?
            .insert(key, asset);
        Ok(())
    }

    fn schedule_cleanup_if_needed(&self, configured: ConfiguredRoot) {
        if self.inner.disk_bytes.load(Ordering::Relaxed) <= configured.disk_limit_bytes
            || self.inner.cleanup_running.swap(true, Ordering::AcqRel)
        {
            return;
        }

        let service = self.clone();
        tauri::async_runtime::spawn(async move {
            let _ = service.refresh_and_enforce_disk_limit(&configured).await;
            service
                .inner
                .cleanup_running
                .store(false, Ordering::Release);
        });
    }

    async fn clear_cache(&self) -> Result<ClearImageServiceCacheResult, String> {
        let _transition_guard = self.inner.transition.lock().await;
        let _clear_guard = Arc::clone(&self.inner.generation_slots)
            .acquire_many_owned(GENERATION_CONCURRENCY as u32)
            .await
            .map_err(|_| "Image generation is shutting down".to_string())?;
        self.inner
            .memory
            .lock()
            .map_err(|_| "Image memory-cache lock is unavailable".to_string())?
            .clear();
        self.inner
            .palettes
            .lock()
            .map_err(|_| "Palette cache lock is unavailable".to_string())?
            .clear();

        let derivative_root = self.derivative_root();
        let palette_root = self.palette_root();
        let result = tauri::async_runtime::spawn_blocking(move || {
            // Palettes are derived from the derivatives, so they go with them.
            // Their bytes are not reported: the count the user sees in Settings
            // is the image cache, and a few KiB of JSON would only muddy it.
            if palette_root.exists() {
                let _ = fs::remove_dir_all(&palette_root);
            }
            let scan = scan_disk_cache(&derivative_root)?;
            if derivative_root.exists() {
                fs::remove_dir_all(&derivative_root).map_err(|error| {
                    format!(
                        "Failed to remove image cache {}: {error}",
                        derivative_root.display()
                    )
                })?;
            }
            fs::create_dir_all(&derivative_root).map_err(|error| {
                format!(
                    "Failed to recreate image cache {}: {error}",
                    derivative_root.display()
                )
            })?;
            Ok::<_, String>(ClearImageServiceCacheResult {
                files_removed: scan.entries as usize,
                bytes_removed: scan.bytes,
            })
        })
        .await
        .map_err(|error| format!("Image cache clear worker failed: {error}"))??;
        self.inner.disk_entries.store(0, Ordering::Relaxed);
        self.inner.disk_bytes.store(0, Ordering::Relaxed);
        Ok(result)
    }

    async fn prewarm(&self, requests: Vec<PrewarmRequest>) -> Result<PrewarmResult, String> {
        let configured = self.configured_root()?;
        Ok(self.prewarm_for_root(configured, requests).await)
    }

    async fn prewarm_for_root(
        &self,
        configured: ConfiguredRoot,
        requests: Vec<PrewarmRequest>,
    ) -> PrewarmResult {
        let requested = requests.len();
        let mut generated = 0;
        let mut cached = 0;
        let mut failures = Vec::new();

        for request in requests {
            if request.variant == ImageVariant::Original {
                failures.push(PrewarmFailure {
                    image_path: request.image_path,
                    variant: request.variant,
                    error: "Original images do not need derivative prewarming".to_string(),
                });
                continue;
            }
            match self
                .load_asset(
                    configured.clone(),
                    request.image_path.clone(),
                    request.variant,
                )
                .await
            {
                Ok(asset) if asset.generated => generated += 1,
                Ok(_) => cached += 1,
                Err(error) => failures.push(PrewarmFailure {
                    image_path: request.image_path,
                    variant: request.variant,
                    error,
                }),
            }
        }

        PrewarmResult {
            requested,
            generated,
            cached,
            failed: failures.len(),
            failures,
        }
    }

    /// Palettes for a batch of covers. Failures are reported as a `None`
    /// palette rather than failing the batch — one unreadable cover must not
    /// cost the caller every other colour it asked for.
    async fn cover_palettes(
        &self,
        image_paths: Vec<String>,
    ) -> Result<Vec<CoverPaletteEntry>, String> {
        let configured = self.configured_root()?;
        let mut entries = Vec::with_capacity(image_paths.len());
        for image_path in image_paths {
            let palette = self
                .cover_palette(configured.clone(), image_path.clone())
                .await
                .ok();
            entries.push(CoverPaletteEntry {
                image_path,
                palette,
            });
        }
        Ok(entries)
    }

    async fn cover_palette(
        &self,
        configured: ConfiguredRoot,
        image_path: String,
    ) -> Result<CoverPalette, String> {
        let configured_for_prepare = configured.clone();
        let path_for_prepare = image_path.clone();
        let prepared = tauri::async_runtime::spawn_blocking(move || {
            prepare_source(
                &configured_for_prepare,
                &path_for_prepare,
                ImageVariant::Small,
            )
        })
        .await
        .map_err(|error| format!("Palette metadata worker failed: {error}"))??;
        // Keyed off the `small` derivative's cache key, so editing or replacing
        // a cover invalidates its palette for free.
        let key = format!("{}-p{PALETTE_VERSION}", prepared.cache_key);

        if let Some(cached) = self
            .inner
            .palettes
            .lock()
            .map_err(|_| "Palette cache lock is unavailable".to_string())?
            .get(&key)
            .cloned()
        {
            return Ok(cached);
        }

        let palette_root = self.palette_root();
        let key_for_disk = key.clone();
        let from_disk = tauri::async_runtime::spawn_blocking(move || {
            read_cached_palette(&palette_root, &key_for_disk)
        })
        .await
        .map_err(|error| format!("Palette cache worker failed: {error}"))?;
        if let Some(cached) = from_disk {
            self.remember_palette(key, cached.clone())?;
            return Ok(cached);
        }

        // Cluster the `small` derivative rather than the original: prewarm has
        // almost always generated it already, and its 384x576 decode is a
        // fraction of what the source file costs.
        let asset = self
            .load_asset(configured, image_path, ImageVariant::Small)
            .await?;
        let palette_root = self.palette_root();
        let key_for_write = key.clone();
        let palette = tauri::async_runtime::spawn_blocking(move || {
            let decoded = image::load_from_memory(&asset.bytes).map_err(|error| {
                format!("Failed to decode cover derivative for palette: {error}")
            })?;
            let palette = compute_palette(&decoded);
            write_cached_palette(&palette_root, &key_for_write, &palette);
            Ok::<_, String>(palette)
        })
        .await
        .map_err(|error| format!("Palette worker failed: {error}"))??;
        self.remember_palette(key, palette.clone())?;
        Ok(palette)
    }

    fn remember_palette(&self, key: String, palette: CoverPalette) -> Result<(), String> {
        self.inner
            .palettes
            .lock()
            .map_err(|_| "Palette cache lock is unavailable".to_string())?
            .insert(key, palette);
        Ok(())
    }

    pub async fn stage_import(&self, source_path: String) -> Result<StagedCoverImportResult, String> {
        let _transition_guard = self.inner.transition.lock().await;
        let configured = self.configured_root()?;
        let token = Uuid::new_v4().to_string();
        let final_id = Uuid::new_v4().to_string();
        let configured_for_stage = configured.clone();
        let token_for_stage = token.clone();
        let staged = tauri::async_runtime::spawn_blocking(move || {
            stage_import_blocking(
                &configured_for_stage,
                PathBuf::from(source_path),
                &token_for_stage,
                &final_id,
            )
        })
        .await
        .map_err(|error| format!("Image import staging worker failed: {error}"))??;
        self.ensure_generation(configured.generation)?;
        let result = StagedCoverImportResult {
            token: token.clone(),
            preview_url: format!("{}/staged/{token}", protocol_base(configured.generation)),
            image_path: staged.relative_path.clone(),
            size_bytes: staged.size_bytes,
        };
        self.inner
            .staged
            .lock()
            .map_err(|_| "Image import lock is unavailable".to_string())?
            .insert(token, staged);
        Ok(result)
    }

    async fn commit_import(&self, token: String) -> Result<CommittedCoverImportResult, String> {
        let _transition_guard = self.inner.transition.lock().await;
        let staged = self
            .inner
            .staged
            .lock()
            .map_err(|_| "Image import lock is unavailable".to_string())?
            .remove(&token)
            .ok_or_else(|| "Image import token is unknown or has expired".to_string())?;
        let configured = self.configured_root()?;
        if staged.generation != configured.generation {
            let _ = fs::remove_file(&staged.staged_path);
            return Err("Image import belongs to an old data-directory session".to_string());
        }

        let relative_path = staged.relative_path.clone();
        let configured_for_commit = configured.clone();
        let staged_for_commit = staged.clone();
        let commit_result = tauri::async_runtime::spawn_blocking(move || {
            commit_import_blocking(&configured_for_commit, &staged_for_commit)
        })
        .await
        .map_err(|error| format!("Image import commit worker failed: {error}"))?;
        let committed_path = match commit_result {
            Ok(path) => path,
            Err(error) => {
                if staged.staged_path.is_file()
                    && let Ok(mut imports) = self.inner.staged.lock()
                {
                    imports.insert(token, staged);
                }
                return Err(error);
            }
        };
        self.ensure_generation(configured.generation)?;

        for variant in [ImageVariant::Small, ImageVariant::Card] {
            if let Err(derivative_error) = self
                .load_asset(configured.clone(), relative_path.clone(), variant)
                .await
            {
                let configured_for_rollback = configured.clone();
                let staged_for_rollback = staged.clone();
                let committed_path_for_rollback = committed_path.clone();
                let rollback_result = match tauri::async_runtime::spawn_blocking(move || {
                    rollback_committed_import_blocking(
                        &configured_for_rollback,
                        &staged_for_rollback,
                        &committed_path_for_rollback,
                    )
                })
                .await
                {
                    Ok(result) => result,
                    Err(error) => Err(format!("Image import rollback worker failed: {error}")),
                };

                return match rollback_result {
                    Ok(()) => {
                        self.inner
                            .staged
                            .lock()
                            .map_err(|_| {
                                format!(
                                    "Failed to prepare the {} cover derivative ({derivative_error}). The original was returned to staging, but its import token could not be restored",
                                    variant.as_protocol()
                                )
                            })?
                            .insert(token, staged);
                        Err(format!(
                            "Failed to prepare the {} cover derivative; the original remains staged and can be retried: {derivative_error}",
                            variant.as_protocol()
                        ))
                    }
                    Err(rollback_error) => Err(format!(
                        "Failed to prepare the {} cover derivative ({derivative_error}). The committed original remains at {relative_path} because rollback also failed: {rollback_error}",
                        variant.as_protocol()
                    )),
                };
            }
        }

        Ok(CommittedCoverImportResult {
            image_path: relative_path,
        })
    }

    async fn cancel_import(&self, token: String) -> Result<bool, String> {
        let _transition_guard = self.inner.transition.lock().await;
        let Some(staged) = self
            .inner
            .staged
            .lock()
            .map_err(|_| "Image import lock is unavailable".to_string())?
            .remove(&token)
        else {
            return Ok(false);
        };
        tauri::async_runtime::spawn_blocking(move || match fs::remove_file(&staged.staged_path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!(
                "Failed to remove staged image {}: {error}",
                staged.staged_path.display()
            )),
        })
        .await
        .map_err(|error| format!("Image import cancellation worker failed: {error}"))??;
        Ok(true)
    }

    async fn load_staged_asset(
        &self,
        requested_generation: u64,
        token: &str,
    ) -> Result<LoadedAsset, String> {
        let staged = self
            .inner
            .staged
            .lock()
            .map_err(|_| "Image import lock is unavailable".to_string())?
            .get(token)
            .cloned()
            .ok_or_else(|| "Image import token is unknown or has expired".to_string())?;
        if staged.generation != requested_generation {
            return Err("Staged image belongs to an old data-directory session".to_string());
        }
        let token = token.to_string();
        let asset = tauri::async_runtime::spawn_blocking(move || {
            let bytes = fs::read(&staged.staged_path).map_err(|error| {
                format!(
                    "Failed to read staged image {}: {error}",
                    staged.staged_path.display()
                )
            })?;
            let content_type = detect_original_content_type(&staged.staged_path, &bytes);
            Ok::<_, String>(LoadedAsset {
                bytes: Arc::new(bytes),
                content_type,
                etag: format!("\"ml-stage-{token}-{}\"", staged.size_bytes),
                generated: false,
            })
        })
        .await
        .map_err(|error| format!("Staged image read worker failed: {error}"))??;
        self.ensure_generation(requested_generation)?;
        Ok(asset)
    }

    pub async fn handle_protocol_request(&self, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
        match self.protocol_response(request).await {
            Ok(response) => response,
            Err(ProtocolError { status, message }) => error_response(status, &message),
        }
    }

    async fn protocol_response(
        &self,
        request: Request<Vec<u8>>,
    ) -> Result<Response<Vec<u8>>, ProtocolError> {
        if request.method() != Method::GET && request.method() != Method::HEAD {
            return Err(ProtocolError::new(
                StatusCode::METHOD_NOT_ALLOWED,
                "Only GET and HEAD are supported",
            ));
        }

        let parts: Vec<&str> = request
            .uri()
            .path()
            .trim_start_matches('/')
            .split('/')
            .collect();
        if parts.len() != 4 || parts[0] != PROTOCOL_VERSION {
            return Err(ProtocolError::new(
                StatusCode::NOT_FOUND,
                "Unknown media URL",
            ));
        }
        let requested_generation = parts[1]
            .parse::<u64>()
            .map_err(|_| ProtocolError::new(StatusCode::BAD_REQUEST, "Invalid generation"))?;
        let configured = self
            .configured_root()
            .map_err(|error| ProtocolError::new(StatusCode::SERVICE_UNAVAILABLE, error))?;
        if configured.generation != requested_generation {
            return Err(ProtocolError::new(
                StatusCode::GONE,
                "This image URL belongs to an old data-directory session",
            ));
        }

        let asset_result = if parts[2] == "staged" {
            self.load_staged_asset(requested_generation, parts[3]).await
        } else {
            let variant = ImageVariant::from_protocol(parts[2]).ok_or_else(|| {
                ProtocolError::new(StatusCode::BAD_REQUEST, "Invalid image variant")
            })?;
            let image_path = decode_protocol_path(parts[3]).map_err(|error| {
                ProtocolError::new(
                    StatusCode::BAD_REQUEST,
                    format!("Invalid image path: {error}"),
                )
            })?;
            self.load_asset(configured.clone(), image_path, variant)
                .await
        };
        let asset = asset_result.map_err(|error| {
            if self.generation_is_current(requested_generation) {
                ProtocolError::new(StatusCode::NOT_FOUND, error)
            } else {
                ProtocolError::new(StatusCode::GONE, error)
            }
        })?;
        if !self.generation_is_current(requested_generation) {
            return Err(ProtocolError::new(
                StatusCode::GONE,
                "The data directory changed while this image was loading",
            ));
        }

        let not_modified = request
            .headers()
            .get(IF_NONE_MATCH)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value == asset.etag);
        if not_modified {
            return Response::builder()
                .status(StatusCode::NOT_MODIFIED)
                .header(ETAG, asset.etag)
                .header(CACHE_CONTROL, "no-cache, max-age=0, must-revalidate")
                .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(Vec::new())
                .map_err(|error| {
                    ProtocolError::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
                });
        }

        let content_length = asset.bytes.len();
        let body = if request.method() == Method::HEAD {
            Vec::new()
        } else {
            (*asset.bytes).clone()
        };
        Response::builder()
            .status(StatusCode::OK)
            .header(CONTENT_TYPE, asset.content_type)
            .header(CONTENT_LENGTH, content_length)
            .header(ETAG, asset.etag)
            .header(CACHE_CONTROL, "no-cache, max-age=0, must-revalidate")
            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header("X-Content-Type-Options", "nosniff")
            .body(body)
            .map_err(|error| {
                ProtocolError::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
            })
    }
}

struct PreparedConfiguredRoot {
    data_root: PathBuf,
    assets_root: PathBuf,
    staging_root: PathBuf,
    disk_limit_bytes: u64,
}

fn prepare_configured_root(
    requested_data_root: PathBuf,
    disk_limit_bytes: u64,
) -> Result<PreparedConfiguredRoot, String> {
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
    if !data_root.is_dir() {
        return Err(format!(
            "Data path is not a directory: {}",
            data_root.display()
        ));
    }
    let requested_assets = data_root.join("assets");
    fs::create_dir_all(requested_assets.join("images")).map_err(|error| {
        format!(
            "Failed to prepare image assets directory {}: {error}",
            requested_assets.display()
        )
    })?;
    let assets_root = fs::canonicalize(&requested_assets).map_err(|error| {
        format!(
            "Failed to resolve assets directory {}: {error}",
            requested_assets.display()
        )
    })?;
    if !assets_root.starts_with(&data_root) || !assets_root.is_dir() {
        return Err("Assets directory resolves outside the configured data directory".to_string());
    }

    let requested_staging_root = data_root.join(".media-logger-image-staging");
    fs::create_dir_all(&requested_staging_root).map_err(|error| {
        format!(
            "Failed to prepare image staging directory {}: {error}",
            requested_staging_root.display()
        )
    })?;
    let staging_metadata = fs::symlink_metadata(&requested_staging_root).map_err(|error| {
        format!(
            "Failed to inspect image staging directory {}: {error}",
            requested_staging_root.display()
        )
    })?;
    if !staging_metadata.is_dir() || staging_metadata.file_type().is_symlink() {
        return Err("Image staging path must be a regular directory, not a symlink".to_string());
    }
    let staging_root = fs::canonicalize(&requested_staging_root).map_err(|error| {
        format!(
            "Failed to resolve image staging directory {}: {error}",
            requested_staging_root.display()
        )
    })?;
    if !staging_root.starts_with(&data_root) {
        return Err("Image staging directory resolves outside the data directory".to_string());
    }

    Ok(PreparedConfiguredRoot {
        data_root,
        assets_root,
        staging_root,
        disk_limit_bytes,
    })
}

fn clear_staging_directory(staging_root: &Path) -> Result<(), String> {
    if staging_root.exists() {
        fs::remove_dir_all(staging_root).map_err(|error| {
            format!(
                "Failed to clear stale image staging directory {}: {error}",
                staging_root.display()
            )
        })?;
    }
    fs::create_dir_all(staging_root).map_err(|error| {
        format!(
            "Failed to recreate image staging directory {}: {error}",
            staging_root.display()
        )
    })
}

fn is_legacy_thumbnail_filename(name: &str) -> bool {
    name.strip_suffix(".jpg")
        .is_some_and(|hash| hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
        || (name.starts_with(".thumbnail-") && name.ends_with(".tmp"))
}

fn remove_legacy_thumbnail_namespace(legacy_root: &Path) -> Result<(), String> {
    if legacy_root.file_name().and_then(|name| name.to_str()) != Some(LEGACY_THUMBNAIL_NAMESPACE) {
        return Err("Refusing to clean an unexpected legacy cache namespace".to_string());
    }

    let metadata = match fs::symlink_metadata(legacy_root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Failed to inspect legacy thumbnail cache {}: {error}",
                legacy_root.display()
            ));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "Refusing to clean a non-directory legacy cache namespace: {}",
            legacy_root.display()
        ));
    }

    let requested_parent = legacy_root
        .parent()
        .ok_or_else(|| "Legacy thumbnail cache has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(requested_parent).map_err(|error| {
        format!(
            "Failed to resolve legacy thumbnail cache parent {}: {error}",
            requested_parent.display()
        )
    })?;
    let canonical_root = fs::canonicalize(legacy_root).map_err(|error| {
        format!(
            "Failed to resolve legacy thumbnail cache {}: {error}",
            legacy_root.display()
        )
    })?;
    if canonical_root.parent() != Some(canonical_parent.as_path())
        || canonical_root.file_name().and_then(|name| name.to_str())
            != Some(LEGACY_THUMBNAIL_NAMESPACE)
    {
        return Err("Legacy thumbnail cache resolves outside its expected namespace".to_string());
    }

    // The old cache was flat. Delete only filenames emitted by that pipeline;
    // unknown files, directories, and links are intentionally left untouched.
    for entry in fs::read_dir(&canonical_root).map_err(|error| {
        format!(
            "Failed to read legacy thumbnail cache {}: {error}",
            canonical_root.display()
        )
    })? {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to inspect legacy thumbnail cache {}: {error}",
                canonical_root.display()
            )
        })?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "Failed to inspect legacy thumbnail entry {}: {error}",
                entry.path().display()
            )
        })?;
        if file_type.is_file() && is_legacy_thumbnail_filename(&name) {
            fs::remove_file(entry.path()).map_err(|error| {
                format!(
                    "Failed to remove legacy thumbnail {}: {error}",
                    entry.path().display()
                )
            })?;
        }
    }

    match fs::remove_dir(&canonical_root) {
        Ok(()) => Ok(()),
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(format!(
            "Failed to remove empty legacy thumbnail cache {}: {error}",
            canonical_root.display()
        )),
    }
}

fn validate_relative_path(image_path: &str) -> Result<&Path, String> {
    let relative = Path::new(image_path);
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("path must contain only normal relative components".to_string());
    }
    Ok(relative)
}

fn resolve_source(assets_root: &Path, image_path: &str) -> Result<PathBuf, String> {
    let relative = validate_relative_path(image_path)?;
    let source = fs::canonicalize(assets_root.join(relative))
        .map_err(|error| format!("Failed to resolve cover {image_path}: {error}"))?;
    if !source.starts_with(assets_root) || !source.is_file() {
        return Err(format!(
            "Cover resolves outside the assets directory: {image_path}"
        ));
    }
    Ok(source)
}

fn prepare_source(
    configured: &ConfiguredRoot,
    image_path: &str,
    variant: ImageVariant,
) -> Result<PreparedSource, String> {
    let source = resolve_source(&configured.assets_root, image_path)?;
    let metadata = fs::metadata(&source)
        .map_err(|error| format!("Failed to inspect cover {}: {error}", source.display()))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let mut hasher = Sha256::new();
    hasher.update(b"media-logger-image-recipe");
    hasher.update(RECIPE_VERSION.to_le_bytes());
    hasher.update(variant.as_protocol().as_bytes());
    hasher.update(source.to_string_lossy().as_bytes());
    hasher.update(metadata.len().to_le_bytes());
    hasher.update(modified.to_le_bytes());
    let cache_key = hex::encode(hasher.finalize());
    let etag = format!("\"ml-{RECIPE_VERSION}-{cache_key}\"");
    Ok(PreparedSource {
        source,
        cache_key,
        etag,
    })
}

fn derivative_candidates(root: &Path, cache_key: &str) -> (PathBuf, PathBuf) {
    let shard = &cache_key[..2];
    let directory = root.join(shard);
    (
        directory.join(format!("{cache_key}.jpg")),
        directory.join(format!("{cache_key}.png")),
    )
}

fn read_existing_derivative(
    root: &Path,
    prepared: &PreparedSource,
) -> Result<Option<LoadedAsset>, String> {
    let (jpeg, png) = derivative_candidates(root, &prepared.cache_key);
    let (path, content_type) = if jpeg.is_file() {
        (jpeg, "image/jpeg")
    } else if png.is_file() {
        (png, "image/png")
    } else {
        return Ok(None);
    };
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Failed to read cached image {}: {error}",
                path.display()
            ));
        }
    };
    if bytes.is_empty() {
        let _ = fs::remove_file(path);
        return Ok(None);
    }
    Ok(Some(LoadedAsset {
        bytes: Arc::new(bytes),
        content_type,
        etag: prepared.etag.clone(),
        generated: false,
    }))
}

async fn read_existing_derivative_async(
    root: PathBuf,
    prepared: PreparedSource,
) -> Result<Option<LoadedAsset>, String> {
    tauri::async_runtime::spawn_blocking(move || read_existing_derivative(&root, &prepared))
        .await
        .map_err(|error| format!("Image cache read worker failed: {error}"))?
}

fn decode_image(source: &Path) -> Result<DynamicImage, String> {
    let mut reader = ImageReader::open(source)
        .map_err(|error| format!("Failed to open cover {}: {error}", source.display()))?
        .with_guessed_format()
        .map_err(|error| format!("Failed to identify cover {}: {error}", source.display()))?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_ALLOCATION);
    reader.limits(limits);
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| format!("Failed to create decoder for {}: {error}", source.display()))?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let (width, height) = decoder.dimensions();
    if u64::from(width).saturating_mul(u64::from(height)) > MAX_IMAGE_PIXELS {
        return Err(format!(
            "Cover {} exceeds the {} megapixel safety limit",
            source.display(),
            MAX_IMAGE_PIXELS / 1_000_000
        ));
    }
    let mut decoded = DynamicImage::from_decoder(decoder)
        .map_err(|error| format!("Failed to decode cover {}: {error}", source.display()))?;
    decoded.apply_orientation(orientation);
    Ok(decoded)
}

fn fast_resize(
    source: &DynamicImage,
    max_width: u32,
    max_height: u32,
) -> Result<DynamicImage, String> {
    let (src_width, src_height) = (source.width(), source.height());
    let scale = f64::min(
        f64::from(max_width) / f64::from(src_width),
        f64::from(max_height) / f64::from(src_height),
    );
    let dst_width = ((f64::from(src_width) * scale).ceil() as u32).max(1);
    let dst_height = ((f64::from(src_height) * scale).ceil() as u32).max(1);

    let has_alpha = source.color().has_alpha();
    let (pixel_type, converted) = if has_alpha {
        (
            fast_image_resize::PixelType::U8x4,
            source.to_rgba8().into_raw(),
        )
    } else {
        (
            fast_image_resize::PixelType::U8x3,
            source.to_rgb8().into_raw(),
        )
    };
    let source_image =
        fast_image_resize::images::Image::from_vec_u8(src_width, src_height, converted, pixel_type)
            .map_err(|error| format!("fast_image_resize source rejected: {error}"))?;

    let mut destination = fast_image_resize::images::Image::new(dst_width, dst_height, pixel_type);
    let mut resizer = fast_image_resize::Resizer::new();
    resizer
        .resize(
            &source_image,
            &mut destination,
            Some(&fast_image_resize::ResizeOptions {
                algorithm: fast_image_resize::ResizeAlg::Convolution(
                    fast_image_resize::FilterType::Lanczos3,
                ),
                ..Default::default()
            }),
        )
        .map_err(|error| format!("fast_image_resize failed: {error}"))?;

    let bytes = destination.into_vec();
    let image_buffer = if has_alpha {
        image::ImageBuffer::from_raw(dst_width, dst_height, bytes).map(DynamicImage::ImageRgba8)
    } else {
        image::ImageBuffer::from_raw(dst_width, dst_height, bytes).map(DynamicImage::ImageRgb8)
    };
    image_buffer.ok_or_else(|| "fast_image_resize produced an invalid buffer".to_string())
}

fn palette_cache_path(root: &Path, key: &str) -> PathBuf {
    root.join(&key[..2]).join(format!("{key}.json"))
}

fn read_cached_palette(root: &Path, key: &str) -> Option<CoverPalette> {
    let bytes = fs::read(palette_cache_path(root, key)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Best-effort: a palette that fails to persist is simply recomputed on the
/// next launch, which is not worth failing the caller's request over.
fn write_cached_palette(root: &Path, key: &str, palette: &CoverPalette) {
    let path = palette_cache_path(root, key);
    let Some(directory) = path.parent() else {
        return;
    };
    if fs::create_dir_all(directory).is_err() {
        return;
    }
    if let Ok(encoded) = serde_json::to_vec(palette) {
        let _ = fs::write(path, encoded);
    }
}

fn luminance(color: [f32; 3]) -> f32 {
    0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
}

fn squared_distance(a: [f32; 3], b: [f32; 3]) -> f32 {
    let (red, green, blue) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    red * red + green * green + blue * blue
}

/// Lloyd's algorithm over the sampled pixels, returning each centroid with the
/// number of pixels that landed on it.
///
/// Seeding is deliberately deterministic — evenly spaced picks from the sample
/// ordered by luminance. Random seeds would give the same cover a different
/// spine colour on different runs, which is far more noticeable than a slightly
/// weaker clustering.
fn cluster_colors(pixels: &[[f32; 3]]) -> Vec<([f32; 3], usize)> {
    if pixels.is_empty() {
        return Vec::new();
    }

    let mut ordered: Vec<usize> = (0..pixels.len()).collect();
    ordered.sort_by(|left, right| luminance(pixels[*left]).total_cmp(&luminance(pixels[*right])));
    let clusters = PALETTE_CLUSTERS.min(pixels.len());
    let mut centroids: Vec<[f32; 3]> = (0..clusters)
        .map(|index| pixels[ordered[(index * 2 + 1) * pixels.len() / (clusters * 2)]])
        .collect();

    let mut assignments = vec![0usize; pixels.len()];
    for _ in 0..PALETTE_ITERATIONS {
        let mut changed = false;
        for (index, pixel) in pixels.iter().enumerate() {
            let mut nearest = 0;
            let mut nearest_distance = f32::MAX;
            for (cluster, centroid) in centroids.iter().enumerate() {
                let distance = squared_distance(*pixel, *centroid);
                if distance < nearest_distance {
                    nearest_distance = distance;
                    nearest = cluster;
                }
            }
            if assignments[index] != nearest {
                assignments[index] = nearest;
                changed = true;
            }
        }

        let mut sums = vec![[0f32; 3]; clusters];
        let mut counts = vec![0usize; clusters];
        for (index, pixel) in pixels.iter().enumerate() {
            let cluster = assignments[index];
            for channel in 0..3 {
                sums[cluster][channel] += pixel[channel];
            }
            counts[cluster] += 1;
        }
        for (cluster, count) in counts.iter().enumerate() {
            if *count == 0 {
                continue;
            }
            let divisor = *count as f32;
            centroids[cluster] = [
                sums[cluster][0] / divisor,
                sums[cluster][1] / divisor,
                sums[cluster][2] / divisor,
            ];
        }

        if !changed {
            break;
        }
    }

    let mut counts = vec![0usize; clusters];
    for cluster in &assignments {
        counts[*cluster] += 1;
    }
    centroids.into_iter().zip(counts).collect()
}

/// The hue and saturation a person would name if asked what colour a cover is.
fn dominant_tone(pixels: &[[f32; 3]]) -> (f32, f32) {
    let total = pixels.len().max(1) as f32;
    let mut best: Option<(f32, f32, f32)> = None;

    for (centroid, count) in cluster_colors(pixels) {
        if count == 0 {
            continue;
        }
        let (hue, saturation, lightness) = rgb_to_hsl(centroid);
        let weight = count as f32 / total;
        // Near-black and blown-out clusters are usually letterboxing, a drop
        // shadow or a white margin: they describe the crop, not the print.
        let usable = if (0.06..=0.94).contains(&lightness) {
            1.0
        } else {
            0.12
        };
        // Saturation outranks frequency on purpose. The largest cluster on a
        // poster is very often a desaturated background, while the colour the
        // cover actually reads as is a smaller, vivid one.
        let score = weight * (0.15 + saturation * 1.8) * usable;
        if best.is_none_or(|(current, _, _)| score > current) {
            best = Some((score, hue, saturation));
        }
    }

    best.map_or((0.0, 0.0), |(_, hue, saturation)| (hue, saturation))
}

/// Reduce a cover to three CSS-ready colours.
///
/// The lightness values below are fixed rather than taken from the image, which
/// is the whole reason this is usable as a shelf: every spine ends up in the
/// same contrast band, so white type is legible on all of them and a rack of
/// two hundred reads as one object instead of a scatter of mismatched swatches.
fn compute_palette(image: &DynamicImage) -> CoverPalette {
    let sample = fast_resize(image, PALETTE_SAMPLE_WIDTH, PALETTE_SAMPLE_HEIGHT)
        .unwrap_or_else(|_| image.thumbnail(PALETTE_SAMPLE_WIDTH, PALETTE_SAMPLE_HEIGHT));
    let pixels: Vec<[f32; 3]> = sample
        .to_rgb8()
        .pixels()
        .map(|pixel| [f32::from(pixel[0]), f32::from(pixel[1]), f32::from(pixel[2])])
        .collect();

    let (hue, measured) = dominant_tone(&pixels);
    // A genuinely monochrome cover keeps a neutral spine: clamping its
    // saturation up to the floor would invent a hue the artwork never had.
    let saturation = if measured < 0.06 {
        0.04
    } else {
        measured.clamp(0.26, 0.70)
    };

    CoverPalette {
        shadow: hex_color(hsl_to_rgb(hue, saturation * 0.9, 0.12)),
        base: hex_color(hsl_to_rgb(hue, saturation, 0.34)),
        accent: hex_color(hsl_to_rgb(hue, (saturation + 0.12).min(0.85), 0.62)),
    }
}

fn rgb_to_hsl(color: [f32; 3]) -> (f32, f32, f32) {
    let (red, green, blue) = (color[0] / 255.0, color[1] / 255.0, color[2] / 255.0);
    let max = red.max(green).max(blue);
    let min = red.min(green).min(blue);
    let lightness = (max + min) / 2.0;
    let delta = max - min;
    if delta <= f32::EPSILON {
        return (0.0, 0.0, lightness);
    }

    let saturation = delta / (1.0 - (2.0 * lightness - 1.0).abs()).max(f32::EPSILON);
    let hue = if max == red {
        60.0 * (((green - blue) / delta) % 6.0)
    } else if max == green {
        60.0 * ((blue - red) / delta + 2.0)
    } else {
        60.0 * ((red - green) / delta + 4.0)
    };
    ((hue + 360.0) % 360.0, saturation.clamp(0.0, 1.0), lightness)
}

fn hsl_to_rgb(hue: f32, saturation: f32, lightness: f32) -> [f32; 3] {
    let chroma = (1.0 - (2.0 * lightness - 1.0).abs()) * saturation;
    let sector = (hue % 360.0) / 60.0;
    let secondary = chroma * (1.0 - (sector % 2.0 - 1.0).abs());
    let (red, green, blue) = match sector as u32 {
        0 => (chroma, secondary, 0.0),
        1 => (secondary, chroma, 0.0),
        2 => (0.0, chroma, secondary),
        3 => (0.0, secondary, chroma),
        4 => (secondary, 0.0, chroma),
        _ => (chroma, 0.0, secondary),
    };
    let offset = lightness - chroma / 2.0;
    [
        (red + offset) * 255.0,
        (green + offset) * 255.0,
        (blue + offset) * 255.0,
    ]
}

fn hex_color(color: [f32; 3]) -> String {
    let channel = |value: f32| value.round().clamp(0.0, 255.0) as u8;
    format!(
        "#{:02x}{:02x}{:02x}",
        channel(color[0]),
        channel(color[1]),
        channel(color[2])
    )
}

fn generate_derivative(
    derivative_root: &Path,
    prepared: PreparedSource,
    variant: ImageVariant,
) -> Result<GeneratedDerivative, String> {
    let (max_width, max_height) = variant
        .dimensions()
        .ok_or_else(|| "Original images are not generated as derivatives".to_string())?;
    let decoded = decode_image(&prepared.source)?;
    let resized = if decoded.width() <= max_width && decoded.height() <= max_height {
        decoded
    } else {
        fast_resize(&decoded, max_width, max_height).unwrap_or_else(|error| {
            // The SIMD resizer can reject unusual layouts. The pure-Rust path
            // keeps quality parity (Lanczos3) with a slower fallback.
            eprintln!(
                "[Image Service] fast_image_resize fallback for {}: {error}",
                prepared.source.display()
            );
            decoded.resize(max_width, max_height, FilterType::Lanczos3)
        })
    };
    let has_alpha = resized.color().has_alpha();
    let (jpeg_path, png_path) = derivative_candidates(derivative_root, &prepared.cache_key);
    let (output, content_type) = if has_alpha {
        (png_path, "image/png")
    } else {
        (jpeg_path, "image/jpeg")
    };
    let parent = output
        .parent()
        .ok_or_else(|| "Derivative output has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to prepare image cache {}: {error}",
            parent.display()
        )
    })?;

    if output.is_file() {
        let bytes = fs::read(&output).map_err(|error| {
            format!("Failed to read cached image {}: {error}", output.display())
        })?;
        return Ok(GeneratedDerivative {
            bytes,
            content_type,
            etag: prepared.etag,
            created_new_file: false,
        });
    }

    let mut encoded = Vec::new();
    if has_alpha {
        let rgba = resized.to_rgba8();
        image::codecs::png::PngEncoder::new_with_quality(
            &mut encoded,
            image::codecs::png::CompressionType::Fast,
            image::codecs::png::FilterType::Adaptive,
        )
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|error| format!("Failed to encode PNG derivative: {error}"))?;
    } else {
        let rgb = resized.to_rgb8();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut encoded, 90)
            .encode(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                ExtendedColorType::Rgb8,
            )
            .map_err(|error| format!("Failed to encode JPEG derivative: {error}"))?;
    }

    let temporary = parent.join(format!(".{}-{}.tmp", prepared.cache_key, Uuid::new_v4()));
    let write_result = (|| -> Result<(), String> {
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| {
                format!(
                    "Failed to create image cache file {}: {error}",
                    temporary.display()
                )
            })?;
        let mut writer = BufWriter::new(file);
        writer.write_all(&encoded).map_err(|error| {
            format!(
                "Failed to write image cache file {}: {error}",
                temporary.display()
            )
        })?;
        writer.flush().map_err(|error| {
            format!(
                "Failed to flush image cache file {}: {error}",
                temporary.display()
            )
        })?;
        writer.get_ref().sync_all().map_err(|error| {
            format!(
                "Failed to sync image cache file {}: {error}",
                temporary.display()
            )
        })?;
        match fs::rename(&temporary, &output) {
            Ok(()) => Ok(()),
            Err(_error) if output.is_file() => {
                let _ = fs::remove_file(&temporary);
                Ok(())
            }
            Err(error) => Err(format!(
                "Failed to publish image cache file {}: {error}",
                output.display()
            )),
        }
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result?;

    Ok(GeneratedDerivative {
        bytes: encoded,
        content_type,
        etag: prepared.etag,
        created_new_file: true,
    })
}

fn scan_disk_cache(root: &Path) -> Result<DiskScan, String> {
    let mut scan = DiskScan::default();
    if !root.is_dir() {
        return Ok(scan);
    }
    let shards = fs::read_dir(root)
        .map_err(|error| format!("Failed to read image cache {}: {error}", root.display()))?;
    for shard in shards {
        let shard = shard.map_err(|error| {
            format!(
                "Failed to inspect an image cache entry in {}: {error}",
                root.display()
            )
        })?;
        let shard_metadata = fs::symlink_metadata(shard.path()).map_err(|error| {
            format!(
                "Failed to inspect image cache path {}: {error}",
                shard.path().display()
            )
        })?;
        if !shard_metadata.is_dir() || shard_metadata.file_type().is_symlink() {
            continue;
        }
        for entry in fs::read_dir(shard.path()).map_err(|error| {
            format!(
                "Failed to read image cache shard {}: {error}",
                shard.path().display()
            )
        })? {
            let entry = entry.map_err(|error| {
                format!(
                    "Failed to inspect image cache shard {}: {error}",
                    shard.path().display()
                )
            })?;
            let metadata = fs::symlink_metadata(entry.path()).map_err(|error| {
                format!(
                    "Failed to inspect image cache file {}: {error}",
                    entry.path().display()
                )
            })?;
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                continue;
            }
            scan.entries += 1;
            scan.bytes = scan.bytes.saturating_add(metadata.len());
            scan.files.push(DiskFile {
                path: entry.path(),
                bytes: metadata.len(),
                modified: metadata.modified().unwrap_or(UNIX_EPOCH),
            });
        }
    }
    Ok(scan)
}

fn enforce_disk_limit(root: &Path, limit_bytes: u64) -> Result<DiskScan, String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("Failed to prepare image cache {}: {error}", root.display()))?;
    let mut scan = scan_disk_cache(root)?;
    if scan.bytes <= limit_bytes {
        return Ok(scan);
    }
    scan.files.sort_by_key(|file| file.modified);
    let target = limit_bytes.saturating_mul(DISK_CLEANUP_TARGET_PERCENT) / 100;
    for file in &scan.files {
        if scan.bytes <= target {
            break;
        }
        match fs::remove_file(&file.path) {
            Ok(()) => {
                scan.entries = scan.entries.saturating_sub(1);
                scan.bytes = scan.bytes.saturating_sub(file.bytes);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                scan.entries = scan.entries.saturating_sub(1);
                scan.bytes = scan.bytes.saturating_sub(file.bytes);
            }
            Err(error) => {
                eprintln!(
                    "Failed to evict image cache file {}: {error}",
                    file.path.display()
                );
            }
        }
    }
    scan.files.clear();
    Ok(scan)
}

fn detect_format(path: &Path) -> Result<(ImageFormat, u32, u32), String> {
    let reader = ImageReader::open(path)
        .map_err(|error| format!("Failed to open image {}: {error}", path.display()))?
        .with_guessed_format()
        .map_err(|error| format!("Failed to identify image {}: {error}", path.display()))?;
    let format = reader
        .format()
        .ok_or_else(|| format!("Unsupported image format: {}", path.display()))?;
    if !matches!(
        format,
        ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::WebP | ImageFormat::Gif
    ) {
        return Err(format!("Unsupported image format: {format:?}"));
    }
    let (width, height) = reader
        .into_dimensions()
        .map_err(|error| format!("Failed to inspect image {}: {error}", path.display()))?;
    if width > MAX_IMAGE_DIMENSION
        || height > MAX_IMAGE_DIMENSION
        || u64::from(width).saturating_mul(u64::from(height)) > MAX_IMAGE_PIXELS
    {
        return Err(format!(
            "Image {} exceeds the supported dimension limit",
            path.display()
        ));
    }
    Ok((format, width, height))
}

fn extension_for_format(format: ImageFormat) -> Result<&'static str, String> {
    match format {
        ImageFormat::Jpeg => Ok("jpg"),
        ImageFormat::Png => Ok("png"),
        ImageFormat::WebP => Ok("webp"),
        ImageFormat::Gif => Ok("gif"),
        _ => Err(format!("Unsupported image format: {format:?}")),
    }
}

fn stage_import_blocking(
    configured: &ConfiguredRoot,
    source: PathBuf,
    token: &str,
    final_id: &str,
) -> Result<StagedImport, String> {
    let source_metadata = fs::symlink_metadata(&source).map_err(|error| {
        format!(
            "Failed to inspect selected image {}: {error}",
            source.display()
        )
    })?;
    if !source_metadata.is_file() || source_metadata.file_type().is_symlink() {
        return Err("Selected image must be a regular file, not a symlink".to_string());
    }
    let (format, _, _) = detect_format(&source)?;
    let extension = extension_for_format(format)?;
    let staging_root = &configured.staging_root;
    fs::create_dir_all(staging_root).map_err(|error| {
        format!(
            "Failed to prepare image staging directory {}: {error}",
            staging_root.display()
        )
    })?;
    let staged_path = staging_root.join(format!("{token}.stage"));
    let mut input = BufReader::new(File::open(&source).map_err(|error| {
        format!(
            "Failed to open selected image {}: {error}",
            source.display()
        )
    })?);
    let output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staged_path)
        .map_err(|error| {
            format!(
                "Failed to create staged image {}: {error}",
                staged_path.display()
            )
        })?;
    let mut output = BufWriter::new(output);
    let size_bytes = std::io::copy(&mut input, &mut output)
        .map_err(|error| format!("Failed to stage selected image: {error}"))?;
    output
        .flush()
        .map_err(|error| format!("Failed to flush staged image: {error}"))?;
    output
        .get_ref()
        .sync_all()
        .map_err(|error| format!("Failed to sync staged image: {error}"))?;
    match detect_format(&staged_path) {
        Ok((staged_format, _, _)) if staged_format == format => {}
        Ok((staged_format, _, _)) => {
            let _ = fs::remove_file(&staged_path);
            return Err(format!(
                "Selected image changed format while it was being copied ({format:?} to {staged_format:?})"
            ));
        }
        Err(error) => {
            let _ = fs::remove_file(&staged_path);
            return Err(error);
        }
    }

    Ok(StagedImport {
        generation: configured.generation,
        staged_path,
        relative_path: format!("images/{final_id}.{extension}"),
        size_bytes,
    })
}

fn commit_import_blocking(
    configured: &ConfiguredRoot,
    staged: &StagedImport,
) -> Result<PathBuf, String> {
    let relative = validate_relative_path(&staged.relative_path)?;
    let relative_parent = relative
        .parent()
        .ok_or_else(|| "Image destination has no parent directory".to_string())?;
    let requested_parent = configured.assets_root.join(relative_parent);
    fs::create_dir_all(&requested_parent).map_err(|error| {
        format!(
            "Failed to prepare image destination {}: {error}",
            requested_parent.display()
        )
    })?;
    let parent = fs::canonicalize(&requested_parent).map_err(|error| {
        format!(
            "Failed to resolve image destination {}: {error}",
            requested_parent.display()
        )
    })?;
    if !parent.starts_with(&configured.assets_root) || !parent.is_dir() {
        return Err("Image destination resolves outside the assets directory".to_string());
    }
    let filename = relative
        .file_name()
        .ok_or_else(|| "Image destination has no filename".to_string())?;
    let destination = parent.join(filename);
    if destination.exists() {
        return Err(format!(
            "Image destination already exists: {}",
            destination.display()
        ));
    }
    fs::rename(&staged.staged_path, &destination).map_err(|error| {
        format!(
            "Failed to publish staged image to {}: {error}",
            destination.display()
        )
    })?;
    let canonical = fs::canonicalize(&destination).map_err(|error| {
        format!(
            "Failed to resolve committed image {}: {error}",
            destination.display()
        )
    })?;
    if !canonical.starts_with(&configured.assets_root) || !canonical.is_file() {
        let _ = fs::rename(&destination, &staged.staged_path);
        return Err("Committed image resolved outside the assets directory".to_string());
    }
    Ok(canonical)
}

fn rollback_committed_import_blocking(
    configured: &ConfiguredRoot,
    staged: &StagedImport,
    committed_path: &Path,
) -> Result<(), String> {
    let canonical = fs::canonicalize(committed_path).map_err(|error| {
        format!(
            "Failed to resolve the committed image {}: {error}",
            committed_path.display()
        )
    })?;
    if !canonical.starts_with(&configured.assets_root) || !canonical.is_file() {
        return Err(
            "The committed image no longer resolves inside the assets directory".to_string(),
        );
    }
    if staged.staged_path.exists() {
        return Err(format!(
            "The image staging path is unexpectedly occupied: {}",
            staged.staged_path.display()
        ));
    }
    let staging_parent = staged
        .staged_path
        .parent()
        .ok_or_else(|| "Image staging path has no parent directory".to_string())?;
    let canonical_staging_parent = fs::canonicalize(staging_parent).map_err(|error| {
        format!(
            "Failed to resolve image staging directory {}: {error}",
            staging_parent.display()
        )
    })?;
    if canonical_staging_parent != configured.staging_root {
        return Err(
            "Image staging path resolves outside the configured staging directory".to_string(),
        );
    }

    fs::rename(&canonical, &staged.staged_path).map_err(|error| {
        format!(
            "Failed to return committed image {} to staging: {error}",
            canonical.display()
        )
    })
}

fn detect_original_content_type(path: &Path, bytes: &[u8]) -> &'static str {
    image::guess_format(bytes)
        .ok()
        .and_then(content_type_for_format)
        .or_else(|| {
            ImageFormat::from_path(path)
                .ok()
                .and_then(content_type_for_format)
        })
        .unwrap_or("application/octet-stream")
}

fn content_type_for_format(format: ImageFormat) -> Option<&'static str> {
    match format {
        ImageFormat::Jpeg => Some("image/jpeg"),
        ImageFormat::Png => Some("image/png"),
        ImageFormat::WebP => Some("image/webp"),
        ImageFormat::Gif => Some("image/gif"),
        _ => None,
    }
}

fn decode_protocol_path(encoded: &str) -> Result<String, String> {
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|error| format!("base64 decoding failed: {error}"))?;
    let decoded = String::from_utf8(bytes).map_err(|_| "path is not valid UTF-8".to_string())?;
    validate_relative_path(&decoded)?;
    Ok(decoded)
}

fn protocol_base(generation: u64) -> String {
    #[cfg(target_os = "windows")]
    {
        format!("http://media.localhost/{PROTOCOL_VERSION}/{generation}")
    }
    #[cfg(not(target_os = "windows"))]
    {
        format!("media://localhost/{PROTOCOL_VERSION}/{generation}")
    }
}

struct ProtocolError {
    status: StatusCode,
    message: String,
}

impl ProtocolError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

fn error_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    let body = message.as_bytes().to_vec();
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(CONTENT_LENGTH, body.len())
        .header(CACHE_CONTROL, "no-store")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

#[tauri::command]
pub async fn configure_image_service(
    state: State<'_, ImageService>,
    data_dir: String,
    cache_limit: Option<u64>,
) -> Result<ImageServiceStatus, String> {
    state.configure(data_dir, cache_limit).await
}

#[tauri::command]
pub async fn image_service_status(
    state: State<'_, ImageService>,
) -> Result<ImageServiceStatus, String> {
    if let Ok(configured) = state.configured_root() {
        state.refresh_and_enforce_disk_limit(&configured).await?;
    }
    state.status().await
}

#[tauri::command]
pub async fn clear_image_service_cache(
    state: State<'_, ImageService>,
) -> Result<ImageServiceStatus, String> {
    let _ = state.clear_cache().await?;
    state.status().await
}

#[tauri::command]
pub async fn prewarm_image_cache(
    state: State<'_, ImageService>,
    requests: Vec<PrewarmRequest>,
) -> Result<PrewarmResult, String> {
    state.prewarm(requests).await
}

#[tauri::command]
pub async fn cover_palettes(
    state: State<'_, ImageService>,
    image_paths: Vec<String>,
) -> Result<Vec<CoverPaletteEntry>, String> {
    state.cover_palettes(image_paths).await
}

#[tauri::command]
pub async fn stage_cover_import(
    state: State<'_, ImageService>,
    source_path: String,
) -> Result<StagedCoverImportResult, String> {
    state.stage_import(source_path).await
}

#[tauri::command]
pub async fn commit_cover_import(
    state: State<'_, ImageService>,
    token: String,
) -> Result<CommittedCoverImportResult, String> {
    state.commit_import(token).await
}

#[tauri::command]
pub async fn cancel_cover_import(
    state: State<'_, ImageService>,
    token: String,
) -> Result<bool, String> {
    state.cancel_import(token).await
}
