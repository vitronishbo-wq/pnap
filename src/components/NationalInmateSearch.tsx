import React, { useState, useMemo, useEffect } from 'react';
import { NationalInmateIndexItem, UserRole } from '../types/pnap';
import { NATIONAL_INMATE_INDEX } from '../data/mockPnapData';
import { fetchNationalIndexViaApi } from '../services/apiClient';
import {
  Search,
  MapPin,
  Shield,
  User,
  Phone,
  Home,
  AlertCircle,
  FileText,
  Lock,
  CheckCircle,
  Filter,
  Send
} from 'lucide-react';

interface NationalInmateSearchProps {
  currentUserRole: UserRole;
  currentUserProvince: string;
  apiActive?: boolean;
  onOpenInmateDossier: (inmateId: string) => void;
  onRequestTransfer: (inmate: NationalInmateIndexItem) => void;
  onClose?: () => void;
}

export const NationalInmateSearch: React.FC<NationalInmateSearchProps> = ({
  currentUserRole,
  currentUserProvince,
  apiActive = false,
  onOpenInmateDossier,
  onRequestTransfer,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<'all' | 'name' | 'matricula' | 'bi' | 'parent' | 'phone' | 'neighborhood' | 'province' | 'crime' | 'pavilion'>('all');
  const [liveResults, setLiveResults] = useState<NationalInmateIndexItem[] | null>(null);

  useEffect(() => {
    if (!apiActive) {
      setLiveResults(null);
      return;
    }
    let mounted = true;
    const timer = setTimeout(() => {
      fetchNationalIndexViaApi(searchTerm, selectedFilterCategory)
        .then((res) => {
          if (mounted) setLiveResults(res.results);
        })
        .catch(() => {});
    }, 200);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [apiActive, searchTerm, selectedFilterCategory]);

  // Motor de busca federado multi-critério sobre o nationalInmateIndex
  const filteredInmates = useMemo(() => {
    if (liveResults !== null) return liveResults;
    if (!searchTerm.trim()) return NATIONAL_INMATE_INDEX;

    const term = searchTerm.toLowerCase().trim();

    return NATIONAL_INMATE_INDEX.filter((inmate) => {
      const matchName = inmate.fullName.toLowerCase().includes(term) || (inmate.alias && inmate.alias.toLowerCase().includes(term));
      const matchMatricula = inmate.matricula.toLowerCase().includes(term);
      const matchBi = inmate.biNumber.toLowerCase().includes(term);
      const matchParent = inmate.parentName.toLowerCase().includes(term) || inmate.emergencyContactName.toLowerCase().includes(term);
      const matchPhone = inmate.emergencyPhone.toLowerCase().includes(term);
      const matchNeighborhood = inmate.neighborhood.toLowerCase().includes(term);
      const matchProvince = inmate.provinceName.toLowerCase().includes(term) || inmate.provinceId.toLowerCase().includes(term);
      const matchCrime = inmate.crimeCategory.toLowerCase().includes(term) || inmate.penalCodeArticle.toLowerCase().includes(term);
      const matchPavilion = inmate.pavilionName.toLowerCase().includes(term) || inmate.cellCode.toLowerCase().includes(term);

      if (selectedFilterCategory === 'name') return matchName;
      if (selectedFilterCategory === 'matricula') return matchMatricula;
      if (selectedFilterCategory === 'bi') return matchBi;
      if (selectedFilterCategory === 'parent') return matchParent;
      if (selectedFilterCategory === 'phone') return matchPhone;
      if (selectedFilterCategory === 'neighborhood') return matchNeighborhood;
      if (selectedFilterCategory === 'province') return matchProvince;
      if (selectedFilterCategory === 'crime') return matchCrime;
      if (selectedFilterCategory === 'pavilion') return matchPavilion;

      // 'all' busca em qualquer um dos campos
      return (
        matchName ||
        matchMatricula ||
        matchBi ||
        matchParent ||
        matchPhone ||
        matchNeighborhood ||
        matchProvince ||
        matchCrime ||
        matchPavilion
      );
    });
  }, [liveResults, searchTerm, selectedFilterCategory]);

  // Checar se o utilizador tem jurisdição direta ou é consulta transversal
  const isDirectJurisdiction = (inmate: NationalInmateIndexItem) => {
    if (currentUserRole === 'CENTRAL_ADMIN') return true;
    if (currentUserRole === 'AUDITOR_INSPECTOR' && currentUserProvince === 'all') return true;
    return inmate.provinceId === currentUserProvince;
  };

  return (
    <div className="bg-[#0b192c] text-white rounded-3xl p-4 md:p-6 shadow-2xl border border-blue-900/50 max-w-4xl mx-auto w-full">
      {/* Cabeçalho de Consulta Nacional */}
      <div className="flex items-center justify-between pb-4 border-b border-blue-900/60 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-2 rounded-xl">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-white">
                Índice Nacional de Reclusos (PNAP)
              </h2>
              <p className="text-xs text-slate-400">
                Consulta transversal federada · 21 Províncias (RDPA 2024)
              </p>
            </div>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700"
          >
            Fechar
          </button>
        )}
      </div>

      {/* Informativo de Jurisdição Ativa */}
      <div className="mb-4 bg-blue-950/60 border border-blue-800/60 p-3 rounded-2xl flex items-start gap-2.5 text-xs">
        <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-slate-300">
          <strong className="text-white">Perfil Ativo: </strong>
          {currentUserRole === 'CENTRAL_ADMIN' ? (
            <span className="text-emerald-400 font-semibold">Administração Geral (Acesso Completo Nacional)</span>
          ) : (
            <span>
              Comando Provincial de <strong className="text-blue-300 capitalize">{currentUserProvince}</strong>. Pode pesquisar reclusos em qualquer província (como Huambo ou Benguela) por Nome, Matrícula, ID, Parente, Telefone, Bairro, Crime ou Pavilhão.
            </span>
          )}
        </div>
      </div>

      {/* Caixa de Pesquisa Principal */}
      <div className="relative mb-3">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-blue-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar por Nome, Matrícula (ex: HB-2024-0312), ID, Parente, Telefone, Bairro, Província, Crime..."
          className="w-full bg-[#10233f] border border-blue-800/60 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-white"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Filtros Rápidos por Critério */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 text-xs scrollbar-none mb-4">
        <span className="text-slate-400 flex items-center gap-1 pr-1 font-medium">
          <Filter className="w-3 h-3 text-blue-400" /> Filtro:
        </span>
        {[
          { id: 'all', label: 'Tudo' },
          { id: 'name', label: 'Nome' },
          { id: 'matricula', label: 'Matrícula' },
          { id: 'bi', label: 'ID / BI' },
          { id: 'parent', label: 'Parente' },
          { id: 'phone', label: 'Telefone' },
          { id: 'neighborhood', label: 'Bairro' },
          { id: 'province', label: 'Província' },
          { id: 'crime', label: 'Crime' },
          { id: 'pavilion', label: 'Pavilhão' }
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedFilterCategory(item.id as any)}
            className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all font-medium ${
              selectedFilterCategory === item.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-[#132847] text-slate-300 hover:bg-[#1a355d] border border-blue-900/50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Resultados da Busca */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>{filteredInmates.length} recluso(s) localizado(s) no índice nacional</span>
          {searchTerm && (
            <span className="text-blue-400">Termo ativo: &quot;{searchTerm}&quot;</span>
          )}
        </div>

        {filteredInmates.length === 0 ? (
          <div className="text-center py-10 bg-[#10233f] rounded-2xl border border-blue-900/40 p-6">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white">Nenhum registo encontrado</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Verifique a grafia do nome, número de matrícula ou tente filtrar apenas pelo bairro ou província.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredInmates.map((inmate) => {
              const hasDirectAccess = isDirectJurisdiction(inmate);

              return (
                <div
                  key={inmate.inmateId}
                  className={`bg-[#10233f] p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    hasDirectAccess
                      ? 'border-blue-800/60 hover:border-blue-500'
                      : 'border-purple-900/60 hover:border-purple-500/80 bg-gradient-to-br from-[#10233f] to-[#151528]'
                  }`}
                >
                  {/* Topo do Card */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={inmate.photoUrl}
                          alt={inmate.fullName}
                          className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">
                            {inmate.fullName}
                          </h3>
                          {inmate.alias && (
                            <span className="text-[11px] text-amber-400 font-medium">
                              Alcunha: &quot;{inmate.alias}&quot;
                            </span>
                          )}
                          <div className="text-[11px] text-slate-400 font-mono">
                            {inmate.matricula} · BI: {inmate.biNumber}
                          </div>
                        </div>
                      </div>

                      {/* Badge de Jurisdição */}
                      <div>
                        {hasDirectAccess ? (
                          <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-400" />
                            {inmate.provinceName}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                            <Lock className="w-3 h-3 text-purple-400" />
                            {inmate.provinceName} (Externa)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dados de Localização e Identificação Cruzada */}
                    <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40 text-xs space-y-1 my-2">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">
                          <strong className="text-white">{inmate.establishmentName}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                        <span className="text-slate-200">{inmate.pavilionName}</span> ·{' '}
                        <span className="text-emerald-400 font-semibold">{inmate.cellCode}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                        <Home className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Bairro: {inmate.neighborhood}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>Parente: <strong className="text-slate-300">{inmate.parentName}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>Contacto: {inmate.emergencyPhone}</span>
                      </div>
                    </div>

                    {/* Crime e Status */}
                    <div className="text-[11px] text-slate-300 mb-2">
                      <div className="text-slate-400">Tipologia de Crime:</div>
                      <div className="font-medium text-amber-300 line-clamp-1">
                        {inmate.crimeCategory} ({inmate.penalCodeArticle})
                      </div>
                    </div>
                  </div>

                  {/* Ações e Regra de Isolamento */}
                  <div className="pt-2 border-t border-blue-900/50 mt-1">
                    {hasDirectAccess ? (
                      <button
                        type="button"
                        onClick={() => onOpenInmateDossier(inmate.inmateId)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Abrir Dossier Completo
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-purple-300/80 flex items-center gap-1 bg-purple-950/40 p-1.5 rounded-lg border border-purple-800/30">
                          <Lock className="w-3 h-3 text-purple-400 shrink-0" />
                          <span>Dossier clínico/disciplinar restrito à Comarca do {inmate.provinceName}.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRequestTransfer(inmate)}
                          className="w-full bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Solicitar Guia de Transferência
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
