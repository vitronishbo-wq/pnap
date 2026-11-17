/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { UserCheck, LogIn, LogOut } from 'lucide-react';
import { onAuthStateChanged, type User as FirebaseAuthUser } from 'firebase/auth';
import { ProvinceId, Inmate, NationalInmateIndexItem } from './types/pnap';
import { MOCK_USERS } from './data/mockPnapData';
import { pnapStore } from './services/pnapStore';
import { auth, signInWithGoogle, signOutFirebase, fetchAuthenticatedPnapUser } from './firebase';
import {
  fetchAdminOverviewViaApi,
  fetchApiProvinceStats,
  fetchCurrentApiUser,
  fetchProvinceEstablishmentsViaApi,
  fetchProvinceInmatesViaApi,
  isApiConfigured,
  type AdminOverviewResponse
} from './services/apiClient';
import {
  canEnterAdminPanel,
  type AdminSectionId,
  type OperationalViewId,
  type PrimaryOperationalId,
  type SecondaryOperationalId
} from './navigation/pnapNavigation';
import { PnapHeader, type WorkspaceArea } from './components/layout/PnapHeader';
import { MobileBottomBar } from './components/layout/MobileBottomBar';
import { DesktopSidebar } from './components/layout/DesktopSidebar';
import { OperationalHome } from './components/operational/OperationalHome';
import { OperationalMoreMenu } from './components/operational/OperationalMoreMenu';
import { ModuleWorkspaceShell } from './components/operational/ModuleWorkspaceShell';
import { AdminShell } from './components/admin/AdminShell';
import {
  AdminAuthGateModal,
  type VerifiedAdminSession
} from './components/admin/AdminAuthGateModal';
import { NationalInmateSearch } from './components/NationalInmateSearch';
import { InmateDossierModal } from './components/InmateDossierModal';
import { EntradaSaidaModal } from './components/EntradaSaidaModal';
import { TransicaoModal } from './components/TransicaoModal';
import { VisitantesModal } from './components/VisitantesModal';
import { ProvisionamentoModal } from './components/ProvisionamentoModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState(MOCK_USERS[0]);
  const [selectedProvinceId, setSelectedProvinceId] = useState<ProvinceId>('huambo');

  // Separação oficial das duas áreas independentes (Área 01: Operacional | Área 02: Administração)
  const [activeArea, setActiveArea] = useState<WorkspaceArea>('operational');
  const [operationalView, setOperationalView] = useState<OperationalViewId>('home');
  const [adminSection, setAdminSection] = useState<AdminSectionId>('visao_nacional');

  // Modais operacionais e administrativos preservados
  const [activeModal, setActiveModal] = useState<
    | 'consultar'
    | 'entrada_saida'
    | 'transferencias'
    | 'transicao'
    | 'visitantes'
    | 'mais_menu'
    | 'role_switcher'
    | 'provisionamento'
    | 'admin_auth_gate'
    | null
  >(null);
  const [selectedInmateForDossier, setSelectedInmateForDossier] = useState<Inmate | null>(null);
  const [transferTargetInmate, setTransferTargetInmate] = useState<NationalInmateIndexItem | null>(null);
  const [, setStoreTick] = useState(0);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseAuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // Fase 2: Sessão Administrativa Verificada & Visão Nacional Real
  const [verifiedAdminSession, setVerifiedAdminSession] = useState<VerifiedAdminSession | null>(null);
  const [adminOverview, setAdminOverview] = useState<AdminOverviewResponse | null>(null);
  const [adminOverviewLoading, setAdminOverviewLoading] = useState(false);
  const [adminOverviewError, setAdminOverviewError] = useState<string | null>(null);

  useEffect(() => {
    return pnapStore.subscribe(() => setStoreTick((t) => t + 1));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setVerifiedAdminSession(null);
        setAdminOverview(null);
        setActiveArea('operational');
        return;
      }
      setVerifiedAdminSession((prev) => {
        if (prev && prev.uid !== user.uid) {
          setActiveArea('operational');
          setAdminOverview(null);
          return null;
        }
        return prev;
      });
      try {
        const officialUser = isApiConfigured()
          ? await fetchCurrentApiUser().catch(() => fetchAuthenticatedPnapUser(user.uid))
          : await fetchAuthenticatedPnapUser(user.uid);
        if (officialUser) {
          setCurrentUser(officialUser);
          if (!canEnterAdminPanel(officialUser.assignments.role)) {
            setVerifiedAdminSession(null);
            setActiveArea('operational');
          }
          if (
            officialUser.assignments.role !== 'CENTRAL_ADMIN' &&
            officialUser.assignments.assignedProvinceId !== 'all'
          ) {
            setSelectedProvinceId(officialUser.assignments.assignedProvinceId as ProvinceId);
          }
        }
      } catch {
        // Utilizador autenticado ainda sem registo em pnap_users
      }
    });
    return () => unsubscribe();
  }, []);

  const apiActive = Boolean(isApiConfigured() && firebaseUser);

  useEffect(() => {
    if (!apiActive) return;
    let mounted = true;
    const syncProvince = async () => {
      try {
        const [inmRes, estRes, statsRes] = await Promise.all([
          fetchProvinceInmatesViaApi(selectedProvinceId).catch(() => null),
          fetchProvinceEstablishmentsViaApi(selectedProvinceId).catch(() => null),
          fetchApiProvinceStats().catch(() => null)
        ]);
        if (!mounted) return;
        if (inmRes) pnapStore.syncLiveInmates(selectedProvinceId, inmRes.inmates);
        if (estRes) pnapStore.syncLiveEstablishments(selectedProvinceId, estRes.establishments);
        if (statsRes) pnapStore.syncLiveProvinceStats(statsRes.stats);
      } catch {
        // Falha silenciosa em sincronização passiva
      }
    };
    syncProvince();
    return () => {
      mounted = false;
    };
  }, [apiActive, selectedProvinceId, currentUser.uid]);

  const handleFirebaseSignIn = async () => {
    setAuthBusy(true);
    try {
      const signed = await signInWithGoogle();
      setBannerNotice(`Sessão Firebase ativa: ${signed.email || signed.uid}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na autenticação Google.';
      setBannerNotice(`Autenticação cancelada ou recusada: ${msg}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleFirebaseSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutFirebase();
      setVerifiedAdminSession(null);
      setAdminOverview(null);
      setActiveArea('operational');
      setBannerNotice('Sessão Firebase terminada.');
    } finally {
      setAuthBusy(false);
    }
  };

  const loadAdminOverview = async () => {
    if (!isApiConfigured() || !auth.currentUser) {
      setAdminOverview(null);
      setAdminOverviewError(
        'Modo sem endpoint API configurado neste terminal (VITE_API_BASE_URL). Os indicadores mostram "—" até ligar à API oficial.'
      );
      return;
    }
    setAdminOverviewLoading(true);
    setAdminOverviewError(null);
    try {
      const data = await fetchAdminOverviewViaApi();
      setAdminOverview(data);
    } catch (err) {
      setAdminOverviewError(
        err instanceof Error ? err.message : 'Falha ao carregar indicadores reais do Painel Administrativo.'
      );
    } finally {
      setAdminOverviewLoading(false);
    }
  };

  const handleRequestAdminAccess = () => {
    setActiveModal(null);
    const sessionValid =
      verifiedAdminSession &&
      firebaseUser &&
      verifiedAdminSession.uid === firebaseUser.uid &&
      new Date(verifiedAdminSession.expiresAt).getTime() > Date.now();

    if (sessionValid) {
      setActiveArea('admin');
      void loadAdminOverview();
      return;
    }

    setVerifiedAdminSession(null);
    setActiveModal('admin_auth_gate');
  };

  const handleAdminSessionVerified = (session: VerifiedAdminSession) => {
    setVerifiedAdminSession(session);
    setActiveModal(null);
    setActiveArea('admin');
    setBannerNotice(`Painel Administrativo desbloqueado (${session.email}).`);
    void loadAdminOverview();
  };

  const handleLockAdminSession = () => {
    setVerifiedAdminSession(null);
    setAdminOverview(null);
    setActiveArea('operational');
    setBannerNotice('Sessão administrativa bloqueada.');
  };

  const handleRoleChange = (userId: string) => {
    const user = MOCK_USERS.find((u) => u.uid === userId);
    if (!user) return;

    setCurrentUser(user);
    if (!canEnterAdminPanel(user.assignments.role)) {
      setVerifiedAdminSession(null);
      setActiveArea('operational');
    }

    if (user.assignments.role === 'PROVINCIAL_COMMAND') {
      setSelectedProvinceId('luanda');
      setBannerNotice('Perfil alterado para: Comando Provincial de Luanda.');
    } else if (
      user.assignments.role === 'CENTRAL_ADMIN' ||
      (user.assignments.role === 'AUDITOR_INSPECTOR' && user.assignments.assignedProvinceId === 'all')
    ) {
      setBannerNotice(`Perfil alterado para: ${user.profile.rank} (Escopo Global).`);
    } else {
      setSelectedProvinceId((user.assignments.assignedProvinceId || 'luanda') as ProvinceId);
      setBannerNotice(`Perfil alterado para: ${user.profile.rank} (${user.assignments.role}).`);
    }
    setActiveModal(null);
  };

  const handleOpenInmateDossier = (inmateId: string) => {
    const found = pnapStore.getInmates().find((inm) => inm.inmateId === inmateId);
    if (found) {
      if (!pnapStore.canOperateProvince(currentUser, found.provinceId)) {
        setBannerNotice(
          `Jurisdição bloqueada: dossier confidencial pertence a ${found.provinceId.toUpperCase()}.`
        );
        return;
      }
      setSelectedInmateForDossier(found);
    } else {
      setBannerNotice('Dossier confidencial localizado em servidor provincial remoto.');
    }
  };

  const handleRequestTransferFromSearch = (inmate: NationalInmateIndexItem) => {
    setTransferTargetInmate(inmate);
    setActiveModal('entrada_saida');
  };

  const handleSelectPrimary = (id: PrimaryOperationalId) => {
    setActiveArea('operational');
    setOperationalView(id);
    setTransferTargetInmate(null);
    if (id === 'entrada_saida') setActiveModal('entrada_saida');
    else if (id === 'transicao') setActiveModal('transicao');
    else if (id === 'visitas') setActiveModal('visitantes');
    else if (id === 'consulta') setActiveModal('consultar');
  };

  const handleSelectSecondary = (id: SecondaryOperationalId) => {
    setActiveArea('operational');
    setOperationalView(id);
    setActiveModal(null);
  };

  const activeMobilePrimary: PrimaryOperationalId | 'mais' | null =
    activeModal === 'mais_menu'
      ? 'mais'
      : activeModal === 'entrada_saida'
      ? 'entrada_saida'
      : activeModal === 'transicao'
      ? 'transicao'
      : activeModal === 'visitantes'
      ? 'visitas'
      : activeModal === 'consultar'
      ? 'consulta'
      : operationalView === 'entrada_saida' ||
        operationalView === 'transicao' ||
        operationalView === 'visitas' ||
        operationalView === 'consulta'
      ? operationalView
      : operationalView === 'home'
      ? null
      : 'mais';

  const isSecondaryView =
    operationalView !== 'home' &&
    operationalView !== 'entrada_saida' &&
    operationalView !== 'transicao' &&
    operationalView !== 'visitas' &&
    operationalView !== 'consulta';

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans overflow-hidden p-0 sm:p-2 md:p-3 lg:p-4 selection:bg-blue-600 selection:text-white">
      {/* Container Responsivo: Mobile single-screen limpo | Desktop com Sidebar esquerda */}
      <div className="w-full h-full max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-[1440px] bg-slate-900 sm:rounded-3xl border-0 sm:border border-slate-800 p-2.5 sm:p-3.5 lg:p-4 flex flex-col justify-between overflow-hidden relative shadow-2xl">
        <PnapHeader
          currentUser={currentUser}
          selectedProvinceId={selectedProvinceId}
          activeArea={activeArea}
          adminVerified={Boolean(verifiedAdminSession)}
          onRequestAdminAccess={handleRequestAdminAccess}
          onExitAdmin={() => setActiveArea('operational')}
          onLockAdminSession={handleLockAdminSession}
          onToggleRoleSwitcher={() =>
            setActiveModal(activeModal === 'role_switcher' ? null : 'role_switcher')
          }
        />

        {bannerNotice && (
          <div className="bg-blue-950/90 border border-blue-600/60 text-blue-200 px-3 py-1.5 rounded-xl text-[11px] flex items-center justify-between mt-1.5 shrink-0">
            <span className="truncate">{bannerNotice}</span>
            <button
              type="button"
              onClick={() => setBannerNotice(null)}
              className="text-slate-400 hover:text-white font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Flutuante de Alternância de Competência & Sessão Firebase */}
        {activeModal === 'role_switcher' && (
          <div className="absolute top-12 right-2.5 left-2.5 sm:left-auto sm:w-96 z-40 p-3 bg-[#10233f] border-2 border-blue-600/80 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-2 border-b border-blue-800 pb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                Matriz de Níveis e Competências
              </span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-white text-xs bg-slate-800 px-2 py-0.5 rounded-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mb-2 p-2 rounded-xl bg-[#0b192c] border border-blue-900/60 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Firebase Auth
                </div>
                <div className="text-[11px] text-slate-200 truncate">
                  {firebaseUser ? firebaseUser.email || firebaseUser.uid : 'Não autenticado'}
                </div>
              </div>
              {firebaseUser ? (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleFirebaseSignOut}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sair</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleFirebaseSignIn}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  <LogIn className="w-3 h-3" />
                  <span>Entrar Google</span>
                </button>
              )}
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {MOCK_USERS.map((user) => {
                const isCurrent = currentUser.uid === user.uid;
                return (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={() => handleRoleChange(user.uid)}
                    className={`w-full text-left p-2 rounded-xl text-xs border transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-blue-600 text-white border-blue-400 font-semibold'
                        : 'bg-[#0b192c] text-slate-300 border-blue-900/60 hover:bg-[#152e55]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold truncate">{user.profile.fullName}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900/60 text-blue-200 shrink-0">
                        {user.assignments.role}
                      </span>
                    </div>
                    <div className="text-[10px] opacity-80">
                      {user.profile.rank} · Escopo:{' '}
                      <strong className="capitalize">{user.assignments.assignedProvinceId}</strong>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* CORPO PRINCIPAL SEPARADO POR ÁREA */}
        {activeArea === 'admin' && verifiedAdminSession ? (
          <div className="flex-1 min-h-0 my-2 flex flex-col overflow-hidden">
            <AdminShell
              currentUser={currentUser}
              selectedProvinceId={selectedProvinceId}
              activeSection={adminSection}
              apiActive={apiActive}
              verifiedSession={verifiedAdminSession}
              overview={adminOverview}
              overviewLoading={adminOverviewLoading}
              overviewError={adminOverviewError}
              onRefreshOverview={() => void loadAdminOverview()}
              onSelectSection={setAdminSection}
              onSelectProvince={(provId) => setSelectedProvinceId(provId)}
              onOpenProvisionamento={() => setActiveModal('provisionamento')}
              onExitAdmin={() => setActiveArea('operational')}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 my-2 flex flex-col lg:flex-row gap-3 overflow-hidden">
            {/* Sidebar Desktop Operacional */}
            <DesktopSidebar
              activeView={operationalView}
              onSelectHome={() => setOperationalView('home')}
              onSelectPrimary={handleSelectPrimary}
              onSelectSecondary={handleSelectSecondary}
            />

            {/* Área Central Operacional */}
            <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {isSecondaryView ? (
                <ModuleWorkspaceShell
                  moduleId={operationalView as SecondaryOperationalId}
                  currentUser={currentUser}
                  onBackHome={() => setOperationalView('home')}
                  onOpenConsultar={() => handleSelectPrimary('consulta')}
                  onOpenTransferFlow={() => setActiveModal('transferencias')}
                />
              ) : (
                <OperationalHome
                  selectedProvinceId={selectedProvinceId}
                  onSelectProvince={(provId) => setSelectedProvinceId(provId)}
                  userRole={currentUser.assignments.role}
                  userAssignedProvince={currentUser.assignments.assignedProvinceId}
                  onSelectPrimary={handleSelectPrimary}
                />
              )}
            </main>
          </div>
        )}

        {/* BARRA FIXA INFERIOR MOBILE (Exclusiva da Interface Operacional: 4 Principais + Mais) */}
        {activeArea === 'operational' && (
          <MobileBottomBar
            activePrimary={activeMobilePrimary}
            onSelectPrimary={handleSelectPrimary}
            onOpenMais={() => setActiveModal('mais_menu')}
          />
        )}
      </div>

      {/* MENU MAIS OPERACIONAL (+) */}
      {activeModal === 'mais_menu' && (
        <OperationalMoreMenu
          onSelectModule={handleSelectSecondary}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* MODAL 1: CONSULTA NACIONAL / ÍNDICE FEDERADO */}
      {activeModal === 'consultar' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <NationalInmateSearch
            currentUserRole={currentUser.assignments.role}
            currentUserProvince={currentUser.assignments.assignedProvinceId}
            apiActive={apiActive}
            onOpenInmateDossier={handleOpenInmateDossier}
            onRequestTransfer={handleRequestTransferFromSearch}
            onClose={() => {
              setActiveModal(null);
              if (operationalView === 'consulta') setOperationalView('home');
            }}
          />
        </div>
      )}

      {/* MODAL 2: ENTRADA-SAÍDA / TRANSFERÊNCIAS */}
      {(activeModal === 'entrada_saida' || activeModal === 'transferencias') && (
        <EntradaSaidaModal
          provinceId={selectedProvinceId}
          currentUser={currentUser}
          apiActive={apiActive}
          presetExitTransferInmate={transferTargetInmate}
          initialTab={activeModal === 'transferencias' ? 'transfers' : 'admissions'}
          onClose={() => {
            setTransferTargetInmate(null);
            setActiveModal(null);
            if (operationalView === 'entrada_saida') setOperationalView('home');
          }}
        />
      )}

      {/* MODAL 3: TRANSIÇÃO PENAL */}
      {activeModal === 'transicao' && (
        <TransicaoModal
          currentProvinceId={selectedProvinceId}
          currentUser={currentUser}
          apiActive={apiActive}
          onClose={() => {
            setActiveModal(null);
            if (operationalView === 'transicao') setOperationalView('home');
          }}
        />
      )}

      {/* MODAL 4: VISITANTES */}
      {activeModal === 'visitantes' && (
        <VisitantesModal
          currentUser={currentUser}
          provinceId={selectedProvinceId}
          apiActive={apiActive}
          onClose={() => {
            setActiveModal(null);
            if (operationalView === 'visitas') setOperationalView('home');
          }}
        />
      )}

      {/* MODAL 5: DOSSIÊ COMPLETO DO RECLUSO (FUR) */}
      {selectedInmateForDossier && (
        <InmateDossierModal
          inmate={selectedInmateForDossier}
          currentUser={currentUser}
          apiActive={apiActive}
          onInmateUpdated={(updated) => setSelectedInmateForDossier(updated)}
          onClose={() => setSelectedInmateForDossier(null)}
        />
      )}

      {/* MODAL 6: PROVISIONAMENTO ESTRUTURAL (Acesso exclusivo via Painel Administrativo) */}
      {activeModal === 'provisionamento' && verifiedAdminSession && (
        <ProvisionamentoModal
          currentUser={currentUser}
          apiActive={apiActive}
          onClose={() => {
            setActiveModal(null);
            if (activeArea === 'admin') {
              void loadAdminOverview();
            }
          }}
          presetProvinceId={selectedProvinceId}
        />
      )}

      {/* MODAL 7: PORTA DE ENTRADA ADMINISTRATIVA (Gmail Institucional + 2.ª Verificação Individual) */}
      {activeModal === 'admin_auth_gate' && (
        <AdminAuthGateModal
          firebaseUser={firebaseUser}
          onVerified={handleAdminSessionVerified}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
