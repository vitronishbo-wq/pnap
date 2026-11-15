import React, { useState, useEffect, useMemo } from 'react';
import {
  ProvinceId,
  AdmissionRecord,
  PnapUser,
  ExitModality,
  NationalInmateIndexItem
} from '../types/pnap';
import { MOCK_ADMISSIONS, INMATES_LOCAL_DB, PROVINCES_DATA } from '../data/mockPnapData';
import { pnapStore } from '../services/pnapStore';
import { UserPlus, UserMinus, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface EntradaSaidaModalProps {
  provinceId: ProvinceId;
  currentUser: PnapUser;
  onClose: () => void;
  presetExitTransferInmate?: NationalInmateIndexItem | null;
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
    label: 'Transferência Física',
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
  onClose,
  presetExitTransferInmate
}) => {
  const [activeTab, setActiveTab] = useState<'admissions' | 'releases' | 'new_admission' | 'new_exit'>(
    presetExitTransferInmate ? 'new_exit' : 'admissions'
  );
  const [admissions, setAdmissions] = useState<AdmissionRecord[]>(MOCK_ADMISSIONS);
  const [, setStoreTick] = useState(0);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    return pnapStore.subscribe(() => setStoreTick((t) => t + 1));
  }, []);

  const releases = pnapStore.getReleases();

  // Reclusos ATIVOS filtrados pela jurisdição autorizada
  const eligibleActiveInmates = useMemo(() => {
    return INMATES_LOCAL_DB.filter(
      (inm) =>
        inm.currentStatus === 'ATIVO' &&
        pnapStore.canOperateProvince(currentUser, inm.provinceId)
    ).sort((a, b) => {
      if (a.provinceId === provinceId && b.provinceId !== provinceId) return -1;
      if (a.provinceId !== provinceId && b.provinceId === provinceId) return 1;
      return a.profile.fullName.localeCompare(b.profile.fullName);
    });
  }, [currentUser, provinceId, releases.length]);

  // Form para nova admissão (preservado)
  const [newName, setNewName] = useState('');
  const [newMatricula, setNewMatricula] = useState('');
  const [newCourt, setNewCourt] = useState('');
  const [newCrime, setNewCrime] = useState('');

  // Form dinâmico de saída (sem dados fictícios pré-preenchidos)
  const [exitInmateId, setExitInmateId] = useState(presetExitTransferInmate?.inmateId || '');
  const [exitModality, setExitModality] = useState<ExitModality | ''>(
    presetExitTransferInmate ? 'TRANSFERENCIA' : ''
  );
  const [exitDocNumber, setExitDocNumber] = useState('');
  const [exitAuthority, setExitAuthority] = useState('');
  const [exitDestProvince, setExitDestProvince] = useState<ProvinceId | ''>('');
  const [exitDestEstablishment, setExitDestEstablishment] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitNotes, setExitNotes] = useState('');

  const selectedModalityMeta = EXIT_MODALITIES.find((m) => m.id === exitModality);

  const handleRegisterAdmission = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCourt.trim() || !newCrime.trim()) {
      setFeedback({ type: 'err', text: 'Preencha todos os campos obrigatórios.' });
      return;
    }

    const genMatricula = newMatricula.trim() || `LA-2024-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRecord: AdmissionRecord = {
      admissionId: `adm-${Date.now()}`,
      inmateId: `inm-new-${Date.now()}`,
      fullName: newName.trim(),
      matricula: genMatricula,
      provinceId: provinceId,
      establishmentId: 'comarca-viana',
      courtName: newCourt.trim(),
      crime: newCrime.trim(),
      timestamp: new Date().toISOString(),
      registeredBy: currentUser.profile.fullName
    };

    setAdmissions([newRecord, ...admissions]);
    setFeedback({ type: 'ok', text: `Entrada registada · Matrícula: ${genMatricula}` });
    setNewName('');
    setNewMatricula('');
    setNewCourt('');
    setNewCrime('');
    setActiveTab('admissions');
  };

  const handleRegisterExit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitInmateId || !exitModality) {
      setFeedback({ type: 'err', text: 'Selecione o recluso e a modalidade.' });
      return;
    }

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
      setExitInmateId('');
      setExitModality('');
      setExitDocNumber('');
      setExitAuthority('');
      setExitDestProvince('');
      setExitDestEstablishment('');
      setExitDate('');
      setExitNotes('');
      setActiveTab('releases');
    } else {
      setFeedback({ type: 'err', text: result.message });
    }
  };

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
              <h2 className="text-sm sm:text-base font-bold text-white truncate">Entrada e Saída</h2>
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

        {/* Feedback Inline */}
        {feedback && (
          <div
            className={`mx-3 mt-2.5 px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 shrink-0 border ${
              feedback.type === 'ok'
                ? 'bg-emerald-950/80 border-emerald-600/50 text-emerald-200'
                : 'bg-rose-950/80 border-rose-600/50 text-rose-200'
            }`}
          >
            <span className="flex items-center gap-1.5 truncate">
              {feedback.type === 'ok' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{feedback.text}</span>
            </span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-300 hover:text-white font-bold cursor-pointer"
            >
              ✕
            </button>
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

          {activeTab === 'new_admission' && (
            <form
              onSubmit={handleRegisterAdmission}
              className="space-y-3 max-w-lg mx-auto bg-[#10233f] p-4 rounded-2xl border border-blue-800/40"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome completo *"
                aria-label="Nome completo"
                className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                required
              />

              <input
                type="text"
                value={newMatricula}
                onChange={(e) => setNewMatricula(e.target.value)}
                placeholder="Matrícula (opcional)"
                aria-label="Matrícula"
                className="w-full bg-[#0b192c] border border-blue-800/60 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
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
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  Registar Entrada
                </button>
              </div>
            </form>
          )}

          {activeTab === 'new_exit' && (
            <form
              onSubmit={handleRegisterExit}
              className="space-y-3 max-w-lg mx-auto bg-[#10233f] p-4 rounded-2xl border border-amber-700/40"
            >
              {/* 1. Recluso ATIVO dentro da jurisdição autorizada */}
              <select
                value={exitInmateId}
                onChange={(e) => setExitInmateId(e.target.value)}
                aria-label="Recluso ativo"
                className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white cursor-pointer focus:outline-none focus:border-amber-500"
                required
              >
                <option value="">Recluso ATIVO ({eligibleActiveInmates.length}) *</option>
                {eligibleActiveInmates.map((inm) => (
                  <option key={inm.inmateId} value={inm.inmateId}>
                    {inm.profile.fullName} · {inm.profile.matricula} ({inm.provinceId.toUpperCase()})
                  </option>
                ))}
              </select>

              {/* 2. Modalidade de Saída (inclui Transferência Física) */}
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

              {/* 3. Campos Dinâmicos segundo a Modalidade */}
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
                        placeholder="Unidade de Destino *"
                        aria-label="Unidade de destino"
                        className="w-full bg-[#0b192c] border border-purple-700/70 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
                        required
                      />
                    </div>
                  )}
                </>
              )}

              {/* 4. Data da Saída */}
              <input
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                aria-label="Data da saída"
                className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                required
              />

              {/* 5. Observações opcionais */}
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
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer"
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
