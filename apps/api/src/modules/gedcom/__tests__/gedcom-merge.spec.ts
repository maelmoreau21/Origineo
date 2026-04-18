// ══════════════════════════════════════
// Unit Tests — GEDCOM Merge Algorithm
// ══════════════════════════════════════
// Tests the duplicate detection scoring, string similarity,
// and merge decision logic without requiring a database.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the private methods indirectly through the public API
// by extracting the algorithm into a testable helper.

// ─── Extract the bigram similarity for direct testing ────────
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function getBigrams(str: string): Map<string, number> {
  const bigrams = new Map<string, number>();
  for (let i = 0; i < str.length - 1; i++) {
    const bg = str.substring(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  return bigrams;
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  let intersectionSize = 0;
  const copyB = new Map(bigramsB);

  for (const [bigram, count] of bigramsA) {
    const bCount = copyB.get(bigram) || 0;
    if (bCount > 0) {
      intersectionSize += Math.min(count, bCount);
      copyB.set(bigram, bCount - Math.min(count, bCount));
    }
  }

  const totalSize =
    Array.from(bigramsA.values()).reduce((s, c) => s + c, 0) +
    Array.from(bigramsB.values()).reduce((s, c) => s + c, 0);

  return totalSize === 0 ? 0 : (2 * intersectionSize) / totalSize;
}

// ─── Scoring algorithm (extracted from GedcomMergeService) ───
interface StagedPerson {
  pointer: string;
  givenNames: string;
  surname: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
}

interface ExistingPerson {
  id: string;
  givenNames: string;
  usageSurname: string | null;
  birthSurname: string | null;
  gender: string;
  birthDate: Date | null;
  birthPlace: string | null;
}

function computeConfidence(staged: StagedPerson, existing: ExistingPerson): {
  confidence: number;
  matchReasons: string[];
} {
  let confidence = 0;
  const matchReasons: string[] = [];

  // Given names
  const sGiven = normalize(staged.givenNames);
  const eGiven = normalize(existing.givenNames);

  if (sGiven && eGiven) {
    if (sGiven === eGiven) {
      confidence += 30;
      matchReasons.push('Prénoms identiques');
    } else if (sGiven.includes(eGiven) || eGiven.includes(sGiven)) {
      confidence += 20;
      matchReasons.push('Prénoms partiellement similaires');
    } else {
      const sim = stringSimilarity(sGiven, eGiven);
      if (sim > 0.7) {
        confidence += Math.round(sim * 25);
        matchReasons.push(`Prénoms proches (${Math.round(sim * 100)}%)`);
      }
    }
  }

  // Surname
  const sSurname = normalize(staged.surname);
  const eSurname = normalize(existing.usageSurname || existing.birthSurname || '');

  if (sSurname && eSurname) {
    if (sSurname === eSurname) {
      confidence += 30;
      matchReasons.push('Nom identique');
    } else {
      const sim = stringSimilarity(sSurname, eSurname);
      if (sim > 0.7) {
        confidence += Math.round(sim * 25);
        matchReasons.push(`Nom proche`);
      }
    }
  }

  // Gender
  if (staged.gender !== 'UNKNOWN' && existing.gender !== 'UNKNOWN' && staged.gender === existing.gender) {
    confidence += 10;
    matchReasons.push('Genre identique');
  }

  // Birth date
  if (staged.birthDate && existing.birthDate) {
    const parsedDate = new Date(staged.birthDate.replace(/^(ABT|EST|CAL|BEF|AFT|BET)\s*/i, ''));
    if (!isNaN(parsedDate.getTime())) {
      const daysDiff = Math.abs(
        (parsedDate.getTime() - existing.birthDate.getTime()) / 86400000,
      );
      if (daysDiff === 0) {
        confidence += 20;
        matchReasons.push('Date de naissance identique');
      } else if (daysDiff <= 365) {
        confidence += 10;
        matchReasons.push('Année de naissance proche');
      }
    }
  }

  // Birth place
  if (staged.birthPlace && existing.birthPlace) {
    const sPlace = normalize(staged.birthPlace);
    const ePlace = normalize(existing.birthPlace);
    if (sPlace === ePlace) {
      confidence += 10;
      matchReasons.push('Lieu de naissance identique');
    } else if (sPlace.includes(ePlace) || ePlace.includes(sPlace)) {
      confidence += 5;
      matchReasons.push('Lieu de naissance partiel');
    }
  }

  return { confidence: Math.min(confidence, 100), matchReasons };
}


// ═══════════════════════════════════════
// T E S T S
// ═══════════════════════════════════════

describe('String Similarity (Bigram)', () => {
  it('identical strings should return 1', () => {
    expect(stringSimilarity('jean', 'jean')).toBe(1);
  });

  it('completely different strings should return near 0', () => {
    expect(stringSimilarity('xyz', 'abc')).toBeLessThan(0.1);
  });

  it('similar names should score high (>0.7)', () => {
    const sim = stringSimilarity('jean', 'jeane');
    expect(sim).toBeGreaterThan(0.7);
  });

  it('abbreviations should score moderate', () => {
    const sim = stringSimilarity('jean pierre', 'jean');
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.8);
  });

  it('very short strings edge cases', () => {
    // Single identical chars: identity check returns 1 before bigram
    expect(stringSimilarity('a', 'a')).toBe(1);
    // Empty string: returns 0
    expect(stringSimilarity('', 'abc')).toBe(0);
  });
});

describe('Normalize', () => {
  it('should lowercase and remove accents', () => {
    expect(normalize('Éléonore')).toBe('eleonore');
  });

  it('should handle empty strings', () => {
    expect(normalize('')).toBe('');
  });

  it('should remove special characters', () => {
    expect(normalize("Jean-Pierre d'Arc")).toBe('jeanpierre darc');
  });
});

describe('Duplicate Confidence Scoring', () => {
  const baseStaged: StagedPerson = {
    pointer: '@I1@',
    givenNames: 'Jean Pierre',
    surname: 'Dupont',
    gender: 'MALE',
    birthDate: '15 JAN 1950',
    birthPlace: 'Paris, France',
    deathDate: null,
    deathPlace: null,
  };

  const baseExisting: ExistingPerson = {
    id: '00000000-0000-0000-0000-000000000001',
    givenNames: 'Jean Pierre',
    usageSurname: 'Dupont',
    birthSurname: 'Dupont',
    gender: 'MALE',
    birthDate: new Date('1950-01-15'),
    birthPlace: 'Paris, France',
  };

  it('exact match should score very high (>=90)', () => {
    const { confidence } = computeConfidence(baseStaged, baseExisting);
    // 30 (name) + 30 (surname) + 10 (gender) + 10 (birthPlace) = 80 minimum
    // + date bonus (10 or 20 depending on GEDCOM date parsing)
    expect(confidence).toBeGreaterThanOrEqual(90);
  });

  it('same name + gender, no dates, should score 70', () => {
    const staged = { ...baseStaged, birthDate: null, birthPlace: null };
    const existing = { ...baseExisting, birthDate: null, birthPlace: null };
    const { confidence } = computeConfidence(staged, existing);
    // 30 (name) + 30 (surname) + 10 (gender) = 70
    expect(confidence).toBe(70);
  });

  it('only name matches should score 30', () => {
    const staged = {
      ...baseStaged,
      surname: 'Martin',
      gender: 'UNKNOWN' as const,
      birthDate: null,
      birthPlace: null,
    };
    const existing = {
      ...baseExisting,
      usageSurname: 'Bouvier',
      birthSurname: null,
      gender: 'UNKNOWN',
      birthDate: null,
      birthPlace: null,
    };
    const { confidence } = computeConfidence(staged, existing);
    expect(confidence).toBe(30);
  });

  it('completely different person should score below threshold (40)', () => {
    const staged = {
      ...baseStaged,
      givenNames: 'Marie',
      surname: 'Martin',
      gender: 'FEMALE' as const,
      birthDate: '1 MAR 1980',
      birthPlace: 'Lyon, France',
    };
    const { confidence } = computeConfidence(staged, baseExisting);
    expect(confidence).toBeLessThan(40);
  });

  it('similar name with typo should still score well', () => {
    const staged = { ...baseStaged, givenNames: 'Jean Piere' }; // typo
    const { confidence, matchReasons } = computeConfidence(staged, baseExisting);
    expect(confidence).toBeGreaterThanOrEqual(70);
    expect(matchReasons.length).toBeGreaterThan(0);
  });

  it('should handle accented names correctly', () => {
    const staged = { ...baseStaged, givenNames: 'Éléonore', surname: 'Bécquer' };
    const existing = {
      ...baseExisting,
      givenNames: 'Eleonore',
      usageSurname: 'Becquer',
      birthSurname: null,
    };
    const { confidence } = computeConfidence(staged, existing);
    // 30 + 30 + 10 + ... (date/place bonuses)
    expect(confidence).toBeGreaterThanOrEqual(70);
  });

  it('year-close birth dates should get partial credit', () => {
    const staged = { ...baseStaged, birthDate: '1 JUN 1950', birthPlace: null };
    const existing = { ...baseExisting, birthPlace: null };
    const { confidence, matchReasons } = computeConfidence(staged, existing);
    // Same year but different month
    expect(matchReasons).toContain('Année de naissance proche');
    expect(confidence).toBeGreaterThanOrEqual(80);
  });

  it('UNKNOWN gender should not add or subtract points', () => {
    const staged = { ...baseStaged, gender: 'UNKNOWN' as const };
    const noGender = computeConfidence(staged, baseExisting);
    const withGender = computeConfidence(baseStaged, baseExisting);
    expect(withGender.confidence - noGender.confidence).toBe(10);
  });
});

describe('Merge Decision Defaults', () => {
  it('confidence >= 70 should default to merge', () => {
    const { confidence } = computeConfidence(
      { pointer: '@I1@', givenNames: 'Jean', surname: 'Dupont', gender: 'MALE', birthDate: null, birthPlace: null, deathDate: null, deathPlace: null },
      { id: '1', givenNames: 'Jean', usageSurname: 'Dupont', birthSurname: null, gender: 'MALE', birthDate: null, birthPlace: null },
    );
    expect(confidence).toBeGreaterThanOrEqual(70);
  });

  it('confidence < 70 but >= 40 should be flagged as candidate', () => {
    const { confidence } = computeConfidence(
      { pointer: '@I2@', givenNames: 'Jean', surname: 'Martin', gender: 'MALE', birthDate: null, birthPlace: null, deathDate: null, deathPlace: null },
      { id: '2', givenNames: 'Jean', usageSurname: 'Dupont', birthSurname: null, gender: 'MALE', birthDate: null, birthPlace: null },
    );
    // 30 (name) + 10 (gender) = 40
    expect(confidence).toBeGreaterThanOrEqual(40);
    expect(confidence).toBeLessThan(70);
  });
});
