import type {
  CustodyState,
  Inmate,
  NationalInmateIndexItem,
  ProvinceId
} from '../types/pnap';

export type SearchCategory =
  | 'all'
  | 'name'
  | 'matricula'
  | 'bi'
  | 'parent'
  | 'phone'
  | 'neighborhood'
  | 'province'
  | 'crime'
  | 'pavilion'
  | 'process'
  | 'visitor';

export type SearchCustodyScope =
  | 'ALL'
  | 'ACTIVE'
  | 'ACTIVE_IN_UNIT'
  | 'LIBERTADO'
  | 'EVADIDO'
  | 'PREVENTIVO';

export function normalizeSearchText(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCompactCode(value?: string | null): string {
  return normalizeSearchText(value).replace(/[\s/_-]+/g, '');
}

export function tokenizeSearchQuery(query: string): string[] {
  const norm = normalizeSearchText(query);
  if (!norm) return [];
  return norm.split(' ').filter(Boolean);
}

export function resolveIndexCustodyState(item: NationalInmateIndexItem): CustodyState {
  if (item.custodyState) return item.custodyState;
  switch (item.custodyStatus) {
    case 'TRANSFERIDO':
      return 'EM_TRANSITO_TRANSFERENCIA';
    case 'LIBERTADO':
      return 'LIBERTADO';
    case 'EVADIDO':
      return 'EVADIDO';
    case 'FALECIDO':
      return 'FALECIDO';
    default:
      return 'ATIVO_NA_UNIDADE';
  }
}

export function matchesCustodyScope(
  item: NationalInmateIndexItem,
  scope: SearchCustodyScope = 'ALL'
): boolean {
  if (scope === 'ALL') return true;
  const state = resolveIndexCustodyState(item);
  if (scope === 'ACTIVE_IN_UNIT') {
    return state === 'ATIVO_NA_UNIDADE';
  }
  if (scope === 'ACTIVE') {
    return (
      state === 'ATIVO_NA_UNIDADE' ||
      state === 'EM_DILIGENCIA_EXTERNA' ||
      state === 'HOSPITALIZADO_EXTERNO'
    );
  }
  if (scope === 'LIBERTADO') {
    return state === 'LIBERTADO';
  }
  if (scope === 'EVADIDO') {
    return state === 'EVADIDO';
  }
  if (scope === 'PREVENTIVO') {
    const isPresent =
      state === 'ATIVO_NA_UNIDADE' ||
      state === 'EM_DILIGENCIA_EXTERNA' ||
      state === 'HOSPITALIZADO_EXTERNO';
    return isPresent && (item.legalStatus === 'PREVENTIVO' || item.legalStatus === 'RECORRENTE');
  }
  return true;
}

export function buildVisitorKeywords(inmate: Inmate): string {
  const parts: string[] = [];
  if (inmate.profile.emergencyContact?.name) {
    parts.push(inmate.profile.emergencyContact.name);
  }
  if (inmate.profile.emergencyContact?.phone) {
    parts.push(inmate.profile.emergencyContact.phone);
  }
  (inmate.visitors || []).forEach((v) => {
    if (v.fullName) parts.push(v.fullName);
    if (v.biNumber) parts.push(v.biNumber);
    if (v.phone) parts.push(v.phone);
  });
  return Array.from(new Set(parts.map((p) => p.trim()).filter(Boolean)))
    .join(' · ')
    .slice(0, 600);
}

export function buildIndexSearchText(item: Partial<NationalInmateIndexItem>): string {
  const rawFields = [
    item.matricula,
    item.fullName,
    item.alias,
    item.biNumber,
    item.processNumber,
    item.parentName,
    item.emergencyContactName,
    item.emergencyPhone,
    item.neighborhood,
    item.provinceId,
    item.provinceName,
    item.establishmentId,
    item.establishmentName,
    item.pavilionName,
    item.cellCode,
    item.crimeCategory,
    item.penalCodeArticle,
    item.visitorKeywords
  ];
  return normalizeSearchText(rawFields.filter(Boolean).join(' ')).slice(0, 1500);
}

export function inmateToNationalIndexItem(
  inmate: Inmate,
  estName?: string,
  provinceName?: string
): NationalInmateIndexItem {
  const visitorKeywords = buildVisitorKeywords(inmate);
  const item: NationalInmateIndexItem = {
    inmateId: inmate.inmateId,
    matricula: inmate.profile.matricula,
    fullName: inmate.profile.fullName,
    alias: inmate.profile.alias,
    biNumber: inmate.profile.biNumber,
    provinceId: inmate.provinceId,
    provinceName: provinceName || inmate.provinceId.toUpperCase(),
    establishmentId: inmate.establishmentId,
    establishmentName: estName || inmate.establishmentId,
    pavilionName: inmate.pavilionId,
    cellCode: inmate.cellId,
    processNumber: inmate.admission?.processNumber || '',
    legalStatus: inmate.legal.legalStatus,
    crimeCategory: inmate.legal.crimeCategory,
    penalCodeArticle: inmate.legal.penalCodeArticle,
    parentName: [inmate.profile.fatherName, inmate.profile.motherName]
      .filter((n) => n && n !== 'Não declarado' && n !== 'Não declarada')
      .join(' / '),
    emergencyContactName: inmate.profile.emergencyContact?.name || '',
    emergencyPhone: inmate.profile.emergencyContact?.phone || '',
    neighborhood: inmate.profile.neighborhood || '',
    photoUrl: inmate.profile.photoUrl || '',
    lastUpdated: inmate.updatedAt || new Date().toISOString(),
    custodyStatus: inmate.currentStatus,
    custodyState: inmate.custodyState,
    version: inmate.version,
    visitorKeywords
  };
  item.searchText = buildIndexSearchText(item);
  return item;
}

function getCategoryFieldTexts(
  item: NationalInmateIndexItem,
  category: SearchCategory
): string[] {
  switch (category) {
    case 'name':
      return [item.fullName, item.alias || ''];
    case 'matricula':
      return [item.matricula];
    case 'bi':
      return [item.biNumber];
    case 'parent':
      return [item.parentName, item.emergencyContactName];
    case 'phone':
      return [item.emergencyPhone, item.visitorKeywords || ''];
    case 'neighborhood':
      return [item.neighborhood];
    case 'province':
      return [item.provinceName, item.provinceId];
    case 'crime':
      return [item.crimeCategory, item.penalCodeArticle];
    case 'pavilion':
      return [item.pavilionName, item.cellCode, item.establishmentName, item.establishmentId];
    case 'process':
      return [item.processNumber || ''];
    case 'visitor':
      return [item.visitorKeywords || '', item.emergencyContactName, item.parentName];
    case 'all':
    default:
      return [
        item.matricula,
        item.fullName,
        item.alias || '',
        item.biNumber,
        item.processNumber || '',
        item.parentName,
        item.emergencyContactName,
        item.emergencyPhone,
        item.neighborhood,
        item.provinceName,
        item.provinceId,
        item.establishmentName,
        item.establishmentId,
        item.pavilionName,
        item.cellCode,
        item.crimeCategory,
        item.penalCodeArticle,
        item.visitorKeywords || '',
        item.searchText || ''
      ];
  }
}

export function scoreNationalIndexMatch(
  item: NationalInmateIndexItem,
  tokens: string[],
  rawNormQuery: string,
  category: SearchCategory = 'all'
): number {
  if (tokens.length === 0) return 1;

  const fieldTexts = getCategoryFieldTexts(item, category).map((f) => normalizeSearchText(f));
  const combinedNorm = fieldTexts.join(' ');
  const combinedCompact = combinedNorm.replace(/[\s/_-]+/g, '');

  // Todos os tokens devem existir (AND flexível entre campos)
  for (const tok of tokens) {
    const compactTok = tok.replace(/[\s/_-]+/g, '');
    const matched =
      combinedNorm.includes(tok) ||
      (compactTok.length >= 2 && combinedCompact.includes(compactTok));
    if (!matched) {
      return 0;
    }
  }

  let score = 10;
  const compactQuery = rawNormQuery.replace(/[\s/_-]+/g, '');
  const normMatricula = normalizeSearchText(item.matricula);
  const compactMatricula = normalizeCompactCode(item.matricula);
  const normBi = normalizeSearchText(item.biNumber);
  const compactBi = normalizeCompactCode(item.biNumber);
  const normName = normalizeSearchText(item.fullName);
  const normAlias = normalizeSearchText(item.alias);
  const normProcess = normalizeSearchText(item.processNumber);
  const compactCell = normalizeCompactCode(item.cellCode);

  if (
    (compactBi && compactQuery && compactBi === compactQuery) ||
    (compactMatricula && compactQuery && compactMatricula === compactQuery) ||
    (normProcess && rawNormQuery && normalizeCompactCode(normProcess) === compactQuery)
  ) {
    score += 1000;
  } else if (
    (compactBi && compactQuery && compactBi.startsWith(compactQuery)) ||
    (compactMatricula && compactQuery && compactMatricula.startsWith(compactQuery))
  ) {
    score += 600;
  }

  if (normName.startsWith(rawNormQuery) || (normAlias && normAlias.startsWith(rawNormQuery))) {
    score += 420;
  }

  for (const tok of tokens) {
    const compactTok = tok.replace(/[\s/_-]+/g, '');
    if (normName.includes(tok) || normAlias.includes(tok)) score += 160;
    if (normMatricula.includes(tok) || (compactTok && compactMatricula.includes(compactTok))) {
      score += 180;
    }
    if (normBi.includes(tok) || (compactTok && compactBi.includes(compactTok))) {
      score += 180;
    }
    if (normProcess.includes(tok)) score += 140;
    if (compactCell && compactTok && compactCell.includes(compactTok)) score += 120;
    if (normalizeSearchText(item.emergencyPhone).includes(tok)) score += 110;
    if (
      normalizeSearchText(item.parentName).includes(tok) ||
      normalizeSearchText(item.emergencyContactName).includes(tok) ||
      normalizeSearchText(item.visitorKeywords).includes(tok)
    ) {
      score += 95;
    }
  }

  return score;
}

export function filterAndRankNationalIndex(
  items: NationalInmateIndexItem[],
  options: {
    q?: string;
    category?: SearchCategory;
    custodyScope?: SearchCustodyScope;
    provinceId?: ProvinceId | '' | 'all';
    preferredProvinceId?: ProvinceId;
    limit?: number;
  } = {}
): { total: number; results: NationalInmateIndexItem[] } {
  const category = options.category || 'all';
  const custodyScope = options.custodyScope || 'ALL';
  const rawNormQuery = normalizeSearchText(options.q || '');
  const tokens = tokenizeSearchQuery(options.q || '');
  const limit = Math.max(1, Math.min(100, options.limit || 25));

  const scored: Array<{ item: NationalInmateIndexItem; score: number }> = [];

  for (const item of items) {
    if (
      options.provinceId &&
      options.provinceId !== 'all' &&
      item.provinceId !== options.provinceId
    ) {
      continue;
    }
    if (!matchesCustodyScope(item, custodyScope)) {
      continue;
    }
    const baseScore = scoreNationalIndexMatch(item, tokens, rawNormQuery, category);
    if (baseScore <= 0) continue;

    const provinceBoost =
      options.preferredProvinceId && item.provinceId === options.preferredProvinceId ? 25 : 0;
    scored.push({ item, score: baseScore + provinceBoost });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.fullName.localeCompare(b.item.fullName);
  });

  return {
    total: scored.length,
    results: scored.slice(0, limit).map((s) => s.item)
  };
}
