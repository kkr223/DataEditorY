use reqwest::{blocking::Client, Url};
use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::{decrypt_secret_key, load_persisted_settings, normalize_base_url};

const DEFAULT_API_BASE_URL: &str = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_SECS: u64 = 120;

struct StoredAiSecret {
    key: String,
    api_base_url: String,
}

enum ResolvedAiSecret {
    Provided(String),
    Stored(StoredAiSecret),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListAiModelsRequest {
    pub(crate) api_base_url: String,
    #[serde(default)]
    pub(crate) secret_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiChatCompletionRequest {
    pub(crate) api_base_url: String,
    pub(crate) body: Value,
}

pub(crate) fn list_ai_models(
    app: &AppHandle,
    request: ListAiModelsRequest,
) -> Result<Vec<String>, String> {
    let requested_api_base_url = request_base_url(request.api_base_url, "models")?;
    let resolved_secret = resolve_secret_key(app, request.secret_key)?;
    let (api_base_url, secret_key) = match resolved_secret {
        ResolvedAiSecret::Provided(secret_key) => (requested_api_base_url, secret_key),
        ResolvedAiSecret::Stored(secret) => {
            if requested_api_base_url != secret.api_base_url {
                return Err(
                    "Changing API base URL requires entering the secret key again.".to_string(),
                );
            }
            (secret.api_base_url, secret.key)
        }
    };
    let endpoint = endpoint_for(&api_base_url, "models");
    let payload = client()?
        .get(endpoint)
        .bearer_auth(secret_key)
        .send()
        .map_err(|err| err.to_string())?;
    let payload = response_json(payload)?;
    let models = payload
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(Value::as_str))
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if models.is_empty() {
        return Err("No models were returned by the API".to_string());
    }

    Ok(models)
}

pub(crate) fn request_chat_completion(
    app: &AppHandle,
    request: AiChatCompletionRequest,
) -> Result<Value, String> {
    let requested_api_base_url = request_base_url(request.api_base_url, "chat/completions")?;
    let secret = stored_secret_key(app)?;
    if requested_api_base_url != secret.api_base_url {
        return Err("AI request API base URL does not match saved settings.".to_string());
    }

    let endpoint = endpoint_for(&secret.api_base_url, "chat/completions");

    let payload = client()?
        .post(endpoint)
        .bearer_auth(secret.key)
        .json(&request.body)
        .send()
        .map_err(|err| err.to_string())?;

    response_json(payload)
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|err| err.to_string())
}

fn resolve_secret_key(
    app: &AppHandle,
    provided_secret_key: Option<String>,
) -> Result<ResolvedAiSecret, String> {
    if let Some(secret_key) = provided_secret_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(ResolvedAiSecret::Provided(secret_key.to_string()));
    }

    stored_secret_key(app).map(ResolvedAiSecret::Stored)
}

fn stored_secret_key(app: &AppHandle) -> Result<StoredAiSecret, String> {
    let settings = load_persisted_settings(app)?;
    let api_base_url = validate_api_base_url(settings.api_base_url)?;
    let Some(encrypted_secret_key) = settings.encrypted_secret_key else {
        return Err("Secret key is required".to_string());
    };

    let key = decrypt_secret_key(app, &encrypted_secret_key)?;
    Ok(StoredAiSecret { key, api_base_url })
}

fn request_base_url(value: String, suffix: &str) -> Result<String, String> {
    let normalized = normalize_base_url(value);
    let suffix_with_slash = format!("/{suffix}");
    let base = normalized
        .strip_suffix(&suffix_with_slash)
        .map(ToString::to_string)
        .unwrap_or(normalized);

    validate_api_base_url(base)
}

fn validate_api_base_url(value: String) -> Result<String, String> {
    let normalized = normalize_base_url(value);
    let base = if normalized.is_empty() {
        DEFAULT_API_BASE_URL.to_string()
    } else {
        normalized
    };
    let parsed = Url::parse(&base).map_err(|err| format!("Invalid API base URL: {err}"))?;

    match parsed.scheme() {
        "https" => Ok(base),
        "http" if is_local_http_host(parsed.host_str()) => Ok(base),
        "http" => Err(
            "Insecure HTTP API base URL is not allowed for secret key authentication. Use HTTPS or localhost."
                .to_string(),
        ),
        scheme => Err(format!("Unsupported API base URL scheme: {scheme}")),
    }
}

fn is_local_http_host(host: Option<&str>) -> bool {
    matches!(host, Some("localhost" | "127.0.0.1" | "::1"))
}

fn endpoint_for(api_base_url: &str, suffix: &str) -> String {
    let normalized = api_base_url.trim().trim_end_matches('/');
    if normalized.ends_with(suffix) {
        normalized.to_string()
    } else {
        format!("{normalized}/{suffix}")
    }
}

fn response_json(response: reqwest::blocking::Response) -> Result<Value, String> {
    let status = response.status();
    let payload = response.json::<Value>().unwrap_or(Value::Null);
    if status.is_success() {
        return Ok(payload);
    }

    let message = payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| payload.get("message").and_then(Value::as_str))
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("AI request failed with status {}", status.as_u16()));

    Err(message)
}
