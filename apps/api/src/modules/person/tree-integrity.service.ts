import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const MIN_PARENT_AGE_YEARS = 12;
const MAX_PARENT_AGE_YEARS = 65;
const FATHER_DEATH_GRACE_MONTHS = 9;

const INTEGRITY_PERSON_SELECT = {
  id: true,
  givenNames: true,
  usageSurname: true,
  birthSurname: true,
  gender: true,
  birthDate: true,
  deathDate: true,
} satisfies Prisma.PersonSelect;

const INTEGRITY_RELATIONSHIP_SELECT = {
  id: true,
  type: true,
  parentId: true,
  childId: true,
  parent: { select: INTEGRITY_PERSON_SELECT },
  child: { select: INTEGRITY_PERSON_SELECT },
} satisfies Prisma.RelationshipSelect;

type IntegrityPerson = Prisma.PersonGetPayload<{
  select: typeof INTEGRITY_PERSON_SELECT;
}>;

type IntegrityRelationship = Prisma.RelationshipGetPayload<{
  select: typeof INTEGRITY_RELATIONSHIP_SELECT;
}>;

export type TreeIntegritySeverity = 'HIGH' | 'MEDIUM';

export type TreeIntegrityAnomalyCode =
  | 'DEATH_BEFORE_BIRTH'
  | 'CHILD_BORN_AFTER_MOTHER_DEATH'
  | 'CHILD_BORN_MORE_THAN_9_MONTHS_AFTER_FATHER_DEATH'
  | 'PARENT_TOO_YOUNG'
  | 'PARENT_TOO_OLD';

export type TreeIntegrityAnomaly = {
  id: string;
  code: TreeIntegrityAnomalyCode;
  severity: TreeIntegritySeverity;
  message: string;
  personIds: string[];
  relationshipId?: string;
  details: Record<string, string | number | null>;
};

export type TreeIntegrityProblemProfile = {
  id: string;
  label: string;
  givenNames: string;
  usageSurname: string | null;
  birthSurname: string | null;
  gender: string;
  birthDate: string | null;
  deathDate: string | null;
  anomalies: TreeIntegrityAnomaly[];
};

export type TreeIntegrityReport = {
  treeId: string;
  generatedAt: string;
  totalAnomalies: number;
  totalProfiles: number;
  profiles: TreeIntegrityProblemProfile[];
  anomalies: TreeIntegrityAnomaly[];
};

@Injectable()
export class TreeIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async findAnomalies(treeId: string): Promise<TreeIntegrityReport> {
    await this.assertTreeExists(treeId);

    const [persons, relationships] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        where: { treeId },
        select: INTEGRITY_PERSON_SELECT,
        orderBy: [{ usageSurname: 'asc' }, { birthSurname: 'asc' }, { givenNames: 'asc' }],
      }),
      this.prisma.relationship.findMany({
        where: {
          type: 'BIOLOGICAL',
          parent: { is: { treeId } },
          child: { is: { treeId } },
        },
        select: INTEGRITY_RELATIONSHIP_SELECT,
      }),
    ]);

    const personsById = new Map(persons.map((person) => [person.id, person]));
    const anomalies = [
      ...this.detectPersonDateAnomalies(persons),
      ...this.detectParentChildAnomalies(relationships),
    ].sort((a, b) => this.compareAnomalies(a, b));

    return this.buildReport(treeId, personsById, anomalies);
  }

  private detectPersonDateAnomalies(
    persons: IntegrityPerson[],
  ): TreeIntegrityAnomaly[] {
    const anomalies: TreeIntegrityAnomaly[] = [];

    for (const person of persons) {
      if (!person.birthDate || !person.deathDate) continue;
      if (person.deathDate >= person.birthDate) continue;

      anomalies.push(
        this.createAnomaly({
          code: 'DEATH_BEFORE_BIRTH',
          severity: 'HIGH',
          message: `${this.labelPerson(person)} a une date de deces anterieure a sa naissance.`,
          personIds: [person.id],
          details: {
            birthDate: this.toDateString(person.birthDate),
            deathDate: this.toDateString(person.deathDate),
          },
        }),
      );
    }

    return anomalies;
  }

  private detectParentChildAnomalies(
    relationships: IntegrityRelationship[],
  ): TreeIntegrityAnomaly[] {
    const anomalies: TreeIntegrityAnomaly[] = [];

    for (const relationship of relationships) {
      anomalies.push(...this.detectParentDeathAnomalies(relationship));
      anomalies.push(...this.detectParentAgeAnomalies(relationship));
    }

    return anomalies;
  }

  private detectParentDeathAnomalies(
    relationship: IntegrityRelationship,
  ): TreeIntegrityAnomaly[] {
    const anomalies: TreeIntegrityAnomaly[] = [];
    const { parent, child } = relationship;

    if (!parent.deathDate || !child.birthDate) return anomalies;

    if (parent.gender === 'FEMALE' && child.birthDate > parent.deathDate) {
      anomalies.push(
        this.createAnomaly({
          code: 'CHILD_BORN_AFTER_MOTHER_DEATH',
          severity: 'HIGH',
          message: `${this.labelPerson(child)} est ne(e) apres le deces de sa mere ${this.labelPerson(parent)}.`,
          personIds: [child.id, parent.id],
          relationshipId: relationship.id,
          details: {
            childBirthDate: this.toDateString(child.birthDate),
            motherDeathDate: this.toDateString(parent.deathDate),
          },
        }),
      );
    }

    if (parent.gender === 'MALE') {
      const latestPlausibleBirthDate = this.addMonths(
        parent.deathDate,
        FATHER_DEATH_GRACE_MONTHS,
      );

      if (child.birthDate > latestPlausibleBirthDate) {
        anomalies.push(
          this.createAnomaly({
            code: 'CHILD_BORN_MORE_THAN_9_MONTHS_AFTER_FATHER_DEATH',
            severity: 'HIGH',
            message: `${this.labelPerson(child)} est ne(e) plus de ${FATHER_DEATH_GRACE_MONTHS} mois apres le deces de son pere ${this.labelPerson(parent)}.`,
            personIds: [child.id, parent.id],
            relationshipId: relationship.id,
            details: {
              childBirthDate: this.toDateString(child.birthDate),
              fatherDeathDate: this.toDateString(parent.deathDate),
              latestPlausibleBirthDate: this.toDateString(latestPlausibleBirthDate),
            },
          }),
        );
      }
    }

    return anomalies;
  }

  private detectParentAgeAnomalies(
    relationship: IntegrityRelationship,
  ): TreeIntegrityAnomaly[] {
    const { parent, child } = relationship;
    if (!parent.birthDate || !child.birthDate) return [];

    const ageAtBirth = this.getAgeInYears(parent.birthDate, child.birthDate);
    const baseDetails = {
      parentBirthDate: this.toDateString(parent.birthDate),
      childBirthDate: this.toDateString(child.birthDate),
      ageAtChildBirth: ageAtBirth,
    };

    if (ageAtBirth < MIN_PARENT_AGE_YEARS) {
      return [
        this.createAnomaly({
          code: 'PARENT_TOO_YOUNG',
          severity: 'HIGH',
          message: `${this.labelPerson(parent)} avait ${ageAtBirth} ans a la naissance de ${this.labelPerson(child)}.`,
          personIds: [parent.id, child.id],
          relationshipId: relationship.id,
          details: {
            ...baseDetails,
            minParentAgeYears: MIN_PARENT_AGE_YEARS,
          },
        }),
      ];
    }

    if (ageAtBirth > MAX_PARENT_AGE_YEARS) {
      return [
        this.createAnomaly({
          code: 'PARENT_TOO_OLD',
          severity: 'MEDIUM',
          message: `${this.labelPerson(parent)} avait ${ageAtBirth} ans a la naissance de ${this.labelPerson(child)}.`,
          personIds: [parent.id, child.id],
          relationshipId: relationship.id,
          details: {
            ...baseDetails,
            maxParentAgeYears: MAX_PARENT_AGE_YEARS,
          },
        }),
      ];
    }

    return [];
  }

  private buildReport(
    treeId: string,
    personsById: Map<string, IntegrityPerson>,
    anomalies: TreeIntegrityAnomaly[],
  ): TreeIntegrityReport {
    const anomaliesByPersonId = new Map<string, TreeIntegrityAnomaly[]>();

    for (const anomaly of anomalies) {
      for (const personId of anomaly.personIds) {
        const personAnomalies = anomaliesByPersonId.get(personId) || [];
        personAnomalies.push(anomaly);
        anomaliesByPersonId.set(personId, personAnomalies);
      }
    }

    const profiles = Array.from(anomaliesByPersonId.entries())
      .map(([personId, personAnomalies]) => {
        const person = personsById.get(personId);
        if (!person) return null;

        return {
          ...this.serializeProfile(person),
          anomalies: personAnomalies.sort((a, b) => this.compareAnomalies(a, b)),
        };
      })
      .filter((profile): profile is TreeIntegrityProblemProfile => profile !== null)
      .sort((a, b) => this.compareProfiles(a, b));

    return {
      treeId,
      generatedAt: new Date().toISOString(),
      totalAnomalies: anomalies.length,
      totalProfiles: profiles.length,
      profiles,
      anomalies,
    };
  }

  private serializeProfile(person: IntegrityPerson): Omit<TreeIntegrityProblemProfile, 'anomalies'> {
    return {
      id: person.id,
      label: this.labelPerson(person),
      givenNames: person.givenNames,
      usageSurname: person.usageSurname,
      birthSurname: person.birthSurname,
      gender: person.gender,
      birthDate: this.toDateString(person.birthDate),
      deathDate: this.toDateString(person.deathDate),
    };
  }

  private createAnomaly(
    anomaly: Omit<TreeIntegrityAnomaly, 'id'>,
  ): TreeIntegrityAnomaly {
    return {
      ...anomaly,
      id: [
        anomaly.code,
        anomaly.relationshipId,
        ...anomaly.personIds,
      ]
        .filter(Boolean)
        .join(':'),
    };
  }

  private async assertTreeExists(treeId: string) {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });

    if (!tree) {
      throw new NotFoundException(`Tree with ID "${treeId}" not found`);
    }
  }

  private compareAnomalies(
    anomalyA: TreeIntegrityAnomaly,
    anomalyB: TreeIntegrityAnomaly,
  ) {
    const severityRank: Record<TreeIntegritySeverity, number> = {
      HIGH: 0,
      MEDIUM: 1,
    };

    const severityDiff =
      severityRank[anomalyA.severity] - severityRank[anomalyB.severity];
    if (severityDiff !== 0) return severityDiff;

    return anomalyA.message.localeCompare(anomalyB.message, 'fr');
  }

  private compareProfiles(
    profileA: TreeIntegrityProblemProfile,
    profileB: TreeIntegrityProblemProfile,
  ) {
    const highestSeverityA = profileA.anomalies[0]?.severity || 'MEDIUM';
    const highestSeverityB = profileB.anomalies[0]?.severity || 'MEDIUM';

    const severityDiff =
      (highestSeverityA === 'HIGH' ? 0 : 1) -
      (highestSeverityB === 'HIGH' ? 0 : 1);
    if (severityDiff !== 0) return severityDiff;

    return profileA.label.localeCompare(profileB.label, 'fr');
  }

  private labelPerson(person: IntegrityPerson) {
    const surname = person.usageSurname || person.birthSurname;
    return [person.givenNames, surname].filter(Boolean).join(' ') || person.id;
  }

  private getAgeInYears(birthDate: Date, referenceDate: Date) {
    let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
    const referenceMonth = referenceDate.getUTCMonth();
    const birthMonth = birthDate.getUTCMonth();

    if (
      referenceMonth < birthMonth ||
      (referenceMonth === birthMonth &&
        referenceDate.getUTCDate() < birthDate.getUTCDate())
    ) {
      age -= 1;
    }

    return age;
  }

  private addMonths(date: Date, months: number) {
    const targetYear = date.getUTCFullYear();
    const targetMonth = date.getUTCMonth() + months;
    const targetDay = date.getUTCDate();
    const lastDayOfTargetMonth = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0),
    ).getUTCDate();

    return new Date(
      Date.UTC(targetYear, targetMonth, Math.min(targetDay, lastDayOfTargetMonth)),
    );
  }

  private toDateString(date: Date | null) {
    return date ? date.toISOString().slice(0, 10) : null;
  }
}
