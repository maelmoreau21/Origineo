use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    extract::{FromRequestParts, Query, State},
    http::{header, request::Parts},
    response::{IntoResponse, Redirect, Response},
    Json,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration as ChronoDuration, Utc};
use dashmap::DashMap;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    error::{ApiSuccess, AppError, AppResult},
    models::{UserDto, UserRole, UserRow},
    AppState,
};

pub const AUTH_COOKIE_NAME: &str = "origineo_session";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionClaims {
    pub sub: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub role: UserRole,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub role: UserRole,
}

impl AuthUser {
    pub fn require_modifier(&self) -> AppResult<()> {
        if self.role.can_modify() {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "Action réservée aux grades Modificateur et Administrateur / Requires Modifier or Administrator role".to_string(),
            ))
        }
    }

    pub fn require_admin(&self) -> AppResult<()> {
        if self.role.is_admin() {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "Action réservée au grade Administrateur / Requires Administrator role".to_string(),
            ))
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct OidcDiscoveryDoc {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub userinfo_endpoint: Option<String>,
    pub end_session_endpoint: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OidcPkceState {
    pub nonce: String,
    pub code_verifier: String,
    pub created_at: Instant,
}

pub struct OidcRuntime {
    pub states: DashMap<String, OidcPkceState>,
    pub discovery_cache: tokio::sync::RwLock<Option<(OidcDiscoveryDoc, Instant)>>,
    pub http_client: reqwest::Client,
}

impl OidcRuntime {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        Self {
            states: DashMap::new(),
            discovery_cache: tokio::sync::RwLock::new(None),
            http_client,
        }
    }

    pub fn cleanup_expired_states(&self) {
        let ttl = Duration::from_secs(600);
        self.states
            .retain(|_, v| v.created_at.elapsed() < ttl);
    }
}

impl FromRequestParts<Arc<AppState>> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);

        let token = jar
            .get(AUTH_COOKIE_NAME)
            .map(|c| c.value().to_string())
            .or_else(|| {
                parts
                    .headers
                    .get(header::AUTHORIZATION)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.strip_prefix("Bearer "))
                    .map(|s| s.trim().to_string())
            })
            .ok_or_else(|| {
                AppError::Unauthorized("Authentification SSO OIDC requise / SSO OIDC authentication required".to_string())
            })?;

        let token_data = decode::<SessionClaims>(
            &token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized("Session expirée ou invalide / Invalid or expired session".to_string()))?;

        let claims = token_data.claims;

        Ok(AuthUser {
            id: claims.sub,
            email: claims.email,
            display_name: claims.display_name,
            role: claims.role,
        })
    }
}

pub fn create_session_jwt(state: &AppState, user: &UserDto) -> AppResult<String> {
    let now = Utc::now();
    let exp = (now + ChronoDuration::hours(state.config.jwt_expiration_hours)).timestamp() as usize;
    let iat = now.timestamp() as usize;

    let claims = SessionClaims {
        sub: user.id,
        email: user.email.clone(),
        display_name: user.display_name.clone(),
        role: user.role,
        exp,
        iat,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("JWT encoding failed: {}", e)))
}

pub fn build_session_cookie(state: &AppState, token: String) -> Cookie<'static> {
    let mut cookie = Cookie::new(AUTH_COOKIE_NAME, token);
    cookie.set_path("/");
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_secure(state.config.cookie_secure);
    cookie
}

pub fn clear_session_cookie() -> Cookie<'static> {
    let mut cookie = Cookie::new(AUTH_COOKIE_NAME, "");
    cookie.set_path("/");
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.make_removal();
    cookie
}

fn generate_random_base64url(bytes_len: usize) -> String {
    let mut buf = vec![0u8; bytes_len];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(&buf)
}

fn compute_pkce_s256_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    URL_SAFE_NO_PAD.encode(digest)
}

async fn fetch_oidc_discovery(state: &AppState) -> AppResult<OidcDiscoveryDoc> {
    {
        let read_guard = state.oidc.discovery_cache.read().await;
        if let Some((doc, cached_at)) = &*read_guard {
            if cached_at.elapsed() < Duration::from_secs(3600) {
                return Ok(doc.clone());
            }
        }
    }

    let issuer = state.config.oidc_issuer_url.trim().trim_end_matches('/');
    if issuer.is_empty() {
        return Err(AppError::BadRequest(
            "OIDC_ISSUER_URL n'est pas configuré / OIDC_ISSUER_URL is not configured".to_string(),
        ));
    }

    let well_known = if issuer.ends_with("/.well-known/openid-configuration") {
        issuer.to_string()
    } else {
        format!("{}/.well-known/openid-configuration", issuer)
    };

    let res = state
        .oidc
        .http_client
        .get(&well_known)
        .header(header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Impossible de joindre le fournisseur OIDC ({}): {}", well_known, e)))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "OIDC Discovery HTTP {}: {}",
            status, text
        )));
    }

    let doc: OidcDiscoveryDoc = res
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Invalid OIDC discovery JSON: {}", e)))?;

    let mut write_guard = state.oidc.discovery_cache.write().await;
    *write_guard = Some((doc.clone(), Instant::now()));

    Ok(doc)
}

/// Resolve user role strictly from OIDC claims/groups (ADMIN > MODIFIER > READER)
pub fn resolve_role_from_oidc_claims(
    state: &AppState,
    claims: &serde_json::Value,
) -> UserRole {
    let mut extracted_groups: Vec<String> = Vec::new();

    let mut push_claim_value = |val: &serde_json::Value| {
        match val {
            serde_json::Value::String(s) => {
                for part in s.split(|c| c == ',' || c == ' ') {
                    let trimmed = part.trim().to_lowercase();
                    if !trimmed.is_empty() {
                        extracted_groups.push(trimmed);
                    }
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr {
                    if let Some(s) = item.as_str() {
                        extracted_groups.push(s.trim().to_lowercase());
                    }
                }
            }
            _ => {}
        }
    };

    if let Some(obj) = claims.as_object() {
        if let Some(custom) = obj.get(&state.config.oidc_role_claim) {
            push_claim_value(custom);
        }
        if let Some(groups) = obj.get("groups") {
            push_claim_value(groups);
        }
        if let Some(roles) = obj.get("roles") {
            push_claim_value(roles);
        }
        if let Some(role) = obj.get("role") {
            push_claim_value(role);
        }
        // Keycloak standard realm_access.roles
        if let Some(realm_roles) = obj.get("realm_access").and_then(|r| r.get("roles")) {
            push_claim_value(realm_roles);
        }
    }

    // Check highest privilege first: ADMIN -> MODIFIER -> READER
    for grp in &extracted_groups {
        if state.config.oidc_admin_values.iter().any(|a| a == grp) {
            return UserRole::Admin;
        }
    }

    for grp in &extracted_groups {
        if state.config.oidc_modifier_values.iter().any(|m| m == grp) {
            return UserRole::Modifier;
        }
    }

    for grp in &extracted_groups {
        if state.config.oidc_reader_values.iter().any(|r| r == grp) {
            return UserRole::Reader;
        }
    }

    UserRole::from_str(&state.config.oidc_default_role)
}

async fn upsert_oidc_user(
    pool: &sqlx::PgPool,
    email: &str,
    oidc_subject: Option<&str>,
    display_name: &str,
    role: UserRole,
) -> AppResult<UserDto> {
    let row = sqlx::query_as::<_, UserRow>(
        r#"
        INSERT INTO users (email, oidc_subject, display_name, role, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (email) DO UPDATE
        SET
            oidc_subject = COALESCE(EXCLUDED.oidc_subject, users.oidc_subject),
            display_name = COALESCE(EXCLUDED.display_name, users.display_name),
            role = EXCLUDED.role,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, email, oidc_subject, display_name, role, created_at, updated_at
        "#,
    )
    .bind(email)
    .bind(oidc_subject)
    .bind(display_name)
    .bind(role.as_str())
    .fetch_one(pool)
    .await?;

    Ok(UserDto::from(row))
}

// ─── Route Handlers ────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OidcConfigResponse {
    pub enabled: bool,
    pub button_label: String,
    pub login_url: String,
    pub dev_mock_enabled: bool,
    pub issuer_configured: bool,
}

pub async fn get_oidc_config(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let issuer_configured =
        !state.config.oidc_issuer_url.trim().is_empty() && !state.config.oidc_client_id.trim().is_empty();

    ApiSuccess::new(OidcConfigResponse {
        enabled: true, // Strictly SSO OIDC mode
        button_label: state.config.oidc_button_label.clone(),
        login_url: "/api/auth/oidc/login".to_string(),
        dev_mock_enabled: state.config.dev_mock_oidc,
        issuer_configured,
    })
}

#[derive(Deserialize)]
pub struct DevLoginQuery {
    pub role: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
}

pub async fn oidc_login(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DevLoginQuery>,
    jar: CookieJar,
) -> AppResult<Response> {
    state.oidc.cleanup_expired_states();

    // If OIDC_DEV_MOCK is explicitly enabled for local Docker testing without external IdP
    if state.config.dev_mock_oidc && state.config.oidc_issuer_url.trim().is_empty() {
        let role = query
            .role
            .as_deref()
            .map(UserRole::from_str)
            .unwrap_or(UserRole::Admin);
        let email = query
            .email
            .unwrap_or_else(|| format!("{}@origineo.sso", role.as_str().to_lowercase()));
        let display_name = query.name.unwrap_or_else(|| match role {
            UserRole::Admin => "Administrateur SSO".to_string(),
            UserRole::Modifier => "Modificateur SSO".to_string(),
            UserRole::Reader => "Lecteur SSO".to_string(),
        });

        let user = upsert_oidc_user(
            &state.pool,
            &email,
            Some(&format!("oidc-sub-{}", email)),
            &display_name,
            role,
        )
        .await?;

        let jwt = create_session_jwt(&state, &user)?;
        let cookie = build_session_cookie(&state, jwt.clone());
        let redirect_target = format!(
            "{}/?sso=ok",
            state.config.frontend_url.trim_end_matches('/')
        );

        return Ok((jar.add(cookie), Redirect::temporary(&redirect_target)).into_response());
    }

    let discovery = fetch_oidc_discovery(&state).await?;
    let client_id = state.config.oidc_client_id.trim();
    if client_id.is_empty() {
        return Err(AppError::BadRequest(
            "OIDC_CLIENT_ID non configuré / OIDC_CLIENT_ID is not configured".to_string(),
        ));
    }

    let oauth_state = generate_random_base64url(32);
    let nonce = generate_random_base64url(16);
    let code_verifier = generate_random_base64url(48);
    let code_challenge = compute_pkce_s256_challenge(&code_verifier);

    state.oidc.states.insert(
        oauth_state.clone(),
        OidcPkceState {
            nonce: nonce.clone(),
            code_verifier,
            created_at: Instant::now(),
        },
    );

    let mut auth_url = url::Url::parse(&discovery.authorization_endpoint)
        .map_err(|e| AppError::Internal(format!("Invalid authorization_endpoint URL: {}", e)))?;

    {
        let mut pairs = auth_url.query_pairs_mut();
        pairs.append_pair("response_type", "code");
        pairs.append_pair("client_id", client_id);
        pairs.append_pair("redirect_uri", &state.config.oidc_redirect_uri);
        pairs.append_pair("scope", &state.config.oidc_scopes);
        pairs.append_pair("state", &oauth_state);
        pairs.append_pair("nonce", &nonce);
        pairs.append_pair("code_challenge", &code_challenge);
        pairs.append_pair("code_challenge_method", "S256");
    }

    Ok(Redirect::temporary(auth_url.as_str()).into_response())
}

#[derive(Deserialize)]
pub struct OidcCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

pub async fn oidc_callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<OidcCallbackQuery>,
    jar: CookieJar,
) -> AppResult<Response> {
    let frontend_base = state.config.frontend_url.trim_end_matches('/');

    if let Some(err) = params.error {
        let desc = params.error_description.unwrap_or(err);
        let redirect_url = format!(
            "{}/login?error={}",
            frontend_base,
            urlencoding::encode(&desc)
        );
        return Ok(Redirect::temporary(&redirect_url).into_response());
    }

    let code = params
        .code
        .ok_or_else(|| AppError::BadRequest("Missing OIDC authorization code".to_string()))?;
    let state_param = params
        .state
        .ok_or_else(|| AppError::BadRequest("Missing OIDC state parameter".to_string()))?;

    let (_, pkce_state) = state.oidc.states.remove(&state_param).ok_or_else(|| {
        AppError::Unauthorized("Invalid or expired OIDC state. Please try logging in again.".to_string())
    })?;

    if pkce_state.created_at.elapsed() > Duration::from_secs(600) {
        return Err(AppError::Unauthorized(
            "OIDC login session timed out.".to_string(),
        ));
    }

    let discovery = fetch_oidc_discovery(&state).await?;

    let mut form = vec![
        ("grant_type", "authorization_code".to_string()),
        ("code", code),
        ("redirect_uri", state.config.oidc_redirect_uri.clone()),
        ("client_id", state.config.oidc_client_id.clone()),
        ("code_verifier", pkce_state.code_verifier),
    ];

    if !state.config.oidc_client_secret.is_empty() {
        form.push(("client_secret", state.config.oidc_client_secret.clone()));
    }

    let mut req = state
        .oidc
        .http_client
        .post(&discovery.token_endpoint)
        .header(header::ACCEPT, "application/json")
        .form(&form);

    if !state.config.oidc_client_secret.is_empty() {
        req = req.basic_auth(
            &state.config.oidc_client_id,
            Some(&state.config.oidc_client_secret),
        );
    }

    let token_res = req
        .send()
        .await
        .map_err(|e| AppError::Unauthorized(format!("Token exchange network error: {}", e)))?;

    if !token_res.status().is_success() {
        let body = token_res.text().await.unwrap_or_default();
        tracing::error!("OIDC token exchange failed: {}", body);
        let redirect_url = format!(
            "{}/login?error={}",
            frontend_base,
            urlencoding::encode("Échec de l'échange de jeton OIDC avec le fournisseur d'identité")
        );
        return Ok(Redirect::temporary(&redirect_url).into_response());
    }

    let token_json: serde_json::Value = token_res
        .json()
        .await
        .map_err(|e| AppError::Unauthorized(format!("Invalid token JSON: {}", e)))?;

    let mut merged_claims = serde_json::Map::new();

    if let Some(id_token) = token_json.get("id_token").and_then(|v| v.as_str()) {
        if let Some(payload_part) = id_token.split('.').nth(1) {
            if let Ok(decoded) = URL_SAFE_NO_PAD.decode(payload_part) {
                if let Ok(serde_json::Value::Object(map)) = serde_json::from_slice(&decoded) {
                    // Verify nonce if present in ID token
                    if let Some(token_nonce) = map.get("nonce").and_then(|n| n.as_str()) {
                        if token_nonce != pkce_state.nonce {
                            return Err(AppError::Unauthorized("OIDC nonce mismatch".to_string()));
                        }
                    }
                    for (k, v) in map {
                        merged_claims.insert(k, v);
                    }
                }
            }
        }
    }

    if let (Some(userinfo_url), Some(access_token)) = (
        discovery.userinfo_endpoint.as_deref(),
        token_json.get("access_token").and_then(|v| v.as_str()),
    ) {
        if let Ok(ui_res) = state
            .oidc
            .http_client
            .get(userinfo_url)
            .bearer_auth(access_token)
            .header(header::ACCEPT, "application/json")
            .send()
            .await
        {
            if ui_res.status().is_success() {
                if let Ok(serde_json::Value::Object(map)) = ui_res.json().await {
                    for (k, v) in map {
                        merged_claims.insert(k, v);
                    }
                }
            }
        }
    }

    let claims_val = serde_json::Value::Object(merged_claims);

    let sub = claims_val
        .get("sub")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let email = claims_val
        .get("email")
        .and_then(|v| v.as_str())
        .or_else(|| claims_val.get("preferred_username").and_then(|v| v.as_str()))
        .or_else(|| claims_val.get("upn").and_then(|v| v.as_str()))
        .or_else(|| sub.as_deref())
        .ok_or_else(|| AppError::Unauthorized("No email or subject identifier in OIDC claims".to_string()))?
        .trim()
        .to_lowercase();

    let display_name = claims_val
        .get("name")
        .and_then(|v| v.as_str())
        .or_else(|| claims_val.get("displayName").and_then(|v| v.as_str()))
        .or_else(|| claims_val.get("preferred_username").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            let given = claims_val.get("given_name").and_then(|v| v.as_str()).unwrap_or("");
            let family = claims_val.get("family_name").and_then(|v| v.as_str()).unwrap_or("");
            let full = format!("{} {}", given, family).trim().to_string();
            if full.is_empty() {
                email.split('@').next().unwrap_or(&email).to_string()
            } else {
                full
            }
        });

    let role = resolve_role_from_oidc_claims(&state, &claims_val);
    let user = upsert_oidc_user(&state.pool, &email, sub.as_deref(), &display_name, role).await?;

    let jwt = create_session_jwt(&state, &user)?;
    let cookie = build_session_cookie(&state, jwt);

    let redirect_target = format!("{}/", frontend_base);
    Ok((jar.add(cookie), Redirect::temporary(&redirect_target)).into_response())
}

pub async fn get_me(user: AuthUser) -> impl IntoResponse {
    ApiSuccess::new(UserDto {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        created_at: Utc::now(),
    })
}

pub async fn logout(jar: CookieJar) -> impl IntoResponse {
    let cookie = clear_session_cookie();
    (
        jar.add(cookie),
        Json(serde_json::json!({
            "success": true,
            "message": "Logged out"
        })),
    )
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    user: AuthUser,
) -> AppResult<impl IntoResponse> {
    user.require_admin()?;

    let rows = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT id, email, oidc_subject, display_name, role, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    let users: Vec<UserDto> = rows.into_iter().map(UserDto::from).collect();
    Ok(ApiSuccess::new(users))
}
