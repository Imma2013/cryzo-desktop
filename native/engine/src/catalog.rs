use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct Catalog {
    pub upstream_commit: String,
    pub providers: Vec<Provider>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub credential_env: Vec<String>,
    pub models: Vec<Model>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub apis: Vec<Api>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Api {
    pub protocol: String,
    pub base_url: Option<String>,
}

impl Catalog {
    pub fn load() -> Result<Self> {
        let source: BTreeMap<String, SourceProvider> = serde_json::from_str(include_str!(
            "../../../packages/core/src/models-dev/snapshot.txt"
        ))?;
        Ok(Self {
            upstream_commit: "caebbcc0807e630629725f320f35a09aa4a427be".into(),
            providers: source
                .into_values()
                .map(|provider| Provider {
                    id: provider.id,
                    name: provider.name,
                    credential_env: provider.env,
                    models: provider
                        .models
                        .into_values()
                        .map(|model| Model {
                            id: model.id,
                            name: model.name,
                            apis: model
                                .api
                                .into_iter()
                                .map(|(protocol, api)| Api {
                                    protocol,
                                    base_url: api.base_url,
                                })
                                .collect(),
                        })
                        .collect(),
                })
                .collect(),
        })
    }

    pub fn chat_endpoint(&self, provider: &str, model: &str) -> Result<&str> {
        let Some(provider) = self.providers.iter().find(|entry| entry.id == provider) else {
            bail!("unknown provider")
        };
        let Some(model) = provider.models.iter().find(|entry| entry.id == model) else {
            bail!("unknown model for this provider")
        };
        // Catalog presence is not parity. Only explicitly implemented transports may run.
        model
            .apis
            .iter()
            .find(|api| api.protocol == "chat-completions")
            .and_then(|api| api.base_url.as_deref())
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "this model's native transport has not passed the compatibility gate"
                )
            })
    }
}

#[derive(Deserialize)]
struct SourceProvider {
    id: String,
    name: String,
    #[serde(default)]
    env: Vec<String>,
    models: BTreeMap<String, SourceModel>,
}
#[derive(Deserialize)]
struct SourceModel {
    id: String,
    name: String,
    #[serde(default)]
    api: BTreeMap<String, SourceApi>,
}
#[derive(Deserialize)]
struct SourceApi {
    base_url: Option<String>,
}
