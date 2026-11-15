import React, { useState } from 'react';
import { Inmate } from '../types/pnap';
import { 
  X, 
  User, 
  Scale, 
  HeartPulse, 
  GraduationCap, 
  AlertOctagon, 
  FileCheck, 
  ShieldAlert, 
  Calendar, 
  MapPin, 
  Phone, 
  Home, 
  Clock,
  Download,
  AlertTriangle,
  BadgeCheck
} from 'lucide-react';

interface InmateDossierModalProps {
  inmate: Inmate;
  onClose: () => void;
  canEdit?: boolean;
}

export const InmateDossierModal: React.FC<InmateDossierModalProps> = ({
  inmate,
  onClose,
  canEdit = false
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'legal' | 'health' | 'rehabilitation' | 'disciplinary' | 'post' | 'documents'>('profile');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#0b192c] text-white w-full max-w-4xl rounded-3xl shadow-2xl border border-blue-900/60 overflow-hidden my-auto flex flex-col max-h-[90vh]">
        {/* Cabeçalho do Dossier Prisional */}
        <div className="bg-gradient-to-r from-[#10233f] to-[#152e55] p-5 border-b border-blue-800/60 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <img
              src={inmate.profile.photoUrl}
              alt={inmate.profile.fullName}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-400 shadow-md"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-blue-600 text-white font-mono px-2 py-0.5 rounded-md font-bold">
                  {inmate.profile.matricula}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  inmate.legal.legalStatus === 'CONDENADO' 
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' 
                    : 'bg-amber-950 text-amber-300 border border-amber-700'
                }`}>
                  {inmate.legal.legalStatus}
                </span>
                <span className="text-xs text-blue-300 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                  Província: {inmate.provinceId.toUpperCase()}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mt-1">
                {inmate.profile.fullName}
              </h2>
              {inmate.profile.alias && (
                <p className="text-xs text-amber-400">
                  Alcunha: &quot;{inmate.profile.alias}&quot;
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/60 p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Navegação do Dossier */}
        <div className="flex items-center gap-1 overflow-x-auto bg-[#081220] p-2 border-b border-blue-900/60 scrollbar-none text-xs">
          {[
            { id: 'profile', label: '1. Perfil & Admissão', icon: User },
            { id: 'legal', label: '2. Jurídico & Penas', icon: Scale },
            { id: 'health', label: '3. Saúde & Clínica', icon: HeartPulse },
            { id: 'rehabilitation', label: '4. Reabilitação', icon: GraduationCap },
            { id: 'disciplinary', label: '5. Disciplinar & Incidentes', icon: AlertOctagon },
            { id: 'post', label: '6. Pós-Institucional', icon: BadgeCheck },
            { id: 'documents', label: '7. Documentos Oficiais', icon: FileCheck }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-all font-medium cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo Dinâmico da Aba Selecionada */}
        <div className="p-5 md:p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: PERFIL & ADMISSÃO */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" /> Dados Pessoais & Família
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400">Bilhete de Identidade (BI): </span>
                      <strong className="text-white font-mono">{inmate.profile.biNumber}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Data de Nascimento: </span>
                      <strong className="text-white">{inmate.profile.dateOfBirth}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Filiação Paterna: </span>
                      <strong className="text-white">{inmate.profile.fatherName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Filiação Materna: </span>
                      <strong className="text-white">{inmate.profile.motherName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Residência / Bairro: </span>
                      <strong className="text-white">{inmate.profile.neighborhood}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Contacto de Emergência: </span>
                      <strong className="text-amber-300 font-mono">
                        {inmate.profile.emergencyContact.name} ({inmate.profile.emergencyContact.phone})
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="bg-[#10233f] p-4 rounded-2xl border border-blue-900/50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Localização Interna na Comarca
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400">Estabelecimento Prisional: </span>
                      <strong className="text-white">{inmate.establishmentId}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Pavilhão: </span>
                      <strong className="text-white">{inmate.pavilionId}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Bloco e Cela: </span>
                      <strong className="text-emerald-400 font-semibold">{inmate.blockId} · {inmate.cellId}</strong>
                    </div>
                    <div className="pt-2 border-t border-blue-900/40">
                      <span className="text-slate-400">Data de Entrada: </span>
                      <strong className="text-white">{inmate.admission.admissionDate}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Mandado Nº: </span>
                      <strong className="text-white font-mono">{inmate.admission.mandateNumber}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Oficial de Recepção: </span>
                      <strong className="text-white">{inmate.admission.intakeOfficer}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: JURÍDICO & PENAS */}
          {activeTab === 'legal' && (
            <div className="space-y-4">
              <div className="bg-[#10233f] p-5 rounded-2xl border border-blue-900/50">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-amber-400" />
                  Situação Processual Penal
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-3">
                  <div>
                    <span className="text-slate-400">Tipologia de Crime:</span>
                    <p className="font-semibold text-white mt-0.5">{inmate.legal.crimeCategory}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Enquadramento Legal:</span>
                    <p className="font-semibold text-amber-300 mt-0.5">{inmate.legal.penalCodeArticle}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Processo & Tribunal:</span>
                    <p className="font-semibold text-white mt-0.5">
                      {inmate.admission.processNumber} · {inmate.admission.courtName}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Total da Pena Aplicada:</span>
                    <p className="font-bold text-emerald-400 text-sm mt-0.5">
                      {inmate.legal.totalSentenceYears} Anos ({inmate.legal.totalSentenceMonths} Meses)
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-blue-900/50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[11px]">Tempo Cumprido</span>
                    <strong className="text-white text-sm">{inmate.legal.timeServedMonths} Meses</strong>
                  </div>
                  <div className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[11px]">Dias Remidos</span>
                    <strong className="text-emerald-400 text-sm">{inmate.legal.remissionEarnedMonths} Meses</strong>
                  </div>
                  <div className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[11px]">Condicional Apta em</span>
                    <strong className="text-amber-300 text-sm">{inmate.legal.eligibleParoleDate}</strong>
                  </div>
                  <div className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400 block text-[11px]">Término da Pena</span>
                    <strong className="text-white text-sm">{inmate.legal.endOfSentenceDate}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SAÚDE & CLÍNICA */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              <div className="bg-[#10233f] p-5 rounded-2xl border border-blue-900/50">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-rose-400" />
                  Registo Clínico Prisional (Confidencial)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400">Grupo Sanguíneo:</span>
                    <div className="text-base font-bold text-rose-400 mt-1">{inmate.health.bloodType}</div>
                  </div>
                  <div className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400">Última Triagem Médica:</span>
                    <div className="font-semibold text-white mt-1">{inmate.health.lastMedicalCheckup}</div>
                  </div>
                  <div className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40">
                    <span className="text-slate-400">Regime Alimentar:</span>
                    <div className="font-semibold text-white mt-1">{inmate.health.dietaryRestrictions}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold">Doenças Crónicas: </span>
                    <span className="text-white">
                      {inmate.health.chronicDiseases.length > 0 ? inmate.health.chronicDiseases.join(', ') : 'Nenhuma registada'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold">Alergias Medicamentosas: </span>
                    <span className="text-rose-300 font-bold">
                      {inmate.health.allergies.length > 0 ? inmate.health.allergies.join(', ') : 'Sem alergias conhecidas'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold">Medicação Contínua: </span>
                    <span className="text-amber-300">
                      {inmate.health.dailyMedication.length > 0 ? inmate.health.dailyMedication.join(', ') : 'Nenhuma'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold">Estado de Saúde Mental: </span>
                    <span className="text-white">{inmate.health.mentalHealthStatus}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REABILITAÇÃO */}
          {activeTab === 'rehabilitation' && (
            <div className="bg-[#10233f] p-5 rounded-2xl border border-blue-900/50 space-y-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-400" />
                Programa de Reinserção e Trabalho Prisional
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400">Ofício / Trabalho Atribuído:</span>
                  <p className="font-bold text-white mt-0.5 text-sm">
                    {inmate.rehabilitation.jobAssignment || 'Sem atribuição activa'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Escolaridade / Nível:</span>
                  <p className="font-semibold text-white mt-0.5">{inmate.rehabilitation.educationLevel}</p>
                </div>
                <div>
                  <span className="text-slate-400">Formação Profissional em Curso:</span>
                  <p className="text-emerald-400 font-medium mt-0.5">
                    {inmate.rehabilitation.coursesEnrolled.join(', ') || 'Nenhum'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Classificação de Conduta:</span>
                  <p className="font-bold text-blue-300 mt-0.5">
                    {inmate.rehabilitation.conductClassification} ({inmate.rehabilitation.meritPoints} Pontos de Mérito)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DISCIPLINAR & INCIDENTES */}
          {activeTab === 'disciplinary' && (
            <div className="space-y-4">
              <div className="bg-[#10233f] p-5 rounded-2xl border border-blue-900/50">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-amber-400" />
                  Registo Disciplinar e Medidas Cautelares
                </h3>
                <div className="text-xs text-slate-300 mb-3">
                  Total de infrações registadas:{' '}
                  <strong className="text-white">{inmate.disciplinary.infractionsCount}</strong>
                </div>

                {inmate.disciplinary.sanctionHistory.length === 0 ? (
                  <p className="text-xs text-emerald-400">Registo disciplinar limpo. Sem sanções aplicadas.</p>
                ) : (
                  <div className="space-y-2">
                    {inmate.disciplinary.sanctionHistory.map((s, idx) => (
                      <div key={idx} className="bg-[#0b192c] p-3 rounded-xl border border-amber-900/40 text-xs">
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Data: {s.date}</span>
                          <span className="text-amber-400 font-semibold">{s.signedBy}</span>
                        </div>
                        <p className="text-white font-medium">{s.description}</p>
                        <p className="text-amber-300 text-[11px] mt-1">Medida: {s.measure}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: PÓS-INSTITUCIONAL */}
          {activeTab === 'post' && (
            <div className="bg-[#10233f] p-5 rounded-2xl border border-blue-900/50 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 text-blue-400" />
                Plano de Acompanhamento Pós-Institucional
              </h3>
              <div>
                <span className="text-slate-400">Estado do Plano: </span>
                <strong className="text-emerald-400">{inmate.postInstitutional.reintegrationPlanStatus}</strong>
              </div>
              <div>
                <span className="text-slate-400">Assistente Social Designada: </span>
                <strong className="text-white">{inmate.postInstitutional.assignedSocialWorker || 'Aguardando atribuição'}</strong>
              </div>
              <div>
                <span className="text-slate-400">Recomendação Vocacional: </span>
                <strong className="text-white">{inmate.postInstitutional.vocationalRecommendation}</strong>
              </div>
            </div>
          )}

          {/* TAB 7: DOCUMENTOS OFICIAIS */}
          {activeTab === 'documents' && (
            <div className="bg-[#10233f] p-5 rounded-2xl border border-blue-900/50 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-blue-400" />
                Documentos Cartorários & Alvarás Anexados
              </h3>
              {inmate.documents.length === 0 ? (
                <p className="text-slate-400">Nenhum documento digitalizado anexado.</p>
              ) : (
                <div className="space-y-2">
                  {inmate.documents.map((doc) => (
                    <div
                      key={doc.documentId}
                      className="bg-[#0b192c] p-3 rounded-xl border border-blue-900/40 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-white">{doc.title}</div>
                        <div className="text-[11px] text-slate-400">
                          Tipo: {doc.type} · Data: {doc.uploadDate} · Tamanho: {doc.fileSize}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => alert(`A descarregar ${doc.title}...`)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                      >
                        <Download className="w-3 h-3" /> Baixar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé com botão de fechar */}
        <div className="p-4 bg-[#081220] border-t border-blue-900/60 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Dossier Prisional Centralizado · PNAP República de Angola
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-medium cursor-pointer"
          >
            Fechar Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
