import React, { useState, useEffect } from 'react';
import { PNAP_SYSTEM_DATA } from '../data/mockPnapData';
import type { PnapCatalog } from '../types/pnap';
import { pnapStore } from '../services/pnapStore';
import { fetchAuditLogsViaApi, fetchCatalogsViaApi } from '../services/apiClient';
import { Settings, X, Building2, Lock, Sparkles } from 'lucide-react';

interface MaisModalProps {
  onClose: () => void;
  currentUserRole: string;
  apiActive?: boolean;
  onOpenProvisionamento?: () => void;
}

export const MaisModal: React.FC<MaisModalProps> = ({
  onClose,
  currentUserRole,
  apiActive = false,
  onOpenProvisionamento
}) => {
  const [activeTab, setActiveTab] = useState<'system' | 'provisioning' | 'audit' | 'jurisdiction'>('system');
  const [, setStoreTick] = useState(0);
  const [catalogs, setCatalogs] = useState<PnapCatalog[]>([]);

  useEffect(() => {
    return pnapStore.subscribe(() => setStoreTick((t) => t + 1));
  }, []);

  useEffect(() => {
    if (!apiActive) return;
    if (activeTab === 'audit') {
      fetchAuditLogsViaApi()
        .then((res) => pnapStore.syncLiveAuditLogs(res.logs))
        .catch(() => {});
    } else if (activeTab === 'system') {
      fetchCatalogsViaApi()
        .then((res) => setCatalogs(res.catalogs))
        .catch(() => {});
    }
  }, [activeTab, apiActive]);

  const auditLogs = pnapStore.getAuditLogs();
  const isCentralAdmin = currentUserRole === 'CENTRAL_ADMIN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0b192c] text-white w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl border border-blue-900/60 overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header sintético */}
        <div className="bg-[#10233f] px-3 py-3 sm:px-5 sm:py-4 border-b border-blue-800/60 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-blue-600 text-white p-1.5 sm:p-2 rounded-xl shrink-0">
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">Administração PNAP</h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                  isCentralAdmin
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {isCentralAdmin ? 'Global' : currentUserRole}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-400 hover:text-white bg-slate-800/60 p-1.5 sm:p-2 rounded-xl cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Tabs compactas */}
        <div className="flex bg-[#081220] p-2 border-b border-blue-900/60 gap-1.5 text-xs overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'system' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sistema
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('provisioning')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'provisioning'
                ? 'bg-amber-500 text-slate-950'
                : 'text-amber-300/80 hover:text-amber-300'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Provisionamento</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'audit' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Auditoria ({auditLogs.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('jurisdiction')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'jurisdiction' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Competências
          </button>
        </div>

        {/* Conteúdo sintético */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 text-xs space-y-3">
          {activeTab === 'system' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40">
                  <span className="text-slate-400 block text-[10px]">Divisão</span>
                  <div className="text-xs sm:text-sm font-bold text-white mt-0.5">
                    {PNAP_SYSTEM_DATA.configuration.dpaVersion}
                  </div>
                  <div className="text-emerald-400 font-semibold mt-0.5">
                    {PNAP_SYSTEM_DATA.configuration.systemState}
                  </div>
                </div>

                <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40">
                  <span className="text-slate-400 block text-[10px]">Esquema FUR</span>
                  <div className="text-xs sm:text-sm font-bold text-white mt-0.5">
                    {PNAP_SYSTEM_DATA.schemaVersions.current}
                  </div>
                </div>

                <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40">
                  <span className="text-slate-400 block text-[10px]">Rede Nacional</span>
                  <div className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5">
                    {PNAP_SYSTEM_DATA.deploymentStatus.provincesOnline} /{' '}
                    {PNAP_SYSTEM_DATA.deploymentStatus.totalProvinces} Províncias
                  </div>
                </div>
              </div>

              {catalogs.length > 0 && (
                <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 space-y-1.5">
                  <div className="font-bold text-slate-300">
                    Catálogos Dinâmicos Ativos ({catalogs.length})
                  </div>
                  {catalogs.map((cat) => (
                    <div key={cat.catalogId} className="text-[11px] text-slate-300 flex justify-between">
                      <span>{cat.category}</span>
                      <span className="text-blue-300 font-mono">{cat.items.length} itens</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-[#10233f] p-3 rounded-xl border border-blue-700/50 flex items-center justify-between gap-3">
                <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Provisionamento Estrutural</span>
                </div>

                {isCentralAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenProvisionamento) onOpenProvisionamento();
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Abrir</span>
                  </button>
                ) : (
                  <div className="text-slate-400 text-[11px] flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700 shrink-0">
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span>CENTRAL_ADMIN</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'provisioning' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[#10233f] p-3 rounded-xl border border-amber-500/40">
                  <strong className="text-amber-400 block">Fase 1</strong>
                  <span className="text-slate-200 font-semibold">Rascunho (DRAFT)</span>
                </div>
                <div className="bg-[#10233f] p-3 rounded-xl border border-emerald-500/40">
                  <strong className="text-emerald-400 block">Fase 2</strong>
                  <span className="text-slate-200 font-semibold">Homologação (HOMOLOGATED)</span>
                </div>
              </div>

              <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/50 flex items-center justify-between gap-2">
                <span className="text-slate-300 text-xs font-medium">
                  {isCentralAdmin ? 'Autorização Global Ativa' : 'Restrito a CENTRAL_ADMIN'}
                </span>
                {isCentralAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenProvisionamento) onOpenProvisionamento();
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Abrir</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div
                  key={log.eventId}
                  className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-blue-300 font-semibold truncate">{log.action}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                        log.jurisdictionStatus === 'BLOCKED_ATTEMPT'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : log.jurisdictionStatus === 'CROSS_PROVINCE_QUERY'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {log.jurisdictionStatus}
                    </span>
                  </div>
                  <div className="text-white font-medium">{log.details}</div>
                  <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap items-center justify-between gap-1">
                    <span>{log.userName}</span>
                    <span>{log.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'jurisdiction' && (
            <div className="space-y-2 text-xs">
              <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 flex items-center justify-between gap-2">
                <strong className="text-amber-400">CENTRAL_ADMIN</strong>
                <span className="text-slate-300 text-right">21 Províncias · Homologação · Catálogos</span>
              </div>
              <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 flex items-center justify-between gap-2">
                <strong className="text-blue-300">PROVINCIAL_COMMAND / DIRECTOR</strong>
                <span className="text-slate-300 text-right">Dupla aprovação de soltura · Transferências</span>
              </div>
              <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 flex items-center justify-between gap-2">
                <strong className="text-emerald-300">PENAL_CONTROL / REHABILITATION</strong>
                <span className="text-slate-300 text-right">Processos, Transições / Cela e Risco</span>
              </div>
              <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 flex items-center justify-between gap-2">
                <strong className="text-rose-300">HEALTH_SPECIALIST</strong>
                <span className="text-slate-300 text-right">Sigilo Clínico exclusivo da unidade</span>
              </div>
              <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 flex items-center justify-between gap-2">
                <strong className="text-purple-300">GATE_SECURITY / AUDITOR_INSPECTOR</strong>
                <span className="text-slate-300 text-right">Portaria e Escoltas / Auditoria Global</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
