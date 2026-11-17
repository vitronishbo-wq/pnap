import React from 'react';
import { Shield, SlidersHorizontal, ArrowLeft, MapPin, Lock, ShieldCheck } from 'lucide-react';
import type { PnapUser, ProvinceId } from '../../types/pnap';
import { PROVINCES_DATA } from '../../data/mockPnapData';

export type WorkspaceArea = 'operational' | 'admin';

interface PnapHeaderProps {
  currentUser: PnapUser;
  selectedProvinceId: ProvinceId;
  activeArea: WorkspaceArea;
  adminVerified: boolean;
  onRequestAdminAccess: () => void;
  onExitAdmin: () => void;
  onLockAdminSession: () => void;
  onToggleRoleSwitcher: () => void;
}

export const PnapHeader: React.FC<PnapHeaderProps> = ({
  currentUser,
  selectedProvinceId,
  activeArea,
  adminVerified,
  onRequestAdminAccess,
  onExitAdmin,
  onLockAdminSession,
  onToggleRoleSwitcher
}) => {
  const provinceName = PROVINCES_DATA[selectedProvinceId]?.name || selectedProvinceId.toUpperCase();
  const scopeLabel =
    currentUser.assignments.assignedProvinceId === 'all'
      ? `Global · ${provinceName}`
      : provinceName;

  return (
    <header className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 shrink-0 px-1">
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`w-8 h-8 rounded-xl border flex items-center justify-center shadow-sm shrink-0 ${
            activeArea === 'admin'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
              : 'bg-blue-600/10 border-blue-500/30 text-blue-400'
          }`}
        >
          <Shield className="w-4 h-4 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-black tracking-tight text-white leading-none">
              {activeArea === 'admin' ? 'PNAP | Administração' : 'PNAP — Gestão Prisional'}
            </h1>
            {activeArea === 'admin' && (
              <span className="hidden sm:inline text-[10px] text-amber-300 font-semibold uppercase tracking-wider truncate">
                Nacional
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 truncate">
            <MapPin className="w-2.5 h-2.5 text-blue-400 shrink-0" />
            <span className="truncate font-medium text-slate-300">{scopeLabel}</span>
            {currentUser.assignments.assignedEstablishmentId && (
              <span className="hidden md:inline text-slate-500 truncate">
                · {currentUser.assignments.assignedEstablishmentId}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {activeArea === 'operational' ? (
          <>
            <button
              type="button"
              onClick={onToggleRoleSwitcher}
              title="Perfil, Competência e Sessão"
              aria-label="Perfil e Competência"
              className="h-8 px-2 sm:px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer text-[11px]"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline font-medium truncate max-w-[140px]">
                {currentUser.assignments.role}
              </span>
            </button>

            <button
              type="button"
              onClick={onRequestAdminAccess}
              title="Acesso Administrativo (Direcção Geral)"
              aria-label="Admin"
              className={`h-8 px-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                adminVerified
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/45'
                  : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border-slate-700/80'
              }`}
            >
              {adminVerified ? (
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span>Admin</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onExitAdmin}
              title="Regressar à Interface Operacional"
              className="h-8 flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 border border-blue-500/40 px-2.5 rounded-xl text-[11px] font-semibold cursor-pointer transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Operação</span>
            </button>

            <button
              type="button"
              onClick={onLockAdminSession}
              title="Bloquear Sessão Administrativa"
              className="h-8 flex items-center gap-1.5 bg-slate-800 hover:bg-rose-950/70 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700/60 px-2.5 rounded-xl text-[11px] font-semibold cursor-pointer transition-all"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Bloquear</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};

