import React from 'react';
import {
  Map,
  UserPlus,
  ArrowRightLeft,
  Users,
  Search,
  Footprints,
  Truck,
  Package,
  AlertTriangle,
  Stethoscope,
  GraduationCap,
  Scale,
  Gavel,
  FileBarChart2,
  Bell,
  Calendar,
  FolderOpen
} from 'lucide-react';
import {
  PRIMARY_OPERATIONAL_MODULES,
  SECONDARY_GROUP_LABELS,
  SECONDARY_OPERATIONAL_MODULES,
  type OperationalViewId,
  type PrimaryOperationalId,
  type SecondaryGroupId,
  type SecondaryOperationalId
} from '../../navigation/pnapNavigation';

interface DesktopSidebarProps {
  activeView: OperationalViewId;
  onSelectHome: () => void;
  onSelectPrimary: (id: PrimaryOperationalId) => void;
  onSelectSecondary: (id: SecondaryOperationalId) => void;
}

const PRIMARY_ICONS: Record<PrimaryOperationalId, React.ReactNode> = {
  entrada_saida: <UserPlus className="w-4 h-4 shrink-0" />,
  transicao: <ArrowRightLeft className="w-4 h-4 shrink-0" />,
  visitas: <Users className="w-4 h-4 shrink-0" />,
  consulta: <Search className="w-4 h-4 shrink-0" />
};

const SECONDARY_ICONS: Record<SecondaryOperationalId, React.ReactNode> = {
  movimentacoes: <Footprints className="w-4 h-4 shrink-0" />,
  transferencias: <Truck className="w-4 h-4 shrink-0" />,
  espolio: <Package className="w-4 h-4 shrink-0" />,
  ocorrencias: <AlertTriangle className="w-4 h-4 shrink-0" />,
  saude: <Stethoscope className="w-4 h-4 shrink-0" />,
  reabilitacao: <GraduationCap className="w-4 h-4 shrink-0" />,
  controlo_penal: <Scale className="w-4 h-4 shrink-0" />,
  disciplina: <Gavel className="w-4 h-4 shrink-0" />,
  relatorios: <FileBarChart2 className="w-4 h-4 shrink-0" />,
  alertas: <Bell className="w-4 h-4 shrink-0" />,
  agenda: <Calendar className="w-4 h-4 shrink-0" />,
  documentos: <FolderOpen className="w-4 h-4 shrink-0" />
};

const GROUP_ORDER: SecondaryGroupId[] = [
  'operacoes_complementares',
  'gestao_especializada',
  'informacao_acompanhamento'
];

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeView,
  onSelectHome,
  onSelectPrimary,
  onSelectSecondary
}) => {
  return (
    <aside
      aria-label="Sidebar operacional"
      className="hidden lg:flex flex-col w-64 xl:w-72 shrink-0 bg-[#081220] border border-blue-950/70 rounded-2xl overflow-hidden"
    >
      <div className="px-3 py-2.5 border-b border-blue-950/80 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
          Área 01 · Operacional
        </span>
        <span className="text-[10px] text-slate-500 font-mono">RDPA 2024</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Início / Mapa */}
        <div>
          <button
            type="button"
            onClick={onSelectHome}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeView === 'home'
                ? 'bg-blue-600/20 text-blue-200 border border-blue-500/40'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border border-transparent'
            }`}
          >
            <Map className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Mapa Operacional</span>
          </button>
        </div>

        {/* 4 Operações Principais */}
        <div>
          <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Operações Principais
          </div>
          <div className="space-y-1">
            {PRIMARY_OPERATIONAL_MODULES.map((mod) => {
              const isActive = activeView === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onSelectPrimary(mod.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  {PRIMARY_ICONS[mod.id]}
                  <span className="truncate">{mod.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Módulos Complementares & Especializados (Menu Mais) */}
        {GROUP_ORDER.map((groupId) => {
          const items = SECONDARY_OPERATIONAL_MODULES.filter((m) => m.group === groupId);
          return (
            <div key={groupId}>
              <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {SECONDARY_GROUP_LABELS[groupId]}
              </div>
              <div className="space-y-0.5">
                {items.map((mod) => {
                  const isActive = activeView === mod.id;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => onSelectSecondary(mod.id)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-600/25 text-blue-200 border border-blue-500/40 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {SECONDARY_ICONS[mod.id]}
                        <span className="truncate">{mod.label}</span>
                      </span>
                      {mod.status === 'PREPARATION' && (
                        <span className="text-[9px] text-slate-500 font-medium shrink-0">
                          Prep.
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
