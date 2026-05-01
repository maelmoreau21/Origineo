import type {
  FamilyChartDatumDto,
  PersonDto,
  RelationshipDto,
  TreeWindowDto,
  UnionDto,
} from '@origineo/shared';

type TreeLike = TreeWindowDto & {
  nodes: Array<{
    person: PersonDto;
    generation: number;
    parents?: string[];
    children?: string[];
  }>;
  relationships: RelationshipDto[];
  unions: UnionDto[];
};

export type FamilyLayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
  datum: FamilyChartDatumDto;
  isRoot: boolean;
};

export type FamilyLayoutLink = {
  id: string;
  type: 'spouse' | 'parent-child' | 'single-parent';
  path: string;
  fromId?: string;
  toId?: string;
  unionId?: string;
};

export type FamilyLayoutResult = {
  nodes: FamilyLayoutNode[];
  links: FamilyLayoutLink[];
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  datumById: Map<string, FamilyChartDatumDto>;
};

const NODE_WIDTH = 224;
const NODE_HEIGHT = 118;
const NODE_GAP_X = 72;
const SPOUSE_GAP_X = 24;
const COMPONENT_GAP_X = 110;
const GENERATION_GAP_Y = 210;

// Format inspired by donatso/family-chart (MIT): { id, data, rels }.
export function toFamilyChartData(tree: TreeLike): FamilyChartDatumDto[] {
  const datumById = new Map<string, FamilyChartDatumDto>();

  for (const node of tree.nodes) {
    datumById.set(node.person.id, {
      id: node.person.id,
      data: {
        gender: mapGender(node.person.gender),
        person: node.person,
        generation: node.generation,
        label: personLabel(node.person),
      },
      rels: {
        parents: [...(node.parents || [])],
        children: [...(node.children || [])],
        spouses: [],
      },
    });
  }

  for (const relationship of tree.relationships) {
    const parent = datumById.get(relationship.parentId);
    const child = datumById.get(relationship.childId);
    if (parent && child) {
      parent.rels.children = unique([...(parent.rels.children || []), child.id]);
      child.rels.parents = unique([...(child.rels.parents || []), parent.id]);
    }
  }

  for (const union of tree.unions) {
    const partner1 = datumById.get(union.partner1Id);
    const partner2 = datumById.get(union.partner2Id);
    if (partner1 && partner2) {
      partner1.rels.spouses = unique([...(partner1.rels.spouses || []), partner2.id]);
      partner2.rels.spouses = unique([...(partner2.rels.spouses || []), partner1.id]);
    }
  }

  return Array.from(datumById.values());
}

export function layoutFamilyTree(
  tree: TreeLike,
  rootId: string,
): FamilyLayoutResult {
  const data = toFamilyChartData(tree);
  const datumById = new Map(data.map((datum) => [datum.id, datum]));
  const generations = new Map<number, FamilyChartDatumDto[]>();

  for (const datum of data) {
    const generation = datum.data.generation || 0;
    const group = generations.get(generation) || [];
    group.push(datum);
    generations.set(generation, group);
  }

  const sortedGenerations = Array.from(generations.keys()).sort((a, b) => a - b);
  const positions = new Map<string, FamilyLayoutNode>();

  for (const generation of sortedGenerations) {
    const row = generations.get(generation) || [];
    const components = buildSpouseComponents(row, tree.unions);
    const rowWidth = components.reduce((total, component, index) => {
      const componentWidth =
        component.length * NODE_WIDTH +
        Math.max(0, component.length - 1) * SPOUSE_GAP_X;
      return total + componentWidth + (index > 0 ? COMPONENT_GAP_X : 0);
    }, 0);

    let cursorX = -rowWidth / 2;
    const y = generation * GENERATION_GAP_Y;

    for (const component of components) {
      const ordered = orderComponent(component, tree.unions);
      const componentWidth =
        ordered.length * NODE_WIDTH +
        Math.max(0, ordered.length - 1) * SPOUSE_GAP_X;

      for (let index = 0; index < ordered.length; index += 1) {
        const datum = ordered[index];
        positions.set(datum.id, {
          id: datum.id,
          x: cursorX + index * (NODE_WIDTH + SPOUSE_GAP_X),
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          generation,
          datum,
          isRoot: datum.id === rootId,
        });
      }

      cursorX += componentWidth + COMPONENT_GAP_X;
    }
  }

  pullChildrenTowardParents(tree, positions);

  const links = [
    ...createSpouseLinks(tree.unions, positions),
    ...createParentChildLinks(tree.relationships, positions),
  ];

  const nodes = Array.from(positions.values());
  const bounds = computeBounds(nodes);

  return {
    nodes,
    links,
    datumById,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    ...bounds,
  };
}

function buildSpouseComponents(
  row: FamilyChartDatumDto[],
  unions: UnionDto[],
): FamilyChartDatumDto[][] {
  const ids = new Set(row.map((datum) => datum.id));
  const byId = new Map(row.map((datum) => [datum.id, datum]));
  const adjacency = new Map<string, Set<string>>();
  for (const id of ids) adjacency.set(id, new Set());

  for (const union of unions) {
    if (!ids.has(union.partner1Id) || !ids.has(union.partner2Id)) continue;
    adjacency.get(union.partner1Id)?.add(union.partner2Id);
    adjacency.get(union.partner2Id)?.add(union.partner1Id);
  }

  const seen = new Set<string>();
  const components: FamilyChartDatumDto[][] = [];
  for (const datum of row.sort(compareDatum)) {
    if (seen.has(datum.id)) continue;
    const queue = [datum.id];
    const component: FamilyChartDatumDto[] = [];
    seen.add(datum.id);

    while (queue.length > 0) {
      const id = queue.shift()!;
      const item = byId.get(id);
      if (item) component.push(item);
      for (const next of adjacency.get(id) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }

    components.push(component.sort(compareDatum));
  }

  return components;
}

function orderComponent(component: FamilyChartDatumDto[], unions: UnionDto[]) {
  if (component.length <= 2) return component;
  const ids = new Set(component.map((datum) => datum.id));
  const linked = new Set<string>();
  const ordered: FamilyChartDatumDto[] = [];
  const byId = new Map(component.map((datum) => [datum.id, datum]));

  for (const union of unions) {
    if (!ids.has(union.partner1Id) || !ids.has(union.partner2Id)) continue;
    for (const id of [union.partner1Id, union.partner2Id]) {
      if (linked.has(id)) continue;
      const datum = byId.get(id);
      if (datum) ordered.push(datum);
      linked.add(id);
    }
  }

  for (const datum of component) {
    if (!linked.has(datum.id)) ordered.push(datum);
  }

  return ordered;
}

function pullChildrenTowardParents(
  tree: TreeLike,
  positions: Map<string, FamilyLayoutNode>,
) {
  const childrenByGeneration = new Map<number, FamilyLayoutNode[]>();
  for (const node of positions.values()) {
    const group = childrenByGeneration.get(node.generation) || [];
    group.push(node);
    childrenByGeneration.set(node.generation, group);
  }

  for (const node of positions.values()) {
    const parents = tree.relationships
      .filter((relationship) => relationship.childId === node.id)
      .map((relationship) => positions.get(relationship.parentId))
      .filter((parent): parent is FamilyLayoutNode => Boolean(parent));
    if (parents.length === 0) continue;

    const desiredCenter =
      parents.reduce((sum, parent) => sum + parent.x + parent.width / 2, 0) /
      parents.length;
    const row = childrenByGeneration.get(node.generation) || [];
    const sameRowIndex = row
      .sort((a, b) => a.x - b.x)
      .findIndex((candidate) => candidate.id === node.id);
    const siblingOffset =
      (sameRowIndex - (row.length - 1) / 2) * Math.min(NODE_GAP_X, 42);
    node.x = desiredCenter - node.width / 2 + siblingOffset;
  }
}

function createSpouseLinks(
  unions: UnionDto[],
  positions: Map<string, FamilyLayoutNode>,
): FamilyLayoutLink[] {
  const links: FamilyLayoutLink[] = [];
  for (const union of unions) {
    const a = positions.get(union.partner1Id);
    const b = positions.get(union.partner2Id);
    if (!a || !b) continue;
    const left = a.x <= b.x ? a : b;
    const right = left.id === a.id ? b : a;
    const y = left.y + 62;
    links.push({
      id: `spouse-${union.id}`,
      type: 'spouse',
      unionId: union.id,
      fromId: left.id,
      toId: right.id,
      path: `M ${left.x + left.width} ${y} C ${left.x + left.width + 28} ${y}, ${right.x - 28} ${y}, ${right.x} ${y}`,
    });
  }
  return links;
}

function createParentChildLinks(
  relationships: RelationshipDto[],
  positions: Map<string, FamilyLayoutNode>,
): FamilyLayoutLink[] {
  const parentsByChild = new Map<string, string[]>();
  for (const relationship of relationships) {
    const list = parentsByChild.get(relationship.childId) || [];
    list.push(relationship.parentId);
    parentsByChild.set(relationship.childId, list);
  }

  const links: FamilyLayoutLink[] = [];
  for (const [childId, parentIds] of parentsByChild.entries()) {
    const child = positions.get(childId);
    if (!child) continue;
    const parents = parentIds
      .map((id) => positions.get(id))
      .filter((parent): parent is FamilyLayoutNode => Boolean(parent));
    if (parents.length === 0) continue;

    const childTopX = child.x + child.width / 2;
    const childTopY = child.y;
    const parentBottomY =
      parents.reduce((sum, parent) => sum + parent.y + parent.height, 0) /
      parents.length;
    const parentCenterX =
      parents.reduce((sum, parent) => sum + parent.x + parent.width / 2, 0) /
      parents.length;
    const busY = parentBottomY + Math.max(42, (childTopY - parentBottomY) / 2);

    for (const parent of parents) {
      const parentX = parent.x + parent.width / 2;
      const parentY = parent.y + parent.height;
      links.push({
        id: `parent-${parent.id}-${child.id}`,
        type: parents.length > 1 ? 'parent-child' : 'single-parent',
        fromId: parent.id,
        toId: child.id,
        path:
          `M ${parentX} ${parentY} ` +
          `C ${parentX} ${busY}, ${parentCenterX} ${busY}, ${parentCenterX} ${busY} ` +
          `C ${parentCenterX} ${busY}, ${childTopX} ${busY}, ${childTopX} ${childTopY}`,
      });
    }
  }
  return links;
}

function computeBounds(nodes: FamilyLayoutNode[]) {
  if (nodes.length === 0) {
    return { minX: -600, minY: -400, maxX: 600, maxY: 400 };
  }

  const minX = Math.min(...nodes.map((node) => node.x)) - 180;
  const minY = Math.min(...nodes.map((node) => node.y)) - 160;
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + 180;
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + 180;
  return { minX, minY, maxX, maxY };
}

function mapGender(gender: PersonDto['gender']): FamilyChartDatumDto['data']['gender'] {
  if (gender === 'MALE') return 'M';
  if (gender === 'FEMALE') return 'F';
  if (gender === 'OTHER') return 'O';
  return 'U';
}

function compareDatum(a: FamilyChartDatumDto, b: FamilyChartDatumDto) {
  return personLabel(a.data.person).localeCompare(personLabel(b.data.person), 'fr');
}

function personLabel(person: PersonDto) {
  return [person.givenNames, person.usageSurname || person.birthSurname]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
