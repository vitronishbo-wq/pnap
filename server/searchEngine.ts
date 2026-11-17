import type { Firestore } from 'firebase-admin/firestore';
import type {
  Inmate,
  NationalInmateIndexItem,
  ProvinceId
} from '../src/types/pnap';
import {
  buildIndexSearchText,
  filterAndRankNationalIndex,
  inmateToNationalIndexItem,
  type SearchCategory,
  type SearchCustodyScope
} from '../src/utils/inmateSearch';

export { type SearchCategory, type SearchCustodyScope };

/**
 * Gera um item de Índice Nacional enriquecido com:
 * - processNumber (n.º processo base)
 * - visitorKeywords (contactos de emergência + visitantes autorizados/registados na FUR)
 * - searchText (texto normalizado NFD para pesquisa multi-token sem acentos/pontuação)
 */
export function buildNationalIndexItemWithSearch(
  inmate: Inmate,
  estName: string,
  cellCode: string,
  nowIso: string
): NationalInmateIndexItem {
  const base = inmateToNationalIndexItem(inmate, estName);
  const resolvedCellCode = cellCode || inmate.cellId || base.cellCode;
  const item: NationalInmateIndexItem = {
    ...base,
    cellCode: resolvedCellCode,
    lastUpdated: nowIso || base.lastUpdated
  };
  item.searchText = buildIndexSearchText(item);
  return item;
}

export async function searchNationalIndexInFirestore(
  db: Firestore,
  options: {
    q?: string;
    category?: SearchCategory;
    custodyScope?: SearchCustodyScope;
    provinceId?: ProvinceId | '' | 'all';
    preferredProvinceId?: ProvinceId;
    limit?: number;
  } = {}
): Promise<{
  items: NationalInmateIndexItem[];
  total: number;
  results: NationalInmateIndexItem[];
}> {
  const collectionRef = db.collection('pnap_national_inmate_index');
  const snap =
    options.provinceId && options.provinceId !== 'all'
      ? await collectionRef.where('provinceId', '==', options.provinceId).get()
      : await collectionRef.get();

  const allItems = snap.docs.map((doc) => doc.data() as NationalInmateIndexItem);
  const ranked = filterAndRankNationalIndex(allItems, options);

  return {
    items: allItems,
    total: ranked.total,
    results: ranked.results
  };
}
