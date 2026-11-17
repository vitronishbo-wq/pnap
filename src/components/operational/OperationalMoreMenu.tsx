import React from 'react';
import {
  X,
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
  FolderOpen,
  ChevronRight
} from 'lucide-react';
import {
  SECONDARY_GROUP_LABELS,
  SECONDARY_OPERATIONAL_MODULES,
  type SecondaryGroupId,
  type SecondaryOperationalId
} from '../../navigation/pnapNavigation';

interface OperationalMoreMenuProps {
  onSelectModule: (id: SecondaryOperationalId) => void;
  onClose: () => void;
}

const MODULE_ICONS: Record<SecondaryOperationalId, React.ReactNode> = {
  movimentacoes: <Footprints className="w-4 h-4 text-sky-400" />,
  transferencias: <Truck className="w-4 h-4 text-amber-400" />,
  espolio: <Package className="w-4 h-4 text-slate-300" />,
  ocorrencias: <AlertTriangle className="w-4 h-4 text-orange-400" />,
  saude: <Stethoscope className="w-4 h-4 text-rose-400" />,
  reabilitacao: <GraduationCap className="w-4 h-4 text-emerald-400" />,
  controlo_penal: <Scale className="w-4 h-4 text-purple-400" />,
  disciplina: <Gavel className="w-4 h-4 text-amber-300" />,
  relatorios: <FileBarChart2 className="w-4 h-4 text-blue-300" />,
  alertas: <Bell className="w-4 h-4 text-rose-300" />,
  agenda: <Calendar className="w-4 h-4 text-teal-300" />,
  documentos: <FolderOpen className="w-4 h-4 text-indigo-300" />
};

const GROUP_ORDER: SecondaryGroupId[] = [
  'operacoes_complementares',
  'gestao_especializada',
  'informacao_acompanhamento'
];

export const OperationalMoreMenu: React.FC<OperationalMoreMenuProps> = ({
  onSelectModule,
  onClose
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0b192c] text-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-blue-900/60 overflow-hidden flex flex-col max-h-[86dvh]">
        <div className="bg-[#10233f] px-4 py-3 border-b border-blue-800/60 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white">Mais Módulos Operacionais</h2>
            <p className="text-[11px] text-slate-400">
              Continuidade da operação diária por especialidade
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="text-slate-400 hover:text-white bg-slate-800/70 p-1.5 rounded-xl cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 overflow-y-auto space-y-4">
          {GROUP_ORDER.map((groupId) => {
            const items = SECONDARY_OPERATIONAL_MODULES.filter((m) => m.group === groupId);
            return (
              <div key={groupId} className="space-y-1.5">
                <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                  {SECONDARY_GROUP_LABELS[groupId]}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((mod) => (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => onSelectModule(mod.id)}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#10233f] hover:bg-[#163055] border border-blue-900/50 text-left transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#0b192c] border border-blue-900/60 flex items-center justify-center shrink-0">
                          {MODULE_ICONS[mod.id]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{mod.label}</div>
                          <div className="text-[10px] text-slate-400 truncate">{mod.subtitle}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
