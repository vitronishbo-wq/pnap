import React, { useState, useEffect, useMemo } from 'react';
import {
  ProvinceId,
  PnapUser,
  ExitModality,
  NationalInmateIndexItem,
  Inmate
} from '../types/pnap';
import { PROVINCES_DATA } from '../data/mockPnapData';
import { pnapStore } from '../services/pnapStore';
import {
  ApiClientError,
  admitInmateViaApi,
  fetchInmateByIdViaApi,
  fetchProvinceInmatesViaApi,
  fetchTransfersViaApi,
  recaptureInmateViaApi,
  receiveTransferViaApi,
  registerInmateExitViaApi
} from '../services/apiClient';
import { InmateSmartFinder } from './shared/InmateSmartFinder';
import { resolveIndexCustodyState } from '../utils/inmateSearch';
import {
  UserPlus,
  UserMinus,
  X,
  CheckCircle2,
  AlertCircle,
  Truck,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  Search,
  UserCheck
} from 'lucide-react';

interface EntradaSaidaModalProps {
  provinceId: ProvinceId;
  currentUser: PnapUser;
  apiActive?: boolean;
  onClose: () => void;
  presetExitTransferInmate?: NationalInmateIndexItem | null;
  initialTab?: 'admissions' | 'releases' | 'transfers' | 'recapture';
}

const EXIT_MODALITIES: Array<{
  id: ExitModality;
  label: string;
  docPlaceholder: string;
  authorityPlaceholder: string;
  resultingStatus: 'LIBERTADO' | 'FALECIDO' | 'EVADIDO' | 'TRANSFERIDO';
}> = [
  {
    id: 'CUMPRIMENTO_PENA',
    label: 'Cumprimento de Pena',
    docPlaceholder: 'N.º Alvará de Soltura',
    authorityPlaceholder: 'Juiz / Tribunal',
    resultingStatus: 'LIBERTADO'
  },
  {
    id: 'LIBERDADE_CONDICIONAL',
    label: 'Liberdade Condicional',
    docPlaceholder: 'N.º Alvará Condicional',
    authorityPlaceholder: 'Juiz / Tribunal',
    resultingStatus: 'LIBERTADO'
  },
  {
    id: 'LIBERDADE_PROVISORIA',
    label: 'Liberdade Provisória',
    docPlaceholder: 'N.º Mandado / Termo',
    authorityPlaceholder: 'Juiz / Magistrado',
    resultingStatus: 'LIBERTADO'
  },
  {
    id: 'ABSOLVICAO',
    label: 'Absolvição / Arquivamento',
    docPlaceholder: 'N.º Mandado de Soltura',
    authorityPlaceholder: 'Juiz / Ministério Público',
    resultingStatus: 'LIBERTADO'
  },
  {
    id: 'INDULTO',
    label: 'Indulto / Amnistia',
    docPlaceholder: 'N.º Decreto Presidencial',
    authorityPlaceholder: 'Entidade Emissora',
    resultingStatus: 'LIBERTADO'
  },
  {
    id: 'TRANSFERENCIA',
    label: 'Transferência Física (Despacho)',
    docPlaceholder: 'N.º Guia de Condução / Transferência',
    authorityPlaceholder: 'Brigada de Escolta / Autoridade',
    resultingStatus: 'TRANSFERIDO'
  },
  {
    id: 'OBITO',
    label: 'Óbito',
    docPlaceholder: 'N.º Certidão de Óbito',
    authorityPlaceholder: 'Causa / Unidade Hospitalar',
    resultingStatus: 'FALECIDO'
  },
  {
    id: 'EVASAO',
    label: 'Evasão / Fuga',
    docPlaceholder: 'N.º Auto de Ocorrência',
    authorityPlaceholder: 'Circunstância / Local',
    resultingStatus: 'EVADIDO'
  }
];

export const EntradaSaidaModal: React.FC<EntradaSaidaModalProps> = ({
  provinceId,
  currentUser,
  apiActive = false,
  onClose,
  presetExitTransferInmate,
  initialTab
}) => {
  const [activeTab, setActiveTab] = useState<
    'admissions' | 'releases' | 'transfers' | 'new_admission' | 'new_exit' | 'recapture'
  >(presetExitTransferInmate ? 'new_exit' : initialTab || 'admissions');
  const [, setStoreTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [conflictRefreshNeeded, setConflictRefreshNeeded] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    return pnapStore.subscribe(() => setStoreTick((t) => t + 1));
  }, []);

  useEffect(() => {
    if (!apiActive) return;
    let active = true;
    fetchTransfersViaApi()
      .then((res) => {
        if (active) pnapStore.syncLiveTransfers(res.transfers);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [apiActive]);

  const admissions = pnapStore.getAdmissions();
  const releases = pnapStore.getReleases();
  const transfers = pnapStore.getPhysicalTransfers();
  const allInmates = pnapStore.getInmates();
  const provinceEstablishments = pnapStore.getEstablishments(provinceId);

  const evadedInmatesCount = useMemo(() => {
    return allInmates.filter(
      (inm) =>
        (inm.custodyState === 'EVADIDO' || inm.currentStatus === 'EVADIDO') &&
        pnapStore.canOperateProvince(currentUser, inm.provinceId)
    ).length;
  }, [allInmates, currentUser]);

  // Verificação nacional prévia na admissão (evitar duplicação da FUR)
  const [admissionLookupItem, setAdmissionLookupItem] = useState<NationalInmateIndexItem | null>(null);
  const [reentryInmate, setReentryInmate] = useState<Inmate | null>(null);
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);

  // Form nova admissão
  const [newName, setNewName] = useState('');
  const [newMatricula, setNewMatricula] = useState('');
  const [newBiNumber, setNewBiNumber] = useState('');
  const [newGender, setNewGender] = useState<'M' | 'F'>('M');
  const [newEstablishmentId, setNewEstablishmentId] = useState(
    currentUser.assignments.assignedEstablishmentId ||
      provinceEstablishments[0]?.establishmentId ||
      'comarca-viana'
  );
  const [newProcessNumber, setNewProcessNumber] = useState('');
  const [newCourt, setNewCourt] = useState('');
  const [newCrime, setNewCrime] = useState('');

  // Form saída / despacho
  const [exitSelectedItem, setExitSelectedItem] = useState<NationalInmateIndexItem | null>(
    presetExitTransferInmate || null
  );
  const [exitHydratedInmate, setExitHydratedInmate] = useState<Inmate | null>(null);
  const [exitModality, setExitModality] = useState<ExitModality | ''>(
    presetExitTransferInmate ? 'TRANSFERENCIA' : ''
  );
  const [exitDocNumber, setExitDocNumber] = useState('');
  const [exitAuthority, setExitAuthority] = useState('');
  const [exitDestProvince, setExitDestProvince] = useState<ProvinceId | ''>('');
  const [exitDestEstablishment, setExitDestEstablishment] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [approvedByDirector, setApprovedByDirector] = useState(false);

  // Form recaptura
  const [recapSelectedItem, setRecapSelectedItem] = useState<NationalInmateIndexItem | null>(null);
  const [recapHydratedInmate, setRecapHydratedInmate] = useState<Inmate | null>(null);
  const [recapDoc, setRecapDoc] = useState('');
  const [recapEscort, setRecapEscort] = useState('');

  useEffect(() => {
    if (!presetExitTransferInmate) return;
    setExitSelectedItem(presetExitTransferInmate);
    if (apiActive) {
      fetchInmateByIdViaApi(presetExitTransferInmate.inmateId)
        .then((res) => setExitHydratedInmate(res.inmate))
        .catch(() => {});
    }
  }, [presetExitTransferInmate, apiActive]);

  const selectedModalityMeta = EXIT_MODALITIES.find((m) => m.id === exitModality);
  const exitInmateId = exitSelectedItem?.inmateId || '';
  const selectedExitInmate: Inmate | undefined =
    exitHydratedInmate && exitHydratedInmate.inmateId === exitInmateId
      ? exitHydratedInmate
      : allInmates.find((i) => i.inmateId === exitInmateId);

  const isDirectorOrAbove =
    currentUser.assignments.role === 'CENTRAL_ADMIN' ||
    currentUser.assignments.role === 'PROVINCIAL_COMMAND' ||
    currentUser.assignments.role === 'ESTABLISHMENT_DIRECTOR';

  const handleSelectAdmissionMatch = async (item: NationalInmateIndexItem) => {
    setAdmissionLookupItem(item);
    setFeedback(null);
    setShowNewPersonForm(false);
    const custody = resolveIndexCustodyState(item);

    if (custody === 'LIBERTADO') {
      if (apiActive) {
        setBusy(true);
        try {
          const res = await fetchInmateByIdViaApi(item.inmateId, 'reentry');
          setReentryInmate(res.inmate);
        } catch (err) {
          setFeedback({
            type: 'err',
            text: err instanceof Error ? err.message : 'Erro ao hidratar FUR histórica.'
          });
          setReentryInmate(null);
        } finally {
          setBusy(false);
        }
      } else {
        const local = allInmates.find((i) => i.inmateId === item.inmateId) || null;
        setReentryInmate(local);
      }
    } else {
      setReentryInmate(null);
    }
  };

  const handleSelectExitInmate = async (item: NationalInmateIndexItem) => {
    setExitSelectedItem(item);
    setFeedback(null);
    setConflictRefreshNeeded(false);
    if (apiActive) {
      try {
        const res = await fetchInmateByIdViaApi(item.inmateId);
        setExitHydratedInmate(res.inmate);
        pnapStore.upsertLiveInmate(res.inmate);
      } catch (err) {
        setFeedback({
          type: 'err',
          text: err instanceof Error ? err.message : 'Erro ao carregar versão atual da FUR.'
        });
      }
    }
  };

  const handleSelectRecapInmate = async (item: NationalInmateIndexItem) => {
    setRecapSelectedItem(item);
    setFeedback(null);
    setConflictRefreshNeeded(false);
    if (apiActive) {
      try {
        const res = await fetchInmateByIdViaApi(item.inmateId);
        setRecapHydratedInmate(res.inmate);
        pnapStore.upsertLiveInmate(res.inmate);
      } catch (err) {
        setFeedback({
          type: 'err',
          text: err instanceof Error ? err.message : 'Erro ao carregar FUR do evadido.'
        });
      }
    }
  };

  const handleRefreshProvinceData = async () => {
    if (!apiActive) return;
    setBusy(true);
    try {
      const [inmRes, trfRes] = await Promise.all([
        fetchProvinceInmatesViaApi(provinceId),
        fetchTransfersViaApi()
      ]);
      pnapStore.syncLiveInmates(provinceId, inmRes.inmates);
      pnapStore.syncLiveTransfers(trfRes.transfers);
      if (exitInmateId) {
        const latestExit = await fetchInmateByIdViaApi(exitInmateId).catch(() => null);
        if (latestExit?.inmate) setExitHydratedInmate(latestExit.inmate);
      }
      if (recapSelectedItem?.inmateId) {
        const latestRecap = await fetchInmateByIdViaApi(recapSelectedItem.inmateId).catch(() => null);
        if (latestRecap?.inmate) setRecapHydratedInmate(latestRecap.inmate);
      }
      setConflictRefreshNeeded(false);
      setFeedback({ type: 'ok', text: 'Fichas recarregadas com a versão mais recente do servidor.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Falha ao sincronizar fichas.'
      });
    } finally {
      setBusy(false);
    }
  };

  const resetAdmissionForms = () => {
    setAdmissionLookupItem(null);
    setReentryInmate(null);
    setShowNewPersonForm(false);
    setNewName('');
    setNewMatricula('');
    setNewBiNumber('');
    setNewProcessNumber('');
    setNewCourt('');
    setNewCrime('');
  };

  const handleRegisterAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    const isReentry = Boolean(admissionLookupItem && resolveIndexCustodyState(admissionLookupItem) === 'LIBERTADO');

    if (!isReentry && !newName.trim()) {
      setFeedback({ type: 'err', text: 'Preencha o nome completo.' });
      return;
    }
    if (!newCourt.trim() || !newCrime.trim()) {
      setFeedback({ type: 'err', text: 'Preencha tribunal/mandado e tipologia de crime.' });
      return;
    }

    const estId = newEstablishmentId || provinceEstablishments[0]?.establishmentId || 'comarca-viana';
    const procNum = newProcessNumber.trim() || `PROC-${Date.now().toString().slice(-4)}/2026`;
    const genMatricula = isReentry
      ? reentryInmate?.profile.matricula || admissionLookupItem!.matricula
      : newMatricula.trim() || `PNAP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!apiActive) {
      const res = pnapStore.admitInmateOffline(currentUser, {
        provinceId,
        establishmentId: estId,
        fullName: isReentry ? reentryInmate?.profile.fullName || admissionLookupItem!.fullName : newName,
        matricula: genMatricula,
        biNumber: isReentry
          ? reentryInmate?.profile.biNumber || admissionLookupItem!.biNumber
          : newBiNumber.trim(),
        gender: isReentry ? reentryInmate?.profile.gender || 'M' : newGender,
        courtName: newCourt,
        crimeCategory: newCrime,
        processNumber: procNum,
        reentry: isReentry,
        existingInmateId: isReentry ? admissionLookupItem!.inmateId : undefined
      });
      if (!res.success) {
        setFeedback({ type: 'err', text: res.message });
        return;
      }
      setFeedback({ type: 'ok', text: res.message });
      resetAdmissionForms();
      setActiveTab('admissions');
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const provinceName = PROVINCES_DATA[provinceId]?.name || provinceId;
      const targetInmateId = isReentry ? admissionLookupItem!.inmateId : `inm-${Date.now()}`;
      const res = await admitInmateViaApi({
        inmateId: targetInmateId,
        provinceId,
        establishmentId: estId,
        reentry: isReentry,
        ...(isReentry && reentryInmate?.version ? { version: reentryInmate.version } : {}),
        profile: isReentry
          ? reentryInmate?.profile || {
              inmateId: targetInmateId,
              fullName: admissionLookupItem!.fullName,
              matricula: admissionLookupItem!.matricula,
              biNumber: admissionLookupItem!.biNumber,
              dateOfBirth: '1990-01-01',
              gender: 'M',
              provinceOfOrigin: provinceName,
              fatherName: 'Não declarado',
              motherName: 'Não declarada',
              neighborhood: admissionLookupItem!.neighborhood || 'Em verificação',
              photoUrl: admissionLookupItem!.photoUrl || '',
              emergencyContact: {
                name: admissionLookupItem!.emergencyContactName || 'Pendente',
                phone: admissionLookupItem!.emergencyPhone || '',
                relationship: 'Familiar'
              }
            }
          : {
              inmateId: targetInmateId,
              fullName: newName.trim(),
              matricula: genMatricula,
              biNumber: newBiNumber.trim(),
              dateOfBirth: '1990-01-01',
              gender: newGender,
              provinceOfOrigin: provinceName,
              fatherName: 'Não declarado',
              motherName: 'Não declarada',
              neighborhood: 'Em verificação',
              photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&fit=crop&crop=faces',
              emergencyContact: { name: 'Pendente', phone: '', relationship: 'Familiar' }
            },
        admission: {
          admissionId: `adm-${Date.now()}`,
          admissionDate: new Date().toISOString().split('T')[0],
          courtName: newCourt.trim(),
          processNumber: procNum,
          mandateNumber: `MAND-${Date.now().toString().slice(-4)}`,
          custodyReason: newCrime.trim() || 'Mandado de Condução / Prisão Preventiva',
          initialPavilionId: 'pav-1',
          intakeOfficer: currentUser.profile.fullName
        },
        legal: {
          legalStatus: 'PREVENTIVO',
          crimeCategory: newCrime.trim(),
          penalCodeArticle: 'Código Penal Angolano',
          totalSentenceYears: 0,
          totalSentenceMonths: 0,
          timeServedMonths: 0,
          remissionEarnedMonths: 0,
          eligibleParoleDate: '',
          endOfSentenceDate: ''
        }
      });
      pnapStore.upsertLiveInmate(res.inmate);
      setFeedback({
        type: 'ok',
        text: isReentry
          ? `Reentrada concluída na mesma FUR (${res.inmate.profile.matricula}) · v${res.inmate.version} · Processo ${res.process.processNumber}.`
          : `FUR oficial criada (${res.inmate.profile.matricula}) · Processo ${res.process.processNumber}.`
      });
      resetAdmissionForms();
      setActiveTab('admissions');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'IDENTITY_EVADED_USE_RECAPTURE') {
        setFeedback({ type: 'err', text: `${err.message} Utilize o separador Recaptura.` });
      } else {
        setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao admitir recluso.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitInmateId || !exitModality) {
      setFeedback({ type: 'err', text: 'Localize e selecione o recluso e a modalidade.' });
      return;
    }

    if (!apiActive) {
      const result = pnapStore.registerInmateExit(currentUser, {
        inmateId: exitInmateId,
        modality: exitModality,
        documentNumber: exitDocNumber,
        authorityOrDetail: exitAuthority,
        exitDate,
        destinationProvinceId:
          exitModality === 'TRANSFERENCIA' && exitDestProvince ? exitDestProvince : undefined,
        destinationEstablishmentId:
          exitModality === 'TRANSFERENCIA' ? exitDestEstablishment : undefined,
        notes: exitNotes
      });
      if (result.success) {
        setFeedback({ type: 'ok', text: result.message });
        setExitSelectedItem(null);
        setExitHydratedInmate(null);
        setExitModality('');
        setExitDocNumber('');
        setExitAuthority('');
        setExitDestProvince('');
        setExitDestEstablishment('');
        setExitDate('');
        setExitNotes('');
        setActiveTab(exitModality === 'TRANSFERENCIA' ? 'transfers' : 'releases');
      } else {
        setFeedback({ type: 'err', text: result.message });
      }
      return;
    }

    setBusy(true);
    setFeedback(null);
    setConflictRefreshNeeded(false);
    try {
      const res = await registerInmateExitViaApi(exitInmateId, {
        modality: exitModality,
        documentNumber: exitDocNumber,
        authorityOrDetail: exitAuthority,
        exitDate,
        destinationProvinceId:
          exitModality === 'TRANSFERENCIA' && exitDestProvince ? exitDestProvince : undefined,
        destinationEstablishmentId:
          exitModality === 'TRANSFERENCIA' ? exitDestEstablishment : undefined,
        notes: exitNotes,
        approvedByDirector: isDirectorOrAbove ? true : approvedByDirector,
        expectedVersion: selectedExitInmate?.version ?? exitSelectedItem?.version
      });
      if (res.inmate) pnapStore.upsertLiveInmate(res.inmate);
      if (res.transfer) {
        pnapStore.syncLiveTransfers([
          res.transfer,
          ...transfers.filter((t) => t.transferId !== res.transfer!.transferId)
        ]);
      }
      setFeedback({ type: 'ok', text: res.message });
      setExitSelectedItem(null);
      setExitHydratedInmate(null);
      setExitModality('');
      setExitDocNumber('');
      setExitAuthority('');
      setExitDestProvince('');
      setExitDestEstablishment('');
      setExitDate('');
      setExitNotes('');
      setApprovedByDirector(false);
      setActiveTab(exitModality === 'TRANSFERENCIA' ? 'transfers' : 'releases');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'VERSION_CONFLICT') {
        setConflictRefreshNeeded(true);
      }
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao registar saída.' });
    } finally {
      setBusy(false);
    }
  };

  const handleReceiveTransfer = async (transferId: string) => {
    if (!apiActive) {
      const res = pnapStore.receiveTransferOffline(currentUser, transferId);
      setFeedback({ type: res.success ? 'ok' : 'err', text: res.message });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await receiveTransferViaApi(transferId, {});
      pnapStore.upsertLiveInmate(res.inmate);
      const list = await fetchTransfersViaApi();
      pnapStore.syncLiveTransfers(list.transfers);
      setFeedback({
        type: 'ok',
        text: `Receção confirmada (Etapa 2): ${res.inmate.profile.fullName} ativo em ${res.inmate.establishmentId}.`
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao confirmar receção de transferência.'
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRecapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const recapInmateId = recapSelectedItem?.inmateId || '';
    if (!recapInmateId || !recapDoc.trim() || !recapEscort.trim()) {
      setFeedback({ type: 'err', text: 'Localize o recluso evadido e preencha auto e escolta.' });
      return;
    }

    if (!apiActive) {
      const res = pnapStore.recaptureInmateOffline(currentUser, recapInmateId, recapDoc, recapEscort);
      setFeedback({ type: res.success ? 'ok' : 'err', text: res.message });
      if (res.success) {
        setRecapSelectedItem(null);
        setRecapHydratedInmate(null);
        setRecapDoc('');
        setRecapEscort('');
      }
      return;
    }

    setBusy(true);
    setFeedback(null);
    const localRecap =
      recapHydratedInmate && recapHydratedInmate.inmateId === recapInmateId
        ? recapHydratedInmate
        : allInmates.find((i) => i.inmateId === recapInmateId);
    try {
      const res = await recaptureInmateViaApi(recapInmateId, {
        documentNumber: recapDoc.trim(),
        authorityOrEscort: recapEscort.trim(),
        expectedVersion: localRecap?.version ?? recapSelectedItem?.version
      });
      pnapStore.upsertLiveInmate(res.inmate);
      setFeedback({
        type: 'ok',
        text: `Recaptura concluída: ${res.inmate.profile.fullName} restaurado na FUR ${res.inmate.profile.matricula}.`
      });
      setRecapSelectedItem(null);
      setRecapHydratedInmate(null);
      setRecapDoc('');
      setRecapEscort('');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'VERSION_CONFLICT') {
        setConflictRefreshNeeded(true);
      }
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro na recaptura.' });
    } finally {
      setBusy(false);
    }
  };

  const admissionMatchCustody = admissionLookupItem
    ? resolveIndexCustodyState(admissionLookupItem)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0b192c] text-white w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl border border-blue-900/60 overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Topo */}
        <div className="bg-[#10233f] px-3 py-3 sm:px-5 sm:py-4 border-b border-blue-800/60 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-blue-600 text-white p-1.5 sm:p-2 rounded-xl shrink-0">
              <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">Entrada, Saída e Custódia</h2>
              <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded uppercase font-semibold">
                {currentUser.assignments.role === 'CENTRAL_ADMIN'
                  ? 'Nacional'
                  : currentUser.assignments.assignedProvinceId.replace('_', ' ')}
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

        {/* Abas Mobile-First */}
        <div className="flex bg-[#081220] p-2 border-b border-blue-900/60 gap-1.5 text-xs overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setActiveTab('admissions');
            }}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'admissions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Entradas ({admissions.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setActiveTab('releases');
            }}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'releases' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Saídas ({releases.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setActiveTab('transfers');
            }}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              activeTab === 'transfers' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Trânsito ({transfers.filter((t) => t.status !== 'CONCLUIDO').length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setActiveTab('recapture');
            }}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              activeTab === 'recapture' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Recaptura ({evadedInmatesCount})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setActiveTab('new_admission');
            }}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ml-auto ${
              activeTab === 'new_admission'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/60'
            }`}
          >
            + Entrada
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setActiveTab('new_exit');
            }}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              activeTab === 'new_exit'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-amber-950/50 text-amber-300 border border-amber-700/60 hover:bg-amber-900/50'
            }`}
          >
            <UserMinus className="w-3.5 h-3.5" />
            <span>+ Saída</span>
          </button>
        </div>

        {/* Feedback Inline + Botão de Recarregar em Conflito de Versão */}
        {feedback && (
          <div
            className={`mx-3 mt-2.5 px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 shrink-0 border ${
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
                  onClick={handleRefreshProvinceData}
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
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 text-xs">
          {activeTab === 'admissions' && (
            <div className="space-y-2.5">
              {admissions.map((adm) => (
                <div
                  key={adm.admissionId}
                  className="bg-[#10233f] p-3.5 rounded-2xl border border-blue-900/40 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-white text-xs sm:text-sm truncate">{adm.fullName}</strong>
                      <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded font-mono">
                        {adm.matricula}
                      </span>
                    </div>
                    <div className="text-slate-400 mt-1 truncate">
                      <span className="text-amber-300">{adm.crime}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {adm.courtName} · {adm.registeredBy}
                    </div>
                  </div>
                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-medium shrink-0">
                    Activo
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'releases' && (
            <div className="space-y-2.5">
              {releases.map((rel) => {
                const statusBadge =
                  rel.resultingStatus ||
                  (rel.reason === 'OBITO'
                    ? 'FALECIDO'
                    : rel.reason === 'EVASAO'
                    ? 'EVADIDO'
                    : rel.reason === 'TRANSFERENCIA'
                    ? 'TRANSFERIDO'
                    : 'LIBERTADO');
                const modalityLabel =
                  EXIT_MODALITIES.find((m) => m.id === rel.reason)?.label || rel.reason;

                return (
                  <div
                    key={rel.releaseId}
                    className="bg-[#10233f] p-3.5 rounded-2xl border border-emerald-900/40 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-white text-xs sm:text-sm truncate">{rel.fullName}</strong>
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono">
                          {rel.matricula}
                        </span>
                        <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-semibold">
                          {modalityLabel}
                        </span>
                      </div>
                      <div className="text-slate-300 mt-1 font-mono text-[11px] truncate">
                        {rel.alvaraNumber} · {rel.judgeName}
                        {rel.destinationProvinceId
                          ? ` ➔ ${rel.destinationEstablishmentId || ''} (${rel.destinationProvinceId.toUpperCase()})`
                          : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {rel.releaseDate} · {rel.registeredBy}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2.5 py-1 rounded-full font-bold border shrink-0 ${
                        statusBadge === 'FALECIDO'
                          ? 'bg-slate-900 text-slate-300 border-slate-700'
                          : statusBadge === 'EVADIDO'
                          ? 'bg-rose-950 text-rose-300 border-rose-800'
                          : statusBadge === 'TRANSFERIDO'
                          ? 'bg-purple-950 text-purple-300 border-purple-800'
                          : 'bg-blue-950 text-blue-300 border-blue-800'
                      }`}
                    >
                      {statusBadge}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'transfers' && (
            <div className="space-y-2.5">
              {transfers.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-[#10233f] rounded-2xl border border-blue-900/40">
                  Sem guias de transferência registadas.
                </div>
              ) : (
                transfers.map((trf) => {
                  const canReceiveHere =
                    trf.status !== 'CONCLUIDO' &&
                    pnapStore.canOperateProvince(currentUser, trf.destinationProvinceId);
                  return (
                    <div
                      key={trf.transferId}
                      className="bg-[#10233f] p-3.5 rounded-2xl border border-purple-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-white text-xs sm:text-sm">{trf.inmateName}</strong>
                          <span className="text-[10px] bg-slate-900 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-mono">
                            {trf.matricula}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              trf.status === 'CONCLUIDO'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                : 'bg-amber-950 text-amber-300 border-amber-700'
                            }`}
                          >
                            {trf.status}
                          </span>
                        </div>
                        <div className="text-slate-300 mt-1">
                          {trf.originProvinceId.toUpperCase()} ({trf.originEstablishmentId}) ➔{' '}
                          <strong className="text-purple-300">
                            {trf.destinationProvinceId.toUpperCase()} ({trf.destinationEstablishmentId})
                          </strong>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Escolta: {trf.securityEscort} · {trf.requestDate}
                        </div>
                      </div>

                      {canReceiveHere && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleReceiveTransfer(trf.transferId)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirmar Receção (Etapa 2)</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'recapture' && (
            <form
              onSubmit={handleRecapture}
              className="space-y-3 max-w-xl mx-auto bg-[#10233f] p-4 rounded-2xl border border-rose-800/40"
            >
              <div className="text-slate-300 text-[11px]">
                Pesquise o evadido por matrícula, nome, BI ou parente. A recaptura reativa a{' '}
                <strong>mesma Ficha Única Nacional</strong> sem duplicar dados.
              </div>

              <InmateSmartFinder
                currentUser={currentUser}
                provinceId={provinceId}
                apiActive={apiActive}
                custodyScope="EVADIDO"
                restrictToOperableJurisdiction={true}
                selectedItem={recapSelectedItem}
                onSelect={handleSelectRecapInmate}
                onClear={() => {
                  setRecapSelectedItem(null);
                  setRecapHydratedInmate(null);
                }}
                placeholder="Procurar recluso EVADIDO (nome, matrícula, BI, parente)..."
                emptyHint="Nenhum recluso em estado EVADIDO encontrado nesta jurisdição."
              />

              <input
                type="text"
                value={recapDoc}
                onChange={(e) => setRecapDoc(e.target.value)}
                placeholder="N.º Auto de Recaptura / Mandado *"
                aria-label="Auto de recaptura"
                className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white font-mono placeholder:text-slate-500"
                required
              />

              <input
                type="text"
                value={recapEscort}
                onChange={(e) => setRecapEscort(e.target.value)}
                placeholder="Força de Recaptura / Escolta *"
                aria-label="Escolta de recaptura"
                className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white placeholder:text-slate-500"
                required
              />

              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !recapSelectedItem}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Confirmar Recaptura na Mesma FUR
                </button>
              </div>
            </form>
          )}

          {activeTab === 'new_admission' && (
            <div className="space-y-3 max-w-xl mx-auto">
              {/* Passo 1: Verificação Nacional Prévia (Regra: Regista-se 1 vez na vida) */}
              <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-800/60 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-blue-300 font-bold">
                    <Search className="w-4 h-4" />
                    <span>1. Verificação Nacional Prévia (21 Províncias)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAdmissionLookupItem(null);
                      setReentryInmate(null);
                      setShowNewPersonForm((v) => !v);
                    }}
                    className="text-[11px] bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/70 px-2.5 py-1 rounded-lg font-semibold cursor-pointer"
                  >
                    {showNewPersonForm ? 'Ocultar Formulário Novo' : 'Sem registo nacional · Nova 1ª Admissão'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Pesquise primeiro em todo o país (nome, alcunha, BI, matrícula, parente ou telefone). Se o cidadão já teve passagem prisional (<strong className="text-blue-300">LIBERTADO</strong>), os dados biográficos são reaproveitados automaticamente na mesma FUR.
                </p>

                <InmateSmartFinder
                  currentUser={currentUser}
                  provinceId={provinceId}
                  apiActive={apiActive}
                  custodyScope="ALL"
                  restrictToOperableJurisdiction={false}
                  selectedItem={admissionLookupItem}
                  onSelect={handleSelectAdmissionMatch}
                  onClear={() => {
                    setAdmissionLookupItem(null);
                    setReentryInmate(null);
                  }}
                  placeholder="Verificar cidadão a nível nacional (nome, BI, matrícula, parente, tel)..."
                  emptyHint="Nenhum registo nacional encontrado. Clique em «Sem registo nacional · Nova 1ª Admissão»."
                />
              </div>

              {/* Caso encontrado: verificar estado de custódia */}
              {admissionLookupItem && admissionMatchCustody === 'EVADIDO' && (
                <div className="bg-rose-950/70 border border-rose-700/70 p-4 rounded-2xl space-y-2">
                  <div className="font-bold text-rose-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Recluso EVADIDO — Não duplicar admissão
                  </div>
                  <p className="text-rose-200/90 text-[11px]">
                    {admissionLookupItem.fullName} ({admissionLookupItem.matricula}) consta como EVADIDO em {admissionLookupItem.provinceName}. Reative a custódia pelo fluxo de Recaptura.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRecapSelectedItem(admissionLookupItem);
                      setActiveTab('recapture');
                    }}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 py-1.5 rounded-xl cursor-pointer"
                  >
                    Ir para Recaptura desta FUR
                  </button>
                </div>
              )}

              {admissionLookupItem &&
                (admissionMatchCustody === 'ATIVO_NA_UNIDADE' ||
                  admissionMatchCustody === 'EM_DILIGENCIA_EXTERNA' ||
                  admissionMatchCustody === 'HOSPITALIZADO_EXTERNO' ||
                  admissionMatchCustody === 'EM_TRANSITO_TRANSFERENCIA') && (
                  <div className="bg-amber-950/70 border border-amber-700/70 p-4 rounded-2xl space-y-1.5">
                    <div className="font-bold text-amber-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Duplicação Bloqueada — FUR Já Ativa ({admissionMatchCustody})
                    </div>
                    <p className="text-amber-200/90 text-[11px]">
                      {admissionLookupItem.fullName} ({admissionLookupItem.matricula}) já está em custódia em{' '}
                      <strong>{admissionLookupItem.establishmentName} ({admissionLookupItem.provinceName})</strong>. Se mudou de estabelecimento, utilize a Guia de Transferência.
                    </p>
                  </div>
                )}

              {admissionLookupItem && admissionMatchCustody === 'FALECIDO' && (
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl text-slate-300">
                  FUR bloqueada: existe registo definitivo de óbito para {admissionLookupItem.matricula}.
                </div>
              )}

              {/* Formulário de Reentrada na mesma FUR (LIBERTADO) OU Nova 1ª Admissão */}
              {((admissionLookupItem && admissionMatchCustody === 'LIBERTADO') ||
                (!admissionLookupItem && showNewPersonForm)) && (
                <form
                  onSubmit={handleRegisterAdmission}
                  className="space-y-3 bg-[#10233f] p-4 rounded-2xl border border-emerald-800/50"
                >
                  {admissionLookupItem && admissionMatchCustody === 'LIBERTADO' ? (
                    <div className="bg-[#0b192c] p-3 rounded-xl border border-emerald-700/60 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4" />
                          Reentrada na Mesma FUR Vitalícia (Dados Preservados)
                        </span>
                        <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded">
                          {reentryInmate?.profile.matricula || admissionLookupItem.matricula}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                        <div>
                          Nome: <strong className="text-white">{reentryInmate?.profile.fullName || admissionLookupItem.fullName}</strong>
                        </div>
                        <div>
                          BI: <strong className="font-mono text-white">{reentryInmate?.profile.biNumber || admissionLookupItem.biNumber || 'N/D'}</strong>
                        </div>
                        <div>
                          Filiação: <strong className="text-slate-200">{reentryInmate ? `${reentryInmate.profile.fatherName} / ${reentryInmate.profile.motherName}` : admissionLookupItem.parentName || 'Registada na FUR'}</strong>
                        </div>
                        <div>
                          Histórico: <strong className="text-blue-300">{reentryInmate?.visitors?.length || 0} visitante(s) · {reentryInmate?.incidents?.length || 0} ocorrência(s)</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nome completo *"
                        aria-label="Nome completo"
                        className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                        required
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={newBiNumber}
                          onChange={(e) => setNewBiNumber(e.target.value)}
                          placeholder="BI Nacional (se houver)"
                          aria-label="BI Nacional"
                          className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        <input
                          type="text"
                          value={newMatricula}
                          onChange={(e) => setNewMatricula(e.target.value)}
                          placeholder="Matrícula (opcional)"
                          aria-label="Matrícula"
                          className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        <select
                          value={newGender}
                          onChange={(e) => setNewGender(e.target.value as 'M' | 'F')}
                          aria-label="Sexo"
                          className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white cursor-pointer"
                        >
                          <option value="M">Masculino</option>
                          <option value="F">Feminino</option>
                        </select>
                      </div>
                    </>
                  )}

                  {provinceEstablishments.length > 0 && (
                    <select
                      value={newEstablishmentId}
                      onChange={(e) => setNewEstablishmentId(e.target.value)}
                      aria-label="Estabelecimento"
                      className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white cursor-pointer"
                    >
                      {provinceEstablishments.map((est) => (
                        <option key={est.establishmentId} value={est.establishmentId}>
                          {est.name} ({est.code})
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newProcessNumber}
                      onChange={(e) => setNewProcessNumber(e.target.value)}
                      placeholder="N.º Processo Judicial"
                      aria-label="Processo"
                      className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      value={newCourt}
                      onChange={(e) => setNewCourt(e.target.value)}
                      placeholder="Tribunal / Mandado *"
                      aria-label="Tribunal"
                      className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <input
                    type="text"
                    value={newCrime}
                    onChange={(e) => setNewCrime(e.target.value)}
                    placeholder="Crime / Artigo *"
                    aria-label="Crime"
                    className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />

                  <div className="pt-1 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('admissions')}
                      className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {admissionLookupItem ? 'Confirmar Reentrada na Mesma FUR' : 'Registar 1ª Entrada'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === 'new_exit' && (
            <form
              onSubmit={handleRegisterExit}
              className="space-y-3 max-w-xl mx-auto bg-[#10233f] p-4 rounded-2xl border border-amber-700/40"
            >
              <InmateSmartFinder
                currentUser={currentUser}
                provinceId={provinceId}
                apiActive={apiActive}
                custodyScope="ACTIVE_IN_UNIT"
                restrictToOperableJurisdiction={true}
                selectedItem={exitSelectedItem}
                onSelect={handleSelectExitInmate}
                onClear={() => {
                  setExitSelectedItem(null);
                  setExitHydratedInmate(null);
                }}
                placeholder="Procurar recluso ATIVO para baixa/saída (matrícula, nome, BI, cela, parente)..."
                emptyHint="Nenhum recluso ATIVO na unidade encontrado para esta pesquisa."
              />

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
                <select
                  value={exitModality}
                  onChange={(e) => setExitModality(e.target.value as ExitModality | '')}
                  aria-label="Modalidade de saída"
                  className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white cursor-pointer focus:outline-none focus:border-amber-500"
                  required
                >
                  <option value="">Modalidade de Saída *</option>
                  {EXIT_MODALITIES.map((mod) => (
                    <option key={mod.id} value={mod.id}>
                      {mod.label}
                    </option>
                  ))}
                </select>

                {selectedModalityMeta && (
                  <span className="text-[10px] font-bold px-2.5 py-2 rounded-xl bg-[#0b192c] border border-slate-700 text-amber-300 text-center shrink-0">
                    ➔ {selectedModalityMeta.resultingStatus}
                  </span>
                )}
              </div>

              {selectedModalityMeta && (
                <>
                  <input
                    type="text"
                    value={exitDocNumber}
                    onChange={(e) => setExitDocNumber(e.target.value)}
                    placeholder={`${selectedModalityMeta.docPlaceholder} *`}
                    aria-label={selectedModalityMeta.docPlaceholder}
                    className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 font-mono focus:outline-none focus:border-amber-500"
                    required
                  />

                  <input
                    type="text"
                    value={exitAuthority}
                    onChange={(e) => setExitAuthority(e.target.value)}
                    placeholder={`${selectedModalityMeta.authorityPlaceholder} *`}
                    aria-label={selectedModalityMeta.authorityPlaceholder}
                    className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    required
                  />

                  {exitModality === 'TRANSFERENCIA' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={exitDestProvince}
                        onChange={(e) => setExitDestProvince(e.target.value as ProvinceId | '')}
                        aria-label="Província de destino"
                        className="w-full bg-[#0b192c] border border-purple-700/70 rounded-xl px-3 py-2 text-white cursor-pointer focus:outline-none focus:border-purple-400"
                        required
                      >
                        <option value="">Província de Destino *</option>
                        {Object.values(PROVINCES_DATA).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={exitDestEstablishment}
                        onChange={(e) => setExitDestEstablishment(e.target.value)}
                        placeholder="ID/Unidade de Destino *"
                        aria-label="Unidade de destino"
                        className="w-full bg-[#0b192c] border border-purple-700/70 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
                        required
                      />
                    </div>
                  )}

                  {selectedModalityMeta.resultingStatus === 'LIBERTADO' && !isDirectorOrAbove && (
                    <label className="flex items-center gap-2 bg-[#0b192c] p-2.5 rounded-xl border border-amber-700/50 text-[11px] text-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={approvedByDirector}
                        onChange={(e) => setApprovedByDirector(e.target.checked)}
                        className="rounded accent-amber-500"
                      />
                      <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Confirmar Despacho de Dupla Aprovação da Direção</span>
                    </label>
                  )}
                </>
              )}

              <input
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                aria-label="Data da saída"
                className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                required
              />

              <input
                type="text"
                value={exitNotes}
                onChange={(e) => setExitNotes(e.target.value)}
                placeholder="Observações (opcional)"
                aria-label="Observações"
                className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />

              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('releases')}
                  className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy || !exitSelectedItem}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Confirmar Saída
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
