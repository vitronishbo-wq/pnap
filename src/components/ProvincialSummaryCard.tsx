import React, { useState } from 'react';
import { ProvinceId, EstablishmentProfile } from '../types/pnap';
import { PROVINCES_DATA } from '../data/mockPnapData';
import { pnapStore } from '../services/pnapStore';
import { ChevronRight, X, ArrowRight } from 'lucide-react';

interface ProvincialSummaryCardProps {
  provinceId: ProvinceId;
  onOpenEstablishmentList?: () => void;
  onSelectInmate?: (inmateId: string) => void;
  onOpenConsultar?: () => void;
}

export const ProvincialSummaryCard: React.FC<ProvincialSummaryCardProps> = ({
  provinceId,
  onOpenConsultar
}) => {
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const province = PROVINCES_DATA[provinceId] || {
    id: provinceId,
    name: provinceId.toUpperCase(),
    capital: 'Capital',
    delegadoProvincial: 'Delegado Provincial',
    contactEmergency: '+244 222 000 000'
  };

  const stats = pnapStore.getProvinceStats(provinceId);

  const establishments: EstablishmentProfile[] = pnapStore.getEstablishments(provinceId);

  return (
    <>
      {/* CARD PRINCIPAL LIMPO (Conforme o Mockup Original do PNAP) */}
      <div 
        onClick={() => setShowDetailsModal(true)}
        className="bg-[#0b192c] text-white rounded-3xl p-5 shadow-2xl border border-blue-900/40 mt-3 transition-all cursor-pointer hover:border-blue-700/60 group"
      >
        {/* Título: Nome da Província */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold tracking-tight text-white group-hover:text-blue-300 transition-colors">
            {province.name}
          </h3>
          <span className="text-[11px] text-slate-500 group-hover:text-blue-400 flex items-center gap-0.5 transition-colors">
            Ver detalhes <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Grid de 4 Métricas Limpas (Conforme Mockup: Reclusos ativos, Estabelecimentos, Ocupação, Vagas) */}
        <div className="grid grid-cols-2 gap-y-4 gap-x-6 py-2">
          {/* 1. Reclusos ativos */}
          <div>
            <div className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {stats.activeInmates.toLocaleString()}
            </div>
            <div className="w-12 h-0.5 bg-slate-700/80 my-1.5" />
            <div className="text-xs text-slate-400 font-medium">
              Reclusos ativos
            </div>
          </div>

          {/* 2. Estabelecimentos */}
          <div>
            <div className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {stats.establishmentsCount > 0 ? stats.establishmentsCount : '--'}
            </div>
            <div className="w-12 h-0.5 bg-slate-700/80 my-1.5" />
            <div className="text-xs text-slate-400 font-medium">
              Estabelecimentos
            </div>
          </div>

          {/* 3. Ocupação */}
          <div>
            <div className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-1.5">
              <span>{stats.occupancyRate}%</span>
              {stats.occupancyRate > 90 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-medium">
                  !
                </span>
              )}
            </div>
            <div className="w-12 h-0.5 bg-slate-700/80 my-1.5" />
            <div className="text-xs text-slate-400 font-medium">
              Ocupação
            </div>
          </div>

          {/* 4. Vagas */}
          <div>
            <div className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {stats.availableSpots}
            </div>
            <div className="w-12 h-0.5 bg-slate-700/80 my-1.5" />
            <div className="text-xs text-slate-400 font-medium">
              Vagas
            </div>
          </div>
        </div>
      </div>

      {/* MODAL / PAINEL "ATRÁS" (Informação Detalhada Sem Poluir a Tela Principal) */}
      {showDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0b192c] text-white w-full max-w-lg rounded-3xl border border-blue-800/60 shadow-2xl p-5 max-h-[85vh] overflow-y-auto">
            {/* Header do Detalhe */}
            <div className="flex items-center justify-between pb-3 border-b border-blue-900/60 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{province.name}</span>
                  <span className="text-xs bg-blue-900/80 text-blue-300 px-2 py-0.5 rounded-full">
                    {province.capital}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {province.delegadoProvincial} · Emergência: {province.contactEmergency}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Distribuição Processual: Preventivos vs Condenados */}
            <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/40 mb-4">
              <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                <span className="font-semibold">Distribuição Processual</span>
                <span className="text-[11px] text-slate-400">
                  Preventivos: <strong className="text-amber-300">{stats.preventiveCount}</strong> | Condenados: <strong className="text-emerald-300">{stats.convictedCount}</strong>
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                <div 
                  className="bg-amber-400 h-full"
                  style={{ width: `${(stats.preventiveCount / (stats.activeInmates || 1)) * 100}%` }}
                  title="Prisão Preventiva"
                />
                <div 
                  className="bg-emerald-500 h-full"
                  style={{ width: `${(stats.convictedCount / (stats.activeInmates || 1)) * 100}%` }}
                  title="Condenados"
                />
              </div>
            </div>

            {/* Estabelecimentos Prisionais */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Estabelecimentos da Província ({establishments.length})
                </span>
                {onOpenConsultar && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDetailsModal(false);
                      onOpenConsultar();
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    Buscar Reclusos <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {establishments.map((est) => (
                  <div
                    key={est.establishmentId}
                    className="bg-[#10233f] p-3 rounded-2xl border border-blue-900/40 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{est.name}</span>
                        <span className="text-[9px] bg-blue-950 text-blue-300 px-1.5 py-0.2 rounded border border-blue-800">
                          {est.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {est.directorName} · {est.address}
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-2">
                      <div className="text-xs font-bold text-slate-200">
                        {est.activeInmatesCount} <span className="text-slate-500 font-normal">/ {est.totalCapacity}</span>
                      </div>
                      <div className="text-[10px] text-emerald-400 font-medium">
                        {Math.round((est.activeInmatesCount / est.totalCapacity) * 100)}% ocupação
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

