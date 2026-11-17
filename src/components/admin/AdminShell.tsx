import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  FileCheck2,
  BookOpen,
  FileSearch,
  KeyRound,
  Plug,
  Settings,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import type { PnapUser, ProvinceId } from '../../types/pnap';
import {
  ADMIN_GROUP_LABELS,
  ADMIN_SECTIONS,
  canAccessAdminSection,
  type AdminSectionId
} from '../../navigation/pnapNavigation';
import type { AdminOverviewResponse } from '../../services/apiClient';
import type { VerifiedAdminSession } from './AdminAuthGateModal';
import { AdminSectionView } from './AdminSectionView';

interface AdminShellProps {
  currentUser: PnapUser;
  selectedProvinceId: ProvinceId;
  activeSection: AdminSectionId;
  apiActive: boolean;
  verifiedSession: VerifiedAdminSession;
  overview: AdminOverviewResponse | null;
  overviewLoading: boolean;
  overviewError: string | null;
  onRefreshOverview: () => void;
  onSelectSection: (id: AdminSectionId) => void;
  onSelectProvince: (provinceId: ProvinceId) => void;
  onOpenProvisionamento: () => void;
  onExitAdmin: () => void;
}

const SECTION_ICONS: Record<AdminSectionId, React.ReactNode> = {
  visao_nacional: <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />,
  estrutura_prisional: <Building2 className="w-3.5 h-3.5 shrink-0" />,
  utilizadores: <Users className="w-3.5 h-3.5 shrink-0" />,
  funcoes_permissoes: <ShieldCheck className="w-3.5 h-3.5 shrink-0" />,
  homologacoes: <FileCheck2 className="w-3.5 h-3.5 shrink-0" />,
  catalogos_institucionais: <BookOpen className="w-3.5 h-3.5 shrink-0" />,
  auditoria_historico: <FileSearch className="w-3.5 h-3.5 shrink-0" />,
  seguranca_sessoes: <KeyRound className="w-3.5 h-3.5 shrink-0" />,
  integracoes: <Plug className="w-3.5 h-3.5 shrink-0" />,
  sistema_manutencao: <Settings className="w-3.5 h-3.5 shrink-0" />
};

export const AdminShell: React.FC<AdminShellProps> = ({
  currentUser,
  selectedProvinceId,
  activeSection,
  apiActive,
  verifiedSession,
  overview,
  overviewLoading,
  overviewError,
  onRefreshOverview,
  onSelectSection,
  onSelectProvince,
  onOpenProvisionamento,
  onExitAdmin
}) => {
  const visibleSections = ADMIN_SECTIONS.filter((sec) =>
    canAccessAdminSection(currentUser.assignments.role, sec)
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 overflow-hidden">
      {/* Sidebar Administrativa Estilo VS Code (Desktop) */}
      <aside
        aria-label="Navegação administrativa"
        className="hidden lg:flex flex-col w-64 xl:w-72 shrink-0 bg-[#081220] border border-amber-500/25 rounded-2xl overflow-hidden"
      >
        <div className="px-3.5 py-3 border-b border-amber-500/20 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black tracking-tight text-white">
              PNAP | Administração
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Nacional
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate font-mono">
            {verifiedSession.email}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          <div className="px-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {ADMIN_GROUP_LABELS.navegacao}
            </span>
            <button
              type="button"
              onClick={onRefreshOverview}
              disabled={overviewLoading}
              title="Atualizar dados reais"
              className="text-slate-400 hover:text-amber-300 cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${overviewLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-0.5">
            {visibleSections.map((sec) => {
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => onSelectSection(sec.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                  }`}
                >
                  {SECTION_ICONS[sec.id]}
                  <span className="truncate">{sec.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[10px]">
          <button
            type="button"
            onClick={onExitAdmin}
            className="text-blue-300 hover:text-white flex items-center gap-1 font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Interface Operacional</span>
          </button>
          <span className="text-slate-500 font-mono">CENTRAL_ADMIN</span>
        </div>
      </aside>

      {/* Navegação Compacta Mobile do Painel Administrativo */}
      <div className="lg:hidden shrink-0 flex gap-1.5 overflow-x-auto pb-1">
        {visibleSections.map((sec) => {
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => onSelectSection(sec.id)}
              className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${
                isActive
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
                  : 'bg-[#0b192c] text-slate-300 border-blue-900/50 hover:text-white'
              }`}
            >
              {SECTION_ICONS[sec.id]}
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Área Central Administrativa */}
      <section className="flex-1 min-h-0 bg-[#0b192c] border border-amber-500/25 rounded-2xl p-3.5 sm:p-5 overflow-y-auto">
        <AdminSectionView
          sectionId={activeSection}
          currentUser={currentUser}
          selectedProvinceId={selectedProvinceId}
          apiActive={apiActive}
          verifiedSession={verifiedSession}
          overview={overview}
          overviewLoading={overviewLoading}
          overviewError={overviewError}
          onRefreshOverview={onRefreshOverview}
          onSelectProvince={onSelectProvince}
          onOpenProvisionamento={onOpenProvisionamento}
        />
      </section>
    </div>
  );
};
