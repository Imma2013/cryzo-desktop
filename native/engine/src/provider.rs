use anyhow::{Context, Result, bail, ensure};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use url::Url;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

/// API-key Chat Completions transport shared by compatible providers.
/// OAuth, Bedrock, Responses, Anthropic and Gemini need their own authenticated adapters.
pub async fn chat(
    endpoint: &str,
    secret: &str,
    model: &str,
    messages: &[Message],
    output: mpsc::Sender<String>,
    cancel: CancellationToken,
) -> Result<String> {
    let mut url = Url::parse(endpoint)?;
    ensure!(
        url.scheme() == "https"
            || (url.scheme() == "http"
                && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))),
        "provider URL must use HTTPS (except local inference)"
    );
    ensure!(
        url.username().is_empty() && url.password().is_none(),
        "credentials must not appear in provider URLs"
    );
    url.set_path(&format!(
        "{}/chat/completions",
        url.path().trim_end_matches('/')
    ));
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(600))
        .build()?;
    let response = tokio::select! {
        _ = cancel.cancelled() => bail!("generation interrupted"),
        response = client.post(url).bearer_auth(secret).json(&json!({"model":model,"messages":messages,"stream":true})).send() => response.context("connect to provider")?,
    };
    // Do not include arbitrary provider bodies: some services echo credentials in diagnostics.
    ensure!(
        response.status().is_success(),
        "provider returned HTTP {}",
        response.status()
    );
    let mut stream = response.bytes_stream();
    let mut decoder = Sse::default();
    let mut text = String::new();
    let mut finished = false;
    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => bail!("generation interrupted"),
            next = stream.next() => next,
        };
        let Some(chunk) = next else { break };
        for data in decoder.push(&chunk?)? {
            if data == "[DONE]" {
                finished = true;
                continue;
            }
            let value: Value = serde_json::from_str(&data).context("invalid provider event")?;
            ensure!(
                value.get("error").is_none(),
                "provider reported a generation error"
            );
            if let Some(delta) = value
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str)
            {
                text.push_str(delta);
                let _ = output.send(delta.to_owned()).await;
            }
            if value
                .pointer("/choices/0/finish_reason")
                .and_then(Value::as_str)
                .is_some()
            {
                finished = true;
            }
        }
    }
    ensure!(finished, "provider stream ended before completion");
    Ok(text)
}

/// Byte framing preserves Unicode when a codepoint is split between network chunks.
#[derive(Default)]
pub struct Sse {
    pending: Vec<u8>,
    data: Vec<String>,
}

impl Sse {
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<String>> {
        self.pending.extend_from_slice(bytes);
        ensure!(
            self.pending.len() <= 8_000_000,
            "provider event exceeds size limit"
        );
        let mut result = Vec::new();
        while let Some(end) = self.pending.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=end).collect();
            let line = std::str::from_utf8(&line)?.trim_end_matches(['\r', '\n']);
            if line.is_empty() {
                if !self.data.is_empty() {
                    result.push(self.data.join("\n"));
                    self.data.clear();
                }
                continue;
            }
            if let Some(data) = line.strip_prefix("data:") {
                self.data
                    .push(data.strip_prefix(' ').unwrap_or(data).to_owned());
            }
        }
        Ok(result)
    }
}
