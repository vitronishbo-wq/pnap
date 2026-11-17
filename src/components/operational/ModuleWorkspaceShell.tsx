import React from 'react';
import {
  ArrowLeft,
  Clock,
  Search,
  Truck,
  Lock,
  CheckCircle2,
  Layers
} from 'lucide-react';
import type { PnapUser } from '../../types/pnap';
import {
  SECONDARY_GROUP_LABELS,
  SECONDARY_OPERATIONAL_MODULES,
  type SecondaryOperationalId
} from '../../navigation/pnapNavigation';

interface ModuleWorkspaceShellProps {
  moduleId: SecondaryOperationalId;
  currentUser: PnapUser;
  onBackHome: () => void;
  onOpenConsultar: () => void;
  onOpenTransferFlow: () => void;
}

export const ModuleWorkspaceShell: React.FC<ModuleWorkspaceShellProps> = ({
  moduleId,
  currentUser,
  onBackHome,
  onOpenConsultar,
  onOpenTransferFlow
}) => {
  const meta = SECONDARY_OPERATIONAL_MODULES.find((m) => m.id === moduleId);
  if (!meta) return null;

  const isHealthBlocked =
    meta.id === 'saude' && currentUser.assignments.role !== 'HEALTH_SPECIALIST';

  return (
    <div className="flex-1 min-h-0 bg-[#0b192c] border border-blue-900/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between overflow-y-auto">
      <div className="space-y-4">
        {/* Topo do Módulo */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-blue-900/60">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-300">
              {SECONDARY_GROUP_LABELS[meta.group]}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">{meta.label}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{meta.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onBackHome}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Mapa</span>
          </button>
        </div>

        {/* Identificação de Estado do Esqueleto */}
        {meta.status === 'PREPARATION' ? (
          <div className="bg-[#10233f] border border-amber-500/35 rounded-xl p-3.5 flex items-start gap-3">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-bold text-amber-300">Módulo em preparação</div>
              <p className="text-slate-300 leading-relaxed">
                O espaço estrutural e a navegação de <strong>{meta.label}</strong> estão definidos
                no esqueleto oficial do PNAP. Os ecrãs e fluxos dedicados serão construídos nas
                fases seguintes, sem simulação de operações.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-[#10233f] border border-blue-700/40 rounded-xl p-3.5 flex items-start gap-3">
            <Layers className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-bold text-blue-200">
                Espaço estrutural do módulo · Ligado à arquitetura atual
              </div>
              <p className="text-slate-300 leading-relaxed">
                {meta.id === 'transferencias'
                  ? 'Este módulo autonomiza o despacho de origem, trânsito e receção no destino.'
                  : 'As operações atuais deste domínio operam através da Ficha Única do Recluso (FUR). O ecrã autónomo de fila operacional será expandido na Fase 4.'}
              </p>
            </div>
          </div>
        )}

        {/* Proteção Clínica em Saúde */}
        {isHealthBlocked && (
          <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-3.5 flex items-start gap-3">
            <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-bold text-rose-200">Sigilo Clínico Ativo</div>
              <p className="text-rose-200/80">
                O perfil atual (<strong>{currentUser.assignments.role}</strong>) não tem acesso ao
                prontuário clínico. Apenas <strong>HEALTH_SPECIALIST</strong> da unidade acede a
                registos médicos; outros perfis visualizam apenas alertas operacionais não-clínicos.
              </p>
            </div>
          </div>
        )}

        {/* Responsabilidades Previstas do Módulo */}
        <div className="bg-[#081220] border border-blue-950/80 rounded-xl p-3.5 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Responsabilidades no PNAP
          </div>
          <ul className="space-y-1.5">
            {meta.responsibilities.map((item) => (
              <li key={item} className="text-xs text-slate-300 flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Ações Contextuais Preservadas */}
      <div className="pt-4 mt-4 border-t border-blue-900/50 flex flex-wrap items-center justify-end gap-2">
        {meta.id === 'transferencias' && (
          <button
            type="button"
            onClick={onOpenTransferFlow}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Abrir Receção / Despacho de Transferências</span>
          </button>
        )}

        {meta.status === 'INTEGRATED_FUR' && (
          <button
            type="button"
            onClick={onOpenConsultar}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Selecionar Recluso via Consulta (FUR)</span>
          </button>
        )}
      </div>
    </div>
  );
};
