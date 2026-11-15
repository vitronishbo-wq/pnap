/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, SlidersHorizontal, UserCheck, ArrowRightLeft, UserPlus, Users, Search, Plus, Building2, LogIn, LogOut } from 'lucide-react';
import { onAuthStateChanged, type User as FirebaseAuthUser } from 'firebase/auth';
import { ProvinceId, Inmate, NationalInmateIndexItem } from './types/pnap';
import { MOCK_USERS, INMATES_LOCAL_DB } from './data/mockPnapData';
import { pnapStore } from './services/pnapStore';
import { auth, signInWithGoogle, signOutFirebase, fetchAuthenticatedPnapUser } from './firebase';
import { AngolaMap } from './components/AngolaMap';
import { ProvincialSummaryCard } from './components/ProvincialSummaryCard';
import { NationalInmateSearch } from './components/NationalInmateSearch';
import { InmateDossierModal } from './components/InmateDossierModal';
import { EntradaSaidaModal } from './components/EntradaSaidaModal';
import { TransicaoModal } from './components/TransicaoModal';
import { VisitantesModal } from './components/VisitantesModal';
import { MaisModal } from './components/MaisModal';
import { ProvisionamentoModal } from './components/ProvisionamentoModal';

export default function App() {
  // Estado do utilizador ativo para demonstração de RBAC e competências
  const [currentUser, setCurrentUser] = useState(MOCK_USERS[0]); // Padrão: Director Geral (CENTRAL_ADMIN) para demonstrar autorização global e provisionamento
  const [selectedProvinceId, setSelectedProvinceId] = useState<ProvinceId>('huambo'); // Focado no Huambo conforme pedido
  
  // Modais e Telas Ativas
  const [activeModal, setActiveModal] = useState<'consultar' | 'entrada_saida' | 'transicao' | 'visitantes' | 'mais' | 'role_switcher' | 'provisionamento' | null>(null);
  const [selectedInmateForDossier, setSelectedInmateForDossier] = useState<Inmate | null>(null);
  const [transferTargetInmate, setTransferTargetInmate] = useState<NationalInmateIndexItem | null>(null);
  const [, setStoreTick] = useState(0);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseAuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    return pnapStore.subscribe(() => setStoreTick((t) => t + 1));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const officialUser = await fetchAuthenticatedPnapUser(user.uid);
          if (officialUser) {
            setCurrentUser(officialUser);
            if (
              officialUser.assignments.role !== 'CENTRAL_ADMIN' &&
              officialUser.assignments.assignedProvinceId !== 'all'
            ) {
              setSelectedProvinceId(officialUser.assignments.assignedProvinceId as ProvinceId);
            }
          }
        } catch {
          // Utilizador autenticado ainda sem registo em pnap_users ou erro registado via handleFirestoreError
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Alerta de feedback temporário para ações de segurança (nulo por defeito para manter ecrã principal 100% limpo)
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

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
      setBannerNotice('Sessão Firebase terminada.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRoleChange = (userId: string) => {
    const user = MOCK_USERS.find((u) => u.uid === userId);
    if (user) {
      setCurrentUser(user);
      if (user.assignments.role === 'PROVINCIAL_COMMAND') {
        setSelectedProvinceId('luanda');
        setBannerNotice('Perfil alterado para: Comando Provincial de Luanda. Registos de outras províncias bloqueados excepto busca federada.');
      } else if (user.assignments.role === 'CENTRAL_ADMIN') {
        setBannerNotice('Perfil alterado para: Direcção Geral PNAP (Acesso central irrestrito a todas as 21 províncias).');
      } else {
        setSelectedProvinceId('luanda');
        setBannerNotice(`Perfil alterado para: ${user.profile.rank}.`);
      }
      setActiveModal(null);
    }
  };

  const handleOpenInmateDossier = (inmateId: string) => {
    const found = INMATES_LOCAL_DB.find((inm) => inm.inmateId === inmateId);
    if (found) {
      // Verificar se utilizador tem permissão
      if (currentUser.assignments.role !== 'CENTRAL_ADMIN' && found.provinceId !== currentUser.assignments.assignedProvinceId) {
        setBannerNotice(`Jurisdição bloqueada: dossier confidencial pertence a ${found.provinceId.toUpperCase()}.`);
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

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans overflow-hidden p-0 sm:p-2 md:p-4 selection:bg-blue-600 selection:text-white">
      {/* Container Principal em Tela Única sem Scroll */}
      <div className="w-full h-full max-w-md sm:max-w-lg md:max-w-xl bg-slate-900 sm:rounded-[36px] border-0 sm:border border-slate-800 p-3 sm:p-4 flex flex-col justify-between overflow-hidden relative shadow-2xl">
        
        {/* TOPO ULTRA-SIMPLIFICADO (PNAP + Status Online + Alternância de Competência) */}
        <header className="flex items-center justify-between pb-2 border-b border-slate-800/80 shrink-0 px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-sm">
              <Shield className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-white leading-none">
                  PNAP
                </h1>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  ADMINISTRAÇÃO PRISIONAL
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Provisionamento Rápido Estrutural (Exclusivo para CENTRAL_ADMIN / Director Geral) */}
            {currentUser.assignments.role === 'CENTRAL_ADMIN' && (
              <button
                type="button"
                onClick={() => setActiveModal('provisionamento')}
                title="Provisionamento Estrutural de Estabelecimentos (Huambo / Nacional)"
                className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-sm"
              >
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xs:inline">Provisionamento</span>
              </button>
            )}

            {/* Status Online */}
            <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Online</span>
            </div>

            {/* Alternador de Competência / Nível */}
            <button
              type="button"
              onClick={() => setActiveModal(activeModal === 'role_switcher' ? null : 'role_switcher')}
              title="Alternar Nível de Acesso (RBAC)"
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition-all cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Feedback visual de isolamento / alteração de jurisdição */}
        {bannerNotice && (
          <div className="bg-blue-950/90 border border-blue-600/60 text-blue-200 px-3 py-1.5 rounded-xl text-[11px] flex items-center justify-between mt-1 shrink-0">
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

        {/* Modal Flutuante de Alternância de Competência */}
        {activeModal === 'role_switcher' && (
          <div className="absolute top-12 left-3 right-3 z-40 p-3 bg-[#10233f] border-2 border-blue-600/80 rounded-2xl shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-2 border-b border-blue-800 pb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                Matriz de Níveis e Competências
              </span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-white text-xs bg-slate-800 px-2 py-0.5 rounded-md"
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
                  {firebaseUser ? (firebaseUser.email || firebaseUser.uid) : 'Não autenticado'}
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

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
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
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{user.profile.fullName}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-900/60 text-blue-200">
                        {user.assignments.role}
                      </span>
                    </div>
                    <div className="text-[10px] opacity-80">
                      {user.profile.rank} · Escopo: <strong className="capitalize">{user.assignments.assignedProvinceId}</strong>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* CENTRO: MAPA VETORIAL RDPA 2024 EM TELA ÚNICA */}
        <div className="flex-1 min-h-0 w-full my-2 flex flex-col justify-center overflow-hidden">
          <AngolaMap
            selectedProvinceId={selectedProvinceId}
            onSelectProvince={(provId) => setSelectedProvinceId(provId)}
            userRole={currentUser.assignments.role}
            userAssignedProvince={currentUser.assignments.assignedProvinceId}
          />
        </div>

        {/* BASE FIXA: OS 5 BOTÕES OPERACIONAIS RÁPIDOS */}
        <nav className="shrink-0 bg-[#0b192c] rounded-2xl border border-blue-900/60 p-1.5 shadow-2xl flex items-center justify-around z-30">
          {/* 1. Entrada/Saída */}
          <button
            type="button"
            onClick={() => {
              setTransferTargetInmate(null);
              setActiveModal('entrada_saida');
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer ${
              activeModal === 'entrada_saida' ? 'text-blue-400 scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-[9px] md:text-[10px] font-medium leading-none">Entrada/Saída</span>
          </button>

          {/* 2. Transição */}
          <button
            type="button"
            onClick={() => {
              setTransferTargetInmate(null);
              setActiveModal('transicao');
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer ${
              activeModal === 'transicao' ? 'text-purple-400 scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-[9px] md:text-[10px] font-medium leading-none">Transição</span>
          </button>

          {/* 3. Visitantes */}
          <button
            type="button"
            onClick={() => setActiveModal('visitantes')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer ${
              activeModal === 'visitantes' ? 'text-emerald-400 scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-[9px] md:text-[10px] font-medium leading-none">Visitantes</span>
          </button>

          {/* 4. Consultar (Busca de Reclusos e Dossiês) */}
          <button
            type="button"
            onClick={() => setActiveModal('consultar')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all cursor-pointer ${
              activeModal === 'consultar' ? 'text-blue-400 scale-105' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-[9px] md:text-[10px] font-medium leading-none">Consultar</span>
          </button>

          {/* 5. Mais */}
          <button
            type="button"
            onClick={() => setActiveModal('mais')}
            className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group py-0.5"
          >
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow group-hover:scale-105 transition-all">
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-[9px] md:text-[10px] text-slate-400 group-hover:text-white font-medium leading-none">
              Mais
            </span>
          </button>
        </nav>
      </div>

      {/* MODAL 1: CONSULTA NACIONAL / ÍNDICE FEDERADO */}
      {activeModal === 'consultar' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <NationalInmateSearch
            currentUserRole={currentUser.assignments.role}
            currentUserProvince={currentUser.assignments.assignedProvinceId}
            onOpenInmateDossier={handleOpenInmateDossier}
            onRequestTransfer={handleRequestTransferFromSearch}
            onClose={() => setActiveModal(null)}
          />
        </div>
      )}

      {/* MODAL 2: ENTRADA / SAÍDA */}
      {activeModal === 'entrada_saida' && (
        <EntradaSaidaModal
          provinceId={selectedProvinceId}
          currentUser={currentUser}
          presetExitTransferInmate={transferTargetInmate}
          onClose={() => {
            setTransferTargetInmate(null);
            setActiveModal(null);
          }}
        />
      )}

      {/* MODAL 3: TRANSIÇÃO (EXCLUSIVO DETIDO -> CONDENADO) */}
      {activeModal === 'transicao' && (
        <TransicaoModal
          currentProvinceId={selectedProvinceId}
          currentUser={currentUser}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* MODAL 4: VISITANTES */}
      {activeModal === 'visitantes' && (
        <VisitantesModal onClose={() => setActiveModal(null)} />
      )}

      {/* MODAL 5: MAIS / SISTEMA & AUDITORIA */}
      {activeModal === 'mais' && (
        <MaisModal
          onClose={() => setActiveModal(null)}
          currentUserRole={currentUser.assignments.role}
          onOpenProvisionamento={() => setActiveModal('provisionamento')}
        />
      )}

      {/* MODAL 6: DOSSIER COMPLETO DO RECLUSO */}
      {selectedInmateForDossier && (
        <InmateDossierModal
          inmate={selectedInmateForDossier}
          onClose={() => setSelectedInmateForDossier(null)}
        />
      )}

      {/* MODAL 7: PROVISIONAMENTO ESTRUTURAL EM DUAS FASES (HUAMBO / NACIONAL) */}
      {activeModal === 'provisionamento' && (
        <ProvisionamentoModal
          currentUser={currentUser}
          onClose={() => setActiveModal(null)}
          presetProvinceId={selectedProvinceId}
        />
      )}
    </div>
  );
}
