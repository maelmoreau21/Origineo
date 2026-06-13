import { Person } from './types';

export type PersonFormState = {
  givenNames: string;
  usageSurname: string;
  birthSurname: string;
  nickname: string;
  title: string;
  gender: Person['gender'];
  birthDate: string;
  birthPlace: string;
  baptismDate: string;
  baptismPlace: string;
  deathDate: string;
  deathPlace: string;
  burialDate: string;
  burialPlace: string;
  deathCause: string;
  religion: string;
  physicalDescription: string;
  nationality: string;
  education: string;
  professions: string;
  residences: string;
  notes: string;
  isRootDefault: boolean;
};

export function formFromPerson(person: Person): PersonFormState {
  return {
    givenNames: person.givenNames || '',
    usageSurname: person.usageSurname || '',
    birthSurname: person.birthSurname || '',
    nickname: person.nickname || '',
    title: person.title || '',
    gender: person.gender || 'UNKNOWN',
    birthDate: toDateInput(person.birthDate),
    birthPlace: person.birthPlace || '',
    baptismDate: toDateInput(person.baptismDate),
    baptismPlace: person.baptismPlace || '',
    deathDate: toDateInput(person.deathDate),
    deathPlace: person.deathPlace || '',
    burialDate: toDateInput(person.burialDate),
    burialPlace: person.burialPlace || '',
    deathCause: person.deathCause || '',
    religion: person.religion || '',
    physicalDescription: person.physicalDescription || '',
    nationality: person.nationality || '',
    education: person.education || '',
    professions: (person.professions || []).join('\n'),
    residences: (person.residences || []).join('\n'),
    notes: person.notes || '',
    isRootDefault: Boolean(person.isRootDefault),
  };
}

export function payloadFromPersonForm(form: PersonFormState) {
  return {
    givenNames: form.givenNames.trim(),
    usageSurname: emptyToNull(form.usageSurname),
    birthSurname: emptyToNull(form.birthSurname),
    nickname: emptyToNull(form.nickname),
    title: emptyToNull(form.title),
    gender: form.gender,
    birthDate: emptyToNull(form.birthDate),
    birthPlace: emptyToNull(form.birthPlace),
    baptismDate: emptyToNull(form.baptismDate),
    baptismPlace: emptyToNull(form.baptismPlace),
    deathDate: emptyToNull(form.deathDate),
    deathPlace: emptyToNull(form.deathPlace),
    burialDate: emptyToNull(form.burialDate),
    burialPlace: emptyToNull(form.burialPlace),
    deathCause: emptyToNull(form.deathCause),
    religion: emptyToNull(form.religion),
    physicalDescription: emptyToNull(form.physicalDescription),
    nationality: emptyToNull(form.nationality),
    education: emptyToNull(form.education),
    professions: linesToArray(form.professions),
    residences: linesToArray(form.residences),
    notes: emptyToNull(form.notes),
    isRootDefault: form.isRootDefault,
  };
}

export function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function linesToArray(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function toDateInput(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}
