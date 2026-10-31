use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub database_url: String,
    pub host: String,
    pub port: u16,
    pub jwt_secret: String,
    pub jwt_expiration_hours: i64,
    pub storage_path: String,
    pub static_dir: String,
    pub frontend_url: String,
    pub cookie_secure: bool,
    // OIDC Configuration
    pub oidc_issuer_url: String,
    pub oidc_client_id: String,
    pub oidc_client_secret: String,
    pub oidc_redirect_uri: String,
    pub oidc_scopes: String,
    pub oidc_role_claim: String,
    pub oidc_admin_values: Vec<String>,
    pub oidc_modifier_values: Vec<String>,
    pub oidc_reader_values: Vec<String>,
    pub oidc_default_role: String,
    pub oidc_button_label: String,
    pub dev_mock_oidc: bool,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let _ = dotenvy::dotenv();

        let port = env::var("API_PORT")
            .or_else(|_| env::var("PORT"))
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8080);

        let host = env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());

        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgresql://origineo:origineo_secret_change_me@localhost:5432/origineo".to_string()
        });

        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| {
            "origineo-ultra-secure-default-jwt-secret-key-change-in-production-64chars".to_string()
        });

        let jwt_expiration_hours = env::var("JWT_EXPIRATION_HOURS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(24 * 7);

        let storage_path = env::var("STORAGE_PATH").unwrap_or_else(|_| "./storage".to_string());
        let static_dir = env::var("STATIC_DIR").unwrap_or_else(|_| "./frontend/build".to_string());
        let frontend_url = env::var("FRONTEND_URL")
            .unwrap_or_else(|_| format!("http://localhost:{}", port));

        let cookie_secure = env::var("COOKIE_SECURE")
            .map(|v| v == "true" || v == "1")
            .unwrap_or_else(|_| frontend_url.starts_with("https://"));

        let oidc_issuer_url = env::var("OIDC_ISSUER_URL").unwrap_or_default();
        let oidc_client_id = env::var("OIDC_CLIENT_ID").unwrap_or_default();
        let oidc_client_secret = env::var("OIDC_CLIENT_SECRET").unwrap_or_default();
        let oidc_redirect_uri = env::var("OIDC_REDIRECT_URI").unwrap_or_else(|_| {
            format!("{}/api/auth/oidc/callback", frontend_url.trim_end_matches('/'))
        });
        let oidc_scopes = env::var("OIDC_SCOPES")
            .unwrap_or_else(|_| "openid email profile groups".to_string());

        let oidc_role_claim = env::var("OIDC_ROLE_CLAIM")
            .or_else(|_| env::var("OIDC_ADMIN_CLAIM"))
            .unwrap_or_else(|_| "groups".to_string());

        let parse_csv = |key: &str, fallback: &[&str]| -> Vec<String> {
            env::var(key)
                .ok()
                .map(|val| {
                    val.split(',')
                        .map(|s| s.trim().to_lowercase())
                        .filter(|s| !s.is_empty())
                        .collect()
                })
                .unwrap_or_else(|| fallback.iter().map(|s| s.to_string()).collect())
        };

        let mut oidc_admin_values = parse_csv(
            "OIDC_ADMIN_VALUES",
            &["origineo-admin", "admin", "administrateur", "administrators"],
        );
        if let Ok(single) = env::var("OIDC_ADMIN_VALUE") {
            let clean = single.trim().to_lowercase();
            if !clean.is_empty() && !oidc_admin_values.contains(&clean) {
                oidc_admin_values.push(clean);
            }
        }

        let oidc_modifier_values = parse_csv(
            "OIDC_MODIFIER_VALUES",
            &[
                "origineo-modifier",
                "origineo-editor",
                "modifier",
                "modificateur",
                "editor",
            ],
        );

        let oidc_reader_values = parse_csv(
            "OIDC_READER_VALUES",
            &[
                "origineo-reader",
                "origineo-viewer",
                "reader",
                "lecteur",
                "viewer",
            ],
        );

        let oidc_default_role = env::var("OIDC_DEFAULT_ROLE")
            .unwrap_or_else(|_| "READER".to_string())
            .to_uppercase();

        let oidc_button_label = env::var("OIDC_BUTTON_LABEL")
            .unwrap_or_else(|_| "SSO OpenID Connect".to_string());

        let dev_mock_oidc = env::var("OIDC_DEV_MOCK")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        Self {
            database_url,
            host,
            port,
            jwt_secret,
            jwt_expiration_hours,
            storage_path,
            static_dir,
            frontend_url,
            cookie_secure,
            oidc_issuer_url,
            oidc_client_id,
            oidc_client_secret,
            oidc_redirect_uri,
            oidc_scopes,
            oidc_role_claim,
            oidc_admin_values,
            oidc_modifier_values,
            oidc_reader_values,
            oidc_default_role,
            oidc_button_label,
            dev_mock_oidc,
        }
    }
}
