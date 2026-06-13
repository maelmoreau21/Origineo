export type Person = {
  id: string;
  treeId?: string;
  givenNames: string;
  usageSurname?: string | null;
  birthSurname?: string | null;
  nickname?: string | null;
  title?: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  birthDate?: string | null;
  birthPlace?: string | null;
  birthPlaceId?: string | null;
  baptismDate?: string | null;
  baptismPlace?: string | null;
  deathDate?: string | null;
  deathPlace?: string | null;
  deathPlaceId?: string | null;
  burialDate?: string | null;
  burialPlace?: string | null;
  deathCause?: string | null;
  religion?: string | null;
  physicalDescription?: string | null;
  nationality?: string | null;
  education?: string | null;
  professions?: string[];
  residences?: string[];
  notes?: string | null;
  sosaNumber?: number | null;
  isRootDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  const prefix = person.title?.trim();
  return [prefix, person.givenNames, person.usageSurname || person.birthSurname]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Sans nom';
}

export function formatLife(person: Person) {
  const birth = person.birthDate ? year(person.birthDate) : '?';
  const death = person.deathDate ? year(person.deathDate) : '';
  return death ? `${birth} - ${death}` : birth === '?' ? '' : `ne(e) ${birth}`;
}

export function formatDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('fr-FR');
}

export function year(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 4);
  return String(parsed.getFullYear());
}

export function genderLabel(gender?: Person['gender']) {
  if (gender === 'MALE') return 'Homme';
  if (gender === 'FEMALE') return 'Femme';
  if (gender === 'OTHER') return 'Autre';
  return 'Inconnu';
}
