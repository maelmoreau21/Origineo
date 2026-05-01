import { describe, expect, it } from 'vitest';
import { layoutFamilyTree } from './index';
import type { PersonDto, RelationshipDto, TreeWindowDto, UnionDto } from '@origineo/shared';

describe('family-layout links', () => {
  it('aligns a couple horizontally and connects a child from the couple midpoint', () => {
    const tree = makeTree({
      persons: [
        person('p1', 'Jean', 'Dupont', 'MALE', 0),
        person('p2', 'Marie', 'Martin', 'FEMALE', 0),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 1),
      ],
      relationships: [rel('p1', 'c1'), rel('p2', 'c1')],
      unions: [union('u1', 'p1', 'p2')],
    });

    const layout = layoutFamilyTree(tree, 'p1');
    const p1 = getNode(layout, 'p1');
    const p2 = getNode(layout, 'p2');
    const child = getNode(layout, 'c1');
    const spouseLink = layout.links.find((link) => link.type === 'spouse');
    const childLink = layout.links.find((link) => link.toId === 'c1');

    expect(p1.cy).toBe(p2.cy);
    expect(p1.cx).not.toBe(p2.cx);
    expect(child.cy).toBeGreaterThan(p1.cy);
    expect(spouseLink?.points).toEqual([
      [p1.cx, p1.cy],
      [p2.cx, p2.cy],
    ]);
    expect(childLink?.points.at(-1)?.[0]).toBeCloseTo((p1.cx + p2.cx) / 2, 1);
    expect(childLink?.unionId).toBe('u1');
    expect(childLink?.parentIds?.sort()).toEqual(['p1', 'p2']);
    expect(childLink?.path).toContain('C');
  });

  it('creates an invisible placeholder for single parents and keeps the child link clean', () => {
    const tree = makeTree({
      persons: [
        person('p1', 'Jean', 'Dupont', 'MALE', 0),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 1),
      ],
      relationships: [rel('p1', 'c1')],
      unions: [],
    });

    const layout = layoutFamilyTree(tree, 'p1');
    const parent = getNode(layout, 'p1');
    const child = getNode(layout, 'c1');
    const childLink = layout.links.find((link) => link.toId === child.id);

    expect(layout.nodes.some((node) => node.id.startsWith('placeholder'))).toBe(false);
    expect(childLink?.type).toBe('single-parent');
    expect(childLink?.points.at(-1)?.[0]).not.toBeCloseTo(parent.cx, 1);
    expect(childLink?.path).toContain('C');
  });

  it('keeps remarriage links distinct and attaches each child to the right couple', () => {
    const tree = makeTree({
      persons: [
        person('p1', 'Jean', 'Dupont', 'MALE', 0),
        person('p2', 'Marie', 'Martin', 'FEMALE', 0),
        person('p3', 'Claire', 'Bernard', 'FEMALE', 0),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 1),
        person('c2', 'Leo', 'Dupont', 'MALE', 1),
      ],
      relationships: [
        rel('p1', 'c1'),
        rel('p2', 'c1'),
        rel('p1', 'c2'),
        rel('p3', 'c2'),
      ],
      unions: [union('u1', 'p1', 'p2'), union('u2', 'p1', 'p3')],
    });

    const layout = layoutFamilyTree(tree, 'p1');
    const firstSpouse = getNode(layout, 'p2');
    const secondSpouse = getNode(layout, 'p3');
    const root = getNode(layout, 'p1');
    const spouseLinks = layout.links.filter((link) => link.type === 'spouse');
    const c1Link = layout.links.find((link) => link.toId === 'c1');
    const c2Link = layout.links.find((link) => link.toId === 'c2');

    expect(spouseLinks).toHaveLength(2);
    expect(c1Link?.unionId).toBe('u1');
    expect(c2Link?.unionId).toBe('u2');
    expect(c1Link?.points.at(-1)?.[0]).toBeCloseTo((root.cx + firstSpouse.cx) / 2, 1);
    expect(c2Link?.points.at(-1)?.[0]).toBeCloseTo((root.cx + secondSpouse.cx) / 2, 1);
    expect(c1Link?.points.at(-1)?.[0]).not.toBeCloseTo(
      c2Link?.points.at(-1)?.[0] || 0,
      1,
    );
  });

  it('groups half-siblings by their other parent on separate buses', () => {
    const tree = makeTree({
      persons: [
        person('p1', 'Jean', 'Dupont', 'MALE', 0),
        person('p2', 'Marie', 'Martin', 'FEMALE', 0),
        person('p3', 'Claire', 'Bernard', 'FEMALE', 0),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 1),
        person('c2', 'Leo', 'Dupont', 'MALE', 1),
        person('c3', 'Noe', 'Dupont', 'MALE', 1),
      ],
      relationships: [
        rel('p1', 'c1'),
        rel('p2', 'c1'),
        rel('p1', 'c2'),
        rel('p3', 'c2'),
        rel('p1', 'c3'),
        rel('p3', 'c3'),
      ],
      unions: [union('u1', 'p1', 'p2'), union('u2', 'p1', 'p3')],
    });

    const layout = layoutFamilyTree(tree, 'p1');
    const c1 = getNode(layout, 'c1');
    const c2 = getNode(layout, 'c2');
    const c3 = getNode(layout, 'c3');
    const c1Bus = layout.links.find((link) => link.toId === 'c1')?.points.at(-1)?.[0];
    const c2Bus = layout.links.find((link) => link.toId === 'c2')?.points.at(-1)?.[0];
    const c3Bus = layout.links.find((link) => link.toId === 'c3')?.points.at(-1)?.[0];

    expect(c2Bus).toBeCloseTo(c3Bus || 0, 1);
    expect(c1Bus).not.toBeCloseTo(c2Bus || 0, 1);
    expect(Math.abs(c1.cx - c2.cx)).toBeGreaterThan(220);
    assertNoNodeOverlaps(layout);
  });

  it('places children from the same father but different mothers under separate unions', () => {
    const tree = makeTree({
      persons: [
        person('father', 'Paul', 'Moreau', 'MALE', 0),
        person('mother-a', 'Anna', 'Durand', 'FEMALE', 0),
        person('mother-b', 'Sofia', 'Leroy', 'FEMALE', 0),
        person('child-a', 'Nina', 'Moreau', 'FEMALE', 1),
        person('child-b1', 'Tom', 'Moreau', 'MALE', 1),
        person('child-b2', 'Lise', 'Moreau', 'FEMALE', 1),
      ],
      relationships: [
        rel('father', 'child-a'),
        rel('mother-a', 'child-a'),
        rel('father', 'child-b1'),
        rel('mother-b', 'child-b1'),
        rel('father', 'child-b2'),
        rel('mother-b', 'child-b2'),
      ],
      unions: [
        union('union-a', 'father', 'mother-a'),
        union('union-b', 'father', 'mother-b'),
      ],
    });

    const layout = layoutFamilyTree(tree, 'father');
    const childA = getNode(layout, 'child-a');
    const childB1 = getNode(layout, 'child-b1');
    const childB2 = getNode(layout, 'child-b2');
    const linkA = layout.links.find((link) => link.toId === 'child-a');
    const linkB1 = layout.links.find((link) => link.toId === 'child-b1');
    const linkB2 = layout.links.find((link) => link.toId === 'child-b2');

    expect(linkA?.unionId).toBe('union-a');
    expect(linkB1?.unionId).toBe('union-b');
    expect(linkB2?.unionId).toBe('union-b');
    expect(linkB1?.points.at(-1)?.[0]).toBeCloseTo(
      linkB2?.points.at(-1)?.[0] || 0,
      1,
    );
    expect(linkA?.points.at(-1)?.[0]).not.toBeCloseTo(
      linkB1?.points.at(-1)?.[0] || 0,
      1,
    );
    expect(Math.abs(childA.cx - childB1.cx)).toBeGreaterThan(220);
    assertNoNodeOverlaps(layout);
  });

  it('keeps full siblings attached to the same couple bus', () => {
    const tree = makeTree({
      persons: [
        person('p1', 'Jean', 'Dupont', 'MALE', 0),
        person('p2', 'Marie', 'Martin', 'FEMALE', 0),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 1),
        person('c2', 'Leo', 'Dupont', 'MALE', 1),
        person('c3', 'Noe', 'Dupont', 'MALE', 1),
        person('s1', 'Emma', 'Petit', 'FEMALE', 1),
        person('g1', 'Mila', 'Dupont', 'FEMALE', 2),
      ],
      relationships: [
        rel('p1', 'c1'),
        rel('p2', 'c1'),
        rel('p1', 'c2'),
        rel('p2', 'c2'),
        rel('p1', 'c3'),
        rel('p2', 'c3'),
        rel('c2', 'g1'),
        rel('s1', 'g1'),
      ],
      unions: [union('u1', 'p1', 'p2'), union('u2', 'c2', 's1')],
    });

    const layout = layoutFamilyTree(tree, 'p1');
    const parent1 = getNode(layout, 'p1');
    const parent2 = getNode(layout, 'p2');
    const siblingLinks = ['c1', 'c2', 'c3'].map((childId) =>
      layout.links.find((link) => link.toId === childId),
    );
    const busX = (parent1.cx + parent2.cx) / 2;

    for (const link of siblingLinks) {
      expect(link?.type).toBe('parent-child');
      expect(link?.unionId).toBe('u1');
      expect(link?.unionKey).toBe('p1+p2');
      expect(link?.parentIds?.sort()).toEqual(['p1', 'p2']);
      expect(link?.points.at(-1)?.[0]).toBeCloseTo(busX, 1);
    }
  });

  it('does not degrade full siblings to mother-only links when the mother is the root', () => {
    const tree = makeTree({
      persons: [
        person('p2', 'Marie', 'Martin', 'FEMALE', 0),
        person('p1', 'Jean', 'Dupont', 'MALE', 0),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 1),
        person('c2', 'Leo', 'Dupont', 'MALE', 1),
      ],
      relationships: [
        rel('p1', 'c1'),
        rel('p2', 'c1'),
        rel('p1', 'c2'),
        rel('p2', 'c2'),
      ],
      unions: [union('u1', 'p1', 'p2')],
    });

    const layout = layoutFamilyTree(tree, 'p2');
    const father = getNode(layout, 'p1');
    const mother = getNode(layout, 'p2');
    const childLinks = ['c1', 'c2'].map((childId) =>
      layout.links.find((link) => link.toId === childId),
    );
    const busX = (father.cx + mother.cx) / 2;

    for (const link of childLinks) {
      expect(link?.type).toBe('parent-child');
      expect(link?.unionId).toBe('u1');
      expect(link?.points.at(-1)?.[0]).toBeCloseTo(busX, 1);
      expect(link?.points.at(-1)?.[0]).not.toBeCloseTo(mother.cx, 1);
    }
  });

  it('infers a visual co-parent bus when parents share a child without a union record', () => {
    const tree = makeTree({
      persons: [
        person('p1', 'Jean', 'Dupont', 'MALE', 0),
        person('p2', 'Marie', 'Martin', 'FEMALE', 0),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 1),
      ],
      relationships: [rel('p1', 'c1'), rel('p2', 'c1')],
      unions: [],
    });

    const layout = layoutFamilyTree(tree, 'p1');
    const p1 = getNode(layout, 'p1');
    const p2 = getNode(layout, 'p2');
    const spouseLink = layout.links.find((link) => link.type === 'spouse');
    const childLink = layout.links.find((link) => link.toId === 'c1');

    expect(spouseLink).toBeDefined();
    expect(spouseLink?.unionId).toBeUndefined();
    expect(childLink?.unionId).toBeUndefined();
    expect(childLink?.points.at(-1)?.[0]).toBeCloseTo((p1.cx + p2.cx) / 2, 1);
  });

  it('connects ancestry through the midpoint of both parents', () => {
    const tree = makeTree({
      persons: [
        person('p1', 'Jean', 'Dupont', 'MALE', -1),
        person('p2', 'Marie', 'Martin', 'FEMALE', -1),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 0),
      ],
      relationships: [rel('p1', 'c1'), rel('p2', 'c1')],
      unions: [union('u1', 'p1', 'p2')],
    });

    const layout = layoutFamilyTree(tree, 'c1');
    const p1 = getNode(layout, 'p1');
    const p2 = getNode(layout, 'p2');
    const ancestryLink = layout.links.find((link) => link.type === 'ancestry');

    expect(p1.cy).toBeLessThan(0);
    expect(p2.cy).toBeLessThan(0);
    expect(ancestryLink?.points.at(-1)?.[0]).toBeCloseTo((p1.cx + p2.cx) / 2, 1);
    expect(ancestryLink?.points.at(-1)?.[1]).toBeCloseTo((p1.cy + p2.cy) / 2, 1);
  });

  it('deduplicates repeated spouse/coparent links', () => {
    const tree = makeTree({
      persons: [
        person('p1', 'Jean', 'Dupont', 'MALE', -1),
        person('p2', 'Marie', 'Martin', 'FEMALE', -1),
        person('c1', 'Alice', 'Dupont', 'FEMALE', 0),
      ],
      relationships: [rel('p1', 'c1'), rel('p2', 'c1')],
      unions: [union('u1', 'p1', 'p2')],
    });

    const layout = layoutFamilyTree(tree, 'c1');
    const spouseLinks = layout.links.filter((link) => link.type === 'spouse');
    const uniqueIds = new Set(spouseLinks.map((link) => link.id));

    expect(spouseLinks).toHaveLength(uniqueIds.size);
    expect(spouseLinks).toHaveLength(1);
  });
});

function makeTree(input: {
  persons: Array<PersonDto & { generation: number }>;
  relationships: RelationshipDto[];
  unions: UnionDto[];
}): TreeWindowDto {
  const parentsByChild = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  for (const relationship of input.relationships) {
    parentsByChild.set(relationship.childId, [
      ...(parentsByChild.get(relationship.childId) || []),
      relationship.parentId,
    ]);
    childrenByParent.set(relationship.parentId, [
      ...(childrenByParent.get(relationship.parentId) || []),
      relationship.childId,
    ]);
  }

  return {
    rootPersonId: input.persons[0]?.id || 'p1',
    nodes: input.persons.map(({ generation, ...person }) => ({
      person,
      generation,
      unions: input.unions.filter(
        (item) => item.partner1Id === person.id || item.partner2Id === person.id,
      ),
      parents: parentsByChild.get(person.id) || [],
      children: childrenByParent.get(person.id) || [],
      visible: true,
    })),
    relationships: input.relationships.map((relationship) => ({
      ...relationship,
      visible: true,
    })),
    unions: input.unions.map((item) => ({ ...item, visible: true })),
    stats: {
      rootPersonId: input.persons[0]?.id || 'p1',
      requestedAncestors: 4,
      requestedDescendants: 2,
      visiblePersons: input.persons.length,
      totalCollectedPersons: input.persons.length,
      visibleRelationships: input.relationships.length,
      visibleUnions: input.unions.length,
      limit: 1200,
      truncated: false,
      includesSiblings: true,
      includesSpouses: true,
    },
  };
}

function person(
  id: string,
  givenNames: string,
  surname: string,
  gender: PersonDto['gender'],
  generation: number,
): PersonDto & { generation: number } {
  return {
    id,
    givenNames,
    usageSurname: surname,
    birthSurname: surname,
    gender,
    birthDate: null,
    birthPlace: null,
    deathDate: null,
    deathPlace: null,
    professions: [],
    notes: null,
    isRootDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    generation,
  };
}

function rel(parentId: string, childId: string): RelationshipDto {
  return {
    id: `${parentId}-${childId}`,
    parentId,
    childId,
    type: 'BIOLOGICAL' as any,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function union(id: string, partner1Id: string, partner2Id: string): UnionDto {
  return {
    id,
    partner1Id,
    partner2Id,
    type: 'MARRIAGE' as any,
    startDate: null,
    startPlace: null,
    endDate: null,
    endReason: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function getNode(layout: ReturnType<typeof layoutFamilyTree>, id: string) {
  const node = layout.nodes.find((item) => item.id === id);
  expect(node).toBeDefined();
  return node!;
}

function assertNoNodeOverlaps(layout: ReturnType<typeof layoutFamilyTree>) {
  for (let aIndex = 0; aIndex < layout.nodes.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < layout.nodes.length; bIndex += 1) {
      const a = layout.nodes[aIndex];
      const b = layout.nodes[bIndex];
      const overlapsX = Math.abs(a.cx - b.cx) < (a.width + b.width) / 2;
      const overlapsY = Math.abs(a.cy - b.cy) < (a.height + b.height) / 2;

      expect(
        overlapsX && overlapsY,
        `${a.tid} overlaps ${b.tid}`,
      ).toBe(false);
    }
  }
}
