import React from 'react';
import { UserPlus, ArrowRightLeft, Users, Search, Plus } from 'lucide-react';
import type { PrimaryOperationalId } from '../../navigation/pnapNavigation';

interface MobileBottomBarProps {
  activePrimary: PrimaryOperationalId | 'mais' | null;
  onSelectPrimary: (id: PrimaryOperationalId) => void;
  onOpenMais: () => void;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  activePrimary,
  onSelectPrimary,
  onOpenMais
}) => {
  return (
    <nav
      aria-label="Navegação operacional mobile"
      className="lg:hidden shrink-0 bg-[#0b192c] rounded-2xl border border-blue-900/60 p-1.5 shadow-2xl flex items-center justify-around z-30"
    >
      <button
        type="button"
        onClick={() => onSelectPrimary('entrada_saida')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer ${
          activePrimary === 'entrada_saida'
            ? 'text-blue-400 scale-105'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <UserPlus className="w-4 h-4 md:w-5 md:h-5" />
        <span className="text-[9px] md:text-[10px] font-medium leading-none">Entrada-Saída</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectPrimary('transicao')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer ${
          activePrimary === 'transicao'
            ? 'text-purple-400 scale-105'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <ArrowRightLeft className="w-4 h-4 md:w-5 md:h-5" />
        <span className="text-[9px] md:text-[10px] font-medium leading-none">Transição</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectPrimary('visitas')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer ${
          activePrimary === 'visitas'
            ? 'text-emerald-400 scale-105'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Users className="w-4 h-4 md:w-5 md:h-5" />
        <span className="text-[9px] md:text-[10px] font-medium leading-none">Visitas</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectPrimary('consulta')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer ${
          activePrimary === 'consulta'
            ? 'text-blue-400 scale-105'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Search className="w-4 h-4 md:w-5 md:h-5" />
        <span className="text-[9px] md:text-[10px] font-medium leading-none">Consulta</span>
      </button>

      <button
        type="button"
        onClick={onOpenMais}
        className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group py-0.5"
      >
        <div
          className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shadow transition-all ${
            activePrimary === 'mais'
              ? 'bg-blue-500 text-white scale-105'
              : 'bg-blue-600 hover:bg-blue-500 text-white group-hover:scale-105'
          }`}
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </div>
        <span className="text-[9px] md:text-[10px] text-slate-400 group-hover:text-white font-medium leading-none">
          Mais
        </span>
      </button>
    </nav>
  );
};
