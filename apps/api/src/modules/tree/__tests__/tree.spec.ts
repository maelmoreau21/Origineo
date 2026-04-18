// ══════════════════════════════════════
// Unit Tests — Tree Service Logic
// ══════════════════════════════════════
// Tests the tree building logic in isolation from Prisma.
// Verifies generation mapping, node construction, and edge cases.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock data ──────────────────────────────
const PERSON_ROOT = {
  id: 'root-1',
  givenNames: 'Jean',
  usageSurname: 'Dupont',
  birthSurname: 'Dupont',
  gender: 'MALE',
  birthDate: new Date('1950-01-15'),
  birthPlace: 'Paris',
  deathDate: null,
  deathPlace: null,
  professions: [],
  notes: null,
  isRootDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PERSON_FATHER = {
  ...PERSON_ROOT,
  id: 'father-1',
  givenNames: 'Pierre',
  isRootDefault: false,
  birthDate: new Date('1920-06-10'),
};

const PERSON_MOTHER = {
  ...PERSON_ROOT,
  id: 'mother-1',
  givenNames: 'Marie',
  gender: 'FEMALE',
  isRootDefault: false,
  birthDate: new Date('1922-03-20'),
};

const PERSON_CHILD = {
  ...PERSON_ROOT,
  id: 'child-1',
  givenNames: 'Sophie',
  gender: 'FEMALE',
  isRootDefault: false,
  birthDate: new Date('1975-09-01'),
};

const PERSON_GRANDPA = {
  ...PERSON_ROOT,
  id: 'grandpa-1',
  givenNames: 'Auguste',
  isRootDefault: false,
  birthDate: new Date('1890-02-14'),
};

// ─── Tree building logic (extracted) ────────
function buildGenerationMap(
  rootPersonId: string,
  ancestors: { id: string; generation: number }[],
  descendants: { id: string; generation: number }[],
): Map<string, number> {
  const generationMap = new Map<string, number>();
  generationMap.set(rootPersonId, 0);
  ancestors.forEach((a) => generationMap.set(a.id, -a.generation));
  descendants.forEach((d) => generationMap.set(d.id, d.generation));
  return generationMap;
}

function buildNodes(
  persons: any[],
  relationships: { id: string; parentId: string; childId: string }[],
  unions: { id: string; partner1Id: string; partner2Id: string }[],
  generationMap: Map<string, number>,
) {
  return persons.map((person) => {
    const personUnions = unions.filter(
      (u) => u.partner1Id === person.id || u.partner2Id === person.id,
    );

    const parents = relationships
      .filter((r) => r.childId === person.id)
      .map((r) => r.parentId);

    const children = relationships
      .filter((r) => r.parentId === person.id)
      .map((r) => r.childId);

    return {
      person,
      generation: generationMap.get(person.id) || 0,
      unions: personUnions,
      parents,
      children,
    };
  });
}


// ═══════════════════════════════════════
// T E S T S
// ═══════════════════════════════════════

describe('Generation Map', () => {
  it('root person should be generation 0', () => {
    const map = buildGenerationMap('root-1', [], []);
    expect(map.get('root-1')).toBe(0);
  });

  it('ancestors should have negative generations', () => {
    const ancestors = [
      { id: 'father-1', generation: 1 },
      { id: 'grandpa-1', generation: 2 },
    ];
    const map = buildGenerationMap('root-1', ancestors, []);

    expect(map.get('root-1')).toBe(0);
    expect(map.get('father-1')).toBe(-1);
    expect(map.get('grandpa-1')).toBe(-2);
  });

  it('descendants should have positive generations', () => {
    const descendants = [
      { id: 'child-1', generation: 1 },
    ];
    const map = buildGenerationMap('root-1', [], descendants);

    expect(map.get('root-1')).toBe(0);
    expect(map.get('child-1')).toBe(1);
  });

  it('mixed ancestors and descendants', () => {
    const ancestors = [
      { id: 'father-1', generation: 1 },
      { id: 'mother-1', generation: 1 },
      { id: 'grandpa-1', generation: 2 },
    ];
    const descendants = [
      { id: 'child-1', generation: 1 },
    ];
    const map = buildGenerationMap('root-1', ancestors, descendants);

    expect(map.size).toBe(5);
    expect(map.get('father-1')).toBe(-1);
    expect(map.get('mother-1')).toBe(-1);
    expect(map.get('grandpa-1')).toBe(-2);
    expect(map.get('child-1')).toBe(1);
  });
});

describe('Node Building', () => {
  const relationships = [
    { id: 'rel-1', parentId: 'father-1', childId: 'root-1' },
    { id: 'rel-2', parentId: 'mother-1', childId: 'root-1' },
    { id: 'rel-3', parentId: 'root-1', childId: 'child-1' },
  ];

  const unions = [
    { id: 'union-1', partner1Id: 'father-1', partner2Id: 'mother-1' },
  ];

  const persons = [PERSON_ROOT, PERSON_FATHER, PERSON_MOTHER, PERSON_CHILD];
  const genMap = buildGenerationMap(
    'root-1',
    [{ id: 'father-1', generation: 1 }, { id: 'mother-1', generation: 1 }],
    [{ id: 'child-1', generation: 1 }],
  );

  it('should build correct number of nodes', () => {
    const nodes = buildNodes(persons, relationships, unions, genMap);
    expect(nodes.length).toBe(4);
  });

  it('root person should have 2 parents and 1 child', () => {
    const nodes = buildNodes(persons, relationships, unions, genMap);
    const rootNode = nodes.find((n) => n.person.id === 'root-1')!;

    expect(rootNode.parents).toEqual(['father-1', 'mother-1']);
    expect(rootNode.children).toEqual(['child-1']);
    expect(rootNode.generation).toBe(0);
  });

  it('father should have the union', () => {
    const nodes = buildNodes(persons, relationships, unions, genMap);
    const fatherNode = nodes.find((n) => n.person.id === 'father-1')!;

    expect(fatherNode.unions.length).toBe(1);
    expect(fatherNode.unions[0].partner2Id).toBe('mother-1');
  });

  it('child should have root as parent', () => {
    const nodes = buildNodes(persons, relationships, unions, genMap);
    const childNode = nodes.find((n) => n.person.id === 'child-1')!;

    expect(childNode.parents).toEqual(['root-1']);
    expect(childNode.children).toEqual([]);
    expect(childNode.generation).toBe(1);
  });

  it('leaf person should have no children and no unions', () => {
    const nodes = buildNodes(persons, relationships, unions, genMap);
    const childNode = nodes.find((n) => n.person.id === 'child-1')!;

    expect(childNode.children).toHaveLength(0);
    expect(childNode.unions).toHaveLength(0);
  });
});

describe('Edge Cases', () => {
  it('empty tree (root only) should work', () => {
    const genMap = buildGenerationMap('root-1', [], []);
    const nodes = buildNodes([PERSON_ROOT], [], [], genMap);

    expect(nodes.length).toBe(1);
    expect(nodes[0].parents).toEqual([]);
    expect(nodes[0].children).toEqual([]);
    expect(nodes[0].generation).toBe(0);
  });

  it('person not in generation map should default to generation 0', () => {
    const genMap = new Map<string, number>();
    const nodes = buildNodes([PERSON_ROOT], [], [], genMap);

    expect(nodes[0].generation).toBe(0);
  });

  it('person appearing in both parent and child roles', () => {
    const relationships = [
      { id: 'rel-1', parentId: 'father-1', childId: 'root-1' },
      { id: 'rel-2', parentId: 'root-1', childId: 'child-1' },
    ];
    const genMap = buildGenerationMap(
      'root-1',
      [{ id: 'father-1', generation: 1 }],
      [{ id: 'child-1', generation: 1 }],
    );

    const nodes = buildNodes(
      [PERSON_ROOT, PERSON_FATHER, PERSON_CHILD],
      relationships,
      [],
      genMap,
    );

    const rootNode = nodes.find((n) => n.person.id === 'root-1')!;
    expect(rootNode.parents).toEqual(['father-1']);
    expect(rootNode.children).toEqual(['child-1']);
  });
});
