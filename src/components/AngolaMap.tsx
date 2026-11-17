import React, { useState, useEffect } from 'react';
import { ProvinceId } from '../types/pnap';
import { PROVINCES_DATA } from '../data/mockPnapData';
import { ANGOLA_PROJECTED_PROVINCES, ProjectedProvince } from '../data/angolaVectorMapData';
import { pnapStore } from '../services/pnapStore';
import { MapPin, Lock, ChevronDown, CheckCircle2, ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';

interface AngolaMapProps {
  selectedProvinceId: ProvinceId;
  onSelectProvince: (provinceId: ProvinceId) => void;
  userRole: string;
  userAssignedProvince: string;
}

export const AngolaMap: React.FC<AngolaMapProps> = ({
  selectedProvinceId,
  onSelectProvince,
  userRole,
  userAssignedProvince
}) => {
  const [hoveredProvince, setHoveredProvince] = useState<ProjectedProvince | null>(null);
  const [showSelectorDropdown, setShowSelectorDropdown] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [jurisdictionNotice, setJurisdictionNotice] = useState<string | null>(null);
  const [, setStoreVersion] = useState(0);

  useEffect(() => {
    return pnapStore.subscribe(() => setStoreVersion((v) => v + 1));
  }, []);

  const hasGlobalScope =
    userRole === 'CENTRAL_ADMIN' ||
    (userRole === 'AUDITOR_INSPECTOR' && userAssignedProvince === 'all');

  // Regra de segurança: Acesso irrestrito ao ADMIN CENTRAL / Auditor Nacional, restante restrito ao comando local
  const isProvinceAllowed = (provId: string) => {
    if (hasGlobalScope) return true;
    return provId === userAssignedProvince;
  };

  const showBlockedProvinceNotice = (provName: string) => {
    const assignedName = PROVINCES_DATA[userAssignedProvince]?.name || userAssignedProvince;
    setJurisdictionNotice(
      `Jurisdição restrita a ${assignedName}: acesso direto a ${provName} negado. Utilize "Consultar" para pesquisa nacional federada.`
    );
  };

  const handleProvinceClick = (prov: ProjectedProvince) => {
    if (!isProvinceAllowed(prov.provinceId)) {
      showBlockedProvinceNotice(prov.name);
      return;
    }
    setJurisdictionNotice(null);
    onSelectProvince(prov.provinceId);
  };

  const currentProvinceMeta = PROVINCES_DATA[selectedProvinceId];
  const currentStats = pnapStore.getProvinceStats(selectedProvinceId);

  const selectedProjected = ANGOLA_PROJECTED_PROVINCES.find(
    (p) => p.provinceId === selectedProvinceId
  );

  return (
    <div className="flex-1 min-h-0 w-full bg-[#0b192c] text-white rounded-2xl md:rounded-3xl p-2 md:p-3 shadow-2xl border border-blue-900/40 relative flex flex-col justify-between overflow-hidden">
      {/* Header do Mapa: Título e Chip Operacional Flutuante da Província Ativa */}
      <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
        <h2 className="text-[11px] md:text-xs font-bold tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          RDPA 2024 · 21 PROVÍNCIAS
        </h2>
        
        {/* Chip Operacional com dados essenciais diretamente no mapa */}
        <div className="bg-[#132847] border border-blue-700/50 px-2.5 py-0.5 rounded-full flex items-center gap-2 text-[10px] md:text-xs font-medium text-blue-200 shadow-sm">
          <span className="font-bold text-white flex items-center gap-1">
            <MapPin className="w-3 h-3 text-blue-400" />
            {currentProvinceMeta?.name || 'Luanda'}
          </span>
          <span className="text-slate-400">·</span>
          <span>{currentStats.activeInmates.toLocaleString()} Reclusos</span>
          <span className="text-slate-400">·</span>
          <span className={currentStats.occupancyRate > 90 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
            {currentStats.occupancyRate}%
          </span>
        </div>
      </div>

      {/* Aviso inline de isolamento de jurisdição (sem window.alert) */}
      {jurisdictionNotice && (
        <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/85 border border-amber-500/60 text-amber-200 text-[11px] flex items-center justify-between gap-2 shrink-0">
          <span className="flex items-center gap-1.5 min-w-0 truncate">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{jurisdictionNotice}</span>
          </span>
          <button
            type="button"
            onClick={() => setJurisdictionNotice(null)}
            aria-label="Fechar aviso"
            className="text-amber-300 hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Container Central do Mapa Vetorial (Sem fotos ou dados redundantes) */}
      <div className="relative flex-1 min-h-0 bg-[#cde4f0] rounded-xl overflow-hidden shadow-inner flex items-center justify-center border border-blue-950/20">
        <div className="relative w-full h-full flex items-center justify-center p-1">
          {/* Controles rápidos de visualização muito discretos */}
          <div className="absolute top-1.5 left-1.5 z-10 flex gap-1 bg-white/75 backdrop-blur rounded-md p-0.5 shadow border border-slate-300 text-slate-700 text-[10px]">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(z + 0.2, 1.8))}
              className="w-5 h-5 flex items-center justify-center hover:bg-slate-200 rounded"
              title="Ampliar"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(z - 0.2, 0.8))}
              className="w-5 h-5 flex items-center justify-center hover:bg-slate-200 rounded"
              title="Reduzir"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomLevel(1);
                setShowLabels((l) => !l);
              }}
              className="w-5 h-5 flex items-center justify-center hover:bg-slate-200 rounded"
              title="Reset"
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* SVG do Mapa Interativo com as 21 províncias oficiais da RDPA 2024 */}
          <svg
            viewBox="0 0 500 550"
            className="w-full h-full max-h-full filter drop-shadow-sm select-none"
            style={{ transform: `scale(${zoomLevel})`, maxHeight: '100%' }}
          >
              <defs>
                {/* Efeito de relevo para a província ativa */}
                <filter id="glow-selected" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1e40af" floodOpacity="0.6" />
                </filter>
                <pattern id="sea-waves" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 0 10 Q 5 7 10 10 T 20 10" fill="none" stroke="#b6dcf0" strokeWidth="0.8" opacity="0.6" />
                </pattern>
              </defs>

              {/* Oceano Atlântico (Fundo esquerdo) */}
              <rect x="0" y="0" width="130" height="550" fill="url(#sea-waves)" opacity="0.5" />
              
              {/* Marca d'água de referências geográficas costeiras e internacionais */}
              <g className="select-none pointer-events-none">
                <text x="25" y="240" fill="#0284c7" fontSize="11" fontWeight="700" letterSpacing="2" fontStyle="italic" opacity="0.75" transform="rotate(-90 25 240)">
                  ATLANTIC OCEAN
                </text>
                <text x="22" y="380" fill="#0369a1" fontSize="9" fontWeight="600" opacity="0.5">
                  (Oceano Atlântico)
                </text>
                
                {/* Rep. of Congo (Norte de Cabinda) */}
                <text x="28" y="22" fill="#64748b" fontSize="8" fontWeight="600" letterSpacing="0.5" opacity="0.7">
                  REP. OF CONGO
                </text>
                
                {/* R. D. Congo (Norte e Nordeste) */}
                <text x="270" y="75" fill="#64748b" fontSize="9.5" fontWeight="700" letterSpacing="1" opacity="0.7">
                  DEMOCRATIC REPUBLIC
                </text>
                <text x="290" y="90" fill="#64748b" fontSize="8.5" fontWeight="700" letterSpacing="1" opacity="0.7">
                  OF THE CONGO
                </text>

                {/* Zâmbia (Leste) */}
                <text x="440" y="475" fill="#64748b" fontSize="9" fontWeight="700" letterSpacing="1" opacity="0.7">
                  ZAMBIA
                </text>

                {/* Namíbia (Sul) */}
                <text x="210" y="542" fill="#64748b" fontSize="9" fontWeight="700" letterSpacing="1" opacity="0.7">
                  NAMIBIA
                </text>
              </g>

              {/* Polígonos Oficiais das 21 Províncias da RDPA 2024 */}
              {ANGOLA_PROJECTED_PROVINCES.map((prov) => {
                const isSelected = selectedProvinceId === prov.provinceId;
                const isHovered = hoveredProvince?.provinceId === prov.provinceId;
                const allowed = isProvinceAllowed(prov.provinceId);

                // Estilo cromático oficial baseado no mapa de referência RDPA 2024
                let fill = prov.fillColor;
                if (isSelected) {
                  fill = '#2563eb'; // Azul intenso para a província ativa
                } else if (isHovered) {
                  fill = '#60a5fa'; // Azul claro no hover
                } else if (!allowed && !hasGlobalScope) {
                  fill = '#cbd5e1'; // Tom de isolamento jurisdicional
                }

                return (
                  <g
                    key={prov.code}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredProvince(prov)}
                    onMouseLeave={() => setHoveredProvince(null)}
                    onClick={() => handleProvinceClick(prov)}
                  >
                    <path
                      d={prov.pathD}
                      fill={fill}
                      stroke={isSelected ? '#1e3a8a' : isHovered ? '#1d4ed8' : '#64748b'}
                      strokeWidth={isSelected ? '2.5' : isHovered ? '1.8' : '0.8'}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      filter={isSelected ? 'url(#glow-selected)' : undefined}
                      className="transition-colors duration-150"
                      opacity={!allowed && !hasGlobalScope ? 0.65 : 1}
                    />

                    {/* Nomes oficiais e siglas posicionados exatamente nos centróides calculados */}
                    {showLabels && (
                      <g className="pointer-events-none select-none">
                        <text
                          x={prov.center[0]}
                          y={prov.center[1]}
                          fill={isSelected ? '#ffffff' : '#1e293b'}
                          fontSize={
                            prov.code === 'LUA' || prov.code === 'ICB' || prov.code === 'CAB' 
                              ? '7.5' 
                              : '8.5'
                          }
                          fontWeight={isSelected ? '800' : '600'}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]"
                        >
                          {prov.name}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Marcador luminoso na província selecionada */}
              {selectedProjected && (
                <g className="pointer-events-none">
                  <circle
                    cx={selectedProjected.center[0]}
                    cy={selectedProjected.center[1] - 8}
                    r="4"
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="animate-bounce"
                  />
                </g>
              )}
            </svg>

            {/* Tooltip Dinâmico Flutuante com Métricas ao passar o rato */}
            {hoveredProvince && (
              <div className="absolute top-2 right-2 bg-slate-900/95 text-white text-xs px-3 py-2.5 rounded-xl shadow-2xl pointer-events-none border border-slate-700 z-20 backdrop-blur max-w-[210px]">
                <div className="font-bold flex items-center justify-between text-blue-400 pb-1 border-b border-slate-800">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {hoveredProvince.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">({hoveredProvince.code})</span>
                </div>
                
                <div className="mt-1.5 space-y-1">
                  <div className="text-[11px] text-slate-300 flex justify-between">
                    <span>Reclusos ativos:</span>
                    <strong className="text-white">
                      {pnapStore.getProvinceStats(hoveredProvince.provinceId).activeInmates.toLocaleString()}
                    </strong>
                  </div>
                  <div className="text-[11px] text-slate-300 flex justify-between">
                    <span>Ocupação:</span>
                    <strong className="text-emerald-400">
                      {pnapStore.getProvinceStats(hoveredProvince.provinceId).occupancyRate}%
                    </strong>
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>Capacidade:</span>
                    <strong className="text-amber-400">
                      {pnapStore.getProvinceStats(hoveredProvince.provinceId).totalCapacity} vagas
                    </strong>
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>Estabelecimentos:</span>
                    <span className="text-slate-200">
                      {pnapStore.getProvinceStats(hoveredProvince.provinceId).establishmentsCount}
                    </span>
                  </div>
                </div>

                {!isProvinceAllowed(hoveredProvince.provinceId) && (
                  <div className="text-[10px] text-amber-300 flex items-center gap-1 mt-2 pt-1 border-t border-slate-800 font-medium">
                    <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                    Jurisdição restrita a {PROVINCES_DATA[userAssignedProvince]?.name || userAssignedProvince}
                  </div>
                )}
              </div>
            )}
          </div>
      </div>

      {/* Botão e Dropdown "Selecionar Província" (Conforme Mockup visual) */}
      <div className="mt-3 relative">
        <button
          type="button"
          onClick={() => setShowSelectorDropdown(!showSelectorDropdown)}
          className="w-full bg-[#0d1d33] hover:bg-[#132847] text-slate-300 hover:text-white text-xs md:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 border border-blue-900/50 transition-all cursor-pointer shadow-sm group"
        >
          <span className="font-medium text-slate-300 group-hover:text-white">Selecionar província</span>
          <span className="text-blue-400 font-bold">({currentProvinceMeta?.name || 'Luanda'})</span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform ${showSelectorDropdown ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown completo com as 21 províncias da RDPA 2024 */}
        {showSelectorDropdown && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1d33] border border-blue-700/60 rounded-2xl shadow-2xl p-2.5 z-30 max-h-72 overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-blue-900/60 mb-2">
              <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">
                Divisão Territorial RDPA 2024 (21 Províncias)
              </span>
              <span className="text-[10px] text-blue-400">
                {hasGlobalScope ? 'Acesso Global' : 'Filtro de Comando'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {ANGOLA_PROJECTED_PROVINCES.map((prov) => {
                const isSelected = selectedProvinceId === prov.provinceId;
                const isAllowed = isProvinceAllowed(prov.provinceId);

                return (
                  <button
                    key={prov.code}
                    type="button"
                    onClick={() => {
                      if (!isAllowed) {
                        showBlockedProvinceNotice(prov.name);
                        return;
                      }
                      setJurisdictionNotice(null);
                      onSelectProvince(prov.provinceId);
                      setShowSelectorDropdown(false);
                    }}
                    className={`px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-md'
                        : isAllowed
                        ? 'hover:bg-blue-950/70 text-slate-200 bg-slate-900/40'
                        : 'opacity-40 hover:opacity-60 text-slate-400 bg-slate-900/20 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-600"
                        style={{ backgroundColor: prov.fillColor }}
                      />
                      <span className="truncate">{prov.name}</span>
                    </div>

                    {isSelected ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0 ml-1" />
                    ) : !isAllowed ? (
                      <Lock className="w-3 h-3 text-slate-500 shrink-0 ml-1" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

