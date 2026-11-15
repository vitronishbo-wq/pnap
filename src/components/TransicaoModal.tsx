import React, { useState, useEffect, useMemo } from 'react';
import { ProvinceId, PnapUser, Inmate } from '../types/pnap';
import { INMATES_LOCAL_DB } from '../data/mockPnapData';
import { pnapStore } from '../services/pnapStore';
import { Scale, X, CheckCircle2, Clock, Search, AlertCircle, UserCheck } from 'lucide-react';

interface TransicaoModalProps {
  currentProvinceId: ProvinceId;
  currentUser: PnapUser;
  onClose: () => void;
}

const addMonthsToIso = (baseDateStr: string, monthsToAdd: number): string => {
  if (!baseDateStr || monthsToAdd <= 0) return '—';
  const d = new Date(baseDateStr);
  if (Number.isNaN(d.getTime())) return '—';
  d.setMonth(d.getMonth() + monthsToAdd);
  return d.toISOString().split('T')[0];
};

export const TransicaoModal: React.FC<TransicaoModalProps> = ({
  currentProvinceId,
  currentUser,
  onClose
}) => {
  const [, setStoreTick] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInmateId, setSelectedInmateId] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    return pnapStore.subscribe(() => setStoreTick((t) => t + 1));
  }, []);

  // Apenas dados novos constantes no mandado / acórdão (nunca repete dados da ficha)
  const [sentenceAcordao, setSentenceAcordao] = useState('');
  const [courtName, setCourtName] = useState('');
  const [sentenceDate, setSentenceDate] = useState('');
  const [transitDate, setTransitDate] = useState('');
  const [years, setYears] = useState('');
  const [months, setMonths] = useState('');
  const [regime, setRegime] = useState<'FECHADO' | 'SEMI_ABERTO'>('FECHADO');
  const [judgeName, setJudgeName] = useState('');

  const transitionsList = pnapStore.getLegalTransitions();

  // Reclusos ATIVOS em estado PREVENTIVO/RECORRENTE dentro da jurisdição autorizada
  const eligiblePreventives = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return INMATES_LOCAL_DB.filter((inm) => {
      const isEligibleStatus =
        inm.currentStatus === 'ATIVO' &&
        (inm.legal.legalStatus === 'PREVENTIVO' || inm.legal.legalStatus === 'RECORRENTE');
      if (!isEligibleStatus || !pnapStore.canOperateProvince(currentUser, inm.provinceId)) {
        return false;
      }
      if (!q) return true;
      return (
        inm.profile.fullName.toLowerCase().includes(q) ||
        inm.profile.matricula.toLowerCase().includes(q) ||
        inm.profile.biNumber.toLowerCase().includes(q) ||
        inm.admission.processNumber.toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      if (a.provinceId === currentProvinceId && b.provinceId !== currentProvinceId) return -1;
      if (a.provinceId !== currentProvinceId && b.provinceId === currentProvinceId) return 1;
      return a.profile.fullName.localeCompare(b.profile.fullName);
    });
  }, [currentUser, currentProvinceId, searchTerm, transitionsList.length]);

  const selectedInmate: Inmate | undefined = INMATES_LOCAL_DB.find(
    (inm) => inm.inmateId === selectedInmateId
  );

  const handleSelectInmate = (inmate: Inmate) => {
    setSelectedInmateId(inmate.inmateId);
    // Puxa o tribunal diretamente da Ficha Única (sem hardcode), editável caso haja recurso
    setCourtName(inmate.admission.courtName);
    setFeedback(null);
  };

  const totalSentenceMonths =
    (Math.max(0, parseInt(years || '0', 10) || 0) * 12) +
    Math.max(0, Math.min(11, parseInt(months || '0', 10) || 0));

  const computedEndDate = selectedInmate
    ? addMonthsToIso(selectedInmate.admission.admissionDate, totalSentenceMonths)
    : '—';
  const computedParoleDate = selectedInmate
    ? addMonthsToIso(
        selectedInmate.admission.admissionDate,
        totalSentenceMonths > 0 ? Math.max(1, Math.floor(totalSentenceMonths / 2)) : 0
      )
    : '—';
  const remainingMonths = selectedInmate
    ? Math.max(0, totalSentenceMonths - selectedInmate.legal.timeServedMonths)
    : 0;

  const handleSubmitTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInmate) {
      setFeedback({ type: 'err', text: 'Selecione a Ficha Única do recluso.' });
      return;
    }

    const result = pnapStore.registerLegalTransition(currentUser, {
      inmateId: selectedInmate.inmateId,
      courtName,
      sentenceAcordaoNumber: sentenceAcordao,
      sentenceDate,
      transitDate,
      totalSentenceYears: parseInt(years || '0', 10) || 0,
      totalSentenceMonths: parseInt(months || '0', 10) || 0,
      regime,
      judgeName,
      endOfSentenceDate: computedEndDate !== '—' ? computedEndDate : undefined,
      eligibleParoleDate: computedParoleDate !== '—' ? computedParoleDate : undefined
    });

    if (result.success) {
      setFeedback({ type: 'ok', text: result.message });
      setSelectedInmateId('');
      setSearchTerm('');
      setSentenceAcordao('');
      setCourtName('');
      setSentenceDate('');
      setTransitDate('');
      setYears('');
      setMonths('');
      setJudgeName('');
    } else {
      setFeedback({ type: 'err', text: result.message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm">
      <div className="bg-[#0b192c] text-white w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl border border-blue-900/80 overflow-hidden flex flex-col max-h-[92dvh]">
        {/* HEADER */}
        <div className="bg-[#10233f] px-3 py-3 sm:px-5 sm:py-4 border-b border-blue-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500 text-slate-950 shrink-0">
              <Scale className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                Transição Penal · Ficha Única
              </h2>
              <span className="text-[10px] bg-blue-900 text-blue-200 border border-blue-700 px-2 py-0.5 rounded font-mono uppercase">
                {currentUser.assignments.role === 'CENTRAL_ADMIN'
                  ? 'Nacional'
                  : currentProvinceId}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* FEEDBACK */}
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

        {/* CORPO */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* 1. PROCURA DA FICHA ÚNICA DO RECLUSO PREVENTIVO */}
          {!selectedInmate ? (
            <div className="bg-[#10233f] p-3.5 rounded-2xl border border-blue-900/60 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-blue-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Procurar Ficha Única (Nome, Matrícula, BI ou Processo)"
                  aria-label="Procurar Ficha Única"
                  className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl pl-9 pr-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {eligiblePreventives.length === 0 ? (
                <div className="p-4 text-center text-slate-400 bg-[#0b192c] rounded-xl border border-slate-800">
                  Sem reclusos preventivos elegíveis nesta jurisdição.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {eligiblePreventives.map((inm) => (
                    <button
                      key={inm.inmateId}
                      type="button"
                      onClick={() => handleSelectInmate(inm)}
                      className="w-full text-left bg-[#0b192c] hover:bg-[#132847] border border-blue-900/60 hover:border-amber-500/60 p-2.5 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={inm.profile.photoUrl}
                          alt={inm.profile.fullName}
                          className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{inm.profile.fullName}</div>
                          <div className="text-[11px] text-slate-400 font-mono truncate">
                            {inm.profile.matricula} · {inm.admission.processNumber}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold shrink-0">
                        {inm.legal.legalStatus}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* 2. FICHA ÚNICA CARREGADA + ATUALIZAÇÃO PELO MANDADO / SENTENÇA */
            <form onSubmit={handleSubmitTransition} className="space-y-3">
              {/* Cartão Read-Only da Ficha Única (Zero Redundância) */}
              <div className="bg-[#10233f] p-3 rounded-2xl border border-blue-700/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={selectedInmate.profile.photoUrl}
                      alt={selectedInmate.profile.fullName}
                      className="w-10 h-10 rounded-xl object-cover border border-blue-400/60 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{selectedInmate.profile.fullName}</span>
                      </div>
                      <div className="text-[11px] text-blue-300 font-mono truncate">
                        {selectedInmate.profile.matricula} · BI {selectedInmate.profile.biNumber}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedInmateId('')}
                    className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg cursor-pointer shrink-0"
                  >
                    Trocar
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/50">
                  <div>
                    <span className="text-slate-500 block">Estado Atual</span>
                    <strong className="text-amber-300">{selectedInmate.legal.legalStatus} ➔ CONDENADO</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Processo</span>
                    <strong className="text-slate-200 truncate block">{selectedInmate.admission.processNumber}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Admissão</span>
                    <strong className="text-slate-200 font-mono">{selectedInmate.admission.admissionDate}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Preventiva Cumprida</span>
                    <strong className="text-emerald-400">{selectedInmate.legal.timeServedMonths} meses</strong>
                  </div>
                </div>
              </div>

              {/* Apenas Dados Novos Constantes do Mandado / Acórdão */}
              <div className="bg-[#10233f] p-3.5 rounded-2xl border border-amber-600/40 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={sentenceAcordao}
                    onChange={(e) => setSentenceAcordao(e.target.value)}
                    placeholder="N.º Mandado / Acórdão / Sentença *"
                    aria-label="Número do Mandado ou Acórdão"
                    className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white font-mono placeholder:text-slate-500"
                    required
                  />

                  <input
                    type="text"
                    value={courtName}
                    onChange={(e) => setCourtName(e.target.value)}
                    placeholder="Tribunal Prolator"
                    aria-label="Tribunal"
                    className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white placeholder:text-slate-500"
                  />

                  <input
                    type="date"
                    value={sentenceDate}
                    onChange={(e) => setSentenceDate(e.target.value)}
                    aria-label="Data da sentença"
                    className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white"
                  />

                  <input
                    type="date"
                    value={transitDate}
                    onChange={(e) => setTransitDate(e.target.value)}
                    aria-label="Data do trânsito em julgado"
                    className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white"
                    required
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={years}
                      onChange={(e) => setYears(e.target.value)}
                      placeholder="Pena (Anos) *"
                      aria-label="Anos de pena"
                      className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white text-center font-bold placeholder:text-slate-500"
                    />
                    <input
                      type="number"
                      min={0}
                      max={11}
                      value={months}
                      onChange={(e) => setMonths(e.target.value)}
                      placeholder="Meses"
                      aria-label="Meses de pena"
                      className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-3 py-2 text-white text-center font-bold placeholder:text-slate-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={regime}
                      onChange={(e) => setRegime(e.target.value as 'FECHADO' | 'SEMI_ABERTO')}
                      aria-label="Regime"
                      className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-2.5 py-2 text-white cursor-pointer"
                    >
                      <option value="FECHADO">Fechado</option>
                      <option value="SEMI_ABERTO">Semi-Aberto</option>
                    </select>
                    <input
                      type="text"
                      value={judgeName}
                      onChange={(e) => setJudgeName(e.target.value)}
                      placeholder="Juiz (opcional)"
                      aria-label="Juiz"
                      className="w-full bg-[#0b192c] border border-blue-800/80 rounded-xl px-2.5 py-2 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {/* Cálculo Automático do Tempo de Cumprimento na Ficha Única */}
                {totalSentenceMonths > 0 && (
                  <div className="grid grid-cols-3 gap-2 bg-[#0b192c] p-2.5 rounded-xl border border-emerald-700/40 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Restante</span>
                      <strong className="text-amber-300 font-mono">{remainingMonths} meses</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Condicional (1/2)</span>
                      <strong className="text-blue-300 font-mono">{computedParoleDate}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Termo da Pena</span>
                      <strong className="text-emerald-400 font-mono">{computedEndDate}</strong>
                    </div>
                  </div>
                )}

                <div className="pt-1 flex justify-end">
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Actualizar Ficha Única ➔ CONDENADO</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Histórico de Atualizações */}
          <div>
            <h4 className="font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Histórico ({transitionsList.length})</span>
            </h4>

            <div className="space-y-1.5">
              {transitionsList.map((t) => (
                <div
                  key={t.transitionId}
                  className="bg-[#10233f] p-2.5 rounded-xl border border-blue-900/40 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                      <span className="truncate">{t.inmateName}</span>
                      <span className="text-[10px] bg-slate-900 text-amber-300 px-2 py-0.5 rounded font-mono">
                        {t.matricula}
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                        {t.totalSentenceYears}a {t.totalSentenceMonths}m
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {t.sentenceAcordaoNumber} · {t.courtName}
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 shrink-0 font-mono">
                    {t.transitDate}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
