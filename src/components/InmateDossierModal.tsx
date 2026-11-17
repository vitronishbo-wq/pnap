import React, { useState, useEffect } from 'react';
import type {
  HealthRecord,
  Inmate,
  InmateIncident,
  JudicialProcess,
  MovementRecord,
  MovementType,
  PnapUser
} from '../types/pnap';
import { pnapStore } from '../services/pnapStore';
import {
  ApiClientError,
  addJudicialProcessViaApi,
  extinguishJudicialProcessViaApi,
  fetchHealthRecordsViaApi,
  fetchInmateMovementsViaApi,
  fetchInmateProcessesViaApi,
  fetchProvinceInmatesViaApi,
  recordClinicalEvaluationViaApi,
  registerIncidentViaApi,
  registerMovementViaApi,
  updateRehabilitationViaApi
} from '../services/apiClient';
import {
  X,
  User,
  Scale,
  HeartPulse,
  GraduationCap,
  AlertOctagon,
  FileCheck,
  MapPin,
  Download,
  BadgeCheck,
  Lock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowRightLeft
} from 'lucide-react';

interface InmateDossierModalProps {
  inmate: Inmate;
  currentUser: PnapUser;
  apiActive?: boolean;
  onInmateUpdated?: (updated: Inmate) => void;
  onClose: () => void;
}

export const InmateDossierModal: React.FC<InmateDossierModalProps> = ({
  inmate: initialInmate,
  currentUser,
  apiActive = false,
  onInmateUpdated,
  onClose
}) => {
  const [inmate, setInmate] = useState<Inmate>(initialInmate);
  const [activeTab, setActiveTab] = useState<
    'profile' | 'legal' | 'health' | 'rehabilitation' | 'disciplinary' | 'post' | 'documents'
  >('profile');
  const [busy, setBusy] = useState(false);
  const [conflictRefreshNeeded, setConflictRefreshNeeded] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Dados setoriais carregados via API
  const [processes, setProcesses] = useState<JudicialProcess[]>([]);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [clinicalDenied, setClinicalDenied] = useState(false);
  const [movements, setMovements] = useState<MovementRecord[]>([]);

  // Form novo processo
  const [showAddProcess, setShowAddProcess] = useState(false);
  const [procNumber, setProcNumber] = useState('');
  const [procCourt, setProcCourt] = useState('');
  const [procCrime, setProcCrime] = useState('');

  // Form triagem clínica (exclusivo HEALTH_SPECIALIST)
  const [clinDiagnosis, setClinDiagnosis] = useState('');
  const [clinOutcome, setClinOutcome] = useState<HealthRecord['triageOutcome']>('APTO_COMUM');
  const [clinInfectious, setClinInfectious] = useState(false);
  const [clinSuicide, setClinSuicide] = useState(false);
  const [clinAllergies, setClinAllergies] = useState('');
  const [clinDiet, setClinDiet] = useState('');

  // Form reabilitação + cela
  const [rehabRisk, setRehabRisk] = useState<NonNullable<Inmate['rehabilitation']['riskLevel']>>(
    initialInmate.rehabilitation.riskLevel || 'MEDIO'
  );
  const [rehabConduct, setRehabConduct] = useState(initialInmate.rehabilitation.conductClassification);
  const [rehabJob, setRehabJob] = useState(initialInmate.rehabilitation.jobAssignment || '');
  const [rehabTargetCell, setRehabTargetCell] = useState('');
  const [rehabOverride, setRehabOverride] = useState(false);

  // Form movimentação temporária
  const [movType, setMovType] = useState<
    Extract<MovementType, 'SAIDA_DILIGENCIA' | 'RETORNO_DILIGENCIA' | 'HOSPITALIZACAO_EXTERNA' | 'RETORNO_HOSPITAL'>
  >('SAIDA_DILIGENCIA');
  const [movDoc, setMovDoc] = useState('');
  const [movEscort, setMovEscort] = useState('');

  // Form incidente disciplinar
  const [incType, setIncType] = useState<InmateIncident['type']>('DESOBEDIENCIA');
  const [incSeverity, setIncSeverity] = useState<InmateIncident['severity']>('MEDIA');
  const [incDesc, setIncDesc] = useState('');
  const [incActions, setIncActions] = useState('');
  const [incSanction, setIncSanction] = useState('');
  const [incBlockVisitsUntil, setIncBlockVisitsUntil] = useState('');

  useEffect(() => {
    setInmate(initialInmate);
    setRehabRisk(initialInmate.rehabilitation.riskLevel || 'MEDIO');
    setRehabConduct(initialInmate.rehabilitation.conductClassification);
    setRehabJob(initialInmate.rehabilitation.jobAssignment || '');
  }, [initialInmate]);

  const role = currentUser.assignments.role;
  const isHealthSpecialist = role === 'HEALTH_SPECIALIST';
  const canPenalControl = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR',
    'PENAL_CONTROL',
    'OPERATIONAL_OFFICER'
  ].includes(role);
  const canRehab = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR',
    'REHABILITATION'
  ].includes(role);
  const canMovePhysical = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR',
    'PENAL_CONTROL',
    'GATE_SECURITY',
    'OPERATIONAL_OFFICER'
  ].includes(role);
  const canOverrideSecurity = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR'
  ].includes(role);

  const syncUpdatedInmate = (updated: Inmate) => {
    setInmate(updated);
    pnapStore.upsertLiveInmate(updated);
    if (onInmateUpdated) onInmateUpdated(updated);
  };

  const handleReloadInmate = async () => {
    if (!apiActive) return;
    setBusy(true);
    try {
      const res = await fetchProvinceInmatesViaApi(inmate.provinceId);
      pnapStore.syncLiveInmates(inmate.provinceId, res.inmates);
      const latest = res.inmates.find((i) => i.inmateId === inmate.inmateId);
      if (latest) syncUpdatedInmate(latest);
      setConflictRefreshNeeded(false);
      setFeedback({ type: 'ok', text: 'Ficha Única recarregada com a última versão do servidor.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao recarregar FUR.' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!apiActive) return;
    if (activeTab === 'legal' && !isHealthSpecialist) {
      fetchInmateProcessesViaApi(inmate.inmateId)
        .then((res) => setProcesses(res.processes))
        .catch(() => {});
    } else if (activeTab === 'health') {
      if (!isHealthSpecialist) {
        setClinicalDenied(true);
        setHealthRecords([]);
      } else {
        fetchHealthRecordsViaApi(inmate.inmateId)
          .then((res) => {
            setClinicalDenied(false);
            setHealthRecords(res.records);
          })
          .catch((err) => {
            if (err instanceof ApiClientError && err.status === 403) {
              setClinicalDenied(true);
            }
          });
      }
    } else if (activeTab === 'rehabilitation' && !isHealthSpecialist) {
      fetchInmateMovementsViaApi(inmate.inmateId)
        .then((res) => setMovements(res.movements))
        .catch(() => {});
    }
  }, [activeTab, apiActive, inmate.inmateId, isHealthSpecialist]);

  const handleError = (err: unknown, fallback: string) => {
    if (err instanceof ApiClientError && err.code === 'VERSION_CONFLICT') {
      setConflictRefreshNeeded(true);
    }
    setFeedback({ type: 'err', text: err instanceof Error ? err.message : fallback });
  };

  const handleAddProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiActive || !procNumber.trim() || !procCourt.trim() || !procCrime.trim()) return;
    setBusy(true);
    setConflictRefreshNeeded(false);
    try {
      const res = await addJudicialProcessViaApi(inmate.inmateId, {
        processNumber: procNumber.trim(),
        courtName: procCourt.trim(),
        crimeCategory: procCrime.trim(),
        legalStatus: 'PREVENTIVO',
        expectedVersion: inmate.version
      });
      syncUpdatedInmate(res.inmate);
      setProcesses((prev) => [res.process, ...prev]);
      setProcNumber('');
      setProcCourt('');
      setProcCrime('');
      setShowAddProcess(false);
      setFeedback({ type: 'ok', text: `Processo ${res.process.processNumber} vinculado à FUR.` });
    } catch (err) {
      handleError(err, 'Erro ao vincular processo judicial.');
    } finally {
      setBusy(false);
    }
  };

  const handleExtinguishProcess = async (processId: string) => {
    if (!apiActive) return;
    setBusy(true);
    setConflictRefreshNeeded(false);
    try {
      const res = await extinguishJudicialProcessViaApi(inmate.inmateId, processId, {
        extintionReason: 'Extinção por decisão judicial / cumprimento',
        expectedVersion: inmate.version
      });
      syncUpdatedInmate(res.inmate);
      setProcesses((prev) => prev.map((p) => (p.processId === processId ? res.process : p)));
      setFeedback({ type: 'ok', text: `Processo ${res.process.processNumber} extinto.` });
    } catch (err) {
      handleError(err, 'Erro ao extinguir processo.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveClinical = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiActive || !clinDiagnosis.trim()) return;
    setBusy(true);
    setConflictRefreshNeeded(false);
    try {
      const res = await recordClinicalEvaluationViaApi(inmate.inmateId, {
        clinicalDiagnosis: clinDiagnosis.trim(),
        triageOutcome: clinOutcome,
        infectiousRisk: clinInfectious,
        suicideRisk: clinSuicide,
        allergyFlags: clinAllergies.split(',').map((s) => s.trim()).filter(Boolean),
        dietFlags: clinDiet.split(',').map((s) => s.trim()).filter(Boolean),
        expectedVersion: inmate.version
      });
      setHealthRecords((prev) => [res.record, ...prev]);
      syncUpdatedInmate({
        ...inmate,
        healthAlerts: res.healthAlerts,
        version: res.version
      });
      setClinDiagnosis('');
      setFeedback({ type: 'ok', text: 'Triagem clínica registada em subcoleção isolada.' });
    } catch (err) {
      handleError(err, 'Erro ao registar avaliação clínica.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRehab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiActive) {
      syncUpdatedInmate({
        ...inmate,
        rehabilitation: {
          ...inmate.rehabilitation,
          riskLevel: rehabRisk,
          conductClassification: rehabConduct,
          jobAssignment: rehabJob.trim()
        }
      });
      setFeedback({ type: 'ok', text: 'Classificação atualizada localmente.' });
      return;
    }
    setBusy(true);
    setConflictRefreshNeeded(false);
    try {
      const res = await updateRehabilitationViaApi(inmate.inmateId, {
        riskLevel: rehabRisk,
        conductClassification: rehabConduct,
        jobAssignment: rehabJob.trim(),
        ...(rehabTargetCell.trim() ? { targetCellId: rehabTargetCell.trim() } : {}),
        securityOverride: rehabOverride,
        expectedVersion: inmate.version
      });
      syncUpdatedInmate(res.inmate);
      setRehabTargetCell('');
      setFeedback({ type: 'ok', text: 'Reabilitação e classificação atualizadas.' });
    } catch (err) {
      handleError(err, 'Erro ao atualizar reabilitação.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiActive || !movDoc.trim() || !movEscort.trim()) return;
    setBusy(true);
    setConflictRefreshNeeded(false);
    try {
      const res = await registerMovementViaApi(inmate.inmateId, {
        type: movType,
        documentNumber: movDoc.trim(),
        authorityOrEscort: movEscort.trim(),
        expectedVersion: inmate.version
      });
      syncUpdatedInmate(res.inmate);
      setMovements((prev) => [res.movement, ...prev]);
      setMovDoc('');
      setMovEscort('');
      setFeedback({
        type: 'ok',
        text: `Movimentação [${movType}] registada · Custódia: ${res.inmate.custodyState}.`
      });
    } catch (err) {
      handleError(err, 'Erro ao registar movimentação.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incDesc.trim() || !incActions.trim()) return;
    if (!apiActive) {
      setFeedback({ type: 'err', text: 'Conecte-se à API oficial para registar sanções disciplinares.' });
      return;
    }
    setBusy(true);
    setConflictRefreshNeeded(false);
    try {
      const res = await registerIncidentViaApi(inmate.inmateId, {
        type: incType,
        severity: incSeverity,
        description: incDesc.trim(),
        actionsTaken: incActions.trim(),
        sanctionMeasure: incSanction.trim() || undefined,
        visitsBlockedUntil: incBlockVisitsUntil.trim() || undefined,
        meritPenaltyPoints: incSeverity === 'CRITICA' ? 20 : incSeverity === 'ALTA' ? 10 : 5,
        expectedVersion: inmate.version
      });
      syncUpdatedInmate(res.inmate);
      setIncDesc('');
      setIncActions('');
      setIncSanction('');
      setIncBlockVisitsUntil('');
      setFeedback({ type: 'ok', text: 'Ocorrência e sanção registadas na Ficha Única.' });
    } catch (err) {
      handleError(err, 'Erro ao registar ocorrência disciplinar.');
    } finally {
      setBusy(false);
    }
  };

  const custodyBadge = inmate.custodyState || inmate.currentStatus;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0b192c] text-white w-full max-w-4xl rounded-3xl shadow-2xl border border-blue-900/60 overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-[#10233f] to-[#152e55] p-4 sm:p-5 border-b border-blue-800/60 flex items-start justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={inmate.profile.photoUrl}
              alt={inmate.profile.fullName}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-blue-400 shadow-md shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs bg-blue-600 text-white font-mono px-2 py-0.5 rounded-md font-bold">
                  {inmate.profile.matricula}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    custodyBadge === 'ATIVO_NA_UNIDADE' || custodyBadge === 'ATIVO'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                      : custodyBadge === 'EVADIDO'
                      ? 'bg-rose-950 text-rose-300 border-rose-700'
                      : 'bg-purple-950 text-purple-300 border-purple-700'
                  }`}
                >
                  {custodyBadge}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    inmate.legal.legalStatus === 'CONDENADO'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-amber-950 text-amber-300 border border-amber-700'
                  }`}
                >
                  {inmate.legal.legalStatus}
                </span>
                <span className="text-[10px] text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 font-mono">
                  v{inmate.version || 1}
                </span>
                <span className="text-[10px] text-blue-300 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                  {inmate.provinceId.toUpperCase()}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-1 truncate">
                {inmate.profile.fullName}
              </h2>
              {inmate.profile.alias && (
                <p className="text-xs text-amber-400">Alcunha: &quot;{inmate.profile.alias}&quot;</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-400 hover:text-white bg-slate-800/60 p-2 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1 overflow-x-auto bg-[#081220] p-2 border-b border-blue-900/60 text-xs shrink-0">
          {[
            { id: 'profile', label: '1. Perfil', icon: User },
            { id: 'legal', label: '2. Jurídico', icon: Scale },
            { id: 'health', label: '3. Saúde', icon: HeartPulse },
            { id: 'rehabilitation', label: '4. Reabilitação & Mov.', icon: GraduationCap },
            { id: 'disciplinary', label: '5. Disciplinar', icon: AlertOctagon },
            { id: 'post', label: '6. Pós-Institucional', icon: BadgeCheck },
            { id: 'documents', label: '7. Documentos', icon: FileCheck }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setActiveTab(tab.id as typeof activeTab);
                }}
                className={`px-3 py-2 rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-all font-medium cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback & Conflito de Versão */}
        {feedback && (
          <div
            className={`mx-4 mt-3 px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 shrink-0 border ${
              feedback.type === 'ok'
                ? 'bg-emerald-950/80 border-emerald-600/50 text-emerald-200'
                : 'bg-rose-950/80 border-rose-600/50 text-rose-200'
            }`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              {feedback.type === 'ok' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="break-words">{feedback.text}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {conflictRefreshNeeded && apiActive && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleReloadInmate}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Recarregar</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-slate-300 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Conteúdo */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* TAB 1: PERFIL */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" /> Dados Pessoais & Família
                </h3>
                <div>
                  <span className="text-slate-400">BI Nacional: </span>
                  <strong className="text-white font-mono">{inmate.profile.biNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Data de Nascimento: </span>
                  <strong className="text-white">{inmate.profile.dateOfBirth}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Filiação: </span>
                  <strong className="text-white">
                    {inmate.profile.fatherName} / {inmate.profile.motherName}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Residência / Bairro: </span>
                  <strong className="text-white">{inmate.profile.neighborhood}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Contacto de Emergência: </span>
                  <strong className="text-amber-300 font-mono">
                    {inmate.profile.emergencyContact.name} ({inmate.profile.emergencyContact.phone})
                  </strong>
                </div>
              </div>

              <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Localização Interna na Comarca
                </h3>
                <div>
                  <span className="text-slate-400">Estabelecimento: </span>
                  <strong className="text-white">{inmate.establishmentId}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Pavilhão / Bloco / Cela: </span>
                  <strong className="text-emerald-400 font-semibold">
                    {inmate.pavilionId} · {inmate.blockId} · {inmate.cellId}
                  </strong>
                </div>
                <div className="pt-2 border-t border-blue-900/40">
                  <span className="text-slate-400">Admissão: </span>
                  <strong className="text-white">{inmate.admission.admissionDate}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Mandado N.º: </span>
                  <strong className="text-white font-mono">{inmate.admission.mandateNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Oficial de Recepção: </span>
                  <strong className="text-white">{inmate.admission.intakeOfficer}</strong>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: JURÍDICO & PROCESSOS MÚLTIPLOS */}
          {activeTab === 'legal' && (
            <div className="space-y-4">
              <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Scale className="w-4 h-4 text-amber-400" /> Situação Processual Consolidada
                  </h3>
                  {canPenalControl && apiActive && (
                    <button
                      type="button"
                      onClick={() => setShowAddProcess((v) => !v)}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Novo Processo</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400">Tipologia Principal:</span>
                    <p className="font-semibold text-white mt-0.5">
                      {inmate.legal.crimeCategory} ({inmate.legal.penalCodeArticle})
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Processo / Tribunal Base:</span>
                    <p className="font-semibold text-white mt-0.5">
                      {inmate.admission.processNumber} · {inmate.admission.courtName}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-blue-900/50 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[10px]">Tempo Cumprido</span>
                    <strong className="text-white">{inmate.legal.timeServedMonths} Meses</strong>
                  </div>
                  <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[10px]">Total da Pena</span>
                    <strong className="text-emerald-400">
                      {inmate.legal.totalSentenceYears}a ({inmate.legal.totalSentenceMonths}m)
                    </strong>
                  </div>
                  <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[10px]">Condicional Apta</span>
                    <strong className="text-amber-300">{inmate.legal.eligibleParoleDate || '—'}</strong>
                  </div>
                  <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[10px]">Termo da Pena</span>
                    <strong className="text-white">{inmate.legal.endOfSentenceDate || '—'}</strong>
                  </div>
                </div>
              </div>

              {showAddProcess && apiActive && (
                <form
                  onSubmit={handleAddProcess}
                  className="bg-[#10233f] p-4 rounded-2xl border border-blue-700/60 space-y-2.5"
                >
                  <div className="font-bold text-blue-300">Vincular Processo Adicional à FUR</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={procNumber}
                      onChange={(e) => setProcNumber(e.target.value)}
                      placeholder="N.º Processo *"
                      className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white font-mono"
                      required
                    />
                    <input
                      type="text"
                      value={procCourt}
                      onChange={(e) => setProcCourt(e.target.value)}
                      placeholder="Tribunal *"
                      className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                      required
                    />
                    <input
                      type="text"
                      value={procCrime}
                      onChange={(e) => setProcCrime(e.target.value)}
                      placeholder="Tipologia de Crime *"
                      className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddProcess(false)}
                      className="bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-1.5 rounded-xl cursor-pointer"
                    >
                      Vincular Processo
                    </button>
                  </div>
                </form>
              )}

              {processes.length > 0 && (
                <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50 space-y-2">
                  <div className="font-bold text-slate-300">
                    Processos Vinculados ({processes.filter((p) => p.isActive).length} ativos)
                  </div>
                  {processes.map((proc) => (
                    <div
                      key={proc.processId}
                      className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/50 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-white font-mono">
                          {proc.processNumber} ·{' '}
                          <span className={proc.isActive ? 'text-amber-300' : 'text-slate-400'}>
                            {proc.legalStatus}
                          </span>
                        </div>
                        <div className="text-slate-400">
                          {proc.crimeCategory} · {proc.courtName}
                        </div>
                      </div>
                      {proc.isActive && canPenalControl && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleExtinguishProcess(proc.processId)}
                          className="bg-slate-800 hover:bg-emerald-700 text-slate-200 hover:text-white px-2.5 py-1 rounded-lg font-semibold cursor-pointer shrink-0"
                        >
                          Extinguir
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SAÚDE & SIGILO CLÍNICO */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              {/* Projeção operacional não-clínica visível para segurança/alojamento */}
              <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-rose-400" />
                  Sinalizadores Operacionais de Custódia (Não-Clínicos)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[10px]">Grupo Sanguíneo</span>
                    <strong className="text-rose-400">{inmate.health.bloodType}</strong>
                  </div>
                  <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[10px]">Risco Infeccioso</span>
                    <strong className={inmate.healthAlerts?.infectiousRisk ? 'text-rose-400' : 'text-emerald-400'}>
                      {inmate.healthAlerts?.infectiousRisk ? 'ISOLAMENTO' : 'Normal'}
                    </strong>
                  </div>
                  <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[10px]">Alergias Críticas</span>
                    <strong className="text-amber-300">
                      {(inmate.healthAlerts?.allergyFlags || inmate.health.allergies).join(', ') || 'Nenhuma'}
                    </strong>
                  </div>
                  <div className="bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[10px]">Dieta / Regime</span>
                    <strong className="text-white">
                      {(inmate.healthAlerts?.dietFlags || []).join(', ') || inmate.health.dietaryRestrictions}
                    </strong>
                  </div>
                </div>
              </div>

              {!isHealthSpecialist || clinicalDenied ? (
                <div className="bg-[#10233f] p-5 rounded-2xl border border-amber-700/50 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-300 text-sm">
                      Sigilo Clínico Ativo (Acesso Exclusivo HEALTH_SPECIALIST)
                    </div>
                    <p className="text-slate-300 mt-1">
                      Diagnósticos médicos, patologias crónicas, medicação e notas psiquiátricas permanecem isolados na subcoleção clínica e bloqueados para o perfil{' '}
                      <strong className="text-white">{role}</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {apiActive && (
                    <form
                      onSubmit={handleSaveClinical}
                      className="bg-[#10233f] p-4 rounded-2xl border border-rose-800/40 space-y-2.5"
                    >
                      <div className="font-bold text-rose-300">Nova Triagem / Avaliação Clínica</div>
                      <input
                        type="text"
                        value={clinDiagnosis}
                        onChange={(e) => setClinDiagnosis(e.target.value)}
                        placeholder="Diagnóstico / Avaliação Clínica *"
                        className="w-full bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                        required
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          value={clinOutcome}
                          onChange={(e) => setClinOutcome(e.target.value as HealthRecord['triageOutcome'])}
                          className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="APTO_COMUM">Apto Alojamento Comum</option>
                          <option value="ISOLAMENTO_SANITARIO">Isolamento Sanitário</option>
                          <option value="ENFERMARIA">Enfermaria</option>
                          <option value="HOSPITAL_EXTERNO">Hospital Externo</option>
                        </select>
                        <input
                          type="text"
                          value={clinAllergies}
                          onChange={(e) => setClinAllergies(e.target.value)}
                          placeholder="Alergias (vírgula)"
                          className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                        />
                        <input
                          type="text"
                          value={clinDiet}
                          onChange={(e) => setClinDiet(e.target.value)}
                          placeholder="Dieta especial (vírgula)"
                          className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                            <input
                              type="checkbox"
                              checked={clinInfectious}
                              onChange={(e) => setClinInfectious(e.target.checked)}
                            />
                            <span>Risco Infeccioso</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                            <input
                              type="checkbox"
                              checked={clinSuicide}
                              onChange={(e) => setClinSuicide(e.target.checked)}
                            />
                            <span>Vigilância Psicológica</span>
                          </label>
                        </div>
                        <button
                          type="submit"
                          disabled={busy}
                          className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-1.5 rounded-xl cursor-pointer"
                        >
                          Gravar Prontuário
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50 space-y-2">
                    <div className="font-bold text-slate-200">
                      Prontuário Clínico Isolado ({healthRecords.length})
                    </div>
                    {healthRecords.length === 0 ? (
                      <div className="text-slate-400">
                        Doenças crónicas: {inmate.health.chronicDiseases.join(', ') || 'Nenhuma'} ·{' '}
                        Medicação: {inmate.health.dailyMedication.join(', ') || 'Nenhuma'} ·{' '}
                        Saúde mental: {inmate.health.mentalHealthStatus}
                      </div>
                    ) : (
                      healthRecords.map((hr) => (
                        <div
                          key={hr.recordId}
                          className="bg-[#0b192c] p-3 rounded-xl border border-rose-900/40"
                        >
                          <div className="flex justify-between text-slate-400">
                            <strong className="text-white">{hr.clinicalDiagnosis}</strong>
                            <span>{hr.triageOutcome}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {hr.recordedByName} · {hr.recordedAt}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: REABILITAÇÃO & MOVIMENTAÇÕES TEMPORÁRIAS */}
          {activeTab === 'rehabilitation' && (
            <div className="space-y-4">
              <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  Classificação Criminológica, Reinserção & Alojamento
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400">Ofício / Trabalho: </span>
                    <strong className="text-white">
                      {inmate.rehabilitation.jobAssignment || 'Sem atribuição'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Conduta & Mérito: </span>
                    <strong className="text-blue-300">
                      {inmate.rehabilitation.conductClassification} ({inmate.rehabilitation.meritPoints} pts) · Risco{' '}
                      {inmate.rehabilitation.riskLevel || 'MEDIO'}
                    </strong>
                  </div>
                </div>

                {canRehab && (
                  <form onSubmit={handleSaveRehab} className="pt-3 border-t border-blue-900/50 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <select
                        value={rehabRisk}
                        onChange={(e) =>
                          setRehabRisk(e.target.value as NonNullable<Inmate['rehabilitation']['riskLevel']>)
                        }
                        className="bg-[#0b192c] border border-blue-800 rounded-xl px-2.5 py-2 text-white"
                      >
                        <option value="BAIXO">Risco BAIXO</option>
                        <option value="MEDIO">Risco MEDIO</option>
                        <option value="ALTO">Risco ALTO</option>
                        <option value="MAXIMO">Risco MAXIMO</option>
                      </select>
                      <select
                        value={rehabConduct}
                        onChange={(e) =>
                          setRehabConduct(e.target.value as Inmate['rehabilitation']['conductClassification'])
                        }
                        className="bg-[#0b192c] border border-blue-800 rounded-xl px-2.5 py-2 text-white"
                      >
                        <option value="EXEMPLAR">Conduta EXEMPLAR</option>
                        <option value="BOM">Conduta BOM</option>
                        <option value="REGULAR">Conduta REGULAR</option>
                        <option value="MAU">Conduta MAU</option>
                      </select>
                      <input
                        type="text"
                        value={rehabJob}
                        onChange={(e) => setRehabJob(e.target.value)}
                        placeholder="Ofício / Trabalho"
                        className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                      />
                      <input
                        type="text"
                        value={rehabTargetCell}
                        onChange={(e) => setRehabTargetCell(e.target.value)}
                        placeholder="Nova Cela (opcional)"
                        className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {canOverrideSecurity && (
                        <label className="flex items-center gap-1.5 text-amber-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rehabOverride}
                            onChange={(e) => setRehabOverride(e.target.checked)}
                          />
                          <span>Autorização excecional de Direção para compatibilidade de cela</span>
                        </label>
                      )}
                      <button
                        type="submit"
                        disabled={busy}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 rounded-xl cursor-pointer ml-auto"
                      >
                        Atualizar Classificação
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {canMovePhysical && apiActive && (
                <div className="bg-[#10233f] p-4 rounded-2xl border border-purple-900/40 space-y-2.5">
                  <div className="font-bold text-purple-300 flex items-center gap-1.5">
                    <ArrowRightLeft className="w-4 h-4" /> Movimentação Temporária (Diligência / Hospital)
                  </div>
                  <form onSubmit={handleRegisterMovement} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <select
                      value={movType}
                      onChange={(e) => setMovType(e.target.value as typeof movType)}
                      className="bg-[#0b192c] border border-blue-800 rounded-xl px-2.5 py-2 text-white"
                    >
                      <option value="SAIDA_DILIGENCIA">Saída p/ Diligência</option>
                      <option value="RETORNO_DILIGENCIA">Retorno de Diligência</option>
                      <option value="HOSPITALIZACAO_EXTERNA">Hospitalização Externa</option>
                      <option value="RETORNO_HOSPITAL">Retorno Hospitalar</option>
                    </select>
                    <input
                      type="text"
                      value={movDoc}
                      onChange={(e) => setMovDoc(e.target.value)}
                      placeholder="N.º Ofício / Guia *"
                      className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white font-mono"
                      required
                    />
                    <input
                      type="text"
                      value={movEscort}
                      onChange={(e) => setMovEscort(e.target.value)}
                      placeholder="Escolta / Destino *"
                      className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                      required
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-2 rounded-xl cursor-pointer"
                    >
                      Registar
                    </button>
                  </form>

                  {movements.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      {movements.slice(0, 5).map((m) => (
                        <div
                          key={m.movementId}
                          className="bg-[#0b192c] px-3 py-2 rounded-xl border border-blue-900/40 flex justify-between"
                        >
                          <span>
                            <strong className="text-purple-300">{m.type}</strong> · {m.documentNumber} ({m.authorityOrEscort})
                          </span>
                          <span className="text-slate-400 font-mono">{m.timestamp.split('T')[0]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DISCIPLINAR & BLOQUEIO DE VISITAS */}
          {activeTab === 'disciplinary' && (
            <div className="space-y-4">
              <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-amber-400" />
                    Registo Disciplinar ({inmate.disciplinary.infractionsCount} infrações)
                  </h3>
                  {inmate.disciplinary.visitsBlockedUntil && (
                    <span className="text-[11px] bg-rose-950 text-rose-300 border border-rose-700 px-2.5 py-1 rounded-full font-bold">
                      Visitas bloqueadas até {inmate.disciplinary.visitsBlockedUntil}
                    </span>
                  )}
                </div>

                {canPenalControl && apiActive && (
                  <form
                    onSubmit={handleRegisterIncident}
                    className="mb-4 p-3 rounded-xl bg-[#0b192c] border border-amber-800/40 space-y-2"
                  >
                    <div className="font-bold text-amber-300">Registar Ocorrência & Sanção</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={incType}
                        onChange={(e) => setIncType(e.target.value as InmateIncident['type'])}
                        className="bg-[#10233f] border border-blue-800 rounded-xl px-2.5 py-2 text-white"
                      >
                        <option value="DESOBEDIENCIA">Desobediência</option>
                        <option value="AGRESSAO">Agressão</option>
                        <option value="POSSE_ILICITA">Posse Ilícita</option>
                        <option value="TENTATIVA_FUGA">Tentativa de Fuga</option>
                        <option value="OUTRO">Outro</option>
                      </select>
                      <select
                        value={incSeverity}
                        onChange={(e) => setIncSeverity(e.target.value as InmateIncident['severity'])}
                        className="bg-[#10233f] border border-blue-800 rounded-xl px-2.5 py-2 text-white"
                      >
                        <option value="BAIXA">Gravidade BAIXA</option>
                        <option value="MEDIA">Gravidade MEDIA</option>
                        <option value="ALTA">Gravidade ALTA</option>
                        <option value="CRITICA">Gravidade CRITICA</option>
                      </select>
                      <input
                        type="date"
                        value={incBlockVisitsUntil}
                        onChange={(e) => setIncBlockVisitsUntil(e.target.value)}
                        aria-label="Bloquear visitas até"
                        className="bg-[#10233f] border border-blue-800 rounded-xl px-2.5 py-2 text-white"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={incDesc}
                        onChange={(e) => setIncDesc(e.target.value)}
                        placeholder="Descrição da ocorrência *"
                        className="bg-[#10233f] border border-blue-800 rounded-xl px-3 py-2 text-white"
                        required
                      />
                      <input
                        type="text"
                        value={incActions}
                        onChange={(e) => setIncActions(e.target.value)}
                        placeholder="Providências tomadas *"
                        className="bg-[#10233f] border border-blue-800 rounded-xl px-3 py-2 text-white"
                        required
                      />
                      <input
                        type="text"
                        value={incSanction}
                        onChange={(e) => setIncSanction(e.target.value)}
                        placeholder="Medida/Sanção (opcional)"
                        className="bg-[#10233f] border border-blue-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={busy}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-1.5 rounded-xl cursor-pointer"
                      >
                        Registar Sanção
                      </button>
                    </div>
                  </form>
                )}

                {inmate.disciplinary.sanctionHistory.length === 0 ? (
                  <p className="text-emerald-400">Registo disciplinar limpo. Sem sanções aplicadas.</p>
                ) : (
                  <div className="space-y-2">
                    {inmate.disciplinary.sanctionHistory.map((s, idx) => (
                      <div key={idx} className="bg-[#0b192c] p-3 rounded-xl border border-amber-900/40">
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Data: {s.date}</span>
                          <span className="text-amber-400 font-semibold">{s.signedBy}</span>
                        </div>
                        <p className="text-white font-medium">{s.description}</p>
                        <p className="text-amber-300 text-[11px] mt-1">Medida: {s.measure}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: PÓS-INSTITUCIONAL */}
          {activeTab === 'post' && (
            <div className="bg-[#10233f] p-5 rounded-2xl border border-blue-900/50 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 text-blue-400" />
                Plano de Acompanhamento Pós-Institucional
              </h3>
              <div>
                <span className="text-slate-400">Estado do Plano: </span>
                <strong className="text-emerald-400">{inmate.postInstitutional.reintegrationPlanStatus}</strong>
              </div>
              <div>
                <span className="text-slate-400">Assistente Social: </span>
                <strong className="text-white">
                  {inmate.postInstitutional.assignedSocialWorker || 'Aguardando atribuição'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Recomendação Vocacional: </span>
                <strong className="text-white">{inmate.postInstitutional.vocationalRecommendation}</strong>
              </div>
            </div>
          )}

          {/* TAB 7: DOCUMENTOS OFICIAIS */}
          {activeTab === 'documents' && (
            <div className="bg-[#10233f] p-5 rounded-2xl border border-blue-900/50 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-blue-400" />
                Documentos Cartorários & Alvarás Anexados
              </h3>
              {inmate.documents.length === 0 ? (
                <p className="text-slate-400">Nenhum documento digitalizado anexado.</p>
              ) : (
                <div className="space-y-2">
                  {inmate.documents.map((doc) => (
                    <div
                      key={doc.documentId}
                      className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold text-white">{doc.title}</div>
                        <div className="text-[11px] text-slate-400">
                          Tipo: {doc.type} · Data: {doc.uploadDate} · {doc.fileSize}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFeedback({ type: 'ok', text: `Documento selecionado para exportação: ${doc.title}` })
                        }
                        className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 text-[11px] font-medium cursor-pointer shrink-0"
                      >
                        <Download className="w-3 h-3" /> Exportar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-3 sm:p-4 bg-[#081220] border-t border-blue-900/60 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-400">
            Ficha Única Nacional · Versão {inmate.version || 1}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-medium cursor-pointer"
          >
            Fechar Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
