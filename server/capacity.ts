import type { EstablishmentProfile } from '../src/types/pnap';

export function computeStructureCapacities(establishment: EstablishmentProfile): EstablishmentProfile {
  let estTotal = 0;
  const updatedPavilions = (establishment.pavilions || []).map((pav) => {
    let pavTotal = 0;
    const updatedBlocks = (pav.blocks || []).map((blk) => {
      const blkTotal = (blk.cells || []).reduce((acc, c) => acc + (Number(c.capacity) || 0), 0);
      pavTotal += blkTotal;
      return {
        ...blk,
        calculatedCapacity: blkTotal
      };
    });
    estTotal += pavTotal;
    return {
      ...pav,
      blocks: updatedBlocks,
      calculatedCapacity: pavTotal
    };
  });

  return {
    ...establishment,
    pavilions: updatedPavilions,
    totalCapacity: estTotal > 0 ? estTotal : Number(establishment.totalCapacity) || 0
  };
}

export function validateEstablishmentForHomologation(
  establishment: EstablishmentProfile,
  decreeNumber: string
): { valid: true; normalized: EstablishmentProfile } | { valid: false; message: string } {
  const recomputed = computeStructureCapacities(establishment);

  if (!recomputed.name || !recomputed.name.trim()) {
    return { valid: false, message: 'Homologação rejeitada: Nome oficial da estrutura obrigatório.' };
  }

  if (!recomputed.pavilions || recomputed.pavilions.length === 0) {
    return { valid: false, message: 'Homologação rejeitada: A estrutura deve conter no mínimo 1 Pavilhão.' };
  }

  for (const pav of recomputed.pavilions) {
    if (!pav.name || !pav.name.trim()) {
      return { valid: false, message: 'Homologação rejeitada: Todos os pavilhões devem ter nome.' };
    }
    if (!pav.blocks || pav.blocks.length === 0) {
      return { valid: false, message: `Homologação rejeitada: Pavilhão "${pav.name}" sem blocos.` };
    }
    for (const blk of pav.blocks) {
      if (!blk.name || !blk.name.trim()) {
        return { valid: false, message: `Homologação rejeitada: Selecione o bloco em "${pav.name}".` };
      }
      if (!blk.cells || blk.cells.length === 0) {
        return { valid: false, message: `Homologação rejeitada: "${blk.name}" sem celas registadas.` };
      }
      for (const cell of blk.cells) {
        if (!cell.code || !cell.code.trim()) {
          return { valid: false, message: `Homologação rejeitada: Existem celas sem código em "${blk.name}".` };
        }
        if (!Number.isFinite(cell.capacity) || cell.capacity <= 0) {
          return { valid: false, message: `Homologação rejeitada: Cela "${cell.code}" sem capacidade válida.` };
        }
      }
    }
  }

  if (recomputed.totalCapacity <= 0) {
    return { valid: false, message: 'Homologação rejeitada: A capacidade calculada das celas é zero.' };
  }

  if (!decreeNumber || !decreeNumber.trim()) {
    return { valid: false, message: 'Homologação rejeitada: Informe o N.º do Despacho Homologatório.' };
  }

  return { valid: true, normalized: recomputed };
}
