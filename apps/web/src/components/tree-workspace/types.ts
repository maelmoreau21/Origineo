export type Person = {
  id: string;
  givenNames: string;
  usageSurname?: string | null;
  birthSurname?: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  birthDate?: string | null;
  birthPlace?: string | null;
  deathDate?: string | null;
  deathPlace?: string | null;
  professions?: string[];
  notes?: string | null;
};

export type TreeWindow = {
  rootPersonId: string;
  nodes: Array<{
    person: Person;
    generation: number;
    unions: any[];
    parents: string[];
    children: string[];
  }>;
  relationships: any[];
  unions: any[];
  stats?: {
    visiblePersons: number;
    totalCollectedPersons: number;
    visibleRelationships: number;
    visibleUnions: number;
    limit: number;
    truncated: boolean;
    requestedAncestors: number;
    requestedDescendants: number;
  };
};

export function personLabel(person?: Person | null) {
  if (!person) return 'Selection vide';
  return [person.givenNames, person.usageSurname || person.birthSurname]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Sans nom';
}

export function formatLife(person: Person) {
  const birth = person.birthDate ? year(person.birthDate) : '?';
  const death = person.deathDate ? year(person.deathDate) : '';
  return death ? `${birth} - ${death}` : birth === '?' ? '' : `ne(e) ${birth}`;
}

export function year(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 4);
  return String(parsed.getFullYear());
}
