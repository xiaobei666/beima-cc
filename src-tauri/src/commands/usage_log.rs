//! 用量查询命令
//!
//! 通过 HTTP API 查询 API Key 的使用统计信息。

use serde_json::{json, Value};
use once_cell::sync::Lazy;

const DEFAULT_BASE_URL: &str = "https://claude.kun8.vip";
const USER_STATS_ENDPOINT: &str = "/apiStats/api/user-stats";
const MODEL_STATS_ENDPOINT: &str = "/apiStats/api/user-model-stats";
const REQUEST_TIMEOUT_SECS: u64 = 10;

static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent("bmai-tools/usage-log")
        .build()
        .unwrap_or_else(|e| panic!("failed to build reqwest client: {e}"))
});

/// 查询 API 用量统计
#[tauri::command]
pub async fn query_api_usage(
    api_key: String,
    base_url: Option<String>,
    period: Option<String>,
) -> Result<Value, String> {
    let base = base_url
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
    let url = format!("{}{}", base.trim_end_matches('/'), USER_STATS_ENDPOINT);
    let period = period.unwrap_or_else(|| "daily".to_string());

    let response = HTTP_CLIENT
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&json!({
            "apiKey": api_key,
            "period": period
        }))
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, text));
    }

    serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {}", e))
}

/// 查询模型使用统计
#[tauri::command]
pub async fn query_model_stats(
    api_key: String,
    base_url: Option<String>,
    period: Option<String>,
) -> Result<Value, String> {
    let base = base_url
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
    let url = format!("{}{}", base.trim_end_matches('/'), MODEL_STATS_ENDPOINT);
    let period = period.unwrap_or_else(|| "daily".to_string());

    let response = HTTP_CLIENT
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&json!({
            "apiKey": api_key,
            "period": period
        }))
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, text));
    }

    serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {}", e))
}
