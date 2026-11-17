import React from 'react';
import type { ProvinceId } from '../../types/pnap';
import { pnapStore } from '../../services/pnapStore';
import { AngolaMap } from '../AngolaMap';
import { ProvincialSummaryCard } from '../ProvincialSummaryCard';
import type { PrimaryOperationalId } from '../../navigation/pnapNavigation';
import { UserPlus, ArrowRightLeft, Users, Search } from 'lucide-react';

interface OperationalHomeProps {
  selectedProvinceId: ProvinceId;
  onSelectProvince: (provinceId: ProvinceId) => void;
  userRole: string;
  userAssignedProvince: string;
  onSelectPrimary: (id: PrimaryOperationalId) => void;
}

export const OperationalHome: React.FC<OperationalHomeProps> = ({
  selectedProvinceId,
  onSelectProvince,
  userRole,
  userAssignedProvince,
  onSelectPrimary
}) => {
  const stats = pnapStore.getProvinceStats(selectedProvinceId);

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col lg:grid lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-2.5 lg:gap-4 overflow-hidden">
      {/* Centro: Mapa RDPA 2024 */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <AngolaMap
          selectedProvinceId={selectedProvinceId}
          onSelectProvince={onSelectProvince}
          userRole={userRole}
          userAssignedProvince={userAssignedProvince}
        />

        {/* Faixa resumida compacta apenas no Mobile para manter ecrã único sem scroll */}
        <div className="lg:hidden mt-1.5 shrink-0 grid grid-cols-4 gap-1.5 bg-[#0b192c] border border-blue-900/50 rounded-xl px-2.5 py-1.5 text-center">
          <div>
            <div className="text-xs font-extrabold text-white leading-tight">
              {stats.activeInmates.toLocaleString()}
            </div>
            <div className="text-[9px] text-slate-400">Reclusos</div>
          </div>
          <div>
            <div className="text-xs font-extrabold text-white leading-tight">
              {stats.establishmentsCount}
            </div>
            <div className="text-[9px] text-slate-400">Unidades</div>
          </div>
          <div>
            <div
              className={`text-xs font-extrabold leading-tight ${
                stats.occupancyRate > 90 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {stats.occupancyRate}%
            </div>
            <div className="text-[9px] text-slate-400">Ocupação</div>
          </div>
          <div>
            <div className="text-xs font-extrabold text-blue-300 leading-tight">
              {stats.availableSpots}
            </div>
            <div className="text-[9px] text-slate-400">Vagas</div>
          </div>
        </div>
      </div>

      {/* Coluna Direita Desktop: Resumo Provincial + Atalhos das 4 Operações */}
      <div className="hidden lg:flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5">
        <div className="-mt-3">
          <ProvincialSummaryCard
            provinceId={selectedProvinceId}
            onOpenConsultar={() => onSelectPrimary('consulta')}
          />
        </div>

        <div className="bg-[#0b192c] border border-blue-900/40 rounded-2xl p-3.5 space-y-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Operações Diárias Prioritárias
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectPrimary('entrada_saida')}
              className="p-2.5 rounded-xl bg-[#10233f] hover:bg-[#163055] border border-blue-900/60 text-left transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-blue-400 mb-1.5" />
              <div className="text-xs font-bold text-white">Entrada-Saída</div>
              <div className="text-[10px] text-slate-400">Internamento e soltura</div>
            </button>

            <button
              type="button"
              onClick={() => onSelectPrimary('transicao')}
              className="p-2.5 rounded-xl bg-[#10233f] hover:bg-[#163055] border border-blue-900/60 text-left transition-all cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4 text-purple-400 mb-1.5" />
              <div className="text-xs font-bold text-white">Transição Penal</div>
              <div className="text-[10px] text-slate-400">Detido ➔ Condenado</div>
            </button>

            <button
              type="button"
              onClick={() => onSelectPrimary('visitas')}
              className="p-2.5 rounded-xl bg-[#10233f] hover:bg-[#163055] border border-blue-900/60 text-left transition-all cursor-pointer"
            >
              <Users className="w-4 h-4 text-emerald-400 mb-1.5" />
              <div className="text-xs font-bold text-white">Visitas</div>
              <div className="text-[10px] text-slate-400">Visitantes e portaria</div>
            </button>

            <button
              type="button"
              onClick={() => onSelectPrimary('consulta')}
              className="p-2.5 rounded-xl bg-[#10233f] hover:bg-[#163055] border border-blue-900/60 text-left transition-all cursor-pointer"
            >
              <Search className="w-4 h-4 text-sky-400 mb-1.5" />
              <div className="text-xs font-bold text-white">Consulta</div>
              <div className="text-[10px] text-slate-400">FUR e localização</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
