import { dictionaries, type LocaleCode, type TranslationKey } from './translations';

class PreferencesStore {
	locale = $state<LocaleCode>('fr');
	theme = $state<'dark' | 'light'>('dark');

	constructor() {
		if (typeof window !== 'undefined') {
			const savedLocale = localStorage.getItem('origineo_locale') as LocaleCode | null;
			if (savedLocale && savedLocale in dictionaries) {
				this.locale = savedLocale;
			} else if (navigator.language.toLowerCase().startsWith('en')) {
				this.locale = 'en';
			}

			const savedTheme = localStorage.getItem('origineo_theme') as 'dark' | 'light' | null;
			if (savedTheme === 'light' || savedTheme === 'dark') {
				this.theme = savedTheme;
			}
			this.applyDomAttributes();
		}
	}

	setLocale(next: LocaleCode) {
		this.locale = next;
		if (typeof window !== 'undefined') {
			localStorage.setItem('origineo_locale', next);
			this.applyDomAttributes();
		}
	}

	toggleTheme() {
		this.theme = this.theme === 'dark' ? 'light' : 'dark';
		if (typeof window !== 'undefined') {
			localStorage.setItem('origineo_theme', this.theme);
			this.applyDomAttributes();
		}
	}

	init() {
		this.applyDomAttributes();
	}

	applyDomAttributes() {
		if (typeof document !== 'undefined') {
			document.documentElement.setAttribute('data-theme', this.theme);
			document.documentElement.setAttribute('lang', this.locale);
		}
	}

	t(key: TranslationKey, vars?: Record<string, string | number>): string {
		const dict = dictionaries[this.locale] || dictionaries.fr;
		let template = dict[key] || dictionaries.fr[key] || key;
		if (vars) {
			for (const [k, v] of Object.entries(vars)) {
				template = template.replaceAll(`{${k}}`, String(v));
			}
		}
		return template;
	}
}

export const prefs = new PreferencesStore();
export const i18n = prefs;
