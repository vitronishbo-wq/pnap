import React, { useState } from 'react';
import { ProvinceId, PnapUser, EstablishmentProfile, Pavilion, Block, Cell } from '../types/pnap';
import { PROVINCES_DATA } from '../data/mockPnapData';
import { pnapStore } from '../services/pnapStore';
import {
  Building2,
  Plus,
  CheckCircle2,
  FileCheck2,
  X,
  Trash2,
  Save,
  FileEdit,
  AlertCircle
} from 'lucide-react';

interface ProvisionamentoModalProps {
  currentUser: PnapUser;
  onClose: () => void;
  presetProvinceId?: ProvinceId;
}

const createEmptyCell = (): Cell => ({
  cellId: `cel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  code: '',
  capacity: 0,
  currentOccupants: 0,
  securityLevel: 'MEDIA',
  inmateIds: []
});

const createEmptyBlock = (): Block => ({
  blockId: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  cells: [createEmptyCell()],
  calculatedCapacity: 0
});

const createEmptyPavilion = (): Pavilion => ({
  pavilionId: `pav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  securityType: 'FECHADO',
  blocks: [createEmptyBlock()],
  calculatedCapacity: 0
});

export const ProvisionamentoModal: React.FC<ProvisionamentoModalProps> = ({
  currentUser,
  onClose,
  presetProvinceId
}) => {
  const [selectedProvince, setSelectedProvince] = useState<ProvinceId | ''>(presetProvinceId || '');
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [editingEstId, setEditingEstId] = useState<string | null>(null);
  const [estName, setEstName] = useState('');
  const [pavilions, setPavilions] = useState<Pavilion[]>(() => [createEmptyPavilion()]);

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [targetEstForHomologation, setTargetEstForHomologation] = useState<EstablishmentProfile | null>(null);
  const [decreeNumber, setDecreeNumber] = useState('');

  const getBlockCapacity = (blk: Block) =>
    blk.cells.reduce((sum, c) => sum + (Number(c.capacity) || 0), 0);

  const getPavilionCapacity = (pav: Pavilion) =>
    pav.blocks.reduce((sum, blk) => sum + getBlockCapacity(blk), 0);

  const totalCalculated = pavilions.reduce((sum, pav) => sum + getPavilionCapacity(pav), 0);

  const handleAddPavilion = () => {
    setPavilions((prev) => [...prev, createEmptyPavilion()]);
  };

  const handleRemovePavilion = (pavilionId: string) => {
    setPavilions((prev) => prev.filter((p) => p.pavilionId !== pavilionId));
  };

  const handlePavilionNameChange = (pavilionId: string, name: string) => {
    setPavilions((prev) =>
      prev.map((p) => (p.pavilionId === pavilionId ? { ...p, name } : p))
    );
  };

  const handleAddBlock = (pavilionId: string) => {
    setPavilions((prev) =>
      prev.map((p) =>
        p.pavilionId === pavilionId
          ? { ...p, blocks: [...p.blocks, createEmptyBlock()] }
          : p
      )
    );
  };

  const handleRemoveBlock = (pavilionId: string, blockId: string) => {
    setPavilions((prev) =>
      prev.map((p) =>
        p.pavilionId === pavilionId
          ? { ...p, blocks: p.blocks.filter((b) => b.blockId !== blockId) }
          : p
      )
    );
  };

  const handleBlockNameChange = (pavilionId: string, blockId: string, name: string) => {
    setPavilions((prev) =>
      prev.map((p) =>
        p.pavilionId === pavilionId
          ? {
              ...p,
              blocks: p.blocks.map((b) => (b.blockId === blockId ? { ...b, name } : b))
            }
          : p
      )
    );
  };

  const handleAddCell = (pavilionId: string, blockId: string) => {
    setPavilions((prev) =>
      prev.map((p) =>
        p.pavilionId === pavilionId
          ? {
              ...p,
              blocks: p.blocks.map((b) =>
                b.blockId === blockId ? { ...b, cells: [...b.cells, createEmptyCell()] } : b
              )
            }
          : p
      )
    );
  };

  const handleRemoveCell = (pavilionId: string, blockId: string, cellId: string) => {
    setPavilions((prev) =>
      prev.map((p) =>
        p.pavilionId === pavilionId
          ? {
              ...p,
              blocks: p.blocks.map((b) =>
                b.blockId === blockId
                  ? { ...b, cells: b.cells.filter((c) => c.cellId !== cellId) }
                  : b
              )
            }
          : p
      )
    );
  };

  const handleCellChange = (
    pavilionId: string,
    blockId: string,
    cellId: string,
    field: 'code' | 'capacity',
    value: string
  ) => {
    setPavilions((prev) =>
      prev.map((p) =>
        p.pavilionId === pavilionId
          ? {
              ...p,
              blocks: p.blocks.map((b) =>
                b.blockId === blockId
                  ? {
                      ...b,
                      cells: b.cells.map((c) =>
                        c.cellId === cellId
                          ? {
                              ...c,
                              [field]:
                                field === 'capacity'
                                  ? Math.max(0, parseInt(value || '0', 10) || 0)
                                  : value
                            }
                          : c
                      )
                    }
                  : b
              )
            }
          : p
      )
    );
  };

  const buildEstablishmentPayload = (provinceId: ProvinceId) => {
    const estId = editingEstId || `est-${provinceId}-${Date.now()}`;
    const generatedCode = estName.trim()
      ? estName
          .trim()
          .split(/\s+/)
          .slice(0, 3)
          .map((w) => w[0]?.toUpperCase() || '')
          .join('')
      : 'RASC';

    return {
      establishmentId: estId,
      provinceId,
      name: estName.trim(),
      code: generatedCode,
      type: 'PENITENCIARIA' as const,
      securityLevel: 'MEDIA' as const,
      directorName: '',
      address: '',
      activeInmatesCount: 0,
      pavilions
    };
  };

  // FASE 1: Rascunho (permite estado incompleto)
  const handleSaveDraft = () => {
    if (!selectedProvince) {
      setFeedback({ type: 'err', text: 'Selecione a província.' });
      return;
    }

    const payload = buildEstablishmentPayload(selectedProvince);
    const result = pnapStore.saveDraftEstablishment(currentUser, payload);

    if (result.success && result.establishment) {
      setEditingEstId(result.establishment.establishmentId);
      setFeedback({ type: 'ok', text: result.message });
    } else {
      setFeedback({ type: 'err', text: result.message });
    }
  };

  // Pré-validação para abrir despacho de homologação
  const handleOpenHomologation = () => {
    if (!selectedProvince) {
      setFeedback({ type: 'err', text: 'Selecione a província.' });
      return;
    }
    if (!estName.trim()) {
      setFeedback({ type: 'err', text: 'Preencha o nome oficial da estrutura.' });
      return;
    }
    if (pavilions.length === 0) {
      setFeedback({ type: 'err', text: 'Adicione pelo menos 1 pavilhão.' });
      return;
    }
    for (const pav of pavilions) {
      if (!pav.name.trim()) {
        setFeedback({ type: 'err', text: 'Preencha o nome de todos os pavilhões.' });
        return;
      }
      if (pav.blocks.length === 0) {
        setFeedback({ type: 'err', text: `Adicione um bloco em ${pav.name}.` });
        return;
      }
      for (const blk of pav.blocks) {
        if (!blk.name.trim()) {
          setFeedback({ type: 'err', text: `Selecione o bloco (A, B ou C) em ${pav.name}.` });
          return;
        }
        if (blk.cells.length === 0) {
          setFeedback({ type: 'err', text: `Adicione celas em ${blk.name}.` });
          return;
        }
        for (const cell of blk.cells) {
          if (!cell.code.trim() || cell.capacity <= 0) {
            setFeedback({ type: 'err', text: `Preencha código e vagas em todas as celas de ${blk.name}.` });
            return;
          }
        }
      }
    }

    const payload = buildEstablishmentPayload(selectedProvince);
    const saved = pnapStore.saveDraftEstablishment(currentUser, payload);
    if (!saved.success || !saved.establishment) {
      setFeedback({ type: 'err', text: saved.message });
      return;
    }

    setEditingEstId(saved.establishment.establishmentId);
    setFeedback(null);
    setDecreeNumber('');
    setTargetEstForHomologation(saved.establishment);
  };

  const handleConfirmHomologation = () => {
    if (!targetEstForHomologation) return;

    const result = pnapStore.homologateEstablishment(
      currentUser,
      targetEstForHomologation.provinceId,
      targetEstForHomologation.establishmentId,
      decreeNumber
    );

    if (result.success) {
      setTargetEstForHomologation(null);
      setEditingEstId(null);
      setEstName('');
      setPavilions([createEmptyPavilion()]);
      setFeedback({ type: 'ok', text: result.message });
      setActiveTab('list');
    } else {
      setFeedback({ type: 'err', text: result.message });
    }
  };

  const handleLoadDraft = (est: EstablishmentProfile) => {
    setSelectedProvince(est.provinceId);
    setEditingEstId(est.establishmentId);
    setEstName(est.name);
    setPavilions(
      est.pavilions && est.pavilions.length > 0 ? est.pavilions : [createEmptyPavilion()]
    );
    setFeedback(null);
    setActiveTab('create');
  };

  const existingEstablishments = selectedProvince
    ? pnapStore.getEstablishments(selectedProvince)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm">
      <div className="bg-[#0b192c] text-white w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl border border-blue-800/70 overflow-hidden flex flex-col max-h-[94dvh]">
        {/* HEADER ULTRA-SINTÉTICO */}
        <div className="bg-[#10233f] px-3 py-2.5 sm:px-5 sm:py-3.5 border-b border-blue-800/70 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-amber-500 text-slate-950 p-1.5 rounded-lg shrink-0">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <h2 className="text-sm sm:text-base font-bold truncate">Provisionamento</h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={selectedProvince}
              onChange={(e) => {
                setSelectedProvince(e.target.value as ProvinceId | '');
                setFeedback(null);
              }}
              aria-label="Província"
              className="bg-[#132847] text-white border border-blue-700/70 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer max-w-[150px] sm:max-w-none"
            >
              <option value="">Província</option>
              {Object.values(PROVINCES_DATA).map((prov) => (
                <option key={prov.id} value={prov.id}>
                  {prov.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ABAS COMPACTAS */}
        <div className="bg-[#0e2038] px-3 py-2 border-b border-blue-900/60 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-[#132847] p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-all ${
                activeTab === 'create' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Formulário
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-all ${
                activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Lista ({existingEstablishments.length})
            </button>
          </div>

          <div className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
            {totalCalculated} vagas
          </div>
        </div>

        {/* FEEDBACK INLINE */}
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
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-3">
          {activeTab === 'create' ? (
            <>
              {/* 1. ESTRUTURA / CAPACIDADE */}
              <div className="bg-[#10233f] p-3 rounded-xl border border-blue-900/60">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-2 items-center">
                  <input
                    type="text"
                    value={estName}
                    onChange={(e) => setEstName(e.target.value)}
                    placeholder="Nome oficial da estrutura"
                    aria-label="Nome oficial da estrutura"
                    className="w-full bg-[#0b192c] border border-blue-800/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <div className="bg-[#0b192c] border border-blue-900/60 rounded-lg px-3 py-2 text-xs font-mono font-bold text-amber-400 text-center">
                    {totalCalculated} vagas
                  </div>
                </div>
              </div>

              {/* 2. PAVILHÕES -> 3. BLOCOS (A/B/C) -> 4. CELAS */}
              <div className="space-y-3">
                {pavilions.map((pav) => {
                  const pavCap = getPavilionCapacity(pav);

                  return (
                    <div
                      key={pav.pavilionId}
                      className="bg-[#10233f] p-3 rounded-xl border border-blue-900/60 space-y-2.5"
                    >
                      {/* Linha do Pavilhão / Capacidade */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={pav.name}
                          onChange={(e) => handlePavilionNameChange(pav.pavilionId, e.target.value)}
                          placeholder="Pavilhão"
                          aria-label="Pavilhão"
                          className="flex-1 min-w-0 bg-[#0b192c] border border-blue-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-[#0b192c] border border-blue-900/60 px-2.5 py-1.5 rounded-lg shrink-0">
                          {pavCap} v
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddBlock(pav.pavilionId)}
                          className="bg-[#132847] hover:bg-[#1a3863] text-blue-300 border border-blue-700/60 px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Bloco</span>
                        </button>
                        {pavilions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePavilion(pav.pavilionId)}
                            aria-label="Remover pavilhão"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Blocos dentro do Pavilhão */}
                      <div className="space-y-2 pl-2 sm:pl-3 border-l-2 border-blue-800/60">
                        {pav.blocks.map((blk) => {
                          const blkCap = getBlockCapacity(blk);

                          return (
                            <div
                              key={blk.blockId}
                              className="bg-[#0b192c] p-2.5 rounded-xl border border-slate-800 space-y-2"
                            >
                              {/* Select Bloco (A, B ou C) / Capacidade individual */}
                              <div className="flex items-center gap-2">
                                <select
                                  value={blk.name}
                                  onChange={(e) =>
                                    handleBlockNameChange(pav.pavilionId, blk.blockId, e.target.value)
                                  }
                                  aria-label="Bloco"
                                  className="flex-1 min-w-0 bg-[#10233f] border border-blue-800/80 rounded-lg px-2.5 py-1.5 text-xs text-white cursor-pointer focus:outline-none focus:border-blue-500"
                                >
                                  <option value="">Bloco (A, B ou C)</option>
                                  <option value="Bloco A">Bloco A</option>
                                  <option value="Bloco B">Bloco B</option>
                                  <option value="Bloco C">Bloco C</option>
                                </select>

                                <span className="text-xs font-mono font-bold text-amber-300 bg-[#10233f] border border-slate-800 px-2.5 py-1.5 rounded-lg shrink-0">
                                  {blkCap} v
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleAddCell(pav.pavilionId, blk.blockId)}
                                  className="bg-[#132847] hover:bg-[#1a3863] text-blue-300 border border-blue-700/60 px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Cela</span>
                                </button>

                                {pav.blocks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBlock(pav.pavilionId, blk.blockId)}
                                    aria-label="Remover bloco"
                                    className="p-1.5 rounded-lg bg-slate-800/70 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 cursor-pointer shrink-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Celas individuais (Código + Capacidade própria) */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {blk.cells.map((cell) => (
                                  <div
                                    key={cell.cellId}
                                    className="flex items-center gap-1.5 bg-[#10233f]/70 p-1.5 rounded-lg border border-slate-800/80"
                                  >
                                    <input
                                      type="text"
                                      value={cell.code}
                                      onChange={(e) =>
                                        handleCellChange(
                                          pav.pavilionId,
                                          blk.blockId,
                                          cell.cellId,
                                          'code',
                                          e.target.value
                                        )
                                      }
                                      placeholder="Cela"
                                      aria-label="Código da cela"
                                      className="flex-1 min-w-0 bg-[#0b192c] border border-blue-900/70 rounded-md px-2 py-1 text-xs text-white placeholder:text-slate-500 font-mono focus:outline-none focus:border-blue-500"
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      value={cell.capacity > 0 ? cell.capacity : ''}
                                      onChange={(e) =>
                                        handleCellChange(
                                          pav.pavilionId,
                                          blk.blockId,
                                          cell.cellId,
                                          'capacity',
                                          e.target.value
                                        )
                                      }
                                      placeholder="Vagas"
                                      aria-label="Vagas da cela"
                                      className="w-16 bg-[#0b192c] border border-blue-900/70 rounded-md px-2 py-1 text-xs text-amber-300 placeholder:text-slate-500 font-mono text-center focus:outline-none focus:border-blue-500"
                                    />
                                    {blk.cells.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveCell(pav.pavilionId, blk.blockId, cell.cellId)
                                        }
                                        aria-label="Remover cela"
                                        className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleAddPavilion}
                className="w-full py-2 rounded-xl border border-dashed border-blue-700/70 text-blue-300 hover:bg-[#10233f] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pavilhão</span>
              </button>
            </>
          ) : (
            /* ABA LISTA COMPACTA */
            <div className="space-y-2">
              {!selectedProvince ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-[#10233f] rounded-xl">
                  Selecione a província.
                </div>
              ) : existingEstablishments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-[#10233f] rounded-xl">
                  Sem registos.
                </div>
              ) : (
                existingEstablishments.map((est) => {
                  const isHomologated = est.provisioningStatus === 'HOMOLOGATED';
                  return (
                    <div
                      key={est.establishmentId}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        isHomologated
                          ? 'bg-[#10233f] border-emerald-500/40'
                          : 'bg-[#142338] border-amber-500/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-white truncate">
                            {est.name || 'Rascunho'}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
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
                        <div className="text-[11px] font-mono text-amber-400 mt-0.5">
                          {est.totalCapacity} vagas
                        </div>
                      </div>

                      {!isHomologated && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadDraft(est)}
                            className="bg-[#132847] hover:bg-[#1a3863] text-blue-300 text-xs px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDecreeNumber('');
                              setTargetEstForHomologation(est);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold cursor-pointer"
                          >
                            Homologar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* RODAPÉ FIXO DE AÇÃO */}
        {activeTab === 'create' && (
          <div className="bg-[#0e2038] px-3 py-2.5 sm:px-4 border-t border-blue-900/60 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="flex-1 sm:flex-none bg-[#132847] hover:bg-[#1a3863] text-blue-200 border border-blue-700/80 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Rascunho</span>
            </button>

            <button
              type="button"
              onClick={handleOpenHomologation}
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Homologar</span>
            </button>
          </div>
        )}

        {/* MODAL DE DESPACHO HOMOLOGATÓRIO */}
        {targetEstForHomologation && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <div className="bg-[#0b192c] text-white w-full max-w-sm rounded-2xl border border-emerald-500 shadow-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-400">Homologação</span>
                <button
                  type="button"
                  onClick={() => setTargetEstForHomologation(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs space-y-1 bg-[#10233f] p-2.5 rounded-xl">
                <div className="font-bold text-white truncate">{targetEstForHomologation.name}</div>
                <div className="text-amber-400 font-mono font-bold">
                  {targetEstForHomologation.totalCapacity} vagas
                </div>
              </div>

              <input
                type="text"
                value={decreeNumber}
                onChange={(e) => setDecreeNumber(e.target.value)}
                placeholder="N.º do Despacho Homologatório"
                aria-label="Número do Despacho Homologatório"
                className="w-full bg-[#132847] border border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 font-mono focus:outline-none"
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTargetEstForHomologation(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmHomologation}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmar</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
