<script lang="ts">
	import { authApi } from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';
	import { AVAILABLE_LOCALES, type LocaleCode } from '$lib/i18n/translations';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let oidcConfig = $state<{
		enabled: boolean;
		buttonLabel: string;
		loginUrl: string;
		devMockEnabled: boolean;
		issuerConfigured: boolean;
	} | null>(null);

	onMount(async () => {
		try {
			const user = await authApi.getMe();
			if (user) {
				goto('/');
				return;
			}
		} catch {
			// Not logged in, stay on /login
		}

		try {
			oidcConfig = await authApi.getOidcConfig();
		} catch {
			oidcConfig = {
				enabled: true,
				buttonLabel: i18n.t('loginSsoBtn'),
				loginUrl: '/api/auth/oidc/login',
				devMockEnabled: false,
				issuerConfigured: false
			};
		}
	});
</script>

<div class="login-page">
	<!-- Top Bar -->
	<header class="login-topbar">
		<div style="display: flex; align-items: center; gap: 0.7rem;">
			<div class="logo-badge">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="5" r="2.5" />
					<circle cx="6" cy="18" r="2.5" />
					<circle cx="18" cy="18" r="2.5" />
					<path d="M12 7.5V13M6 15.5V13h12v2.5" />
				</svg>
			</div>
			<div>
				<span style="font-weight: 800; font-size: 1.05rem;">Origineo</span>
				<span class="studio-chip">STUDIO v2.0</span>
			</div>
		</div>

		<div style="display: flex; align-items: center; gap: 0.5rem;">
			<select
				class="select"
				style="width: auto; height: 32px; padding: 0 0.65rem; font-size: 0.78rem; font-weight: 700;"
				value={i18n.locale}
				onchange={(e) => i18n.setLocale((e.currentTarget as HTMLSelectElement).value as LocaleCode)}
			>
				{#each AVAILABLE_LOCALES as loc (loc.code)}
					<option value={loc.code}>{loc.label}</option>
				{/each}
			</select>

			<button type="button" class="btn btn-secondary btn-sm" onclick={() => i18n.toggleTheme()}>
				{i18n.theme === 'dark' ? i18n.t('themeLight') : i18n.t('themeDark')}
			</button>
		</div>
	</header>

	<main class="login-split">
		<div class="login-card">
			<div class="logo-hero">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
					<circle cx="12" cy="5" r="2.8" />
					<circle cx="6" cy="18" r="2.8" />
					<circle cx="18" cy="18" r="2.8" />
					<path d="M12 7.8V13M6 15.2V13h12v2.2" />
				</svg>
			</div>

			<div class="security-pill mono">SSO OIDC · PKCE S256 · POSTGRESQL 18</div>

			<h1 class="font-serif-title" style="margin: 0.65rem 0 0.45rem; font-size: 1.7rem; font-weight: 700;">
				{i18n.t('loginTitle')}
			</h1>
			<p style="margin: 0 0 1.65rem; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6;">
				{i18n.t('loginSubtitle')}
			</p>

			<a
				href={oidcConfig?.loginUrl || '/api/auth/oidc/login'}
				class="btn btn-primary"
				style="width: 100%; height: 44px; font-size: 0.92rem;"
			>
				<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
				<span>{oidcConfig?.buttonLabel || i18n.t('loginSsoBtn')}</span>
			</a>

			<!-- 3-Tier Role Matrix -->
			<div class="roles-grid">
				<div class="role-box">
					<span class="badge badge-accent">{i18n.t('role_ADMIN')}</span>
					<p>Accès intégral + Studio GEDCOM (Import, Export, Fusion sélective)</p>
				</div>
				<div class="role-box">
					<span class="badge badge-success">{i18n.t('role_MODIFIER')}</span>
					<p>Création & édition des fiches, filiations, actes et portraits WebP</p>
				</div>
				<div class="role-box">
					<span class="badge badge-warning">{i18n.t('role_READER')}</span>
					<p>Navigation dynamique 3A/3D, Roue Sosa, Atlas & Parenté BFS</p>
				</div>
			</div>

			{#if oidcConfig?.devMockEnabled}
				<div class="dev-mock-box">
					<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem;">
						<span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold);">
							{i18n.t('devMockTitle')}
						</span>
						<span class="mono" style="font-size: 0.68rem; color: var(--text-muted);">DEV SANDBOX</span>
					</div>
					<p style="margin: 0 0 0.75rem; font-size: 0.78rem; color: var(--text-secondary);">
						{i18n.t('devMockDesc')}
					</p>
					<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
						<a href="/api/auth/oidc/login?mock_role=ADMIN" class="btn btn-secondary btn-sm">
							{i18n.t('role_ADMIN')}
						</a>
						<a href="/api/auth/oidc/login?mock_role=MODIFIER" class="btn btn-secondary btn-sm">
							{i18n.t('role_MODIFIER')}
						</a>
						<a href="/api/auth/oidc/login?mock_role=READER" class="btn btn-secondary btn-sm">
							{i18n.t('role_READER')}
						</a>
					</div>
				</div>
			{/if}
		</div>
	</main>
</div>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background-color: var(--bg-canvas);
		background-image:
			radial-gradient(circle at 20% 15%, var(--accent-soft), transparent 40%),
			radial-gradient(circle at 80% 85%, rgba(56, 189, 248, 0.08), transparent 40%),
			radial-gradient(var(--canvas-dots) 1px, transparent 1px);
		background-size:
			100% 100%,
			100% 100%,
			24px 24px;
	}

	.login-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.1rem 2rem;
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-glass);
		backdrop-filter: blur(12px);
	}

	.logo-badge {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: var(--accent-soft);
		color: var(--accent);
		border: 1px solid rgba(16, 185, 129, 0.35);
		display: grid;
		place-items: center;
	}

	.studio-chip {
		margin-left: 0.45rem;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		padding: 0.14rem 0.45rem;
		border-radius: 5px;
		background: var(--bg-elevated);
		color: var(--text-secondary);
		border: 1px solid var(--border-subtle);
	}

	.login-split {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1.25rem;
	}

	.login-card {
		width: 100%;
		max-width: 520px;
		padding: 2.5rem 2.25rem;
		border-radius: var(--radius-xl);
		background: var(--bg-surface);
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow-lg);
		text-align: center;
	}

	.logo-hero {
		width: 64px;
		height: 64px;
		margin: 0 auto 0.85rem;
		border-radius: 18px;
		background: linear-gradient(135deg, var(--accent-soft), rgba(56, 189, 248, 0.14));
		color: var(--accent);
		border: 1px solid rgba(16, 185, 129, 0.35);
		display: grid;
		place-items: center;
	}

	.security-pill {
		display: inline-block;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text-secondary);
		border: 1px solid var(--border-subtle);
	}

	.roles-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.55rem;
		margin-top: 1.5rem;
		text-align: left;
	}

	.role-box {
		padding: 0.75rem;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
	}

	.role-box p {
		margin: 0.45rem 0 0;
		font-size: 0.72rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.dev-mock-box {
		margin-top: 1.35rem;
		padding: 0.95rem 1rem;
		border-radius: var(--radius-md);
		background: var(--gold-soft);
		border: 1px solid rgba(245, 158, 11, 0.35);
		text-align: left;
	}
</style>
