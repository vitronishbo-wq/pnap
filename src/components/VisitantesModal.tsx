import React, { useState } from 'react';
import { VisitorRecord, VisitRecord } from '../types/pnap';
import { MOCK_VISITORS, MOCK_VISITS } from '../data/mockPnapData';
import { Users, X, CheckCircle, ShieldCheck, Phone, Calendar, Search } from 'lucide-react';

interface VisitantesModalProps {
  onClose: () => void;
}

export const VisitantesModal: React.FC<VisitantesModalProps> = ({ onClose }) => {
  const [visitors, setVisitors] = useState<VisitorRecord[]>(MOCK_VISITORS);
  const [visits, setVisits] = useState<VisitRecord[]>(MOCK_VISITS);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredVisitors = visitors.filter(
    (v) =>
      v.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.biNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.inmateName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#0b192c] text-white w-full max-w-3xl rounded-3xl shadow-2xl border border-blue-900/60 overflow-hidden my-auto flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-[#10233f] p-4 md:p-5 border-b border-blue-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 text-white p-2 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Controlo de Visitantes & Parlatório</h2>
              <p className="text-xs text-slate-400">
                Registo biométrico, revistas de segurança e parentesco
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/60 p-2 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Busca Rápida */}
        <div className="p-3 bg-[#081220] border-b border-blue-900/60">
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

        {/* Lista */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 text-xs space-y-3">
          {filteredVisitors.map((v) => (
            <div
              key={v.visitorId}
              className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/40 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <strong className="text-white text-sm">{v.fullName}</strong>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                    BI: {v.biNumber}
                  </span>
                </div>
                <div className="text-slate-300 mt-1">
                  Grau de Parentesco:{' '}
                  <strong className="text-amber-300">{v.relationship}</strong> de{' '}
                  <span className="text-blue-300">{v.inmateName}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" /> {v.phone}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" /> Última Visita: {v.lastVisitDate}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> {v.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
