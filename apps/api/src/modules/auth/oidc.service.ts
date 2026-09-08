// ══════════════════════════════════════
// Origineo — OIDC (OpenID Connect) SSO Service
// ══════════════════════════════════════

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

interface OidcDiscoveryDoc {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  end_session_endpoint?: string;
}

interface StoredState {
  nonce: string;
  createdAt: number;
}

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private cachedDiscovery: { doc: OidcDiscoveryDoc; expiresAt: number } | null = null;
  private readonly stateStore = new Map<string, StoredState>();

  constructor(private readonly prisma: PrismaService) {
    // Clean up expired states every 5 minutes
    setInterval(() => this.cleanupStates(), 5 * 60 * 1000).unref();
  }

  isEnabled(): boolean {
    const explicit = process.env.OIDC_ENABLED;
    if (explicit !== undefined) {
      return explicit === 'true' || explicit === '1';
    }
    return Boolean(process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID);
  }

  getButtonLabel(): string {
    return process.env.OIDC_BUTTON_LABEL || 'Se connecter avec SSO';
  }

  getRedirectUri(): string {
    return (
      process.env.OIDC_REDIRECT_URI ||
      'http://localhost:3001/api/auth/oidc/callback'
    );
  }

  getFrontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  async getConfig() {
    return {
      enabled: this.isEnabled(),
      buttonLabel: this.getButtonLabel(),
      loginUrl: '/api/auth/oidc/login',
    };
  }

  async getAuthorizationUrl(): Promise<string> {
    if (!this.isEnabled()) {
      throw new BadRequestException('OIDC SSO is not enabled on this instance');
    }

    const discovery = await this.getDiscovery();
    const clientId = process.env.OIDC_CLIENT_ID;
    if (!clientId) {
      throw new InternalServerErrorException('OIDC_CLIENT_ID is not configured');
    }

    const state = randomBytes(32).toString('hex');
    const nonce = randomBytes(16).toString('hex');

    this.stateStore.set(state, {
      nonce,
      createdAt: Date.now(),
    });

    const scopes = process.env.OIDC_SCOPES || 'openid email profile';
    const redirectUri = this.getRedirectUri();

    const authUrl = new URL(discovery.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    return authUrl.toString();
  }

  async handleCallback(code: string, state: string) {
    if (!this.isEnabled()) {
      throw new BadRequestException('OIDC SSO is not enabled');
    }

    if (!code || !state) {
      throw new BadRequestException('Missing authorization code or state');
    }

    const storedState = this.stateStore.get(state);
    if (!storedState) {
      this.logger.warn(`Invalid or expired OIDC state: ${state}`);
      throw new UnauthorizedException('Session expired or invalid state. Please try again.');
    }
    this.stateStore.delete(state);

    if (Date.now() - storedState.createdAt > 10 * 60 * 1000) {
      throw new UnauthorizedException('OIDC state has expired. Please try again.');
    }

    const discovery = await this.getDiscovery();
    const clientId = process.env.OIDC_CLIENT_ID!;
    const clientSecret = process.env.OIDC_CLIENT_SECRET || '';
    const redirectUri = this.getRedirectUri();

    // 1. Exchange authorization code for tokens
    const tokenParams = new URLSearchParams();
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('code', code);
    tokenParams.set('redirect_uri', redirectUri);
    tokenParams.set('client_id', clientId);
    if (clientSecret) {
      tokenParams.set('client_secret', clientSecret);
    }

    const tokenHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    if (clientSecret) {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      tokenHeaders['Authorization'] = `Basic ${basicAuth}`;
    }

    let tokenData: any;
    try {
      const tokenRes = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: tokenHeaders,
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        this.logger.error(`OIDC token exchange failed: HTTP ${tokenRes.status} - ${errorText}`);
        throw new UnauthorizedException('Failed to exchange authorization code with identity provider');
      }

      tokenData = await tokenRes.json();
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`OIDC token exchange error: ${err.message}`);
      throw new UnauthorizedException('Unable to reach identity provider token endpoint');
    }

    const accessToken = tokenData.access_token;
    const idToken = tokenData.id_token;

    let idTokenClaims: Record<string, any> = {};
    if (idToken) {
      idTokenClaims = this.decodeJwtPayload(idToken);
    }

    // 2. Fetch UserInfo if endpoint is available
    let userInfoClaims: Record<string, any> = {};
    if (discovery.userinfo_endpoint && accessToken) {
      try {
        const userinfoRes = await fetch(discovery.userinfo_endpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });
        if (userinfoRes.ok) {
          userInfoClaims = await userinfoRes.json();
        }
      } catch (err: any) {
        this.logger.warn(`Could not fetch userinfo: ${err.message}`);
      }
    }

    // Merge claims (userinfo takes precedence over id_token)
    const claims = { ...idTokenClaims, ...userInfoClaims };

    // 3. Extract identifier (email / preferred_username / sub)
    const email =
      claims.email ||
      claims.preferred_username ||
      claims.upn ||
      claims.sub;

    if (!email || typeof email !== 'string') {
      this.logger.error('No valid email or identifier claim found in OIDC claims');
      throw new UnauthorizedException('No email or user identifier provided by identity provider');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const displayName =
      claims.name ||
      claims.displayName ||
      claims.preferred_username ||
      [claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
      normalizedEmail.split('@')[0];

    // 4. Resolve user role based on configured admin claim
    const role = this.resolveRoleFromClaims(claims);

    // 5. Provision or update local user
    return this.upsertOidcUser(normalizedEmail, displayName, role);
  }

  private resolveRoleFromClaims(claims: Record<string, any>): 'ADMIN' | 'VISITOR' {
    const adminClaimKey = process.env.OIDC_ADMIN_CLAIM || 'groups';
    const adminValue = (process.env.OIDC_ADMIN_VALUE || 'origineo-admin').toLowerCase();

    // Check custom claim key or fallback to 'groups', 'roles', 'realm_access'
    const candidates: any[] = [];

    if (claims[adminClaimKey]) {
      candidates.push(claims[adminClaimKey]);
    }
    if (claims['groups']) {
      candidates.push(claims['groups']);
    }
    if (claims['roles']) {
      candidates.push(claims['roles']);
    }
    // Keycloak standard realm_access.roles
    if (claims['realm_access']?.roles) {
      candidates.push(claims['realm_access'].roles);
    }
    // Authentik / generic groups
    if (Array.isArray(claims['groups'])) {
      candidates.push(...claims['groups']);
    }

    for (const item of candidates) {
      if (Array.isArray(item)) {
        if (item.some((val) => String(val).toLowerCase() === adminValue || String(val).toLowerCase() === 'admin')) {
          return 'ADMIN';
        }
      } else if (typeof item === 'string') {
        if (item.toLowerCase() === adminValue || item.toLowerCase() === 'admin') {
          return 'ADMIN';
        }
      }
    }

    return 'VISITOR';
  }

  private async upsertOidcUser(
    email: string,
    displayName: string,
    role: 'ADMIN' | 'VISITOR',
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      // Don't downgrade existing ADMINs to VISITOR unless explicitly desired
      const finalRole = existing.role === 'ADMIN' ? 'ADMIN' : role;

      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: displayName || existing.displayName,
          role: finalRole,
        },
      });
    }

    // Auto-provision new OIDC user with a secure random password hash
    const randomPassword = randomBytes(32).toString('hex');
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(randomPassword, salt);

    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        role,
      },
    });
  }

  private async getDiscovery(): Promise<OidcDiscoveryDoc> {
    if (this.cachedDiscovery && Date.now() < this.cachedDiscovery.expiresAt) {
      return this.cachedDiscovery.doc;
    }

    const issuerUrl = process.env.OIDC_ISSUER_URL;
    if (!issuerUrl) {
      throw new InternalServerErrorException('OIDC_ISSUER_URL is not configured');
    }

    const normalizedIssuer = issuerUrl.replace(/\/+$/, '');
    const wellKnownUrl = normalizedIssuer.endsWith('/.well-known/openid-configuration')
      ? normalizedIssuer
      : `${normalizedIssuer}/.well-known/openid-configuration`;

    try {
      const res = await fetch(wellKnownUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const doc: OidcDiscoveryDoc = await res.json();
      if (!doc.authorization_endpoint || !doc.token_endpoint) {
        throw new Error('Discovery document is missing required endpoints');
      }

      // Cache discovery metadata for 1 hour
      this.cachedDiscovery = {
        doc,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };

      return doc;
    } catch (err: any) {
      this.logger.error(`Failed to fetch OIDC discovery from ${wellKnownUrl}: ${err.message}`);
      throw new InternalServerErrorException(
        `Unable to fetch OIDC provider discovery: ${err.message}`,
      );
    }
  }

  private decodeJwtPayload(jwt: string): Record<string, any> {
    try {
      const parts = jwt.split('.');
      if (parts.length < 2) return {};
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = Buffer.from(payloadBase64, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  private cleanupStates() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [state, data] of this.stateStore.entries()) {
      if (data.createdAt < cutoff) {
        this.stateStore.delete(state);
      }
    }
  }
}
