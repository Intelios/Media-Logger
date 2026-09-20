// Remote cover-art search for the opt-in Cover Art feature. All outbound HTTP
// lives here: `cover_search` sends the query to exactly one provider (chosen
// by entry type) and `cover_stage_from_url` downloads the picked original
// straight into the existing image-import staging flow. Error strings are
// user-facing sentences and never echo upstream URLs, bodies, or credentials.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State as TauriState};
use uuid::Uuid;

use crate::image_service::{ImageService, StagedCoverImportResult};

const USER_AGENT: &str = concat!(
    "MediaLogger/",
    env!("CARGO_PKG_VERSION"),
    " (personal media library)"
);
const MAX_RESULTS: usize = 24;
const MAX_QUERY_CHARS: usize = 200;
const MAX_DOWNLOAD_BYTES: u64 = 32 * 1024 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
// Refresh the Twitch app-access token this long before it actually expires.
const IGDB_TOKEN_EXPIRY_MARGIN: Duration = Duration::from_secs(3600);
// Defensive cap so `Instant::now() + expires_in` can never overflow.
const IGDB_MAX_TOKEN_LIFETIME: Duration = Duration::from_secs(365 * 24 * 60 * 60);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverSearchResult {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub thumbnail_url: String,
    pub original_url: String,
}

pub struct CoverSearchState {
    client: reqwest::Client,
    download_root: PathBuf,
    igdb_token: Mutex<IgdbTokenCache>,
}

struct IgdbTokenCache {
    client_id: String,
    token: Option<IgdbToken>,
}

struct IgdbToken {
    access_token: String,
    expires_at: Instant,
}

impl CoverSearchState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let cache_root = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("Failed to resolve application cache directory: {error}"))?;
        let download_root = cache_root.join("cover-downloads");
        // Files only ever survive here if the app quit between download and
        // stage; clearing at startup keeps the cache directory from growing.
        let _ = std::fs::remove_dir_all(&download_root);
        std::fs::create_dir_all(&download_root).map_err(|error| {
            format!(
                "Failed to prepare cover download directory {}: {error}",
                download_root.display()
            )
        })?;

        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| format!("Failed to create the cover search HTTP client: {error}"))?;

        Ok(Self {
            client,
            download_root,
            igdb_token: Mutex::new(IgdbTokenCache {
                client_id: String::new(),
                token: None,
            }),
        })
    }
}

fn normalize_credential(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|trimmed| !trimmed.is_empty())
}

fn required_credential(value: Option<String>, label: &str) -> Result<String, String> {
    normalize_credential(value)
        .ok_or_else(|| format!("A {label} is required for this media type. Add it in Settings → Cover Art."))
}

fn year_from_date(date: &str) -> Option<String> {
    let year = date.get(..4)?;
    year.chars()
        .all(|c| c.is_ascii_digit())
        .then(|| year.to_string())
}

#[tauri::command]
pub async fn cover_search(
    state: TauriState<'_, CoverSearchState>,
    query: String,
    entry_type: String,
    tmdb_api_key: Option<String>,
    igdb_client_id: Option<String>,
    igdb_client_secret: Option<String>,
    rawg_api_key: Option<String>,
    game_provider: Option<String>,
) -> Result<Vec<CoverSearchResult>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err("Enter a title to search for.".to_string());
    }
    let query: String = query.chars().take(MAX_QUERY_CHARS).collect();

    match entry_type.trim().to_ascii_lowercase().as_str() {
        "movie" => {
            let api_key = required_credential(tmdb_api_key, "TMDB API key")?;
            search_tmdb(&state.client, false, &query, &api_key).await
        }
        "show" | "k-drama" => {
            let api_key = required_credential(tmdb_api_key, "TMDB API key")?;
            search_tmdb(&state.client, true, &query, &api_key).await
        }
        "anime" => search_anilist(&state.client, &query).await,
        "book" => search_open_library(&state.client, &query).await,
        "album" => search_itunes(&state.client, &query).await,
        "game" => match game_provider.as_deref().unwrap_or("igdb") {
            "rawg" => {
                let api_key = required_credential(rawg_api_key, "RAWG API key")?;
                search_rawg(&state.client, &query, &api_key).await
            }
            _ => {
                let client_id = required_credential(igdb_client_id, "IGDB Client ID")?;
                let client_secret = required_credential(igdb_client_secret, "IGDB Client Secret")?;
                search_igdb(&state, &client_id, &client_secret, &query).await
            }
        },
        _ => Err(format!(
            "Cover art search does not support the {} type.",
            entry_type.trim()
        )),
    }
}

#[tauri::command]
pub async fn cover_stage_from_url(
    search: TauriState<'_, CoverSearchState>,
    images: TauriState<'_, ImageService>,
    url: String,
) -> Result<StagedCoverImportResult, String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| "The cover URL is not valid.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only https cover URLs can be downloaded.".to_string());
    }

    let response = search
        .client
        .get(parsed)
        .send()
        .await
        .map_err(|_| "Failed to download the cover — check your network connection.".to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("The cover download failed (HTTP {status})."));
    }

    // An absent Content-Type is tolerated — staging sniffs the real format
    // from the bytes. A present non-image header means an error page or
    // similar came back with a 200 and staging must not see it.
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.is_empty() && !content_type.starts_with("image/") {
        return Err(format!(
            "The provider returned '{content_type}' instead of an image."
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_DOWNLOAD_BYTES)
    {
        return Err("The cover image exceeds the 32 MiB download limit.".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Failed to read the downloaded cover.".to_string())?;
    if bytes.len() as u64 > MAX_DOWNLOAD_BYTES {
        return Err("The cover image exceeds the 32 MiB download limit.".to_string());
    }
    if bytes.is_empty() {
        return Err("The provider returned an empty image.".to_string());
    }

    let temp_path = search.download_root.join(format!("{}.download", Uuid::new_v4()));
    let write_path = temp_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(&write_path, &bytes)
            .map_err(|error| format!("Failed to write the downloaded cover: {error}"))
    })
    .await
    .map_err(|error| format!("Cover download worker failed: {error}"))??;

    // stage_import copies the bytes into the staging directory (it never
    // consumes the source), so the temp file goes away either way.
    let staged = images
        .stage_import(temp_path.to_string_lossy().into_owned())
        .await;
    let _ = std::fs::remove_file(&temp_path);
    staged
}

async fn search_tmdb(
    client: &reqwest::Client,
    tv: bool,
    query: &str,
    api_key: &str,
) -> Result<Vec<CoverSearchResult>, String> {
    let endpoint = if tv { "tv" } else { "movie" };
    let response = client
        .get(format!("https://api.themoviedb.org/3/search/{endpoint}"))
        .query(&[
            ("query", query),
            ("api_key", api_key),
            ("include_adult", "false"),
            ("page", "1"),
        ])
        .send()
        .await
        .map_err(|_| "TMDB search failed — check your network connection.".to_string())?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("TMDB rejected the API key — verify it in Settings → Cover Art.".to_string());
    }
    if !response.status().is_success() {
        return Err(format!("TMDB search failed (HTTP {}).", response.status()));
    }

    let text = response
        .text()
        .await
        .map_err(|_| "TMDB returned an unreadable response.".to_string())?;
    let payload: TmdbSearchResponse = serde_json::from_str(&text)
        .map_err(|_| "TMDB returned an unexpected response.".to_string())?;

    Ok(payload
        .results
        .into_iter()
        .filter_map(|item| {
            let poster = item.poster_path?;
            let title = item.title.or(item.name)?;
            Some(CoverSearchResult {
                id: item.id.to_string(),
                title,
                subtitle: item
                    .release_date
                    .as_deref()
                    .or(item.first_air_date.as_deref())
                    .and_then(year_from_date),
                thumbnail_url: format!("https://image.tmdb.org/t/p/w342{poster}"),
                original_url: format!("https://image.themoviedb.org/t/p/original{poster}"),
            })
        })
        .take(MAX_RESULTS)
        .collect())
}

async fn search_anilist(
    client: &reqwest::Client,
    query: &str,
) -> Result<Vec<CoverSearchResult>, String> {
    let graphql_query = "\
query ($search: String) {
  Page(perPage: 24) {
    media(search: $search, type: ANIME, isAdult: false) {
      id
      title { romaji english }
      coverImage { extraLarge }
      startDate { year }
    }
  }
}";
    let body = serde_json::json!({ "query": graphql_query, "variables": { "search": query } });
    let response = client
        .post("https://graphql.anilist.co")
        .json(&body)
        .send()
        .await
        .map_err(|_| "AniList search failed — check your network connection.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("AniList search failed (HTTP {}).", response.status()));
    }

    let text = response
        .text()
        .await
        .map_err(|_| "AniList returned an unreadable response.".to_string())?;
    let payload: AnilistSearchResponse = serde_json::from_str(&text)
        .map_err(|_| "AniList returned an unexpected response.".to_string())?;

    Ok(payload
        .data
        .page
        .media
        .into_iter()
        .filter_map(|media| {
            let cover = media.cover_image?.extra_large?;
            let title = media.title.romaji.or(media.title.english)?;
            Some(CoverSearchResult {
                id: media.id.to_string(),
                title,
                subtitle: media
                    .start_date
                    .and_then(|date| date.year)
                    .map(|year| year.to_string()),
                thumbnail_url: cover.clone(),
                original_url: cover,
            })
        })
        .collect())
}

async fn search_open_library(
    client: &reqwest::Client,
    query: &str,
) -> Result<Vec<CoverSearchResult>, String> {
    let response = client
        .get("https://openlibrary.org/search.json")
        .query(&[
            ("q", query),
            ("limit", "24"),
            (
                "fields",
                "key,title,cover_i,author_name,first_publish_year",
            ),
        ])
        .send()
        .await
        .map_err(|_| "Open Library search failed — check your network connection.".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Open Library search failed (HTTP {}).",
            response.status()
        ));
    }

    let text = response
        .text()
        .await
        .map_err(|_| "Open Library returned an unreadable response.".to_string())?;
    let payload: OpenLibrarySearchResponse = serde_json::from_str(&text)
        .map_err(|_| "Open Library returned an unexpected response.".to_string())?;

    Ok(payload
        .docs
        .into_iter()
        .filter_map(|doc| {
            let cover_id = doc.cover_i?;
            let title = doc.title?;
            let mut parts: Vec<String> = Vec::new();
            if let Some(authors) = doc.author_name.filter(|names| !names.is_empty()) {
                parts.push(authors.join(", "));
            }
            if let Some(year) = doc.first_publish_year {
                parts.push(year.to_string());
            }
            Some(CoverSearchResult {
                id: doc.key,
                title,
                subtitle: (!parts.is_empty()).then(|| parts.join(" · ")),
                thumbnail_url: format!("https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"),
                original_url: format!("https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"),
            })
        })
        .collect())
}

async fn search_itunes(
    client: &reqwest::Client,
    query: &str,
) -> Result<Vec<CoverSearchResult>, String> {
    // iTunes answers with `text/javascript`; read as text and parse from there.
    let response = client
        .get("https://itunes.apple.com/search")
        .query(&[("term", query), ("entity", "album"), ("limit", "24")])
        .send()
        .await
        .map_err(|_| "Album search failed — check your network connection.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("Album search failed (HTTP {}).", response.status()));
    }

    let text = response
        .text()
        .await
        .map_err(|_| "The album search response was unreadable.".to_string())?;
    let payload: ItunesSearchResponse = serde_json::from_str(&text)
        .map_err(|_| "The album search returned an unexpected response.".to_string())?;

    Ok(payload
        .results
        .into_iter()
        .filter_map(|album| {
            let artwork = album.artwork_url_100;
            // Apple's CDN serves the same asset at larger sizes by swapping
            // the dimension segment of the artwork URL.
            let original = artwork.replace("100x100bb", "1000x1000bb");
            Some(CoverSearchResult {
                id: album.collection_id.to_string(),
                title: album.collection_name,
                subtitle: Some(album.artist_name),
                thumbnail_url: artwork,
                original_url: original,
            })
        })
        .collect())
}

enum IgdbRequestError {
    Unauthorized,
    Fatal(String),
}

// RAWG's game objects carry high-resolution promotional screenshots
// (`background_image`, natively 16:9). They are passed through untouched —
// no cropping or URL transformation — so what the picker shows is the exact
// image that gets imported.
async fn search_rawg(
    client: &reqwest::Client,
    query: &str,
    api_key: &str,
) -> Result<Vec<CoverSearchResult>, String> {
    let response = client
        .get("https://api.rawg.io/api/games")
        .query(&[
            ("search", query),
            ("page_size", "24"),
            ("key", api_key),
        ])
        .send()
        .await
        .map_err(|_| "RAWG search failed — check your network connection.".to_string())?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("RAWG rejected the API key — verify it in Settings → Cover Art.".to_string());
    }
    if !status.is_success() {
        return Err(format!("RAWG search failed (HTTP {status})."));
    }

    let text = response
        .text()
        .await
        .map_err(|_| "RAWG returned an unreadable response.".to_string())?;
    let payload: RawgSearchResponse = serde_json::from_str(&text)
        .map_err(|_| "RAWG returned an unexpected response.".to_string())?;

    Ok(payload
        .results
        .into_iter()
        .filter_map(|game| {
            let image = game.background_image?;
            Some(CoverSearchResult {
                id: game.id.to_string(),
                title: game.name,
                subtitle: game.released.as_deref().and_then(year_from_date),
                thumbnail_url: image.clone(),
                original_url: image,
            })
        })
        .collect())
}

async fn search_igdb(
    state: &CoverSearchState,
    client_id: &str,
    client_secret: &str,
    query: &str,
) -> Result<Vec<CoverSearchResult>, String> {
    // A 401 means the cached app token went stale (or Twitch rotated it);
    // force one fresh token before giving up on the credentials.
    let mut force_refresh = false;
    for _ in 0..2 {
        let token = current_igdb_token(state, client_id, client_secret, force_refresh).await?;
        match igdb_games_request(&state.client, &token, client_id, query).await {
            Ok(results) => return Ok(results),
            Err(IgdbRequestError::Unauthorized) => {
                force_refresh = true;
                continue;
            }
            Err(IgdbRequestError::Fatal(message)) => return Err(message),
        }
    }
    Err(
        "IGDB rejected the app access token — verify the Client ID and Secret in Settings → Cover Art."
            .to_string(),
    )
}

async fn current_igdb_token(
    state: &CoverSearchState,
    client_id: &str,
    client_secret: &str,
    force_refresh: bool,
) -> Result<String, String> {
    if !force_refresh {
        let cached = state
            .igdb_token
            .lock()
            .map_err(|_| "IGDB token cache lock is unavailable".to_string())?;
        if cached.client_id == client_id
            && let Some(token) = &cached.token
            && token.expires_at > Instant::now() + IGDB_TOKEN_EXPIRY_MARGIN
        {
            return Ok(token.access_token.clone());
        }
    }

    let response = state
        .client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|_| {
            "Failed to request an IGDB access token — check your network connection.".to_string()
        })?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::BAD_REQUEST {
        return Err(
            "IGDB rejected the Client ID / Client Secret — verify them in Settings → Cover Art."
                .to_string(),
        );
    }
    if !status.is_success() {
        return Err(format!(
            "Failed to obtain an IGDB access token (HTTP {status})."
        ));
    }

    let text = response
        .text()
        .await
        .map_err(|_| "The IGDB token response was unreadable.".to_string())?;
    let payload: IgdbTokenResponse = serde_json::from_str(&text)
        .map_err(|_| "IGDB returned an unexpected token response.".to_string())?;

    let token = IgdbToken {
        access_token: payload.access_token,
        expires_at: Instant::now()
            + Duration::from_secs(
                payload
                    .expires_in
                    .min(IGDB_MAX_TOKEN_LIFETIME.as_secs())
                    .max(1),
            ),
    };
    let access_token = token.access_token.clone();
    let mut cache = state
        .igdb_token
        .lock()
        .map_err(|_| "IGDB token cache lock is unavailable".to_string())?;
    *cache = IgdbTokenCache {
        client_id: client_id.to_string(),
        token: Some(token),
    };
    Ok(access_token)
}

async fn igdb_games_request(
    client: &reqwest::Client,
    token: &str,
    client_id: &str,
    query: &str,
) -> Result<Vec<CoverSearchResult>, IgdbRequestError> {
    // Apicalypse search terms are double-quoted; strip the characters that
    // would break out of the quotes.
    let sanitized: String = query
        .chars()
        .map(|c| if c == '"' || c == '\\' { ' ' } else { c })
        .collect();
    let body = format!(
        "search \"{sanitized}\"; fields name,cover.image_id,first_release_date; limit {MAX_RESULTS};"
    );

    let response = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {token}"))
        .body(body)
        .send()
        .await
        .map_err(|_| {
            IgdbRequestError::Fatal(
                "IGDB search failed — check your network connection.".to_string(),
            )
        })?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(IgdbRequestError::Unauthorized);
    }
    if !status.is_success() {
        return Err(IgdbRequestError::Fatal(format!(
            "IGDB search failed (HTTP {status})."
        )));
    }

    let text = response
        .text()
        .await
        .map_err(|_| IgdbRequestError::Fatal("IGDB returned an unreadable response.".to_string()))?;
    let games: Vec<IgdbGame> = serde_json::from_str(&text)
        .map_err(|_| {
            IgdbRequestError::Fatal("IGDB returned an unexpected response.".to_string())
        })?;

    Ok(games
        .into_iter()
        .filter_map(|game| {
            let image_id = game.cover?.image_id?;
            Some(CoverSearchResult {
                id: game.id.to_string(),
                title: game.name?,
                subtitle: game
                    .first_release_date
                    .and_then(|timestamp| chrono::DateTime::from_timestamp(timestamp, 0))
                    .map(|datetime| datetime.format("%Y").to_string()),
                thumbnail_url: format!(
                    "https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg"
                ),
                original_url: format!(
                    "https://images.igdb.com/igdb/image/upload/t_720p/{image_id}.jpg"
                ),
            })
        })
        .collect())
}

#[derive(Deserialize)]
struct TmdbSearchResponse {
    results: Vec<TmdbSearchItem>,
}

#[derive(Deserialize)]
struct TmdbSearchItem {
    id: u64,
    title: Option<String>,
    name: Option<String>,
    poster_path: Option<String>,
    release_date: Option<String>,
    first_air_date: Option<String>,
}

#[derive(Deserialize)]
struct AnilistSearchResponse {
    data: AnilistSearchData,
}

#[derive(Deserialize)]
struct AnilistSearchData {
    #[serde(rename = "Page")]
    page: AnilistPage,
}

#[derive(Deserialize)]
struct AnilistPage {
    media: Vec<AnilistMedia>,
}

#[derive(Deserialize)]
struct AnilistMedia {
    id: u64,
    title: AnilistTitle,
    #[serde(rename = "coverImage")]
    cover_image: Option<AnilistCoverImage>,
    #[serde(rename = "startDate")]
    start_date: Option<AnilistDate>,
}

#[derive(Deserialize)]
struct AnilistTitle {
    romaji: Option<String>,
    english: Option<String>,
}

#[derive(Deserialize)]
struct AnilistCoverImage {
    #[serde(rename = "extraLarge")]
    extra_large: Option<String>,
}

#[derive(Deserialize)]
struct AnilistDate {
    year: Option<i64>,
}

#[derive(Deserialize)]
struct OpenLibrarySearchResponse {
    docs: Vec<OpenLibraryDoc>,
}

#[derive(Deserialize)]
struct OpenLibraryDoc {
    key: String,
    title: Option<String>,
    cover_i: Option<u64>,
    author_name: Option<Vec<String>>,
    first_publish_year: Option<i64>,
}

#[derive(Deserialize)]
struct ItunesSearchResponse {
    results: Vec<ItunesAlbum>,
}

#[derive(Deserialize)]
struct ItunesAlbum {
    #[serde(rename = "collectionId")]
    collection_id: u64,
    #[serde(rename = "collectionName")]
    collection_name: String,
    #[serde(rename = "artistName")]
    artist_name: String,
    #[serde(rename = "artworkUrl100")]
    artwork_url_100: String,
}

#[derive(Deserialize)]
struct IgdbTokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct RawgSearchResponse {
    results: Vec<RawgGame>,
}

#[derive(Deserialize)]
struct RawgGame {
    id: u64,
    name: String,
    background_image: Option<String>,
    released: Option<String>,
}

#[derive(Deserialize)]
struct IgdbGame {
    id: u64,
    name: Option<String>,
    cover: Option<IgdbCover>,
    first_release_date: Option<i64>,
}

#[derive(Deserialize)]
struct IgdbCover {
    image_id: Option<String>,
}
