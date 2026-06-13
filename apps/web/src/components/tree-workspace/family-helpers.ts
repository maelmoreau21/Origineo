import { Person, personLabel, TreeWindow } from './types';

export type TreeNode = TreeWindow['nodes'][number];

export type UnionGroup = {
  key: string;
  union?: any;
  unionId?: string;
  partnerId?: string;
  partner?: Person;
  title: string;
  subtitle: string;
  children: Person[];
  warnings: string[];
  inferred: boolean;
};

const UNION_TYPE_LABELS: Record<string, string> = {
  MARRIAGE: 'Mariage',
  PACS: 'PACS',
  PARTNERSHIP: 'Partenariat',
  OTHER: 'Union',
};

const UNION_END_REASON_LABELS: Record<string, string> = {
  DIVORCE: 'Divorce',
  DEATH: 'Deces',
  ANNULMENT: 'Annulation',
  OTHER: 'Autre',
};

export function buildUnionGroups(
  tree: TreeWindow,
  selectedNode: TreeNode,
): UnionGroup[] {
  const selectedId = selectedNode.person.id;
  const peopleById = new Map(tree.nodes.map((node) => [node.person.id, node.person]));
  const parentsByChild = new Map<string, string[]>();
  const selectedUnions = uniqueById([
    ...tree.unions.filter(
      (union) => union.partner1Id === selectedId || union.partner2Id === selectedId,
    ),
    ...(selectedNode.unions || []),
  ]);
  const groups = new Map<string, UnionGroup>();
  const unionKeyByPartner = new Map<string, string>();

  for (const relationship of tree.relationships) {
    parentsByChild.set(relationship.childId, [
      ...(parentsByChild.get(relationship.childId) || []),
      relationship.parentId,
    ]);
  }

  for (const union of selectedUnions) {
    const partnerId = union.partner1Id === selectedId ? union.partner2Id : union.partner1Id;
    const partner = peopleById.get(partnerId);
    const key = `union-${union.id}`;
    unionKeyByPartner.set(partnerId, key);
    groups.set(key, {
      key,
      union,
      unionId: union.id,
      partnerId,
      partner,
      title: partner ? personLabel(partner) : `Partenaire ${partnerId.slice(0, 8)}`,
      subtitle: formatUnionLine(union),
      children: [],
      warnings: [],
      inferred: false,
    });
  }

  for (const childId of selectedNode.children || []) {
    const child = peopleById.get(childId);
    if (!child) continue;

    const parentIds = unique(parentsByChild.get(childId) || [selectedId]);
    const otherParentIds = parentIds.filter((id) => id !== selectedId);
    const firstOtherParentId = otherParentIds[0];
    const realUnionKey = firstOtherParentId
      ? unionKeyByPartner.get(firstOtherParentId)
      : undefined;
    const key = realUnionKey || (firstOtherParentId ? `coparent-${firstOtherParentId}` : 'single-parent');

    if (!groups.has(key)) {
      const partner = firstOtherParentId ? peopleById.get(firstOtherParentId) : undefined;
      groups.set(key, {
        key,
        partnerId: firstOtherParentId,
        partner,
        title: partner ? personLabel(partner) : 'Parent inconnu',
        subtitle: firstOtherParentId
          ? 'Coparent deduit des parents de l enfant'
          : 'Enfants rattaches a un seul parent visible',
        children: [],
        warnings: [],
        inferred: true,
      });
    }

    const group = groups.get(key)!;
    group.children.push(child);

    if (parentIds.length > 2) {
      group.warnings.push(`${personLabel(child)} a plus de deux parents enregistres.`);
    }
    if (firstOtherParentId && !realUnionKey) {
      group.warnings.push(
        `${personLabel(child)} a un coparent mais aucune union reelle pour ce couple.`,
      );
    }
    if (!firstOtherParentId) {
      group.warnings.push(`${personLabel(child)} n a qu un parent visible dans cette fenetre.`);
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.inferred !== b.inferred) return a.inferred ? 1 : -1;
    return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  });
}

export function buildIntegrityWarnings(
  selectedNode: TreeNode | undefined,
  groups: UnionGroup[],
) {
  if (!selectedNode) return [];
  const warnings: string[] = [];
  if (selectedNode.parents.length > 2) {
    warnings.push('Cette personne a plus de deux parents enregistres.');
  }
  for (const group of groups) {
    warnings.push(...group.warnings);
  }
  return unique(warnings);
}

export function unionTypeLabel(type?: string | null) {
  if (!type) return 'Union';
  return UNION_TYPE_LABELS[type] || type;
}

export function unionEndReasonLabel(reason?: string | null) {
  if (!reason) return 'Non renseigne';
  return UNION_END_REASON_LABELS[reason] || reason;
}

export function formatUnionLine(union: any) {
  const type = unionTypeLabel(union?.type);
  const date = formatShortDate(union?.startDate);
  const place = union?.startPlace;
  if (date || place) return [type, date, place].filter(Boolean).join(' - ');
  return `${type} sans date ni lieu`;
}

export function peopleFromIds(tree: TreeWindow | null, ids: string[]) {
  if (!tree) return [];
  const byId = new Map(tree.nodes.map((node) => [node.person.id, node.person]));
  return ids.map((id) => byId.get(id)).filter((person): person is Person => Boolean(person));
}

export function formatShortDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('fr-FR');
}

export function readApiList<T>(result: any): T[] {
  const payload = result?.data ?? result;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function uniqueById<T extends { id: string }>(values: T[]) {
  const byId = new Map<string, T>();
  for (const value of values) byId.set(value.id, value);
  return Array.from(byId.values());
}
