/**
 * French Republican Calendar (Calendrier Républicain) Converter
 * Used in French genealogy between 22 Sept 1792 (1er Vendémiaire An I)
 * and 31 Dec 1805 (10 Nivôse An XIV).
 */

export interface RepublicanDate {
	day: number; // 1 - 30 (or 1 - 6 for Sansculottides)
	month: string; // 'Vendémiaire', etc.
	monthIndex: number; // 0 - 11, or 12 for Sansculottides
	year: number; // 1 - 14 (Romain I - XIV)
	yearRoman: string;
}

export const REPUBLICAN_MONTHS = [
	{ name: 'Vendémiaire', season: 'Automne' },
	{ name: 'Brumaire', season: 'Automne' },
	{ name: 'Frimaire', season: 'Automne' },
	{ name: 'Nivôse', season: 'Hiver' },
	{ name: 'Pluviôse', season: 'Hiver' },
	{ name: 'Ventôse', season: 'Hiver' },
	{ name: 'Germinal', season: 'Printemps' },
	{ name: 'Floréal', season: 'Printemps' },
	{ name: 'Prairial', season: 'Printemps' },
	{ name: 'Messidor', season: 'Été' },
	{ name: 'Thermidor', season: 'Été' },
	{ name: 'Fructidor', season: 'Été' },
	{ name: 'Sans-culottides', season: 'Jours complémentaires' }
];

export const SANSCULOTTIDES_DAYS = [
	'Jour de la vertu',
	'Jour du génie',
	'Jour du travail',
	'Jour de l’opinion',
	'Jour des récompenses',
	'Jour de la révolution'
];

const ROMAN_NUMERALS: [number, string][] = [
	[14, 'XIV'],
	[13, 'XIII'],
	[12, 'XII'],
	[11, 'XI'],
	[10, 'X'],
	[9, 'IX'],
	[8, 'VIII'],
	[7, 'VII'],
	[6, 'VI'],
	[5, 'V'],
	[4, 'IV'],
	[3, 'III'],
	[2, 'II'],
	[1, 'I']
];

export function toRoman(n: number): string {
	const found = ROMAN_NUMERALS.find(([val]) => val === n);
	return found ? found[1] : `${n}`;
}

export function fromRoman(roman: string): number | null {
	const clean = roman.trim().toUpperCase();
	const found = ROMAN_NUMERALS.find(([, sym]) => sym === clean);
	if (found) return found[0];
	const parsed = parseInt(clean, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

// Gregorian start dates of Republican years (all midnight UTC)
const REPUBLICAN_YEAR_STARTS: [number, number, number][] = [
	[1792, 9, 22], // An I
	[1793, 9, 22], // An II
	[1794, 9, 22], // An III
	[1795, 9, 23], // An IV (sextile)
	[1796, 9, 22], // An V
	[1797, 9, 22], // An VI
	[1798, 9, 22], // An VII
	[1799, 9, 23], // An VIII (sextile)
	[1800, 9, 23], // An IX
	[1801, 9, 23], // An X
	[1802, 9, 23], // An XI
	[1803, 9, 24], // An XII (sextile)
	[1804, 9, 23], // An XIII
	[1805, 9, 23] // An XIV
];

/**
 * Converts a Gregorian date (YYYY-MM-DD string or Date) to French Republican Date
 */
export function gregorianToRepublican(dateInput: string | Date): RepublicanDate | null {
	const d = typeof dateInput === 'string' ? new Date(`${dateInput}T00:00:00Z`) : dateInput;
	if (Number.isNaN(d.getTime())) return null;

	const y = d.getUTCFullYear();
	if (y < 1792 || y > 1806) return null;

	// Find Republican Year
	let repYear = 1;
	for (let i = REPUBLICAN_YEAR_STARTS.length - 1; i >= 0; i--) {
		const [gy, gm, gd] = REPUBLICAN_YEAR_STARTS[i];
		const start = Date.UTC(gy, gm - 1, gd);
		if (d.getTime() >= start) {
			repYear = i + 1;
			break;
		}
	}

	if (repYear < 1 || repYear > 14) return null;

	const [startY, startM, startD] = REPUBLICAN_YEAR_STARTS[repYear - 1];
	const yearStartTime = Date.UTC(startY, startM - 1, startD);
	const dayDiff = Math.floor((d.getTime() - yearStartTime) / (86400 * 1000));

	if (dayDiff < 0 || dayDiff >= 366) return null;

	if (dayDiff < 360) {
		const monthIndex = Math.floor(dayDiff / 30);
		const day = (dayDiff % 30) + 1;
		return {
			day,
			month: REPUBLICAN_MONTHS[monthIndex].name,
			monthIndex,
			year: repYear,
			yearRoman: toRoman(repYear)
		};
	}

	// Sans-culottides
	const day = dayDiff - 360 + 1;
	return {
		day,
		month: 'Sans-culottides',
		monthIndex: 12,
		year: repYear,
		yearRoman: toRoman(repYear)
	};
}

/**
 * Converts French Republican date components back to Gregorian date (YYYY-MM-DD)
 */
export function republicanToGregorian(day: number, monthIndex: number, year: number): string | null {
	if (year < 1 || year > 14) return null;
	const [startY, startM, startD] = REPUBLICAN_YEAR_STARTS[year - 1];
	let totalDays = 0;

	if (monthIndex >= 0 && monthIndex < 12) {
		if (day < 1 || day > 30) return null;
		totalDays = monthIndex * 30 + (day - 1);
	} else if (monthIndex === 12) {
		if (day < 1 || day > 6) return null;
		totalDays = 360 + (day - 1);
	} else {
		return null;
	}

	const date = new Date(Date.UTC(startY, startM - 1, startD));
	date.setUTCDate(date.getUTCDate() + totalDays);

	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Parses freeform string like "14 Brumaire An IV" or "2 Nivôse An 8"
 */
export function parseRepublicanString(str: string): { gregorian: string; display: string } | null {
	if (!str) return null;
	const clean = str.trim();
	const match = clean.match(/(\d{1,2})\s+([A-Za-zéèêëîïôöûü-]+)\s+(?:an|année)?\s*([IVXLCDM\d]+)/i);
	if (!match) return null;

	const day = parseInt(match[1], 10);
	const monthStr = match[2].toLowerCase();
	const yearStr = match[3];

	const year = fromRoman(yearStr);
	if (!year) return null;

	const monthIndex = REPUBLICAN_MONTHS.findIndex((m) =>
		m.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').startsWith(
			monthStr.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 4)
		)
	);

	if (monthIndex === -1) return null;

	const greg = republicanToGregorian(day, monthIndex, year);
	if (!greg) return null;

	const mName = REPUBLICAN_MONTHS[monthIndex].name;
	return {
		gregorian: greg,
		display: `${day} ${mName} An ${toRoman(year)}`
	};
}
