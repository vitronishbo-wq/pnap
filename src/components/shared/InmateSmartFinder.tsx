import React, { useEffect, useMemo, useState } from 'react';
import type { NationalInmateIndexItem, PnapUser, ProvinceId } from '../../types/pnap';
import { NATIONAL_INMATE_INDEX, PROVINCES_DATA } from '../../data/mockPnapData';
import { pnapStore } from '../../services/pnapStore';
import { fetchNationalIndexViaApi } from '../../services/apiClient';
import {
  filterAndRankNationalIndex,
  inmateToNationalIndexItem,
  resolveIndexCustodyState,
  type SearchCategory,
  type SearchCustodyScope
} from '../../utils/inmateSearch';
import { Search, UserCheck, AlertCircle, X, MapPin, Phone, Users } from 'lucide-react';

interface InmateSmartFinderProps {
  currentUser: PnapUser;
  provinceId?: ProvinceId;
  apiActive?: boolean;
  custodyScope?: SearchCustodyScope;
  restrictToOperableJurisdiction?: boolean;
  selectedItem?: NationalInmateIndexItem | null;
  onSelect: (item: NationalInmateIndexItem) => void;
  onClear?: () => void;
  placeholder?: string;
  emptyHint?: string;
  showFilters?: boolean;
  maxResults?: number;
}

const FILTER_CHIPS: Array<{ id: SearchCategory; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'matricula', label: 'Matrícula' },
  { id: 'name', label: 'Nome' },
  { id: 'bi', label: 'BI' },
  { id: 'pavilion', label: 'Cela/Unid' },
  { id: 'parent', label: 'Parente' },
  { id: 'phone', label: 'Tel' },
  { id: 'process', label: 'Processo' },
  { id: 'visitor', label: 'Visitante' }
];

function getCustodyBadgeClass(state: string): string {
  switch (state) {
    case 'ATIVO_NA_UNIDADE':
    case 'ATIVO':
      return 'bg-emerald-950 text-emerald-300 border-emerald-700';
    case 'LIBERTADO':
      return 'bg-blue-950 text-blue-300 border-blue-700';
    case 'EVADIDO':
      return 'bg-rose-950 text-rose-300 border-rose-700';
    case 'FALECIDO':
      return 'bg-slate-900 text-slate-300 border-slate-700';
    case 'EM_TRANSITO_TRANSFERENCIA':
      return 'bg-purple-950 text-purple-300 border-purple-700';
    default:
      return 'bg-amber-950 text-amber-300 border-amber-700';
  }
}

export const InmateSmartFinder: React.FC<InmateSmartFinderProps> = ({
  currentUser,
  provinceId,
  apiActive = false,
  custodyScope = 'ALL',
  restrictToOperableJurisdiction = false,
  selectedItem = null,
  onSelect,
  onClear,
  placeholder = 'Procurar por matrícula, nome, BI, parente, tel, cela, processo ou visitante...',
  emptyHint = 'Nenhum recluso encontrado para este critério.',
  showFilters = true,
  maxResults = 12
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [storeTick, setStoreTick] = useState(0);
  const [apiResults, setApiResults] = useState<NationalInmateIndexItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    return pnapStore.subscribe(() => setStoreTick((t) => t + 1));
  }, []);

  useEffect(() => {
    if (!apiActive) {
      setApiResults(null);
      setApiError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setApiError(null);
      fetchNationalIndexViaApi({
        q: query,
        category,
        custodyScope,
        limit: Math.max(maxResults, 25)
      })
        .then((res) => {
          if (!cancelled) {
            setApiResults(res.results);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setApiError(
              err instanceof Error ? err.message : 'Falha na pesquisa ao servidor nacional.'
            );
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apiActive, query, category, custodyScope, maxResults]);

  const localResults = useMemo(() => {
    const mergedById = new Map<string, NationalInmateIndexItem>();

    NATIONAL_INMATE_INDEX.forEach((item) => {
      mergedById.set(item.inmateId, item);
    });

    pnapStore.getInmates().forEach((inm) => {
      const estList = pnapStore.getEstablishments(inm.provinceId);
      const estName =
        estList.find((e) => e.establishmentId === inm.establishmentId)?.name ||
        inm.establishmentId;
      const provName = PROVINCES_DATA[inm.provinceId]?.name || inm.provinceId;
      mergedById.set(inm.inmateId, inmateToNationalIndexItem(inm, estName, provName));
    });

    let candidates = Array.from(mergedById.values());
    if (restrictToOperableJurisdiction) {
      candidates = candidates.filter((item) =>
        pnapStore.canOperateProvince(currentUser, item.provinceId)
      );
    }

    return filterAndRankNationalIndex(candidates, {
      q: query,
      category,
      custodyScope,
      preferredProvinceId: provinceId,
      limit: maxResults
    }).results;
  }, [
    storeTick,
    query,
    category,
    custodyScope,
    provinceId,
    maxResults,
    restrictToOperableJurisdiction,
    currentUser
  ]);

  const visibleResults = useMemo(() => {
    const base = apiActive && apiResults !== null ? apiResults : localResults;
    const scoped = restrictToOperableJurisdiction
      ? base.filter((item) => pnapStore.canOperateProvince(currentUser, item.provinceId))
      : base;
    return scoped.slice(0, maxResults);
  }, [apiActive, apiResults, localResults, restrictToOperableJurisdiction, currentUser, maxResults]);

  if (selectedItem) {
    const custodyState = resolveIndexCustodyState(selectedItem);
    return (
      <div className="bg-[#0b192c] border border-blue-600/70 rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {selectedItem.photoUrl ? (
            <img
              src={selectedItem.photoUrl}
              alt={selectedItem.fullName}
              className="w-10 h-10 rounded-lg object-cover border border-blue-500/60 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-blue-950 border border-blue-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4 text-blue-300" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <strong className="text-white text-xs sm:text-sm truncate">
                {selectedItem.fullName}
              </strong>
              <span className="text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded">
                {selectedItem.matricula}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getCustodyBadgeClass(
                  custodyState
                )}`}
              >
                {custodyState}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              {selectedItem.establishmentName} · {selectedItem.provinceName} · Cela{' '}
              {selectedItem.cellCode || 'N/D'}
              {selectedItem.biNumber ? ` · BI ${selectedItem.biNumber}` : ''}
            </div>
          </div>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            <span>Trocar</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 text-blue-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Pesquisar Ficha Única"
          className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl pl-9 pr-14 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-400"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-white cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {showFilters && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setCategory(chip.id)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                category === chip.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#0b192c] text-slate-400 hover:text-white border border-blue-900/50'
              }`}
            >
              {chip.label}
            </button>
          ))}
          {searching && (
            <span className="text-[10px] text-blue-300 ml-auto whitespace-nowrap">
              A consultar...
            </span>
          )}
        </div>
      )}

      {apiError && (
        <div className="text-[11px] text-amber-300 bg-amber-950/60 border border-amber-700/50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{apiError} (a usar índice em cache local)</span>
        </div>
      )}

      {visibleResults.length === 0 ? (
        <div className="p-3 text-center text-slate-400 bg-[#0b192c] rounded-xl border border-blue-900/40 text-[11px]">
          {emptyHint}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
          {visibleResults.map((item) => {
            const custodyState = resolveIndexCustodyState(item);
            return (
              <button
                key={item.inmateId}
                type="button"
                onClick={() => onSelect(item)}
                className="w-full text-left bg-[#0b192c] hover:bg-[#132847] border border-blue-900/60 hover:border-blue-500/70 p-2.5 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={item.fullName}
                      className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-white text-xs truncate">{item.fullName}</span>
                      {item.alias && (
                        <span className="text-[10px] text-amber-300 truncate">
                          &quot;{item.alias}&quot;
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">
                      {item.matricula}
                      {item.biNumber ? ` · BI ${item.biNumber}` : ''}
                      {item.processNumber ? ` · Proc. ${item.processNumber}` : ''}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-2 truncate mt-0.5">
                      <span className="flex items-center gap-0.5 truncate">
                        <MapPin className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                        {item.provinceName} · {item.cellCode || item.establishmentName}
                      </span>
                      {item.parentName && (
                        <span className="hidden sm:flex items-center gap-0.5 truncate">
                          <Users className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                          {item.parentName}
                        </span>
                      )}
                      {item.emergencyPhone && (
                        <span className="hidden md:flex items-center gap-0.5 truncate">
                          <Phone className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                          {item.emergencyPhone}
                        </span>
                      )}
                    </div>
                    {item.visitorKeywords && (
                      <div className="text-[10px] text-emerald-300/80 truncate">
                        Visitantes: {item.visitorKeywords}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getCustodyBadgeClass(
                      custodyState
                    )}`}
                  >
                    {custodyState}
                  </span>
                  <span className="text-[9px] text-amber-300 font-semibold">
                    {item.legalStatus}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
