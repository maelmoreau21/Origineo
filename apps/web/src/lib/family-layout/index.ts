import * as d3 from 'd3';
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

export type FamilyLayoutOptions = {
  nodeSeparation?: number;
  levelSeparation?: number;
  singleParentPlaceholder?: boolean;
};

export type FamilyTreeDatum = FamilyChartDatumDto & {
  main?: boolean;
  toAdd?: boolean;
  spouseUnionIds?: Record<string, string>;
};

export type FamilyTreeNode = {
  id: string;
  tid: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  sx?: number;
  sy?: number;
  psx?: number;
  psy?: number;
  width: number;
  height: number;
  generation: number;
  depth: number;
  datum: FamilyTreeDatum;
  isRoot: boolean;
  hidden: boolean;
  added: boolean;
  isAncestry: boolean;
  parent?: FamilyTreeNode;
  parents?: FamilyTreeNode[];
  children?: FamilyTreeNode[];
  spouses?: FamilyTreeNode[];
  spouse?: FamilyTreeNode;
  coparent?: FamilyTreeNode;
};

export type FamilyTreeLink = {
  id: string;
  type: 'spouse' | 'parent-child' | 'single-parent' | 'ancestry';
  points: [number, number][];
  path: string;
  curve: boolean;
  hidden?: boolean;
  fromId?: string;
  toId?: string;
  unionId?: string;
  unionKey?: string;
  parentIds?: string[];
  childId?: string;
};

export type FamilyLayoutResult = {
  nodes: FamilyTreeNode[];
  links: FamilyTreeLink[];
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  datumById: Map<string, FamilyTreeDatum>;
};

const NODE_WIDTH = 224;
const NODE_HEIGHT = 118;
const DEFAULT_NODE_SEPARATION = 296;
const DEFAULT_LEVEL_SEPARATION = 224;
const DIFFERENT_UNION_SEPARATION = 0.85;

/**
 * Adaptation du principe de layout de donatso/family-chart.
 * Source d'inspiration MIT/SEE LICENSE IN LICENSE.txt :
 * https://github.com/donatso/family-chart
 *
 * Le point essentiel est le meme que family-chart : D3 calcule une hierarchie
 * ascendance/progeny, puis les conjoints sont ajoutes comme noeuds lateraux
 * avec `sx/sy`; les paths SVG sont ensuite generes en 6 points via D3.
 */
export function layoutFamilyTree(
  tree: TreeLike,
  rootId: string,
  options: FamilyLayoutOptions = {},
): FamilyLayoutResult {
  const dataStash = createDataStash(
    toFamilyChartData(tree),
    options.singleParentPlaceholder ?? true,
  );
  const datumById = new Map(dataStash.map((datum) => [datum.id, datum]));
  const main = datumById.get(rootId) || dataStash[0];
  if (!main) {
    return emptyLayout();
  }
  dataStash.forEach((datum) => {
    datum.main = datum.id === main.id;
  });

  const nodeSeparation = options.nodeSeparation || DEFAULT_NODE_SEPARATION;
  const levelSeparation = options.levelSeparation || DEFAULT_LEVEL_SEPARATION;
  const progeny = calculateTreeSide(
    main,
    dataStash,
    'children',
    nodeSeparation,
    levelSeparation,
  );
  const ancestry = calculateTreeSide(
    main,
    dataStash,
    'parents',
    nodeSeparation,
    levelSeparation,
  );

  levelOutEachSide(ancestry, progeny);
  const nodes = mergeSides(ancestry, progeny);
  setupChildrenAndParents(nodes);
  setupSpouses(nodes, dataStash, nodeSeparation);
  setupProgenyParentPositions(nodes);
  nodePositioning(nodes);
  setupTid(nodes);

  const linksById = new Map<string, FamilyTreeLink>();
  for (const node of nodes) {
    for (const link of createLinks(node)) {
      linksById.set(link.id, link);
    }
  }

  const links = Array.from(linksById.values()).filter((link) => !link.hidden);
  const visibleNodes = nodes.filter((node) => !node.hidden);
  const bounds = computeBounds(visibleNodes, links);

  return {
    nodes: visibleNodes.map((node) => ({
      ...node,
      x: node.cx - NODE_WIDTH / 2,
      y: node.cy - NODE_HEIGHT / 2,
    })),
    links,
    datumById,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    ...bounds,
  };
}

export function toFamilyChartData(tree: TreeLike): FamilyTreeDatum[] {
  const datumById = new Map<string, FamilyTreeDatum>();

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
    if (!parent || !child) continue;

    parent.rels.children = unique([...(parent.rels.children || []), child.id]);
    child.rels.parents = unique([...(child.rels.parents || []), parent.id]);
  }

  for (const union of tree.unions) {
    const partner1 = datumById.get(union.partner1Id);
    const partner2 = datumById.get(union.partner2Id);
    if (!partner1 || !partner2) continue;

    partner1.rels.spouses = unique([...(partner1.rels.spouses || []), partner2.id]);
    partner2.rels.spouses = unique([...(partner2.rels.spouses || []), partner1.id]);
    partner1.spouseUnionIds = {
      ...(partner1.spouseUnionIds || {}),
      [partner2.id]: union.id,
    };
    partner2.spouseUnionIds = {
      ...(partner2.spouseUnionIds || {}),
      [partner1.id]: union.id,
    };
  }

  for (const child of datumById.values()) {
    const parents = unique(child.rels.parents || []);
    if (parents.length !== 2) continue;
    const [parent1Id, parent2Id] = parents;
    const parent1 = datumById.get(parent1Id);
    const parent2 = datumById.get(parent2Id);
    if (!parent1 || !parent2) continue;

    parent1.rels.spouses = unique([...(parent1.rels.spouses || []), parent2.id]);
    parent2.rels.spouses = unique([...(parent2.rels.spouses || []), parent1.id]);
  }

  return Array.from(datumById.values());
}

function createDataStash(data: FamilyTreeDatum[], addSingleParentPlaceholder: boolean) {
  const cloned = data.map(cloneDatum);
  if (!addSingleParentPlaceholder) return cloned;

  const byId = new Map(cloned.map((datum) => [datum.id, datum]));
  const placeholders: FamilyTreeDatum[] = [];

  for (const datum of cloned) {
    const childIds = datum.rels.children || [];
    if (childIds.length === 0) continue;

    let placeholder: FamilyTreeDatum | undefined;
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      const parents = child.rels.parents || [];
      if (parents.length !== 1 || parents[0] !== datum.id) continue;

      if (!placeholder) {
        placeholder = {
          id: `placeholder-spouse-${datum.id}`,
          toAdd: true,
          data: {
            gender: datum.data.gender === 'M' ? 'F' : 'M',
            person: {
              id: `placeholder-spouse-${datum.id}`,
              givenNames: '',
              usageSurname: null,
              birthSurname: null,
              gender: 'UNKNOWN',
              birthDate: null,
              birthPlace: null,
              deathDate: null,
              deathPlace: null,
              professions: [],
              notes: null,
              isRootDefault: false,
              createdAt: '',
              updatedAt: '',
            } as PersonDto,
            generation: datum.data.generation,
            label: '',
          },
          rels: {
            parents: [],
            spouses: [datum.id],
            children: [],
          },
        };
        placeholders.push(placeholder);
        datum.rels.spouses = unique([...(datum.rels.spouses || []), placeholder.id]);
      }

      placeholder.rels.children = unique([
        ...(placeholder.rels.children || []),
        child.id,
      ]);
      child.rels.parents = unique([...parents, placeholder.id]);
    }
  }

  return [...cloned, ...placeholders];
}

function calculateTreeSide(
  main: FamilyTreeDatum,
  dataStash: FamilyTreeDatum[],
  relationType: 'children' | 'parents',
  nodeSeparation: number,
  levelSeparation: number,
) {
  const tree = d3
    .tree<FamilyTreeDatum>()
    .nodeSize([nodeSeparation, levelSeparation])
    .separation((a, b) =>
      relationType === 'parents'
        ? 1
        : progenySeparation(a.data, b.data),
    );

  const hierarchy = d3.hierarchy(main, (datum) =>
    relationType === 'children'
      ? hierarchyChildren(datum, dataStash)
      : hierarchyParents(datum, dataStash),
  );

  const projected = tree(hierarchy);
  const hierarchyNodes = projected.descendants();
  const nodeMap = new Map<d3.HierarchyPointNode<FamilyTreeDatum>, FamilyTreeNode>();
  for (const hierarchyNode of hierarchyNodes) {
    nodeMap.set(
      hierarchyNode,
      toFamilyTreeNode(hierarchyNode, relationType === 'parents'),
    );
  }

  for (const hierarchyNode of hierarchyNodes) {
    const layoutNode = nodeMap.get(hierarchyNode);
    if (layoutNode && hierarchyNode.parent) {
      layoutNode.parent = nodeMap.get(hierarchyNode.parent);
    }
  }

  return hierarchyNodes
    .map((hierarchyNode) => nodeMap.get(hierarchyNode))
    .filter((node): node is FamilyTreeNode => Boolean(node));
}

function hierarchyChildren(datum: FamilyTreeDatum, dataStash: FamilyTreeDatum[]) {
  const children = (datum.rels.children || [])
    .map((id) => dataStash.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is FamilyTreeDatum => Boolean(candidate));

  return sortChildrenWithSpouses(children, datum);
}

function hierarchyParents(datum: FamilyTreeDatum, dataStash: FamilyTreeDatum[]) {
  const parents = [...(datum.rels.parents || [])];
  const firstParent = dataStash.find((candidate) => candidate.id === parents[0]);
  if (firstParent?.data.gender === 'F') parents.reverse();

  return parents
    .map((id) => dataStash.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is FamilyTreeDatum => Boolean(candidate));
}

function progenySeparation(a: FamilyTreeDatum, b: FamilyTreeDatum) {
  let offset = 1;
  const sameUnion = unionKeyForChild(a) === unionKeyForChild(b);
  if (!sameUnion) offset += DIFFERENT_UNION_SEPARATION;
  if ((a.rels.spouses || []).length > 0 || (b.rels.spouses || []).length > 0) {
    offset += ((a.rels.spouses || []).length + (b.rels.spouses || []).length) * 0.5;
  }
  return offset;
}

function sortChildrenWithSpouses(children: FamilyTreeDatum[], parent: FamilyTreeDatum) {
  const spouseOrder = parent.rels.spouses || [];
  return [...children].sort((a, b) => {
    const spouseA = spouseIndexForChild(a, parent.id, spouseOrder);
    const spouseB = spouseIndexForChild(b, parent.id, spouseOrder);
    if (spouseA !== spouseB) return spouseA - spouseB;
    const unionA = unionKeyForChild(a, parent.id);
    const unionB = unionKeyForChild(b, parent.id);
    if (unionA !== unionB) return unionA.localeCompare(unionB);
    return personLabel(a.data.person).localeCompare(personLabel(b.data.person), 'fr');
  });
}

function spouseIndexForChild(
  child: FamilyTreeDatum,
  parentId: string,
  spouseOrder: string[],
) {
  const otherParent = (child.rels.parents || []).find((id) => id !== parentId);
  if (!otherParent) return Number.MAX_SAFE_INTEGER;
  const index = spouseOrder.indexOf(otherParent);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function toFamilyTreeNode(
  node: d3.HierarchyPointNode<FamilyTreeDatum>,
  isAncestry: boolean,
): FamilyTreeNode {
  return {
    id: node.data.id,
    tid: node.data.id,
    cx: node.x || 0,
    cy: node.y || 0,
    x: (node.x || 0) - NODE_WIDTH / 2,
    y: (node.y || 0) - NODE_HEIGHT / 2,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    generation: node.data.data.generation ?? (isAncestry ? -node.depth : node.depth),
    depth: node.depth,
    datum: node.data,
    isRoot: Boolean(node.data.main),
    hidden: Boolean(node.data.toAdd),
    added: false,
    isAncestry,
  };
}

function levelOutEachSide(parents: FamilyTreeNode[], children: FamilyTreeNode[]) {
  if (!parents[0] || !children[0]) return;
  const midDiff = (parents[0].cx - children[0].cx) / 2;
  parents.forEach((node) => {
    node.cx -= midDiff;
  });
  children.forEach((node) => {
    node.cx += midDiff;
  });
}

function mergeSides(parents: FamilyTreeNode[], children: FamilyTreeNode[]) {
  const root = children[0];
  parents.forEach((node) => {
    node.isAncestry = true;
    if (node.depth === 1) node.parent = root;
  });
  return [...children, ...parents.slice(1)];
}

function setupChildrenAndParents(nodes: FamilyTreeNode[]) {
  for (const node of nodes) {
    delete node.children;
    delete node.parents;
  }

  for (const parent of nodes) {
    for (const child of nodes) {
      if (child.parent !== parent) continue;
      if (child.isAncestry) {
        parent.parents = [...(parent.parents || []), child];
      } else {
        parent.children = [...(parent.children || []), child];
      }
    }

    if (parent.parents?.length === 2) {
      const [p1, p2] = parent.parents;
      p1.coparent = p2;
      p2.coparent = p1;
    }
  }
}

function setupSpouses(
  nodes: FamilyTreeNode[],
  dataStash: FamilyTreeDatum[],
  nodeSeparation: number,
) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (!node.isAncestry) {
      const spouses = node.datum.rels.spouses || [];
      if (spouses.length > 0) {
        const side = node.datum.data.gender === 'M' ? -1 : 1;
        node.cx += (spouses.length / 2) * nodeSeparation * side;

        spouses.forEach((spouseId, spouseIndex) => {
          const spouseDatum = dataStash.find((datum) => datum.id === spouseId);
          if (!spouseDatum) return;

          const spouse: FamilyTreeNode = {
            id: spouseDatum.id,
            tid: `${node.id}-spouse-${spouseIndex}`,
            cx: node.cx - nodeSeparation * (spouseIndex + 1) * side,
            cy: node.cy,
            x: 0,
            y: 0,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            generation: node.generation,
            depth: node.depth,
            datum: spouseDatum,
            isRoot: spouseDatum.main || false,
            hidden: Boolean(spouseDatum.toAdd),
            added: true,
            isAncestry: false,
            spouse: node,
          };

          spouse.sx = midpoint(node.cx, spouse.cx);
          spouse.sy = spouse.cy;

          node.spouses = [...(node.spouses || []), spouse];
          nodes.push(spouse);
        });
      }
    }

    if (node.parents?.length === 2) {
      const [p1, p2] = node.parents;
      const midpoint = p1.cx - (p1.cx - p2.cx) / 2;
      p2.cx = midpoint + (nodeSeparation / 2) * (p1.cx < p2.cx ? 1 : -1);
      p1.cx = midpoint + (nodeSeparation / 2) * (p2.cx < p1.cx ? 1 : -1);
    }
  }
}

function setupProgenyParentPositions(nodes: FamilyTreeNode[]) {
  for (const node of nodes) {
    if (node.isAncestry || node.depth === 0 || node.added) continue;

    const p1 = node.parent;
    const p2 = p1?.spouses?.find((spouse) =>
      (node.datum.rels.parents || []).includes(spouse.id),
    );

    if (p1 && p2) {
      const addedSpouse = p1.added ? p1 : p2;
      node.psx = addedSpouse.sx;
      node.psy = addedSpouse.cy;
    } else if (p1) {
      const parents = node.datum.rels.parents || [];
      const parentNodes = [p1, ...(p1.spouses || [])].filter((parentNode) =>
        parents.includes(parentNode.id),
      );
      p1.sx =
        parentNodes.length === 2
          ? midpoint(parentNodes[0].cx, parentNodes[1].cx)
          : p1.cx;
      p1.sy = p1.cy;
      node.psx = p1.sx;
      node.psy = p1.cy;
    }
  }
}

function nodePositioning(nodes: FamilyTreeNode[]) {
  for (const node of nodes) {
    node.cy *= node.isAncestry ? -1 : 1;
    if (typeof node.sy === 'number') {
      node.sy *= node.isAncestry ? -1 : 1;
    }
    if (typeof node.psy === 'number') {
      node.psy *= node.isAncestry ? -1 : 1;
    }
  }
}

function setupTid(nodes: FamilyTreeNode[]) {
  const seen = new Map<string, number>();
  for (const node of nodes) {
    const count = seen.get(node.id) || 0;
    node.tid = count === 0 ? node.id : `${node.id}--x${count + 1}`;
    seen.set(node.id, count + 1);
  }
}

function createLinks(node: FamilyTreeNode): FamilyTreeLink[] {
  const links: FamilyTreeLink[] = [];
  if (node.spouses || node.coparent) handleSpouseLinks(node, links);
  handleAncestryLink(node, links);
  handleProgenyLinks(node, links);
  return links;
}

function handleSpouseLinks(node: FamilyTreeNode, links: FamilyTreeLink[]) {
  const spouses = node.spouses || (node.coparent ? [node.coparent] : []);
  for (const spouse of spouses) {
    const hidden = node.hidden || spouse.hidden;
    links.push({
      id: linkId(node, spouse),
      type: 'spouse',
      points: [
        [node.cx, node.cy],
        [spouse.cx, spouse.cy],
      ],
      path: createPath(
        [
          [node.cx, node.cy],
          [spouse.cx, spouse.cy],
        ],
        false,
      ),
      curve: false,
      hidden,
      fromId: node.id,
      toId: spouse.id,
      unionId: realUnionIdFor(node, spouse),
      unionKey: unionKeyForParents([node.id, spouse.id]),
    });
  }
}

function handleAncestryLink(node: FamilyTreeNode, links: FamilyTreeLink[]) {
  if (!node.parents || node.parents.length === 0) return;

  const p1 = node.parents[0];
  const p2 = node.parents[1] || p1;
  const parentPoint = {
    x: midpoint(p1.cx, p2.cx),
    y: midpoint(p1.cy, p2.cy),
  };
  const points = verticalLink({ x: node.cx, y: node.cy }, parentPoint);
  links.push({
    id: linkId(node, p1, p2),
    type: 'ancestry',
    points,
    path: createPath(points, true),
    curve: true,
    fromId: node.id,
    toId: p1.id,
    unionId: realUnionIdFor(p1, p2),
    unionKey: unionKeyForParents([p1.id, p2.id]),
    parentIds: unique([p1.id, p2.id]),
    childId: node.id,
  });
}

function handleProgenyLinks(node: FamilyTreeNode, links: FamilyTreeLink[]) {
  if (!node.children || node.children.length === 0) return;

  for (const child of node.children) {
    const otherParent =
      node.spouses?.find((spouse) =>
        (child.datum.rels.parents || []).includes(spouse.id),
      ) || node;
    const sx = otherParent.sx;
    if (typeof sx !== 'number') continue;

    const parentPoint = { x: sx, y: node.cy };
    const points = verticalLink({ x: child.cx, y: child.cy }, parentPoint);
    const hidden = child.hidden || (node.hidden && otherParent.hidden);
    const parentIds = unique(child.datum.rels.parents || []);
    links.push({
      id: linkId(child, node, otherParent),
      type:
        otherParent === node || otherParent.hidden
          ? 'single-parent'
          : 'parent-child',
      points,
      path: createPath(points, true),
      curve: true,
      hidden,
      fromId: node.id,
      toId: child.id,
      unionId: realUnionIdFor(node, otherParent),
      unionKey: unionKeyForChild(child.datum, node.id),
      parentIds,
      childId: child.id,
    });
  }
}

function verticalLink(
  child: { x: number; y: number },
  parent: { x: number; y: number },
): [number, number][] {
  const hy = child.y + (parent.y - child.y) / 2;
  return [
    [child.x, child.y],
    [child.x, hy],
    [child.x, hy],
    [parent.x, hy],
    [parent.x, hy],
    [parent.x, parent.y],
  ];
}

function createPath(points: [number, number][], curve: boolean) {
  const line = d3.line<[number, number]>().curve(
    curve ? d3.curveBasis : d3.curveMonotoneY,
  );
  return line(points) || '';
}

function computeBounds(nodes: FamilyTreeNode[], links: FamilyTreeLink[]) {
  if (nodes.length === 0) return { minX: -600, minY: -400, maxX: 600, maxY: 400 };

  const nodeXs = nodes.flatMap((node) => [
    node.cx - NODE_WIDTH / 2,
    node.cx + NODE_WIDTH / 2,
  ]);
  const nodeYs = nodes.flatMap((node) => [
    node.cy - NODE_HEIGHT / 2,
    node.cy + NODE_HEIGHT / 2,
  ]);
  const linkXs = links.flatMap((link) => link.points.map(([x]) => x));
  const linkYs = links.flatMap((link) => link.points.map(([, y]) => y));

  return {
    minX: Math.min(...nodeXs, ...linkXs) - 180,
    minY: Math.min(...nodeYs, ...linkYs) - 160,
    maxX: Math.max(...nodeXs, ...linkXs) + 180,
    maxY: Math.max(...nodeYs, ...linkYs) + 180,
  };
}

function emptyLayout(): FamilyLayoutResult {
  return {
    nodes: [],
    links: [],
    width: 1200,
    height: 800,
    minX: -600,
    minY: -400,
    maxX: 600,
    maxY: 400,
    datumById: new Map(),
  };
}

function cloneDatum(datum: FamilyTreeDatum): FamilyTreeDatum {
  return {
    ...datum,
    data: { ...datum.data },
    spouseUnionIds: { ...(datum.spouseUnionIds || {}) },
    rels: {
      parents: [...(datum.rels.parents || [])],
      spouses: [...(datum.rels.spouses || [])],
      children: [...(datum.rels.children || [])],
    },
  };
}

function midpoint(a: number, b: number) {
  return a - (a - b) / 2;
}

function realUnionIdFor(a: FamilyTreeNode, b: FamilyTreeNode) {
  return a.datum.spouseUnionIds?.[b.id] || b.datum.spouseUnionIds?.[a.id];
}

function unionKeyForChild(child: FamilyTreeDatum, preferredParentId?: string) {
  const parents = unique(child.rels.parents || []);
  if (preferredParentId && parents.includes(preferredParentId)) {
    const otherParents = parents.filter((id) => id !== preferredParentId).sort();
    return unionKeyForParents([preferredParentId, ...otherParents]);
  }
  return unionKeyForParents(parents);
}

function unionKeyForParents(parentIds: string[]) {
  return unique(parentIds).sort().join('+') || 'unknown';
}

function linkId(...nodes: FamilyTreeNode[]) {
  return nodes.map((node) => node.tid).sort().join(', ');
}

function mapGender(gender: PersonDto['gender']): FamilyChartDatumDto['data']['gender'] {
  if (gender === 'MALE') return 'M';
  if (gender === 'FEMALE') return 'F';
  if (gender === 'OTHER') return 'O';
  return 'U';
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
