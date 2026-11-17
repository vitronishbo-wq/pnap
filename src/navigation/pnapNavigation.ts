import type { UserRole } from '../types/pnap';

export type PrimaryOperationalId = 'entrada_saida' | 'transicao' | 'visitas' | 'consulta';

export type SecondaryOperationalId =
  | 'movimentacoes'
  | 'transferencias'
  | 'espolio'
  | 'ocorrencias'
  | 'saude'
  | 'reabilitacao'
  | 'controlo_penal'
  | 'disciplina'
  | 'relatorios'
  | 'alertas'
  | 'agenda'
  | 'documentos';

export type OperationalViewId = 'home' | PrimaryOperationalId | SecondaryOperationalId;

export type SecondaryGroupId =
  | 'operacoes_complementares'
  | 'gestao_especializada'
  | 'informacao_acompanhamento';

export type AdminSectionId =
  | 'visao_nacional'
  | 'estrutura_prisional'
  | 'utilizadores'
  | 'funcoes_permissoes'
  | 'homologacoes'
  | 'catalogos_institucionais'
  | 'auditoria_historico'
  | 'seguranca_sessoes'
  | 'integracoes'
  | 'sistema_manutencao';

export type AdminGroupId = 'navegacao';

export interface PrimaryModuleMeta {
  id: PrimaryOperationalId;
  label: string;
  shortLabel: string;
  description: string;
}

export interface SecondaryModuleMeta {
  id: SecondaryOperationalId;
  group: SecondaryGroupId;
  label: string;
  subtitle: string;
  status: 'PREPARATION' | 'INTEGRATED_FUR' | 'INTEGRATED_FLOW';
  responsibilities: string[];
}

export interface AdminSectionMeta {
  id: AdminSectionId;
  group: AdminGroupId;
  order: number;
  label: string;
  subtitle: string;
  status: 'ACTIVE';
  minScope: 'CENTRAL_ONLY';
}

export const PRIMARY_OPERATIONAL_MODULES: PrimaryModuleMeta[] = [
  {
    id: 'entrada_saida',
    label: 'Entrada-Saída',
    shortLabel: 'Entrada/Saída',
    description: 'Novo internamento, identificação na FUR e saída definitiva autorizada.'
  },
  {
    id: 'transicao',
    label: 'Transição Penal',
    shortLabel: 'Transição',
    description: 'Alteração do estatuto jurídico de detido preventivo para condenado.'
  },
  {
    id: 'visitas',
    label: 'Visitas',
    shortLabel: 'Visitas',
    description: 'Visitantes autorizados, portaria, check-in/out e restrições.'
  },
  {
    id: 'consulta',
    label: 'Consulta',
    shortLabel: 'Consultar',
    description: 'Pesquisa por matrícula, nome, BI ou unidade e abertura da FUR.'
  }
];

export const SECONDARY_GROUP_LABELS: Record<SecondaryGroupId, string> = {
  operacoes_complementares: 'Grupo A · Operações Complementares',
  gestao_especializada: 'Grupo B · Gestão Prisional Especializada',
  informacao_acompanhamento: 'Grupo C · Informação e Acompanhamento'
};

export const SECONDARY_OPERATIONAL_MODULES: SecondaryModuleMeta[] = [
  // Grupo A — Operações Complementares
  {
    id: 'movimentacoes',
    group: 'operacoes_complementares',
    label: 'Movimentações',
    subtitle: 'Movimentos internos e diligências externas',
    status: 'INTEGRATED_FUR',
    responsibilities: [
      'Saídas temporárias para Tribunal, PGR ou Hospital externo',
      'Controlo de escolta e reserva automática de vaga/cela',
      'Registo de retorno à unidade prisional'
    ]
  },
  {
    id: 'transferencias',
    group: 'operacoes_complementares',
    label: 'Transferências',
    subtitle: 'Origem, trânsito e receção entre unidades',
    status: 'INTEGRATED_FLOW',
    responsibilities: [
      'Etapa 1: Despacho e guia de condução na unidade de origem',
      'Monitorização em trânsito (EM_TRANSITO_TRANSFERENCIA)',
      'Etapa 2: Conferência física e receção na unidade de destino'
    ]
  },
  {
    id: 'espolio',
    group: 'operacoes_complementares',
    label: 'Espólio',
    subtitle: 'Bens e valores dos reclusos',
    status: 'PREPARATION',
    responsibilities: [
      'Inventário de entrada e termo de depósito',
      'Custódia de valores e objetos retidos',
      'Devolução em caso de transferência ou soltura'
    ]
  },
  {
    id: 'ocorrencias',
    group: 'operacoes_complementares',
    label: 'Ocorrências',
    subtitle: 'Registos de incidentes operacionais',
    status: 'INTEGRATED_FUR',
    responsibilities: [
      'Participação de incidentes internos e tentativas de evasão',
      'Registo de providências imediatas de segurança',
      'Encaminhamento para processo disciplinar'
    ]
  },

  // Grupo B — Gestão Prisional Especializada
  {
    id: 'saude',
    group: 'gestao_especializada',
    label: 'Saúde',
    subtitle: 'Prontuário clínico protegido',
    status: 'INTEGRATED_FUR',
    responsibilities: [
      'Triagem clínica inicial e avaliações médicas contínuas',
      'Sigilo clínico estrito exclusivo ao perfil HEALTH_SPECIALIST',
      'Projeção de alertas operacionais não-clínicos (dieta/risco)'
    ]
  },
  {
    id: 'reabilitacao',
    group: 'gestao_especializada',
    label: 'Reabilitação',
    subtitle: 'Educação, formação e reinserção',
    status: 'INTEGRATED_FUR',
    responsibilities: [
      'Avaliação psicossocial, risco e classificação de conduta',
      'Programas escolares, laborais e mérito',
      'Alocação compatível de pavilhão/cela e plano pós-institucional'
    ]
  },
  {
    id: 'controlo_penal',
    group: 'gestao_especializada',
    label: 'Controlo Penal',
    subtitle: 'Processos e acompanhamento jurídico',
    status: 'INTEGRATED_FUR',
    responsibilities: [
      'Gestão de múltiplos processos judiciais vinculados à FUR',
      'Verificação de prazos de prisão preventiva e liberdade condicional',
      'Consolidação de extinção processual antes da soltura'
    ]
  },
  {
    id: 'disciplina',
    group: 'gestao_especializada',
    label: 'Disciplina',
    subtitle: 'Infrações e medidas disciplinares',
    status: 'INTEGRATED_FUR',
    responsibilities: [
      'Registo formal de infrações e sanções aplicadas',
      'Bloqueio temporário automático de visitas por sanção',
      'Histórico de pontos de mérito e conduta'
    ]
  },

  // Grupo C — Informação e Acompanhamento
  {
    id: 'relatorios',
    group: 'informacao_acompanhamento',
    label: 'Relatórios',
    subtitle: 'Mapas estatísticos e extratos',
    status: 'PREPARATION',
    responsibilities: [
      'Relatórios diários de população e lotação da unidade',
      'Mapas comparativos por estatuto jurídico e género',
      'Exportação institucional validada'
    ]
  },
  {
    id: 'alertas',
    group: 'informacao_acompanhamento',
    label: 'Alertas',
    subtitle: 'Prazos, restrições e avisos',
    status: 'PREPARATION',
    responsibilities: [
      'Vencimento de prazos de prisão preventiva',
      'Reclusos com restrição sanitária ou bloqueio de visitas',
      'Transferências pendentes de receção'
    ]
  },
  {
    id: 'agenda',
    group: 'informacao_acompanhamento',
    label: 'Agenda',
    subtitle: 'Diligências, audiências e escoltas',
    status: 'PREPARATION',
    responsibilities: [
      'Calendário de apresentações em Tribunal e PGR',
      'Consultas hospitalares externas agendadas',
      'Escalas de escolta e portaria'
    ]
  },
  {
    id: 'documentos',
    group: 'informacao_acompanhamento',
    label: 'Documentos',
    subtitle: 'Alvarás, guias e certidões',
    status: 'INTEGRATED_FUR',
    responsibilities: [
      'Repositório documental anexado à Ficha Única',
      'Mandados de condução, acórdãos e alvarás de soltura',
      'Rastreabilidade de emissão e registo'
    ]
  }
];

export const ADMIN_GROUP_LABELS: Record<AdminGroupId, string> = {
  navegacao: 'NAVEGAÇÃO'
};

export const ADMIN_SECTIONS: AdminSectionMeta[] = [
  {
    id: 'visao_nacional',
    group: 'navegacao',
    order: 1,
    label: 'Visão Nacional',
    subtitle: 'Indicadores gerais das 21 províncias (RDPA 2024), estabelecimentos, população prisional e alertas',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'estrutura_prisional',
    group: 'navegacao',
    order: 2,
    label: 'Estrutura Prisional',
    subtitle: 'Províncias, estabelecimentos, pavilhões, blocos, celas e capacidades instaladas',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'utilizadores',
    group: 'navegacao',
    order: 3,
    label: 'Utilizadores',
    subtitle: 'Criar contas, associar funcionários a províncias e estabelecimentos, suspender e reactivar acessos',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'funcoes_permissoes',
    group: 'navegacao',
    order: 4,
    label: 'Funções e Permissões',
    subtitle: 'Perfis institucionais, matriz RBAC, módulos permitidos e limites territoriais',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'homologacoes',
    group: 'navegacao',
    order: 5,
    label: 'Homologações',
    subtitle: 'Aprovar estruturas, alterações institucionais e capacidade instalada submetidas pelas províncias',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'catalogos_institucionais',
    group: 'navegacao',
    order: 6,
    label: 'Catálogos Institucionais',
    subtitle: 'Tipos de admissão, modalidades de saída, regimes, categorias e parâmetros institucionais',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'auditoria_historico',
    group: 'navegacao',
    order: 7,
    label: 'Auditoria e Histórico',
    subtitle: 'Registo imutável de acessos, alterações, bloqueios e rastreabilidade por instituição',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'seguranca_sessoes',
    group: 'navegacao',
    order: 8,
    label: 'Segurança e Sessões',
    subtitle: 'MFA, segunda verificação individual, sessões activas, tentativas bloqueadas e revogação',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'integracoes',
    group: 'navegacao',
    order: 9,
    label: 'Integrações',
    subtitle: 'Firebase Auth, Cloud Firestore Enterprise, API oficial PNAP e estado das integrações',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  },
  {
    id: 'sistema_manutencao',
    group: 'navegacao',
    order: 10,
    label: 'Sistema e Manutenção',
    subtitle: 'Parâmetros gerais, estado dos serviços, esquema FUR e diagnóstico institucional',
    status: 'ACTIVE',
    minScope: 'CENTRAL_ONLY'
  }
];

export function canEnterAdminPanel(role: UserRole): boolean {
  return role === 'CENTRAL_ADMIN';
}

export function canAccessAdminSection(role: UserRole, section: AdminSectionMeta): boolean {
  if (!canEnterAdminPanel(role)) return false;
  if (section.minScope === 'CENTRAL_ONLY') {
    return role === 'CENTRAL_ADMIN';
  }
  return true;
}

