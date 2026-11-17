import React, { useState, useEffect } from 'react';
import type { PnapUser, ProvinceId, VisitorRecord, VisitRecord } from '../types/pnap';
import { MOCK_VISITORS, MOCK_VISITS } from '../data/mockPnapData';
import { pnapStore } from '../services/pnapStore';
import {
  fetchVisitorsViaApi,
  fetchVisitsViaApi,
  registerVisitCheckInViaApi,
  registerVisitorViaApi,
  updateVisitorStatusViaApi
} from '../services/apiClient';
import {
  Users,
  X,
  ShieldCheck,
  Phone,
  Calendar,
  Search,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Ban
} from 'lucide-react';

interface VisitantesModalProps {
  currentUser: PnapUser;
  provinceId: ProvinceId;
  apiActive?: boolean;
  onClose: () => void;
}

export const VisitantesModal: React.FC<VisitantesModalProps> = ({
  currentUser,
  provinceId,
  apiActive = false,
  onClose
}) => {
  const [visitors, setVisitors] = useState<VisitorRecord[]>(MOCK_VISITORS);
  const [visits, setVisits] = useState<VisitRecord[]>(MOCK_VISITS);
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'visitors' | 'visits' | 'new_visitor' | 'checkin'>('visitors');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Form Novo Visitante
  const [visInmateId, setVisInmateId] = useState('');
  const [visName, setVisName] = useState('');
  const [visBi, setVisBi] = useState('');
  const [visPhone, setVisPhone] = useState('');
  const [visRel, setVisRel] = useState('Familiar');

  // Form Registar Visita (Portaria)
  const [checkVisitorId, setCheckVisitorId] = useState('');
  const [checkDate, setCheckDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkSlot, setCheckSlot] = useState('09:00 - 11:00');
  const [inspectionPassed, setInspectionPassed] = useState(true);

  const allInmates = pnapStore
    .getInmates()
    .filter((i) => pnapStore.canOperateProvince(currentUser, i.provinceId));

  useEffect(() => {
    if (!apiActive) return;
    let mounted = true;
    Promise.all([fetchVisitorsViaApi(), fetchVisitsViaApi()])
      .then(([vRes, vstRes]) => {
        if (!mounted) return;
        setVisitors(vRes.visitors);
        setVisits(vstRes.visits);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [apiActive, provinceId]);

  const role = currentUser.assignments.role;
  const canGateOperate = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR',
    'PENAL_CONTROL',
    'GATE_SECURITY',
    'OPERATIONAL_OFFICER'
  ].includes(role);
  const canSuspendVisitor = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR',
    'PENAL_CONTROL'
  ].includes(role);

  const filteredVisitors = visitors.filter(
    (v) =>
      v.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.biNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.inmateName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRegisterVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visInmateId || !visName.trim() || !visBi.trim()) return;
    if (!apiActive) {
      const inm = allInmates.find((i) => i.inmateId === visInmateId);
      const localVisitor: VisitorRecord = {
        visitorId: `vis-${Date.now()}`,
        fullName: visName.trim(),
        biNumber: visBi.trim(),
        phone: visPhone.trim(),
        relationship: visRel.trim(),
        inmateId: visInmateId,
        inmateName: inm?.profile.fullName || 'Recluso',
        provinceId: inm?.provinceId || provinceId,
        establishmentId: inm?.establishmentId || 'comarca-viana',
        lastVisitDate: '',
        status: 'AUTORIZADO'
      };
      setVisitors((prev) => [localVisitor, ...prev]);
      setFeedback({ type: 'ok', text: `Visitante ${localVisitor.fullName} cadastrado localmente.` });
      setVisName('');
      setVisBi('');
      setVisPhone('');
      setTab('visitors');
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await registerVisitorViaApi({
        inmateId: visInmateId,
        fullName: visName.trim(),
        biNumber: visBi.trim(),
        phone: visPhone.trim(),
        relationship: visRel.trim()
      });
      setVisitors((prev) => [res.visitor, ...prev]);
      setFeedback({ type: 'ok', text: `Visitante autorizado: ${res.visitor.fullName}.` });
      setVisName('');
      setVisBi('');
      setVisPhone('');
      setTab('visitors');
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao cadastrar visitante.' });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVisitorStatus = async (vis: VisitorRecord) => {
    const nextStatus = vis.status === 'AUTORIZADO' ? 'SUSPENSO' : 'AUTORIZADO';
    if (!apiActive) {
      setVisitors((prev) => prev.map((v) => (v.visitorId === vis.visitorId ? { ...v, status: nextStatus } : v)));
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await updateVisitorStatusViaApi(vis.visitorId, nextStatus, 'Alteração administrativa');
      setVisitors((prev) => prev.map((v) => (v.visitorId === vis.visitorId ? res.visitor : v)));
      setFeedback({ type: 'ok', text: `${vis.fullName} atualizado para ${nextStatus}.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atualizar visitante.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkVisitorId) return;
    if (!apiActive) {
      const vis = visitors.find((v) => v.visitorId === checkVisitorId);
      if (!inspectionPassed) {
        setFeedback({ type: 'err', text: 'Visita bloqueada: inspeção obrigatória não aprovada.' });
        return;
      }
      if (vis) {
        const localVisit: VisitRecord = {
          visitId: `vst-${Date.now()}`,
          visitorId: vis.visitorId,
          visitorName: vis.fullName,
          inmateId: vis.inmateId,
          inmateName: vis.inmateName,
          provinceId: vis.provinceId,
          establishmentId: vis.establishmentId,
          date: checkDate,
          timeSlot: checkSlot,
          inspectionPassed: true,
          dutyOfficer: currentUser.profile.fullName
        };
        setVisits((prev) => [localVisit, ...prev]);
        setFeedback({ type: 'ok', text: `Entrada na portaria registada: ${vis.fullName}.` });
        setTab('visits');
      }
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await registerVisitCheckInViaApi({
        visitorId: checkVisitorId,
        date: checkDate,
        timeSlot: checkSlot,
        inspectionPassed
      });
      setVisits((prev) => [res.visit, ...prev]);
      setFeedback({ type: 'ok', text: `Visita registada na portaria: ${res.visit.visitorName} ➔ ${res.visit.inmateName}.` });
      setTab('visits');
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Visita bloqueada na portaria.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0b192c] text-white w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl border border-blue-900/60 overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="bg-[#10233f] px-4 py-3 sm:px-5 sm:py-4 border-b border-blue-800/60 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-emerald-600 text-white p-2 rounded-xl shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                Portaria de Visitantes & Parlatório
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Controlo contra sanção disciplinar, custódia ativa e inspeção
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-400 hover:text-white bg-slate-800/60 p-2 rounded-xl cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#081220] p-2 border-b border-blue-900/60 gap-1.5 text-xs overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setTab('visitors');
            }}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap cursor-pointer ${
              tab === 'visitors' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Autorizados ({visitors.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setTab('visits');
            }}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap cursor-pointer ${
              tab === 'visits' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Registos ({visits.length})
          </button>
          {canGateOperate && (
            <>
              <button
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setTab('new_visitor');
                }}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap cursor-pointer ml-auto flex items-center gap-1 ${
                  tab === 'new_visitor'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Visitante</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setTab('checkin');
                }}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap cursor-pointer ${
                  tab === 'checkin'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-amber-950/50 text-amber-300 border border-amber-700/60'
                }`}
              >
                Registar Entrada
              </button>
            </>
          )}
        </div>

        {/* Feedback */}
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
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-300 hover:text-white font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Busca rápida nas listagens */}
        {(tab === 'visitors' || tab === 'visits') && (
          <div className="p-3 bg-[#081220] border-b border-blue-900/60 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar visitante por Nome, BI ou Recluso..."
                className="w-full bg-[#10233f] border border-blue-900/60 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Conteúdo */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 text-xs space-y-3">
          {tab === 'visitors' &&
            filteredVisitors.map((v) => (
              <div
                key={v.visitorId}
                className="bg-[#10233f] p-3.5 rounded-2xl border border-blue-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-white text-sm">{v.fullName}</strong>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                      BI: {v.biNumber}
                    </span>
                  </div>
                  <div className="text-slate-300 mt-1">
                    Parentesco: <strong className="text-amber-300">{v.relationship}</strong> de{' '}
                    <span className="text-blue-300">{v.inmateName}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" /> {v.phone || '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" /> Última: {v.lastVisitDate || 'N/D'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1 ${
                      v.status === 'AUTORIZADO'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border-rose-800'
                    }`}
                  >
                    {v.status === 'AUTORIZADO' ? <ShieldCheck className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                    {v.status}
                  </span>
                  {canSuspendVisitor && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleToggleVisitorStatus(v)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg text-[11px] cursor-pointer"
                    >
                      {v.status === 'AUTORIZADO' ? 'Suspender' : 'Reautorizar'}
                    </button>
                  )}
                </div>
              </div>
            ))}

          {tab === 'visits' &&
            visits.map((vst) => (
              <div
                key={vst.visitId}
                className="bg-[#10233f] p-3.5 rounded-2xl border border-emerald-900/40 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-bold text-white">
                    {vst.visitorName} ➔ <span className="text-blue-300">{vst.inmateName}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {vst.date} ({vst.timeSlot}) · Oficial: {vst.dutyOfficer}
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-full font-bold">
                  Inspeção OK
                </span>
              </div>
            ))}

          {tab === 'new_visitor' && (
            <form
              onSubmit={handleRegisterVisitor}
              className="space-y-3 max-w-lg mx-auto bg-[#10233f] p-4 rounded-2xl border border-emerald-800/40"
            >
              <select
                value={visInmateId}
                onChange={(e) => setVisInmateId(e.target.value)}
                className="w-full bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                required
              >
                <option value="">Selecionar Recluso *</option>
                {allInmates.map((i) => (
                  <option key={i.inmateId} value={i.inmateId}>
                    {i.profile.fullName} · {i.profile.matricula}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={visName}
                onChange={(e) => setVisName(e.target.value)}
                placeholder="Nome completo do visitante *"
                className="w-full bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={visBi}
                  onChange={(e) => setVisBi(e.target.value)}
                  placeholder="N.º BI *"
                  className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white font-mono"
                  required
                />
                <input
                  type="text"
                  value={visPhone}
                  onChange={(e) => setVisPhone(e.target.value)}
                  placeholder="Telefone"
                  className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                />
                <input
                  type="text"
                  value={visRel}
                  onChange={(e) => setVisRel(e.target.value)}
                  placeholder="Parentesco"
                  className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 rounded-xl cursor-pointer"
                >
                  Autorizar Visitante
                </button>
              </div>
            </form>
          )}

          {tab === 'checkin' && (
            <form
              onSubmit={handleCheckIn}
              className="space-y-3 max-w-lg mx-auto bg-[#10233f] p-4 rounded-2xl border border-amber-700/40"
            >
              <select
                value={checkVisitorId}
                onChange={(e) => setCheckVisitorId(e.target.value)}
                className="w-full bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                required
              >
                <option value="">Selecionar Visitante Cadastrado *</option>
                {visitors.map((v) => (
                  <option key={v.visitorId} value={v.visitorId}>
                    {v.fullName} ({v.status}) ➔ {v.inmateName}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                  required
                />
                <input
                  type="text"
                  value={checkSlot}
                  onChange={(e) => setCheckSlot(e.target.value)}
                  placeholder="Turno (ex: 09:00 - 11:00)"
                  className="bg-[#0b192c] border border-blue-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <label className="flex items-center gap-2 bg-[#0b192c] p-2.5 rounded-xl border border-blue-900/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inspectionPassed}
                  onChange={(e) => setInspectionPassed(e.target.checked)}
                />
                <span>Revista e inspeção obrigatória de portaria aprovada</span>
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-xl cursor-pointer"
                >
                  Confirmar Entrada na Portaria
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
