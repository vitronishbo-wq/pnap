import { 
  ProvinceProfile, 
  ProvinceStatistics, 
  EstablishmentProfile, 
  Inmate, 
  NationalInmateIndexItem, 
  PnapUser, 
  PnapSystem,
  TransferRecord,
  AdmissionRecord,
  ReleaseRecord,
  VisitorRecord,
  VisitRecord,
  AuditLogEvent
} from '../types/pnap';

export const PNAP_SYSTEM_DATA: PnapSystem = {
  configuration: {
    country: "República de Angola",
    lawFramework: "Lei Geral do Trabalho Prisional & Código de Execução de Penas",
    dpaVersion: "RDPA 2024 · 21 Províncias",
    systemState: "ONLINE",
    maxCellCapacityAlertThreshold: 90
  },
  schemaVersions: {
    current: "2024.11-v2.1",
    appliedAt: "2024-11-01T00:00:00Z"
  },
  deploymentStatus: {
    provincesOnline: 21,
    totalProvinces: 21,
    lastPing: "2026-11-12T11:45:00Z"
  }
};

// As 21 Províncias de Angola no modelo RDPA 2024
export const PROVINCES_DATA: Record<string, ProvinceProfile> = {
  luanda: {
    id: 'luanda',
    name: 'Luanda',
    capital: 'Luanda',
    delegadoProvincial: 'Comissário Prisional Manuel da Silva',
    contactEmergency: '+244 222 334 100',
    coordinates: { lat: -8.8390, lng: 13.2894 },
    shortCode: 'LUA'
  },
  icolo_e_bengo: {
    id: 'icolo_e_bengo',
    name: 'Icolo e Bengo',
    capital: 'Catete',
    delegadoProvincial: 'Superintendente Prisional Artur Cassoma',
    contactEmergency: '+244 222 445 201',
    coordinates: { lat: -9.1333, lng: 13.7000 },
    shortCode: 'IEB'
  },
  bengo: {
    id: 'bengo',
    name: 'Bengo',
    capital: 'Caxito',
    delegadoProvincial: 'Subcomissário Prisional Gabriel Luvualu',
    contactEmergency: '+244 234 500 110',
    coordinates: { lat: -8.5786, lng: 13.6644 },
    shortCode: 'BGO'
  },
  cuanza_norte: {
    id: 'cuanza_norte',
    name: 'Cuanza Norte',
    capital: 'Ndalatando',
    delegadoProvincial: 'Superintendente Prisional José Kissange',
    contactEmergency: '+244 235 600 200',
    coordinates: { lat: -9.2978, lng: 14.9116 },
    shortCode: 'CNO'
  },
  cuanza_sul: {
    id: 'cuanza_sul',
    name: 'Cuanza Sul',
    capital: 'Sumbe',
    delegadoProvincial: 'Subcomissário Prisional Fernando Gonga',
    contactEmergency: '+244 236 700 300',
    coordinates: { lat: -11.2061, lng: 13.8437 },
    shortCode: 'CSU'
  },
  malanje: {
    id: 'malanje',
    name: 'Malanje',
    capital: 'Malanje',
    delegadoProvincial: 'Superintendente Prisional Domingos Quiala',
    contactEmergency: '+244 238 800 400',
    coordinates: { lat: -9.5401, lng: 16.3410 },
    shortCode: 'MAL'
  },
  uige: {
    id: 'uige',
    name: 'Uíge',
    capital: 'Uíge',
    delegadoProvincial: 'Superintendente Prisional Afonso Dinis',
    contactEmergency: '+244 233 900 500',
    coordinates: { lat: -7.6086, lng: 15.0613 },
    shortCode: 'UIG'
  },
  zaire: {
    id: 'zaire',
    name: 'Zaire',
    capital: 'Mbanza Kongo',
    delegadoProvincial: 'Subcomissário Prisional Simão Nzinga',
    contactEmergency: '+244 232 100 600',
    coordinates: { lat: -6.2670, lng: 14.2401 },
    shortCode: 'ZAI'
  },
  cabinda: {
    id: 'cabinda',
    name: 'Cabinda',
    capital: 'Cabinda',
    delegadoProvincial: 'Comissário Prisional Pedro Buana',
    contactEmergency: '+244 231 200 700',
    coordinates: { lat: -5.5560, lng: 12.2000 },
    shortCode: 'CAB'
  },
  lunda_norte: {
    id: 'lunda_norte',
    name: 'Lunda Norte',
    capital: 'Dundo',
    delegadoProvincial: 'Superintendente Prisional Joaquim Tchipóia',
    contactEmergency: '+244 252 300 800',
    coordinates: { lat: -7.3794, lng: 20.8324 },
    shortCode: 'LNO'
  },
  lunda_sul: {
    id: 'lunda_sul',
    name: 'Lunda Sul',
    capital: 'Saurimo',
    delegadoProvincial: 'Subcomissário Prisional Bernardo Muacanhica',
    contactEmergency: '+244 253 400 900',
    coordinates: { lat: -9.6608, lng: 20.3916 },
    shortCode: 'LSU'
  },
  benguela: {
    id: 'benguela',
    name: 'Benguela',
    capital: 'Benguela',
    delegadoProvincial: 'Comissário Prisional Ernesto Catumbela',
    contactEmergency: '+244 272 500 001',
    coordinates: { lat: -12.5763, lng: 13.4055 },
    shortCode: 'BEN'
  },
  huambo: {
    id: 'huambo',
    name: 'Huambo',
    capital: 'Huambo',
    delegadoProvincial: 'Comissário Prisional Abel Chissingui',
    contactEmergency: '+244 241 600 112',
    coordinates: { lat: -12.7761, lng: 15.7392 },
    shortCode: 'HBA'
  },
  bie: {
    id: 'bie',
    name: 'Bié',
    capital: 'Cuito',
    delegadoProvincial: 'Subcomissário Prisional Moisés Samacalu',
    contactEmergency: '+244 248 700 223',
    coordinates: { lat: -12.3833, lng: 16.9333 },
    shortCode: 'BIE'
  },
  moxico: {
    id: 'moxico',
    name: 'Moxico',
    capital: 'Luena',
    delegadoProvincial: 'Superintendente Prisional Faustino Sachilombo',
    contactEmergency: '+244 254 800 334',
    coordinates: { lat: -11.7833, lng: 19.9167 },
    shortCode: 'MOX'
  },
  moxico_leste: {
    id: 'moxico_leste',
    name: 'Moxico Leste',
    capital: 'Luau',
    delegadoProvincial: 'Subcomissário Prisional Justino Tchicapa',
    contactEmergency: '+244 254 990 445',
    coordinates: { lat: -10.7073, lng: 22.2247 },
    shortCode: 'MXL'
  },
  huila: {
    id: 'huila',
    name: 'Huíla',
    capital: 'Lubango',
    delegadoProvincial: 'Comissário Prisional Bartolomeu Tyipinge',
    contactEmergency: '+244 261 100 556',
    coordinates: { lat: -14.9172, lng: 13.5456 },
    shortCode: 'HUI'
  },
  namibe: {
    id: 'namibe',
    name: 'Namibe',
    capital: 'Moçâmedes',
    delegadoProvincial: 'Superintendente Prisional Lucas Camulombo',
    contactEmergency: '+244 264 200 667',
    coordinates: { lat: -15.1961, lng: 12.1522 },
    shortCode: 'NAM'
  },
  cunene: {
    id: 'cunene',
    name: 'Cunene',
    capital: 'Ondjiva',
    delegadoProvincial: 'Subcomissário Prisional Hélio Haufiku',
    contactEmergency: '+244 265 300 778',
    coordinates: { lat: -17.0667, lng: 15.7333 },
    shortCode: 'CNN'
  },
  cuando: {
    id: 'cuando',
    name: 'Cuando',
    capital: 'Menongue',
    delegadoProvincial: 'Superintendente Prisional Valério Tchimboto',
    contactEmergency: '+244 249 400 889',
    coordinates: { lat: -14.6585, lng: 17.6909 },
    shortCode: 'CUA'
  },
  cubango: {
    id: 'cubango',
    name: 'Cubango',
    capital: 'Mavinga',
    delegadoProvincial: 'Subcomissário Prisional Salomão Mwafulirwa',
    contactEmergency: '+244 249 550 990',
    coordinates: { lat: -15.7667, lng: 20.3667 },
    shortCode: 'CUB'
  }
};

// Estatísticas Provinciais (RDPA 2024)
export const PROVINCE_STATISTICS: Record<string, ProvinceStatistics> = {
  luanda: {
    periodId: '2024-Q4',
    activeInmates: 5840,
    totalCapacity: 6200,
    occupancyRate: 94.2,
    availableSpots: 360,
    establishmentsCount: 4,
    preventiveCount: 2420,
    convictedCount: 3420,
    maleCount: 5610,
    femaleCount: 230
  },
  huambo: {
    periodId: '2024-Q4',
    activeInmates: 2150,
    totalCapacity: 2400,
    occupancyRate: 89.5,
    availableSpots: 250,
    establishmentsCount: 2,
    preventiveCount: 880,
    convictedCount: 1270,
    maleCount: 2080,
    femaleCount: 70
  },
  benguela: {
    periodId: '2024-Q4',
    activeInmates: 3120,
    totalCapacity: 3300,
    occupancyRate: 94.5,
    availableSpots: 180,
    establishmentsCount: 3,
    preventiveCount: 1300,
    convictedCount: 1820,
    maleCount: 2990,
    femaleCount: 130
  },
  huila: {
    periodId: '2024-Q4',
    activeInmates: 2410,
    totalCapacity: 2800,
    occupancyRate: 86.1,
    availableSpots: 390,
    establishmentsCount: 3,
    preventiveCount: 950,
    convictedCount: 1460,
    maleCount: 2350,
    femaleCount: 60
  },
  cabinda: {
    periodId: '2024-Q4',
    activeInmates: 980,
    totalCapacity: 1200,
    occupancyRate: 81.6,
    availableSpots: 220,
    establishmentsCount: 2,
    preventiveCount: 380,
    convictedCount: 600,
    maleCount: 940,
    femaleCount: 40
  },
  icolo_e_bengo: {
    periodId: '2024-Q4',
    activeInmates: 1450,
    totalCapacity: 1800,
    occupancyRate: 80.5,
    availableSpots: 350,
    establishmentsCount: 1,
    preventiveCount: 450,
    convictedCount: 1000,
    maleCount: 1450,
    femaleCount: 0
  },
  bengo: {
    periodId: '2024-Q4',
    activeInmates: 740,
    totalCapacity: 900,
    occupancyRate: 82.2,
    availableSpots: 160,
    establishmentsCount: 1,
    preventiveCount: 310,
    convictedCount: 430,
    maleCount: 710,
    femaleCount: 30
  },
  cuanza_norte: {
    periodId: '2024-Q4',
    activeInmates: 620,
    totalCapacity: 800,
    occupancyRate: 77.5,
    availableSpots: 180,
    establishmentsCount: 1,
    preventiveCount: 240,
    convictedCount: 380,
    maleCount: 600,
    femaleCount: 20
  },
  cuanza_sul: {
    periodId: '2024-Q4',
    activeInmates: 1120,
    totalCapacity: 1300,
    occupancyRate: 86.1,
    availableSpots: 180,
    establishmentsCount: 2,
    preventiveCount: 490,
    convictedCount: 630,
    maleCount: 1080,
    femaleCount: 40
  },
  malanje: {
    periodId: '2024-Q4',
    activeInmates: 1040,
    totalCapacity: 1200,
    occupancyRate: 86.6,
    availableSpots: 160,
    establishmentsCount: 2,
    preventiveCount: 410,
    convictedCount: 630,
    maleCount: 1010,
    femaleCount: 30
  },
  uige: {
    periodId: '2024-Q4',
    activeInmates: 890,
    totalCapacity: 1100,
    occupancyRate: 80.9,
    availableSpots: 210,
    establishmentsCount: 1,
    preventiveCount: 360,
    convictedCount: 530,
    maleCount: 860,
    femaleCount: 30
  },
  zaire: {
    periodId: '2024-Q4',
    activeInmates: 510,
    totalCapacity: 700,
    occupancyRate: 72.8,
    availableSpots: 190,
    establishmentsCount: 1,
    preventiveCount: 220,
    convictedCount: 290,
    maleCount: 495,
    femaleCount: 15
  },
  lunda_norte: {
    periodId: '2024-Q4',
    activeInmates: 830,
    totalCapacity: 1000,
    occupancyRate: 83.0,
    availableSpots: 170,
    establishmentsCount: 1,
    preventiveCount: 310,
    convictedCount: 520,
    maleCount: 810,
    femaleCount: 20
  },
  lunda_sul: {
    periodId: '2024-Q4',
    activeInmates: 640,
    totalCapacity: 800,
    occupancyRate: 80.0,
    availableSpots: 160,
    establishmentsCount: 1,
    preventiveCount: 260,
    convictedCount: 380,
    maleCount: 620,
    femaleCount: 20
  },
  bie: {
    periodId: '2024-Q4',
    activeInmates: 1190,
    totalCapacity: 1400,
    occupancyRate: 85.0,
    availableSpots: 210,
    establishmentsCount: 2,
    preventiveCount: 460,
    convictedCount: 730,
    maleCount: 1150,
    femaleCount: 40
  },
  moxico: {
    periodId: '2024-Q4',
    activeInmates: 710,
    totalCapacity: 900,
    occupancyRate: 78.8,
    availableSpots: 190,
    establishmentsCount: 1,
    preventiveCount: 290,
    convictedCount: 420,
    maleCount: 690,
    femaleCount: 20
  },
  moxico_leste: {
    periodId: '2024-Q4',
    activeInmates: 340,
    totalCapacity: 500,
    occupancyRate: 68.0,
    availableSpots: 160,
    establishmentsCount: 1,
    preventiveCount: 130,
    convictedCount: 210,
    maleCount: 330,
    femaleCount: 10
  },
  namibe: {
    periodId: '2024-Q4',
    activeInmates: 580,
    totalCapacity: 750,
    occupancyRate: 77.3,
    availableSpots: 170,
    establishmentsCount: 1,
    preventiveCount: 210,
    convictedCount: 370,
    maleCount: 560,
    femaleCount: 20
  },
  cunene: {
    periodId: '2024-Q4',
    activeInmates: 670,
    totalCapacity: 850,
    occupancyRate: 78.8,
    availableSpots: 180,
    establishmentsCount: 1,
    preventiveCount: 270,
    convictedCount: 400,
    maleCount: 650,
    femaleCount: 20
  },
  cuando: {
    periodId: '2024-Q4',
    activeInmates: 430,
    totalCapacity: 600,
    occupancyRate: 71.6,
    availableSpots: 170,
    establishmentsCount: 1,
    preventiveCount: 170,
    convictedCount: 260,
    maleCount: 420,
    femaleCount: 10
  },
  cubango: {
    periodId: '2024-Q4',
    activeInmates: 290,
    totalCapacity: 450,
    occupancyRate: 64.4,
    availableSpots: 160,
    establishmentsCount: 1,
    preventiveCount: 110,
    convictedCount: 180,
    maleCount: 285,
    femaleCount: 5
  }
};

// Estabelecimentos Prisionais de Luanda & Outras Províncias
export const ESTABLISHMENTS_DATA: Record<string, EstablishmentProfile[]> = {
  luanda: [
    {
      establishmentId: 'comarca-viana',
      provinceId: 'luanda',
      name: 'Estabelecimento Prisional de Viana',
      code: 'EPV-01',
      type: 'COMARCA',
      securityLevel: 'MAXIMA',
      directorName: 'Superintendente Mor Ernesto Caxita',
      address: 'Município de Viana, Estrada Direita de Viana, Luanda',
      totalCapacity: 2800,
      activeInmatesCount: 2710
    },
    {
      establishmentId: 'cadeia-central-luanda',
      provinceId: 'luanda',
      name: 'Cadeia Central de Luanda (CCL)',
      code: 'CCL-02',
      type: 'PENITENCIARIA',
      securityLevel: 'MAXIMA',
      directorName: 'Subcomissário Prisional Pedro Kassoma',
      address: 'Distrito Urbano do Rangel / São Paulo, Luanda',
      totalCapacity: 1600,
      activeInmatesCount: 1540
    },
    {
      establishmentId: 'hospital-sao-paulo',
      provinceId: 'luanda',
      name: 'Hospital Prisional de São Paulo',
      code: 'HPSP-03',
      type: 'HOSPITAL_PRISIONAL',
      securityLevel: 'MEDIA',
      directorName: 'Dra. Maria Antonieta Quitembo',
      address: 'Rua de São Paulo, Bairro Operário, Luanda',
      totalCapacity: 400,
      activeInmatesCount: 380
    },
    {
      establishmentId: 'comarca-feminina-luanda',
      provinceId: 'luanda',
      name: 'Estabelecimento Prisional Feminino de Luanda',
      code: 'EPFL-04',
      type: 'COMARCA',
      securityLevel: 'MEDIA',
      directorName: 'Superintendente Teresa Dinis',
      address: 'Cacuaco, Zona Industrial, Luanda',
      totalCapacity: 1400,
      activeInmatesCount: 1210
    }
  ],
  huambo: [
    {
      establishmentId: 'penitenciaria-huambo',
      provinceId: 'huambo',
      name: 'Estabelecimento Prisional do Huambo',
      code: 'EPH-01',
      type: 'PENITENCIARIA',
      securityLevel: 'MAXIMA',
      directorName: 'Superintendente Silvestre Nangolo',
      address: 'Bairro Kaluquembe, Cidade Alta, Huambo',
      totalCapacity: 1500,
      activeInmatesCount: 1390
    },
    {
      establishmentId: 'comarca-baila',
      provinceId: 'huambo',
      name: 'Comarca de Bailundo',
      code: 'CPB-02',
      type: 'COMARCA',
      securityLevel: 'MEDIA',
      directorName: 'Intendente Prisional Lucas Sapi',
      address: 'Vila do Bailundo, Huambo',
      totalCapacity: 900,
      activeInmatesCount: 760
    }
  ],
  benguela: [
    {
      establishmentId: 'comarca-cavaco',
      provinceId: 'benguela',
      name: 'Estabelecimento Prisional de Cavaco',
      code: 'EPC-01',
      type: 'PENITENCIARIA',
      securityLevel: 'MAXIMA',
      directorName: 'Superintendente Fernando Candido',
      address: 'Vale do Cavaco, Benguela',
      totalCapacity: 1800,
      activeInmatesCount: 1720
    }
  ]
};

// Reclusos Completos (Detalhes clínicos, jurídicos, disciplinares, registados em cada província)
export const INMATES_LOCAL_DB: Inmate[] = [
  {
    inmateId: 'inm-la-001',
    provinceId: 'luanda',
    establishmentId: 'comarca-viana',
    pavilionId: 'pav-a',
    blockId: 'blk-1',
    cellId: 'cell-104',
    currentStatus: 'ATIVO',
    profile: {
      inmateId: 'inm-la-001',
      matricula: 'LA-2024-0012',
      biNumber: '004928172LA044',
      fullName: 'António Manuel dos Santos',
      alias: 'Tó Zé',
      dateOfBirth: '1992-06-14',
      gender: 'M',
      fatherName: 'Manuel João dos Santos',
      motherName: 'Maria Esperança dos Santos',
      emergencyContact: {
        name: 'Maria Esperança dos Santos (Mãe)',
        relationship: 'Mãe',
        phone: '+244 923 445 112'
      },
      neighborhood: 'Bairro Sambizanga, Sector 4',
      provinceOfOrigin: 'Luanda',
      photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&fit=crop&crop=faces'
    },
    admission: {
      admissionId: 'adm-la-2024-012',
      admissionDate: '2024-02-18',
      processNumber: 'Proc. 142/2024-4ª Sec.',
      courtName: 'Tribunal da Comarca de Luanda (Dona Alice)',
      mandateNumber: 'MAND-0988/24',
      custodyReason: 'Prisão Preventiva convertida em Condenação',
      initialPavilionId: 'pav-a',
      intakeOfficer: 'Subinspetor Prisional André Kiala'
    },
    legal: {
      legalStatus: 'CONDENADO',
      crimeCategory: 'Roubo Qualificado em Concurso com Posse de Arma',
      penalCodeArticle: 'Art. 402º e 404º do Código Penal Angolano',
      totalSentenceYears: 8,
      totalSentenceMonths: 96,
      timeServedMonths: 18,
      remissionEarnedMonths: 2,
      eligibleParoleDate: '2028-06-14',
      endOfSentenceDate: '2032-02-18'
    },
    health: {
      bloodType: 'O+',
      chronicDiseases: ['Hipertensão Arterial Leve'],
      allergies: ['Penicilina'],
      dailyMedication: ['Enalapril 10mg'],
      mentalHealthStatus: 'Apto, sem sinais psicopatológicos activos',
      lastMedicalCheckup: '2024-10-12',
      dietaryRestrictions: 'Dieta hipossódica'
    },
    rehabilitation: {
      jobAssignment: 'Oficina de Carpintaria e Marcenaria',
      educationLevel: '9ª Classe Concluída',
      coursesEnrolled: ['Carpintaria Industrial - Módulo II'],
      meritPoints: 85,
      conductClassification: 'BOM'
    },
    disciplinary: {
      infractionsCount: 1,
      lastInfractionDate: '2024-05-10',
      activeSanction: 'Nenhuma',
      sanctionHistory: [
        {
          date: '2024-05-10',
          description: 'Atraso na contagem da formatura matinal',
          measure: 'Repreensão verbal e limpeza do pátio',
          signedBy: 'Chefe de Turno Sgt. Pedro'
        }
      ]
    },
    incidents: [],
    postInstitutional: {
      reintegrationPlanStatus: 'EM_ANALISE',
      familyShelterConfirmed: true,
      assignedSocialWorker: 'Dra. Noémia Baptista',
      vocationalRecommendation: 'Aptidão comprovada para marcenaria autônoma'
    },
    documents: [
      {
        documentId: 'doc-001',
        title: 'Certidão de Sentença Condenatória Trânsito em Julgado',
        type: 'CERTIDAO_SENTENCA',
        uploadDate: '2024-03-01',
        fileSize: '2.4 MB'
      },
      {
        documentId: 'doc-002',
        title: 'Ficha Biográfica e Biometria Dactiloscópica',
        type: 'FICHA_BIOMETRICA',
        uploadDate: '2024-02-18',
        fileSize: '4.8 MB'
      }
    ]
  },
  {
    inmateId: 'inm-la-002',
    provinceId: 'luanda',
    establishmentId: 'comarca-viana',
    pavilionId: 'pav-b',
    blockId: 'blk-2',
    cellId: 'cell-201',
    currentStatus: 'ATIVO',
    profile: {
      inmateId: 'inm-la-002',
      matricula: 'LA-2024-0198',
      biNumber: '006129384LA021',
      fullName: 'Domingos Sebastião Gaspar',
      alias: 'Mestre Domi',
      dateOfBirth: '1987-11-03',
      gender: 'M',
      fatherName: 'Sebastião Gaspar',
      motherName: 'Joana da Conceição Gaspar',
      emergencyContact: {
        name: 'Joana Gaspar (Irmã)',
        relationship: 'Irmã',
        phone: '+244 931 998 440'
      },
      neighborhood: 'Bairro Rocha Pinto, Rua 12',
      provinceOfOrigin: 'Luanda',
      photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&fit=crop&crop=faces'
    },
    admission: {
      admissionId: 'adm-la-2024-198',
      admissionDate: '2024-06-10',
      processNumber: 'Proc. 883/24-2ª Sec.',
      courtName: 'Tribunal da Comarca de Viana',
      mandateNumber: 'MAND-1190/24',
      custodyReason: 'Prisão Preventiva',
      initialPavilionId: 'pav-b',
      intakeOfficer: 'Inspetor Prisional Carlos Morais'
    },
    legal: {
      legalStatus: 'PREVENTIVO',
      crimeCategory: 'Burla por Defraudação Qualificada',
      penalCodeArticle: 'Art. 425º do Código Penal',
      totalSentenceYears: 0,
      totalSentenceMonths: 0,
      timeServedMonths: 5,
      remissionEarnedMonths: 0,
      eligibleParoleDate: 'Pendente Julgamento',
      endOfSentenceDate: 'Aguardando Sentença'
    },
    health: {
      bloodType: 'A+',
      chronicDiseases: [],
      allergies: [],
      dailyMedication: [],
      mentalHealthStatus: 'Estável',
      lastMedicalCheckup: '2024-06-11',
      dietaryRestrictions: 'Geral'
    },
    rehabilitation: {
      jobAssignment: 'Apoio Administrativo à Biblioteca',
      educationLevel: '12ª Classe Concluída (Ensino Médio)',
      coursesEnrolled: ['Informática Básica'],
      meritPoints: 95,
      conductClassification: 'MUITO_BOM'
    },
    disciplinary: {
      infractionsCount: 0,
      sanctionHistory: []
    },
    incidents: [],
    postInstitutional: {
      reintegrationPlanStatus: 'EM_ANALISE',
      familyShelterConfirmed: true,
      vocationalRecommendation: 'Serviços administrativos'
    },
    documents: [
      {
        documentId: 'doc-003',
        title: 'Mandado de Condução e Prisão Preventiva',
        type: 'GUIA_CONDUCAO',
        uploadDate: '2024-06-10',
        fileSize: '1.8 MB'
      }
    ]
  },
  // RECLUSO NO HUAMBO (Para testar o isolamento e a busca no nationalInmateIndex a partir de Luanda!)
  {
    inmateId: 'inm-hb-045',
    provinceId: 'huambo',
    establishmentId: 'penitenciaria-huambo',
    pavilionId: 'pav-kalu-1',
    blockId: 'blk-b',
    cellId: 'cell-08',
    currentStatus: 'ATIVO',
    profile: {
      inmateId: 'inm-hb-045',
      matricula: 'HB-2024-0312',
      biNumber: '007736152HB089',
      fullName: 'Mateus Chissingui Calueio',
      alias: 'Bomba',
      dateOfBirth: '1995-04-20',
      gender: 'M',
      fatherName: 'Calueio Bento',
      motherName: 'Teresa Chissingui',
      emergencyContact: {
        name: 'Teresa Chissingui (Mãe)',
        relationship: 'Mãe',
        phone: '+244 945 112 334'
      },
      neighborhood: 'Bairro São Pedro, Huambo',
      provinceOfOrigin: 'Huambo',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&fit=crop&crop=faces'
    },
    admission: {
      admissionId: 'adm-hb-2024-045',
      admissionDate: '2023-11-05',
      processNumber: 'Proc. 77/23-Tribunal Huambo',
      courtName: 'Tribunal da Comarca do Huambo',
      mandateNumber: 'MAND-HB-442',
      custodyReason: 'Condenação definitiva',
      initialPavilionId: 'pav-kalu-1',
      intakeOfficer: 'Subinspector Huambo Prisional'
    },
    legal: {
      legalStatus: 'CONDENADO',
      crimeCategory: 'Homicídio Simples em Briga de Taberna',
      penalCodeArticle: 'Art. 345º do Código Penal',
      totalSentenceYears: 12,
      totalSentenceMonths: 144,
      timeServedMonths: 24,
      remissionEarnedMonths: 3,
      eligibleParoleDate: '2029-11-05',
      endOfSentenceDate: '2035-11-05'
    },
    health: {
      bloodType: 'B+',
      chronicDiseases: ['Úlcera Gástrica'],
      allergies: ['AAS / Aspirina'],
      dailyMedication: ['Omeprazol 20mg'],
      mentalHealthStatus: 'Acompanhamento psicológico regular por impulsividade',
      lastMedicalCheckup: '2024-09-02',
      dietaryRestrictions: 'Sem condimentos picantes'
    },
    rehabilitation: {
      jobAssignment: 'Brigada Agrícola de Produção',
      educationLevel: '6ª Classe',
      coursesEnrolled: ['Horticultura e Agropecuária'],
      meritPoints: 78,
      conductClassification: 'REGULAR'
    },
    disciplinary: {
      infractionsCount: 2,
      lastInfractionDate: '2024-04-18',
      activeSanction: 'Cumprida',
      sanctionHistory: [
        {
          date: '2024-04-18',
          description: 'Discussão agressiva com outro recluso na formatura',
          measure: 'Isolamento de 5 dias na cela de reflexão',
          signedBy: 'Director da Penitenciária do Huambo'
        }
      ]
    },
    incidents: [
      {
        incidentId: 'inc-hb-01',
        date: '2024-04-18',
        type: 'AGRESSAO',
        severity: 'MEDIA',
        description: 'Troca de agressões físicas leves no pátio interno',
        actionsTaken: 'Intervenção imediata da guarda prisional',
        reportedBy: 'Chefe de Turno do Huambo'
      }
    ],
    postInstitutional: {
      reintegrationPlanStatus: 'EM_ANALISE',
      familyShelterConfirmed: true,
      vocationalRecommendation: 'Agricultura familiar'
    },
    documents: []
  },
  // RECLUSO EM BENGUELA
  {
    inmateId: 'inm-bg-088',
    provinceId: 'benguela',
    establishmentId: 'comarca-cavaco',
    pavilionId: 'pav-cavaco-a',
    blockId: 'blk-1',
    cellId: 'cell-04',
    currentStatus: 'ATIVO',
    profile: {
      inmateId: 'inm-bg-088',
      matricula: 'BG-2024-0711',
      biNumber: '003819284BG019',
      fullName: 'Albano Catumbela Tchissola',
      alias: 'Tio Alva',
      dateOfBirth: '1981-08-12',
      gender: 'M',
      fatherName: 'Augusto Tchissola',
      motherName: 'Natália Catumbela',
      emergencyContact: {
        name: 'Augusto Tchissola (Pai)',
        relationship: 'Pai',
        phone: '+244 924 888 123'
      },
      neighborhood: 'Bairro Caponte, Lobito',
      provinceOfOrigin: 'Benguela',
      photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&fit=crop&crop=faces'
    },
    admission: {
      admissionId: 'adm-bg-2024-88',
      admissionDate: '2022-04-15',
      processNumber: 'Proc. 312/22-Lobito',
      courtName: 'Tribunal da Comarca do Lobito',
      mandateNumber: 'MAND-BG-891',
      custodyReason: 'Condenação',
      initialPavilionId: 'pav-cavaco-a',
      intakeOfficer: 'Inspetor Benguela'
    },
    legal: {
      legalStatus: 'CONDENADO',
      crimeCategory: 'Contrabando de Combustível e Associação Criminosa',
      penalCodeArticle: 'Art. 450º do Código Penal',
      totalSentenceYears: 6,
      totalSentenceMonths: 72,
      timeServedMonths: 31,
      remissionEarnedMonths: 4,
      eligibleParoleDate: '2025-04-15',
      endOfSentenceDate: '2028-04-15'
    },
    health: {
      bloodType: 'AB+',
      chronicDiseases: [],
      allergies: [],
      dailyMedication: [],
      mentalHealthStatus: 'Apto',
      lastMedicalCheckup: '2024-08-10',
      dietaryRestrictions: 'Sem restrições'
    },
    rehabilitation: {
      jobAssignment: 'Serralharia Prisional',
      educationLevel: '10ª Classe',
      coursesEnrolled: ['Serralharia e Soldadura'],
      meritPoints: 90,
      conductClassification: 'MUITO_BOM'
    },
    disciplinary: {
      infractionsCount: 0,
      sanctionHistory: []
    },
    incidents: [],
    postInstitutional: {
      reintegrationPlanStatus: 'APROVADO',
      familyShelterConfirmed: true,
      vocationalRecommendation: 'Mecânica e soldadura naval'
    },
    documents: []
  }
];

// ÍNDICE NACIONAL DE RECLUSOS (nationalInmateIndex)
// Todos os reclusos do país indexados para pesquisa rápida federada
export const NATIONAL_INMATE_INDEX: NationalInmateIndexItem[] = [
  {
    inmateId: 'inm-la-001',
    matricula: 'LA-2024-0012',
    fullName: 'António Manuel dos Santos',
    alias: 'Tó Zé',
    biNumber: '004928172LA044',
    provinceId: 'luanda',
    provinceName: 'Luanda',
    establishmentId: 'comarca-viana',
    establishmentName: 'Estabelecimento Prisional de Viana',
    pavilionName: 'Pavilhão A - Ala Fechada',
    cellCode: 'Cela 104',
    legalStatus: 'CONDENADO',
    crimeCategory: 'Roubo Qualificado em Concurso com Posse de Arma',
    penalCodeArticle: 'Art. 402º e 404º',
    parentName: 'Maria Esperança dos Santos (Mãe)',
    emergencyContactName: 'Maria Esperança dos Santos',
    emergencyPhone: '+244 923 445 112',
    neighborhood: 'Sambizanga, Sector 4',
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&fit=crop&crop=faces',
    lastUpdated: '2026-11-12T08:30:00Z'
  },
  {
    inmateId: 'inm-la-002',
    matricula: 'LA-2024-0198',
    fullName: 'Domingos Sebastião Gaspar',
    alias: 'Mestre Domi',
    biNumber: '006129384LA021',
    provinceId: 'luanda',
    provinceName: 'Luanda',
    establishmentId: 'comarca-viana',
    establishmentName: 'Estabelecimento Prisional de Viana',
    pavilionName: 'Pavilhão B - Regime Médio',
    cellCode: 'Cela 201',
    legalStatus: 'PREVENTIVO',
    crimeCategory: 'Burla por Defraudação Qualificada',
    penalCodeArticle: 'Art. 425º',
    parentName: 'Joana da Conceição Gaspar (Mãe)',
    emergencyContactName: 'Joana Gaspar',
    emergencyPhone: '+244 931 998 440',
    neighborhood: 'Rocha Pinto, Rua 12',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&fit=crop&crop=faces',
    lastUpdated: '2026-11-12T09:15:00Z'
  },
  {
    inmateId: 'inm-hb-045',
    matricula: 'HB-2024-0312',
    fullName: 'Mateus Chissingui Calueio',
    alias: 'Bomba',
    biNumber: '007736152HB089',
    provinceId: 'huambo',
    provinceName: 'Huambo',
    establishmentId: 'penitenciaria-huambo',
    establishmentName: 'Estabelecimento Prisional do Huambo',
    pavilionName: 'Pavilhão Kaluquembe 1',
    cellCode: 'Cela 08',
    legalStatus: 'CONDENADO',
    crimeCategory: 'Homicídio Simples em Briga de Taberna',
    penalCodeArticle: 'Art. 345º',
    parentName: 'Teresa Chissingui (Mãe)',
    emergencyContactName: 'Teresa Chissingui',
    emergencyPhone: '+244 945 112 334',
    neighborhood: 'Bairro São Pedro',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&fit=crop&crop=faces',
    lastUpdated: '2026-11-12T07:45:00Z'
  },
  {
    inmateId: 'inm-bg-088',
    matricula: 'BG-2024-0711',
    fullName: 'Albano Catumbela Tchissola',
    alias: 'Tio Alva',
    biNumber: '003819284BG019',
    provinceId: 'benguela',
    provinceName: 'Benguela',
    establishmentId: 'comarca-cavaco',
    establishmentName: 'Estabelecimento Prisional de Cavaco',
    pavilionName: 'Pavilhão Cavaco A',
    cellCode: 'Cela 04',
    legalStatus: 'CONDENADO',
    crimeCategory: 'Contrabando de Combustível e Associação Criminosa',
    penalCodeArticle: 'Art. 450º',
    parentName: 'Natália Catumbela (Mãe) / Augusto Tchissola (Pai)',
    emergencyContactName: 'Augusto Tchissola',
    emergencyPhone: '+244 924 888 123',
    neighborhood: 'Bairro Caponte, Lobito',
    photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&fit=crop&crop=faces',
    lastUpdated: '2026-11-11T16:20:00Z'
  },
  {
    inmateId: 'inm-hl-019',
    matricula: 'HL-2024-0091',
    fullName: 'Joaquim Tyipinge Ndafenhoso',
    alias: 'Kiluange',
    biNumber: '005518291HL032',
    provinceId: 'huila',
    provinceName: 'Huíla',
    establishmentId: 'penitenciaria-lubango',
    establishmentName: 'Estabelecimento Prisional do Lubango',
    pavilionName: 'Pavilhão Sul',
    cellCode: 'Cela 12',
    legalStatus: 'CONDENADO',
    crimeCategory: 'Furto de Gado Qualificado',
    penalCodeArticle: 'Art. 408º',
    parentName: 'Esperança Ndafenhoso',
    emergencyContactName: 'Esperança Ndafenhoso',
    emergencyPhone: '+244 926 771 902',
    neighborhood: 'Bairro Lucrécia, Lubango',
    photoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&fit=crop&crop=faces',
    lastUpdated: '2026-11-10T14:10:00Z'
  }
];

// Utilizadores Predefinidos para alternância de competência
export const MOCK_USERS: PnapUser[] = [
  {
    uid: 'user-central-01',
    profile: {
      uid: 'user-central-01',
      fullName: 'Comissário-Chefe Sebastião Vigário',
      badgeNumber: 'PNAP-DG-0001',
      rank: 'Director Geral dos Serviços Prisionais',
      phone: '+244 923 000 001',
      email: 'direccao.geral@pnap.gov.ao',
      status: 'active'
    },
    assignments: {
      role: 'CENTRAL_ADMIN',
      assignedProvinceId: 'all',
      permissions: [
        'view_all_provinces',
        'manage_national_transfers',
        'export_national_statistics',
        'view_global_audit',
        'configure_system'
      ]
    }
  },
  {
    uid: 'user-luanda-01',
    profile: {
      uid: 'user-luanda-01',
      fullName: 'Superintendente Prisional Mateus de Oliveira',
      badgeNumber: 'PNAP-LUA-0412',
      rank: 'Comandante Provincial de Luanda',
      phone: '+244 922 441 890',
      email: 'comando.luanda@pnap.gov.ao',
      status: 'active'
    },
    assignments: {
      role: 'PROVINCIAL_COMMAND',
      assignedProvinceId: 'luanda',
      permissions: [
        'view_luanda_establishments',
        'manage_luanda_inmates',
        'admit_release_luanda',
        'query_national_index',
        'view_luanda_logs'
      ]
    }
  },
  {
    uid: 'user-viana-01',
    profile: {
      uid: 'user-viana-01',
      fullName: 'Inspector-Chefe Paulo Quifuxi',
      badgeNumber: 'PNAP-EPV-109',
      rank: 'Chefe de Turno / Estabelecimento de Viana',
      phone: '+244 925 332 119',
      email: 'turno.viana@pnap.gov.ao',
      status: 'active'
    },
    assignments: {
      role: 'OPERATIONAL_OFFICER',
      assignedProvinceId: 'luanda',
      assignedEstablishmentId: 'comarca-viana',
      permissions: [
        'manage_intake_release',
        'manage_visitors',
        'view_pavilion_cells',
        'query_national_index'
      ]
    }
  }
];

// Histórico de Transferências (Inter-Provincial / Estabelecimentos)
export const MOCK_TRANSFERS: TransferRecord[] = [
  {
    transferId: 'trf-2024-001',
    inmateId: 'inm-bg-088',
    inmateName: 'Albano Catumbela Tchissola',
    matricula: 'BG-2024-0711',
    originProvinceId: 'benguela',
    originEstablishmentId: 'comarca-cavaco',
    destinationProvinceId: 'luanda',
    destinationEstablishmentId: 'comarca-viana',
    requestDate: '2026-11-10',
    status: 'AUTORIZADO_CENTRAL',
    justification: 'Comparecimento a audiência no Tribunal Supremo de Luanda',
    securityEscort: 'Brigada de Intervenção Rápida Prisional (BIRP)',
    authorizedBy: 'Direcção Geral PNAP (Comissário-Chefe Vigário)'
  },
  {
    transferId: 'trf-2024-002',
    inmateId: 'inm-la-001',
    inmateName: 'António Manuel dos Santos',
    matricula: 'LA-2024-0012',
    originProvinceId: 'luanda',
    originEstablishmentId: 'comarca-viana',
    destinationProvinceId: 'luanda',
    destinationEstablishmentId: 'hospital-sao-paulo',
    requestDate: '2026-11-08',
    status: 'CONCLUIDO',
    justification: 'Internamento médico especializado para cirurgia programada',
    securityEscort: 'Escolta Local Comarca de Viana',
    authorizedBy: 'Superintendente Mor Ernesto Caxita'
  }
];

// Histórico de Admissões
export const MOCK_ADMISSIONS: AdmissionRecord[] = [
  {
    admissionId: 'adm-rec-01',
    inmateId: 'inm-la-002',
    fullName: 'Domingos Sebastião Gaspar',
    matricula: 'LA-2024-0198',
    provinceId: 'luanda',
    establishmentId: 'comarca-viana',
    courtName: 'Tribunal da Comarca de Viana',
    crime: 'Burla por Defraudação Qualificada',
    timestamp: '2026-11-11T14:32:00Z',
    registeredBy: 'Inspetor Prisional Carlos Morais'
  },
  {
    admissionId: 'adm-rec-02',
    inmateId: 'inm-la-001',
    fullName: 'António Manuel dos Santos',
    matricula: 'LA-2024-0012',
    provinceId: 'luanda',
    establishmentId: 'comarca-viana',
    courtName: 'Tribunal da Comarca de Luanda',
    crime: 'Roubo Qualificado em Concurso com Posse de Arma',
    timestamp: '2026-11-10T09:12:00Z',
    registeredBy: 'Subinspetor Prisional André Kiala'
  }
];

// Histórico de Solturas (Releases)
export const MOCK_RELEASES: ReleaseRecord[] = [
  {
    releaseId: 'rel-2024-09',
    inmateId: 'inm-la-099',
    fullName: 'Bernardo Simão Kwanza',
    matricula: 'LA-2022-0941',
    provinceId: 'luanda',
    establishmentId: 'comarca-viana',
    alvaraNumber: 'ALV-TCL-8891/2026',
    judgeName: 'Dr. Afonso Ndala (Juiz Presidente 3ª Vara)',
    releaseDate: '2026-11-11',
    reason: 'CUMPRIMENTO_PENA',
    registeredBy: 'Oficial de Mandados EPV'
  }
];

// Visitantes e Visitas
export const MOCK_VISITORS: VisitorRecord[] = [
  {
    visitorId: 'vis-01',
    fullName: 'Maria Esperança dos Santos',
    biNumber: '001928374LA011',
    phone: '+244 923 445 112',
    relationship: 'Mãe',
    inmateId: 'inm-la-001',
    inmateName: 'António Manuel dos Santos',
    provinceId: 'luanda',
    establishmentId: 'comarca-viana',
    lastVisitDate: '2026-11-09',
    status: 'AUTORIZADO'
  },
  {
    visitorId: 'vis-02',
    fullName: 'Joana da Conceição Gaspar',
    biNumber: '002819281LA043',
    phone: '+244 931 998 440',
    relationship: 'Irmã',
    inmateId: 'inm-la-002',
    inmateName: 'Domingos Sebastião Gaspar',
    provinceId: 'luanda',
    establishmentId: 'comarca-viana',
    lastVisitDate: '2026-11-11',
    status: 'AUTORIZADO'
  }
];

export const MOCK_VISITS: VisitRecord[] = [
  {
    visitId: 'vst-001',
    visitorId: 'vis-02',
    visitorName: 'Joana da Conceição Gaspar',
    inmateId: 'inm-la-002',
    inmateName: 'Domingos Sebastião Gaspar',
    establishmentId: 'comarca-viana',
    date: '2026-11-12',
    timeSlot: '10:00 - 11:30',
    inspectionPassed: true,
    dutyOfficer: 'Subinspetor Prisional André Kiala'
  }
];

// Logs Globais e de Jurisdição
export const MOCK_AUDIT_LOGS: AuditLogEvent[] = [
  {
    eventId: 'log-001',
    timestamp: '2026-11-12T09:44:12Z',
    userId: 'user-luanda-01',
    userName: 'Superintendente Prisional Mateus de Oliveira',
    userRole: 'PROVINCIAL_COMMAND',
    userScopeProvince: 'luanda',
    action: 'NATIONAL_INDEX_QUERY',
    targetResource: 'nationalInmateIndex (Pesquisa por termo: Mateus)',
    details: 'Pesquisa federada realizada por Comando Provincial de Luanda. 1 resultado encontrado em Huambo.',
    ipAddress: '10.244.12.1',
    jurisdictionStatus: 'CROSS_PROVINCE_QUERY'
  },
  {
    eventId: 'log-002',
    timestamp: '2026-11-12T09:12:00Z',
    userId: 'user-luanda-01',
    userName: 'Superintendente Prisional Mateus de Oliveira',
    userRole: 'PROVINCIAL_COMMAND',
    userScopeProvince: 'luanda',
    action: 'VIEW_PROVINCIAL_DASHBOARD',
    targetResource: 'provinces/luanda/statistics',
    details: 'Visualização autorizada dos 4 estabelecimentos de Luanda.',
    ipAddress: '10.244.12.1',
    jurisdictionStatus: 'AUTHORIZED'
  },
  {
    eventId: 'log-003',
    timestamp: '2026-11-12T08:50:22Z',
    userId: 'user-luanda-01',
    userName: 'Superintendente Prisional Mateus de Oliveira',
    userRole: 'PROVINCIAL_COMMAND',
    userScopeProvince: 'luanda',
    action: 'BLOCKED_CROSS_PROVINCIAL_ACCESS',
    targetResource: 'provinces/huambo/establishments/penitenciaria-huambo/inmates/inm-hb-045/health',
    details: 'Tentativa de acesso direto a ficha clínica confidencial do Huambo bloqueada por isolamento de competência.',
    ipAddress: '10.244.12.1',
    jurisdictionStatus: 'BLOCKED_ATTEMPT'
  },
  {
    eventId: 'log-004',
    timestamp: '2026-11-12T08:15:30Z',
    userId: 'user-central-01',
    userName: 'Comissário-Chefe Sebastião Vigário',
    userRole: 'CENTRAL_ADMIN',
    userScopeProvince: 'all',
    action: 'CONSOLIDATED_NATIONAL_REPORT',
    targetResource: 'pnap/provinces/all',
    details: 'Consolidação das 21 províncias da RDPA 2024 emitida com sucesso.',
    ipAddress: '10.244.1.1',
    jurisdictionStatus: 'AUTHORIZED'
  }
];
