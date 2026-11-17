import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  FileEdit,
  Globe,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserX
} from 'lucide-react';
import type {
  AuditLogEvent,
  PnapCatalog,
  PnapUser,
  ProvinceId,
  UserRole
} from '../../types/pnap';
import { PNAP_SYSTEM_DATA, PROVINCES_DATA } from '../../data/mockPnapData';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  checkApiHealth,
  checkFirestoreHealthViaApi,
  fetchAuditLogsViaApi,
  fetchCatalogsViaApi,
  getApiBaseUrl,
  revokeUserSessionsViaApi,
  updateAdminUserStatusViaApi,
  upsertAdminUserViaApi,
  upsertCatalogViaApi,
  type AdminOverviewResponse
} from '../../services/apiClient';
import { ADMIN_SECTIONS, type AdminSectionId } from '../../navigation/pnapNavigation';
import type { VerifiedAdminSession } from './AdminAuthGateModal';

interface AdminSectionViewProps {
  sectionId: AdminSectionId;
  currentUser: PnapUser;
  selectedProvinceId: ProvinceId;
  apiActive: boolean;
  verifiedSession: VerifiedAdminSession;
  overview: AdminOverviewResponse | null;
  overviewLoading: boolean;
  overviewError: string | null;
  onRefreshOverview: () => void;
  onSelectProvince: (provinceId: ProvinceId) => void;
  onOpenProvisionamento: () => void;
}

const RBAC_ROLES_INFO: Array<{
  role: UserRole;
  scope: string;
  description: string;
  accent: string;
}> = [
  {
    role: 'CENTRAL_ADMIN',
    scope: 'Nacional (21 Províncias)',
    description: 'Painel Administrativo, provisionamento, homologações, utilizadores e catálogos.',
    accent: 'text-amber-300'
  },
  {
    role: 'PROVINCIAL_COMMAND',
    scope: 'Província atribuída',
    description: 'Supervisão provincial, aprovações e auditoria da respetiva província.',
    accent: 'text-blue-300'
  },
  {
    role: 'ESTABLISHMENT_DIRECTOR',
    scope: 'Estabelecimento atribuído',
    description: 'Direção de estabelecimento e dupla aprovação de soltura.',
    accent: 'text-cyan-300'
  },
  {
    role: 'PENAL_CONTROL',
    scope: 'Estabelecimento atribuído',
    description: 'Admissões, processos judiciais, transições penais e extinções.',
    accent: 'text-emerald-300'
  },
  {
    role: 'REHABILITATION',
    scope: 'Estabelecimento atribuído',
    description: 'Avaliação psicossocial, conduta, risco e compatibilidade de alojamento.',
    accent: 'text-teal-300'
  },
  {
    role: 'HEALTH_SPECIALIST',
    scope: 'Isolado (Sigilo Clínico)',
    description: 'Acesso exclusivo a prontuários clínicos (health_records) e triagem sanitária.',
    accent: 'text-rose-300'
  },
  {
    role: 'GATE_SECURITY',
    scope: 'Estabelecimento atribuído',
    description: 'Portaria, visitantes, check-in/out e movimentações com escolta.',
    accent: 'text-indigo-300'
  },
  {
    role: 'OPERATIONAL_OFFICER',
    scope: 'Estabelecimento atribuído',
    description: 'Operação diária de unidade e registos operacionais autorizados.',
    accent: 'text-slate-200'
  },
  {
    role: 'AUDITOR_INSPECTOR',
    scope: 'Global ou Provincial (Leitura)',
    description: 'Inspeção e leitura de auditoria sem mutação operacional ou acesso clínico.',
    accent: 'text-purple-300'
  }
];

export const AdminSectionView: React.FC<AdminSectionViewProps> = ({
  sectionId,
  currentUser,
  selectedProvinceId,
  apiActive,
  verifiedSession,
  overview,
  overviewLoading,
  overviewError,
  onRefreshOverview,
  onSelectProvince,
  onOpenProvisionamento
}) => {
  const [catalogs, setCatalogs] = useState<PnapCatalog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEvent[]>([]);
  const [auditFilter, setAuditFilter] = useState<'ALL' | AuditLogEvent['jurisdictionStatus']>('ALL');
  const [actionNotice, setActionNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Estado do formulário de Utilizadores
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserUid, setNewUserUid] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRank, setNewUserRank] = useState('Oficial Prisional');
  const [newUserBadge, setNewUserBadge] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('OPERATIONAL_OFFICER');
  const [newUserProvince, setNewUserProvince] = useState<string>(selectedProvinceId);
  const [newUserEstId, setNewUserEstId] = useState('');

  // Estado do formulário de Catálogos
  const [newCatalogId, setNewCatalogId] = useState('CRIMES_DEFAULT');
  const [newCatalogCategory, setNewCatalogCategory] = useState<PnapCatalog['category']>('CRIMES');
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemLabel, setNewItemLabel] = useState('');

  // Estado de Integrações / Diagnóstico
  const [apiHealth, setApiHealth] = useState<{
    checked: boolean;
    ok: boolean;
    firebaseAdmin?: boolean;
    gemini?: boolean;
    timestamp?: string;
    error?: string;
  }>({ checked: false, ok: false });
  const [firestoreProbe, setFirestoreProbe] = useState<{
    checked: boolean;
    connected: boolean;
    collectionsCount?: number;
    error?: string;
  }>({ checked: false, connected: false });

  useEffect(() => {
    setActionNotice(null);
    if (!apiActive) return;
    if (sectionId === 'auditoria_historico' || sectionId === 'seguranca_sessoes') {
      fetchAuditLogsViaApi()
        .then((res) => setAuditLogs(res.logs))
        .catch(() => setAuditLogs([]));
    } else if (sectionId === 'catalogos_institucionais') {
      fetchCatalogsViaApi()
        .then((res) => setCatalogs(res.catalogs))
        .catch(() => setCatalogs([]));
    } else if (sectionId === 'integracoes') {
      checkApiHealth()
        .then((res) =>
          setApiHealth({
            checked: true,
            ok: res.status === 'ok',
            firebaseAdmin: res.configured?.firebaseAdmin,
            gemini: res.configured?.gemini,
            timestamp: res.timestamp
          })
        )
        .catch((err) =>
          setApiHealth({
            checked: true,
            ok: false,
            error: err instanceof Error ? err.message : 'API inacessível'
          })
        );
    }
  }, [apiActive, sectionId]);

  const meta = ADMIN_SECTIONS.find((s) => s.id === sectionId);
  const allProvinces = Object.values(PROVINCES_DATA);
  const realEstablishments = overview?.establishments ?? [];
  const provinceEstablishments = realEstablishments.filter((e) => e.provinceId === selectedProvinceId);
  const realAuditLogs = auditLogs.length > 0 ? auditLogs : overview?.recentAuditLogs ?? [];

  const renderSectionHeader = () => (
    <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-blue-900/60">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
          Painel Administrativo · Governação Nacional
        </div>
        <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">{meta?.label}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{meta?.subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefreshOverview}
          disabled={overviewLoading}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#10233f] hover:bg-[#173056] text-slate-200 border border-blue-800/70 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${overviewLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>
    </div>
  );

  const renderFeedbackBanner = () => (
    <>
      {overviewError && (
        <div className="bg-amber-950/60 border border-amber-600/50 text-amber-200 rounded-xl px-3 py-2 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{overviewError}</span>
        </div>
      )}
      {actionNotice && (
        <div
          className={`rounded-xl px-3 py-2 text-xs flex items-start gap-2 border ${
            actionNotice.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
              : 'bg-rose-950/70 border-rose-700/70 text-rose-200'
          }`}
        >
          {actionNotice.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span>{actionNotice.text}</span>
        </div>
      )}
    </>
  );

  // 1. VISÃO NACIONAL (Indicadores Reais ou "—", Zero valores de demonstração)
  if (sectionId === 'visao_nacional') {
    const m = overview?.metrics;
    const provDisplay = m ? `${m.provincesConfigured} / ${m.totalProvinces}` : '—';
    const estDisplay = m ? m.establishmentsCount.toLocaleString() : '—';
    const inmatesDisplay = m ? m.activeInmates.toLocaleString() : '—';
    const occupancyDisplay =
      m && m.occupancyRate !== null ? `${m.occupancyRate}%` : '—';

    return (
      <div className="space-y-4">
        {renderSectionHeader()}
        {renderFeedbackBanner()}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/50">
            <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
              Províncias
            </span>
            <strong className="text-lg sm:text-xl font-black text-white mt-0.5 block">
              {provDisplay}
            </strong>
          </div>
          <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/50">
            <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
              Estabelecimentos
            </span>
            <strong className="text-lg sm:text-xl font-black text-blue-300 mt-0.5 block">
              {estDisplay}
            </strong>
          </div>
          <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/50">
            <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
              Reclusos
            </span>
            <strong className="text-lg sm:text-xl font-black text-white mt-0.5 block">
              {inmatesDisplay}
            </strong>
          </div>
          <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/50">
            <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
              Ocupação
            </span>
            <strong className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5 block">
              {occupancyDisplay}
            </strong>
          </div>
        </div>

        <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/50 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>Actividade recente</span>
            </div>
            <span className="text-[10px] text-slate-400">
              Registos e alterações institucionais reais
            </span>
          </div>

          {!overview || overview.recentAuditLogs.length === 0 ? (
            <div className="p-3 rounded-lg bg-[#081220] border border-slate-800 text-xs text-slate-400">
              Sem registos institucionais carregados nesta sessão. Os indicadores são alimentados
              exclusivamente por dados reais da API/Firestore.
            </div>
          ) : (
            <div className="space-y-1.5">
              {overview.recentAuditLogs.slice(0, 6).map((log) => (
                <div
                  key={log.eventId}
                  className="bg-[#081220] border border-slate-800/80 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] text-blue-300 font-semibold">
                      {log.action}
                    </span>
                    <div className="text-slate-300 truncate">{log.details}</div>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">{log.timestamp}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 text-xs text-slate-300 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Segregação institucional: o perfil <strong>CENTRAL_ADMIN</strong> gere estruturas,
            contas e governação, sem acesso ao prontuário clínico (exclusivo a{' '}
            <strong>HEALTH_SPECIALIST</strong>).
          </span>
        </div>
      </div>
    );
  }

  // 2. ESTRUTURA PRISIONAL
  if (sectionId === 'estrutura_prisional') {
    return (
      <div className="space-y-4">
        {renderSectionHeader()}
        {renderFeedbackBanner()}

        <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-700/50 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              <span>
                Estrutura Prisional ·{' '}
                {PROVINCES_DATA[selectedProvinceId]?.name || selectedProvinceId.toUpperCase()}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Províncias, estabelecimentos, pavilhões, blocos, celas e capacidades instaladas
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenProvisionamento}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Gerir & Provisionar Estrutura</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
          {allProvinces.map((prov) => {
            const isSelected = prov.id === selectedProvinceId;
            return (
              <button
                key={prov.id}
                type="button"
                onClick={() => onSelectProvince(prov.id)}
                className={`px-2 py-1.5 rounded-lg border text-left text-[11px] transition-all cursor-pointer truncate ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-200 font-bold'
                    : 'bg-[#10233f] border-blue-900/40 text-slate-300 hover:text-white'
                }`}
              >
                {prov.name}
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Estabelecimentos reais em {PROVINCES_DATA[selectedProvinceId]?.name} ({provinceEstablishments.length})
          </div>
          {provinceEstablishments.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#081220] border border-blue-950 text-xs text-slate-400">
              Nenhum estabelecimento registado no Firestore para esta província ou aguardando ligação à API.
            </div>
          ) : (
            provinceEstablishments.map((est) => {
              const isHomologated = est.provisioningStatus === 'HOMOLOGATED';
              return (
                <div
                  key={est.establishmentId}
                  className="bg-[#10233f] p-3 rounded-xl border border-blue-900/50 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{est.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {est.activeInmatesCount} / {est.totalCapacity} vagas · {est.type} ·{' '}
                      {(est.pavilions || []).length} pavilhões
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
                      isHomologated
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {isHomologated ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" /> HOMOLOGADO
                      </>
                    ) : (
                      <>
                        <FileEdit className="w-3 h-3" /> RASCUNHO
                      </>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // 3. UTILIZADORES
  if (sectionId === 'utilizadores') {
    const usersList = overview?.users ?? [];

    const handleCreateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!apiActive) {
        setActionNotice({
          type: 'err',
          text: 'Ligue a API oficial do PNAP para criar ou associar contas em pnap_users.'
        });
        return;
      }
      setBusyAction(true);
      setActionNotice(null);
      try {
        const res = await upsertAdminUserViaApi({
          uid: newUserUid.trim() || undefined,
          fullName: newUserName.trim(),
          email: newUserEmail.trim(),
          rank: newUserRank.trim(),
          badgeNumber: newUserBadge.trim() || 'PNAP-CIP',
          role: newUserRole,
          assignedProvinceId: newUserProvince,
          assignedEstablishmentId: newUserEstId.trim() || undefined
        });
        setActionNotice({
          type: 'ok',
          text: `Conta ${res.user.profile.fullName} (${res.user.assignments.role}) gravada em pnap_users.`
        });
        setNewUserName('');
        setNewUserEmail('');
        setNewUserUid('');
        setNewUserBadge('');
        onRefreshOverview();
      } catch (err) {
        setActionNotice({
          type: 'err',
          text: err instanceof Error ? err.message : 'Falha ao gravar utilizador.'
        });
      } finally {
        setBusyAction(false);
      }
    };

    const handleToggleUserStatus = async (target: PnapUser) => {
      if (!apiActive) return;
      const nextStatus = target.profile.status === 'active' ? 'suspended' : 'active';
      setBusyAction(true);
      setActionNotice(null);
      try {
        await updateAdminUserStatusViaApi(target.uid, nextStatus);
        setActionNotice({
          type: 'ok',
          text: `Conta ${target.profile.email} alterada para ${nextStatus}.`
        });
        onRefreshOverview();
      } catch (err) {
        setActionNotice({
          type: 'err',
          text: err instanceof Error ? err.message : 'Erro ao atualizar estado da conta.'
        });
      } finally {
        setBusyAction(false);
      }
    };

    return (
      <div className="space-y-4">
        {renderSectionHeader()}
        {renderFeedbackBanner()}

        <form
          onSubmit={handleCreateUser}
          className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/60 space-y-3 text-xs"
        >
          <div className="font-bold text-white flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Associar / Provisionar Utilizador Oficial</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <input
              type="text"
              required
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Nome completo do funcionário"
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white placeholder:text-slate-500"
            />
            <input
              type="email"
              required
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder="E-mail Google institucional"
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white placeholder:text-slate-500"
            />
            <input
              type="text"
              value={newUserUid}
              onChange={(e) => setNewUserUid(e.target.value)}
              placeholder="UID Firebase (opcional se já existir)"
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white placeholder:text-slate-500 font-mono"
            />
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as UserRole)}
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white"
            >
              {RBAC_ROLES_INFO.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.role}
                </option>
              ))}
            </select>
            <select
              value={newUserProvince}
              onChange={(e) => setNewUserProvince(e.target.value)}
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white"
            >
              <option value="all">all (Global — CENTRAL_ADMIN / AUDITOR)</option>
              {allProvinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newUserEstId}
              onChange={(e) => setNewUserEstId(e.target.value)}
              placeholder="ID Estabelecimento (opcional)"
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white placeholder:text-slate-500"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newUserRank}
                onChange={(e) => setNewUserRank(e.target.value)}
                placeholder="Patente / Cargo"
                className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white w-44"
              />
              <input
                type="text"
                value={newUserBadge}
                onChange={(e) => setNewUserBadge(e.target.value)}
                placeholder="CIP / Cédula"
                className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white w-32"
              />
            </div>
            <button
              type="submit"
              disabled={busyAction}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {busyAction ? 'A gravar...' : 'Guardar Conta PNAP'}
            </button>
          </div>
        </form>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Contas registadas em pnap_users ({usersList.length})
          </div>
          {usersList.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#081220] border border-blue-950 text-xs text-slate-400">
              Nenhuma conta carregada da API/Firestore.
            </div>
          ) : (
            usersList.map((u) => {
              const active = u.profile?.status === 'active';
              return (
                <div
                  key={u.uid}
                  className="bg-[#10233f] p-3 rounded-xl border border-blue-900/50 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">
                      {u.profile?.fullName || u.uid}{' '}
                      <span className="text-[10px] font-mono text-amber-300 ml-1">
                        {u.assignments.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {u.profile?.email} · Escopo: {u.assignments.assignedProvinceId}
                      {u.assignments.assignedEstablishmentId
                        ? ` · ${u.assignments.assignedEstablishmentId}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        active
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {active ? 'ACTIVO' : 'SUSPENSO'}
                    </span>
                    {u.uid !== currentUser.uid && (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleToggleUserStatus(u)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        {active ? (
                          <>
                            <UserX className="w-3 h-3 text-rose-400" />
                            <span>Suspender</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3 h-3 text-emerald-400" />
                            <span>Reactivar</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // 4. FUNÇÕES E PERMISSÕES
  if (sectionId === 'funcoes_permissoes') {
    return (
      <div className="space-y-3">
        {renderSectionHeader()}
        <div className="space-y-2 text-xs">
          {RBAC_ROLES_INFO.map((item) => (
            <div
              key={item.role}
              className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
            >
              <div>
                <strong className={item.accent}>{item.role}</strong>
                <div className="text-[11px] text-slate-400">{item.scope}</div>
              </div>
              <span className="text-slate-300 sm:text-right max-w-md">{item.description}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 5. HOMOLOGAÇÕES
  if (sectionId === 'homologacoes') {
    const drafts = realEstablishments.filter((e) => e.provisioningStatus !== 'HOMOLOGATED');
    const homologated = realEstablishments.filter((e) => e.provisioningStatus === 'HOMOLOGATED');

    return (
      <div className="space-y-4">
        {renderSectionHeader()}
        {renderFeedbackBanner()}

        <div className="bg-[#10233f] p-3.5 rounded-xl border border-amber-500/35 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <div className="font-bold text-white">Despachos Centrais de Homologação</div>
            <div className="text-[11px] text-slate-400">
              Pendentes: {overview ? drafts.length : '—'} · Homologados:{' '}
              {overview ? homologated.length : '—'}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenProvisionamento}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Homologar Estruturas</span>
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Rascunhos pendentes de despacho ({drafts.length})
          </div>
          {drafts.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#081220] border border-blue-950 text-xs text-slate-400">
              Nenhuma estrutura pendente de homologação carregada.
            </div>
          ) : (
            drafts.map((est) => (
              <div
                key={est.establishmentId}
                className="bg-[#10233f] p-3 rounded-xl border border-amber-500/40 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-bold text-white">{est.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {est.provinceId.toUpperCase()} · {est.totalCapacity} vagas declaradas
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                  DRAFT
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 6. CATÁLOGOS INSTITUCIONAIS
  if (sectionId === 'catalogos_institucionais') {
    const handleAddCatalogItem = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!apiActive || !newItemCode.trim() || !newItemLabel.trim()) return;
      setBusyAction(true);
      setActionNotice(null);
      try {
        const existingCat = catalogs.find((c) => c.catalogId === newCatalogId.trim());
        const nextItems = [
          ...(existingCat?.items || []),
          { code: newItemCode.trim().toUpperCase(), label: newItemLabel.trim(), active: true }
        ];
        const res = await upsertCatalogViaApi(newCatalogId.trim(), {
          category: newCatalogCategory,
          items: nextItems
        });
        setCatalogs((prev) => {
          const rest = prev.filter((c) => c.catalogId !== res.catalog.catalogId);
          return [res.catalog, ...rest];
        });
        setNewItemCode('');
        setNewItemLabel('');
        setActionNotice({ type: 'ok', text: `Catálogo ${res.catalog.catalogId} atualizado.` });
      } catch (err) {
        setActionNotice({
          type: 'err',
          text: err instanceof Error ? err.message : 'Erro ao atualizar catálogo.'
        });
      } finally {
        setBusyAction(false);
      }
    };

    return (
      <div className="space-y-4">
        {renderSectionHeader()}
        {renderFeedbackBanner()}

        <form
          onSubmit={handleAddCatalogItem}
          className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/50 space-y-2.5 text-xs"
        >
          <div className="font-bold text-white flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Adicionar Parâmetro ao Catálogo</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              value={newCatalogId}
              onChange={(e) => setNewCatalogId(e.target.value)}
              placeholder="ID do Catálogo"
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white font-mono"
            />
            <select
              value={newCatalogCategory}
              onChange={(e) => setNewCatalogCategory(e.target.value as PnapCatalog['category'])}
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white"
            >
              <option value="CRIMES">CRIMES</option>
              <option value="INCIDENTS">INCIDENTS</option>
              <option value="EXIT_REASONS">EXIT_REASONS</option>
              <option value="ESCORT_PROTOCOLS">ESCORT_PROTOCOLS</option>
              <option value="REHAB_PROGRAMS">REHAB_PROGRAMS</option>
            </select>
            <input
              type="text"
              value={newItemCode}
              onChange={(e) => setNewItemCode(e.target.value)}
              placeholder="Código (ex: ART_401)"
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white font-mono"
            />
            <input
              type="text"
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              placeholder="Designação oficial"
              className="bg-[#081220] border border-slate-700 rounded-lg px-2.5 py-2 text-white"
            />
          </div>
          <button
            type="submit"
            disabled={busyAction || !apiActive}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg cursor-pointer disabled:opacity-40"
          >
            Gravar Item no Catálogo
          </button>
        </form>

        {catalogs.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#081220] border border-blue-950 text-xs text-slate-400">
            Nenhum catálogo dinâmico carregado do Firestore neste momento.
          </div>
        ) : (
          <div className="space-y-2">
            {catalogs.map((cat) => (
              <div
                key={cat.catalogId}
                className="bg-[#10233f] p-3 rounded-xl border border-blue-900/50 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-white">
                    {cat.category} · <span className="font-mono text-amber-300">{cat.catalogId}</span>
                  </strong>
                  <span className="text-blue-300 font-mono">{cat.items.length} itens</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.items.slice(0, 12).map((it) => (
                    <span
                      key={it.code}
                      className="px-2 py-0.5 rounded bg-[#081220] border border-slate-800 text-[10px] text-slate-300"
                    >
                      {it.code}: {it.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 7. AUDITORIA E HISTÓRICO
  if (sectionId === 'auditoria_historico') {
    const filteredLogs =
      auditFilter === 'ALL'
        ? realAuditLogs
        : realAuditLogs.filter((l) => l.jurisdictionStatus === auditFilter);

    return (
      <div className="space-y-3">
        {renderSectionHeader()}

        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {(['ALL', 'AUTHORIZED', 'CROSS_PROVINCE_QUERY', 'BLOCKED_ATTEMPT'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setAuditFilter(f)}
              className={`px-2.5 py-1 rounded-lg border font-semibold cursor-pointer ${
                auditFilter === f
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
                  : 'bg-[#10233f] text-slate-300 border-blue-900/40'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#081220] border border-blue-950 text-xs text-slate-400">
              Nenhum evento de auditoria carregado para este filtro.
            </div>
          ) : (
            filteredLogs.map((log) => (
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
                  <span>
                    {log.userName} ({log.userRole}) · IP: {log.ipAddress}
                  </span>
                  <span>{log.timestamp}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 8. SEGURANÇA E SESSÕES
  if (sectionId === 'seguranca_sessoes') {
    const blockedAttempts = realAuditLogs.filter((l) => l.jurisdictionStatus === 'BLOCKED_ATTEMPT');
    const adminsList = overview?.admins ?? [];

    const handleRevoke = async (uid: string) => {
      if (!apiActive) return;
      setBusyAction(true);
      setActionNotice(null);
      try {
        await revokeUserSessionsViaApi(uid);
        setActionNotice({
          type: 'ok',
          text: `Tokens de sessão Firebase revogados para ${uid}.`
        });
      } catch (err) {
        setActionNotice({
          type: 'err',
          text: err instanceof Error ? err.message : 'Erro ao revogar sessões.'
        });
      } finally {
        setBusyAction(false);
      }
    };

    return (
      <div className="space-y-4">
        {renderSectionHeader()}
        {renderFeedbackBanner()}

        <div className="bg-[#10233f] p-3.5 rounded-xl border border-amber-500/40 text-xs space-y-1.5">
          <div className="font-bold text-amber-300 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4" />
            <span>Sessão Administrativa Verificada</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-300">
            <div>
              E-mail: <strong className="text-white">{verifiedSession.email}</strong>
            </div>
            <div>
              Método 2.º Factor:{' '}
              <strong className="text-emerald-300">{verifiedSession.verificationMethod}</strong>
            </div>
            <div>
              Verificado em: <span className="font-mono">{verifiedSession.verifiedAt}</span>
            </div>
            <div>
              Expira em: <span className="font-mono">{verifiedSession.expiresAt}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/50 space-y-2 text-xs">
          <div className="font-bold text-white flex items-center justify-between">
            <span>Administradores Registados (pnap_admins)</span>
            <span className="font-mono text-amber-300">
              {overview ? adminsList.length : '—'}
            </span>
          </div>
          {adminsList.length === 0 ? (
            <div className="text-slate-400">
              Sem registos adicionais carregados de pnap_admins.
            </div>
          ) : (
            adminsList.map((adm, idx) => (
              <div
                key={String(adm.uid || idx)}
                className="bg-[#081220] px-3 py-2 rounded-lg flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-white truncate">{String(adm.email || adm.uid)}</div>
                  <div className="text-[10px] text-slate-400">UID: {String(adm.uid || '—')}</div>
                </div>
                {adm.uid && String(adm.uid) !== verifiedSession.uid && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => handleRevoke(String(adm.uid))}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-700/60 text-[10px] font-semibold cursor-pointer"
                  >
                    Revogar Sessões
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Tentativas Bloqueadas ({blockedAttempts.length})</span>
          </div>
          {blockedAttempts.length === 0 ? (
            <div className="p-3 rounded-xl bg-[#081220] border border-blue-950 text-xs text-slate-400">
              Nenhuma tentativa bloqueada registada nos logs carregados.
            </div>
          ) : (
            blockedAttempts.slice(0, 8).map((ev) => (
              <div
                key={ev.eventId}
                className="bg-rose-950/30 border border-rose-800/60 rounded-xl p-2.5 text-xs"
              >
                <div className="font-mono text-rose-300 font-semibold">{ev.action}</div>
                <div className="text-slate-200">{ev.details}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {ev.userName} · {ev.ipAddress} · {ev.timestamp}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 9. INTEGRAÇÕES
  if (sectionId === 'integracoes') {
    const apiBase = getApiBaseUrl();
    return (
      <div className="space-y-3">
        {renderSectionHeader()}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/40 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Firebase Project & Hosting</span>
            </div>
            <div className="text-slate-300 font-mono text-[11px]">
              Projeto: {firebaseConfig.projectId}
            </div>
            <div className="text-slate-400 font-mono text-[11px] truncate">
              Firestore DB: {firebaseConfig.firestoreDatabaseId}
            </div>
          </div>

          <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/40 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Backend API PNAP</span>
            </div>
            <div className="text-slate-300 font-mono text-[11px] truncate">
              {apiBase || 'VITE_API_BASE_URL não configurado neste terminal'}
            </div>
            <div className="text-[11px] text-slate-400">
              Estado /health:{' '}
              <strong className={apiHealth.ok ? 'text-emerald-400' : 'text-amber-300'}>
                {!apiHealth.checked ? '—' : apiHealth.ok ? 'Operacional' : apiHealth.error || 'Indisponível'}
              </strong>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 10. SISTEMA E MANUTENÇÃO
  const handleProbeFirestore = async () => {
    if (!apiActive) {
      setFirestoreProbe({
        checked: true,
        connected: false,
        error: 'Ligue a API oficial do PNAP para executar o diagnóstico servidor.'
      });
      return;
    }
    try {
      const res = await checkFirestoreHealthViaApi();
      setFirestoreProbe({
        checked: true,
        connected: res.connected,
        collectionsCount: res.collectionsCount,
        error: res.error
      });
    } catch (err) {
      setFirestoreProbe({
        checked: true,
        connected: false,
        error: err instanceof Error ? err.message : 'Falha no diagnóstico'
      });
    }
  };

  return (
    <div className="space-y-4">
      {renderSectionHeader()}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40">
          <span className="text-slate-400 block text-[10px]">Divisão Territorial</span>
          <div className="text-sm font-bold text-white mt-0.5">
            {overview?.systemInfo.dpaVersion || PNAP_SYSTEM_DATA.configuration.dpaVersion}
          </div>
        </div>
        <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40">
          <span className="text-slate-400 block text-[10px]">Esquema FUR</span>
          <div className="text-sm font-bold text-white mt-0.5">
            {PNAP_SYSTEM_DATA.schemaVersions.current}
          </div>
        </div>
        <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/40">
          <span className="text-slate-400 block text-[10px]">Base Firestore</span>
          <div className="text-xs font-mono text-amber-300 mt-1 truncate">
            {overview?.systemInfo.databaseId || firebaseConfig.firestoreDatabaseId}
          </div>
        </div>
      </div>

      <div className="bg-[#10233f] p-3.5 rounded-xl border border-blue-900/50 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <div className="font-bold text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Diagnóstico de Conectividade Firestore Admin</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {firestoreProbe.checked
              ? firestoreProbe.connected
                ? `Conectado · ${firestoreProbe.collectionsCount ?? 0} coleções detetadas.`
                : `Erro: ${firestoreProbe.error || 'Desconectado'}`
              : 'Execute o diagnóstico para confirmar a integridade do acesso ao Cloud Firestore.'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleProbeFirestore}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-semibold cursor-pointer"
        >
          Testar Firestore
        </button>
      </div>
    </div>
  );
};
