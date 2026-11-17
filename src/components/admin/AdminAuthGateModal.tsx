import React, { useMemo, useState } from 'react';
import type { User as FirebaseAuthUser } from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  checkAdminGateFirestore,
  getEnrolledMfaInfo,
  reauthenticateWithGoogle,
  signInWithGoogle
} from '../../firebase';
import {
  ApiClientError,
  isApiConfigured,
  requestAdminChallengeViaApi,
  verifyAdminAccessViaApi,
  type AdminVerificationMethod
} from '../../services/apiClient';

export interface VerifiedAdminSession {
  uid: string;
  email: string;
  verifiedAt: string;
  expiresAt: string;
  verificationMethod: AdminVerificationMethod;
  apiVerified: boolean;
}

interface AdminAuthGateModalProps {
  firebaseUser: FirebaseAuthUser | null;
  onVerified: (session: VerifiedAdminSession) => void;
  onClose: () => void;
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getPasskeyStorageKey(uid: string): string {
  return `pnap_admin_passkey_id_${uid}`;
}

export const AdminAuthGateModal: React.FC<AdminAuthGateModalProps> = ({
  firebaseUser,
  onVerified,
  onClose
}) => {
  const [activeUser, setActiveUser] = useState<FirebaseAuthUser | null>(firebaseUser);
  const [busyStep, setBusyStep] = useState<'google' | 'reauth' | 'passkey' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const mfaInfo = useMemo(() => getEnrolledMfaInfo(activeUser), [activeUser]);
  const webAuthnAvailable =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials);

  const savedCredentialId = activeUser
    ? window.localStorage.getItem(getPasskeyStorageKey(activeUser.uid))
    : null;

  const isEmailStepReady = Boolean(activeUser && activeUser.email && activeUser.emailVerified);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setStatusNote(null);
    setBusyStep('google');
    try {
      const signed = await signInWithGoogle();
      setActiveUser(signed);
      if (!signed.emailVerified) {
        setErrorMsg('A conta Google selecionada não possui e-mail verificado.');
      } else {
        setStatusNote(`Conta autenticada: ${signed.email}. Conclua a 2.ª verificação individual abaixo.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Autenticação Google cancelada ou recusada.';
      setErrorMsg(msg);
    } finally {
      setBusyStep(null);
    }
  };

  const finalizeGateVerification = async (
    user: FirebaseAuthUser,
    method: AdminVerificationMethod,
    credentialId?: string
  ) => {
    if (!user.email || !user.emailVerified) {
      throw new Error('É obrigatório autenticar com um e-mail institucional Google verificado.');
    }

    if (isApiConfigured()) {
      const challengeRes = await requestAdminChallengeViaApi();
      const verifyRes = await verifyAdminAccessViaApi({
        challengeId: challengeRes.challengeId,
        verificationMethod: method,
        ...(credentialId ? { credentialId } : {})
      });
      if (!verifyRes.verified) {
        throw new Error('Verificação administrativa recusada pelo servidor PNAP.');
      }
      onVerified({
        uid: verifyRes.admin.uid,
        email: verifyRes.admin.email,
        verifiedAt: verifyRes.verifiedAt,
        expiresAt: verifyRes.expiresAt,
        verificationMethod: verifyRes.verificationMethod,
        apiVerified: true
      });
      return;
    }

    // Fallback direto via Firestore Security Rules quando VITE_API_BASE_URL não está configurado
    const gate = await checkAdminGateFirestore(user.uid);
    const hasCentralRole =
      (gate.hasAdminDoc && gate.adminRole === 'CENTRAL_ADMIN') ||
      (gate.pnapUser?.assignments.role === 'CENTRAL_ADMIN' && gate.pnapUser?.profile?.status === 'active');

    if (!hasCentralRole) {
      throw new Error(
        `A conta ${user.email} não está autorizada como CENTRAL_ADMIN em pnap_admins / pnap_users.`
      );
    }

    const now = new Date();
    onVerified({
      uid: user.uid,
      email: user.email,
      verifiedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      verificationMethod: method,
      apiVerified: false
    });
  };

  const handleSecondFactorGoogleReauth = async () => {
    if (!activeUser) return;
    setErrorMsg(null);
    setStatusNote(null);
    setBusyStep('reauth');
    try {
      const reauthed = await reauthenticateWithGoogle();
      setActiveUser(reauthed);
      await reauthed.getIdToken(true);
      const method: AdminVerificationMethod = mfaInfo.count > 0 ? 'FIREBASE_MFA' : 'REAUTH_GOOGLE';
      await finalizeGateVerification(reauthed, method);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(`${err.message} (${err.code})`);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Falha na confirmação de segunda verificação.');
      }
    } finally {
      setBusyStep(null);
    }
  };

  const handlePasskeyVerification = async () => {
    if (!activeUser || !activeUser.email) return;
    setErrorMsg(null);
    setStatusNote(null);
    setBusyStep('passkey');
    try {
      let challengeBase64Url = arrayBufferToBase64Url(crypto.getRandomValues(new Uint8Array(32)).buffer);
      let serverChallengeId: string | null = null;

      if (isApiConfigured()) {
        const challengeRes = await requestAdminChallengeViaApi();
        challengeBase64Url = challengeRes.challenge;
        serverChallengeId = challengeRes.challengeId;
      }

      const challengeBytes = base64UrlToUint8Array(challengeBase64Url);
      const challengeBuffer = challengeBytes.buffer.slice(
        challengeBytes.byteOffset,
        challengeBytes.byteOffset + challengeBytes.byteLength
      ) as ArrayBuffer;
      let usedCredentialId = savedCredentialId || '';

      if (!usedCredentialId) {
        const userIdBytes = new TextEncoder().encode(activeUser.uid);
        const created = (await navigator.credentials.create({
          publicKey: {
            challenge: challengeBuffer,
            rp: {
              name: 'PNAP · Administração Nacional',
              id: window.location.hostname
            },
            user: {
              id: userIdBytes,
              name: activeUser.email,
              displayName: activeUser.displayName || activeUser.email
            },
            pubKeyCredParams: [
              { alg: -7, type: 'public-key' },
              { alg: -257, type: 'public-key' }
            ],
            authenticatorSelection: {
              userVerification: 'required',
              residentKey: 'preferred'
            },
            timeout: 60000
          }
        })) as PublicKeyCredential | null;

        if (!created) {
          throw new Error('Registo da passkey cancelado.');
        }
        usedCredentialId = arrayBufferToBase64Url(created.rawId);
        window.localStorage.setItem(getPasskeyStorageKey(activeUser.uid), usedCredentialId);
      } else {
        const assertion = (await navigator.credentials.get({
          publicKey: {
            challenge: challengeBuffer,
            allowCredentials: [
              {
                id: base64UrlToUint8Array(usedCredentialId).buffer as ArrayBuffer,
                type: 'public-key'
              }
            ],
            userVerification: 'required',
            timeout: 60000
          }
        })) as PublicKeyCredential | null;

        if (!assertion) {
          throw new Error('Verificação biométrica/passkey cancelada.');
        }
        usedCredentialId = arrayBufferToBase64Url(assertion.rawId);
      }

      if (isApiConfigured() && serverChallengeId) {
        const verifyRes = await verifyAdminAccessViaApi({
          challengeId: serverChallengeId,
          verificationMethod: 'WEBAUTHN_PASSKEY',
          credentialId: usedCredentialId
        });
        if (!verifyRes.verified) {
          throw new Error('Passkey não validada pelo servidor.');
        }
        onVerified({
          uid: verifyRes.admin.uid,
          email: verifyRes.admin.email,
          verifiedAt: verifyRes.verifiedAt,
          expiresAt: verifyRes.expiresAt,
          verificationMethod: verifyRes.verificationMethod,
          apiVerified: true
        });
      } else {
        await finalizeGateVerification(activeUser, 'WEBAUTHN_PASSKEY', usedCredentialId);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(`${err.message} (${err.code})`);
      } else {
        const msg = err instanceof Error ? err.message : 'Falha na verificação com Passkey.';
        setErrorMsg(
          `${msg} Pode concluir utilizando a confirmação Google institucional / MFA.`
        );
      }
    } finally {
      setBusyStep(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0b192c] border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-[#081220] border-b border-amber-500/25 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Acesso Administrativo</h2>
              <p className="text-[11px] text-slate-400">
                Área reservada à Direcção Geral e administradores autorizados
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar acesso administrativo"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          {/* Passo 1: Conta Google institucional */}
          <div className="bg-[#10233f] border border-blue-900/60 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                1. E-mail Institucional Autorizado
              </span>
              {isEmailStepReady && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Verificado
                </span>
              )}
            </div>

            <div className="bg-[#081220] border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400">Sessão Google / Firebase</div>
                <div className="text-xs font-mono text-white truncate">
                  {activeUser?.email || 'Nenhuma conta autenticada'}
                </div>
              </div>
              <button
                type="button"
                disabled={busyStep !== null}
                onClick={handleGoogleLogin}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{activeUser ? 'Trocar Conta' : 'Autenticar Google'}</span>
              </button>
            </div>
          </div>

          {/* Passo 2: Segunda verificação individual */}
          <div
            className={`bg-[#10233f] border rounded-xl p-3 space-y-2.5 transition-opacity ${
              isEmailStepReady ? 'border-amber-500/40 opacity-100' : 'border-slate-800 opacity-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                2. Verificação Individual de Segurança
              </span>
              <span className="text-[10px] text-slate-400">
                {mfaInfo.count > 0 ? `MFA Firebase (${mfaInfo.count})` : 'CENTRAL_ADMIN'}
              </span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              Sem senha fixa ou universal. Confirme a posse individual da credencial para validar
              a função <strong className="text-white">CENTRAL_ADMIN</strong> e desbloquear o painel.
            </p>

            <div className="grid grid-cols-1 gap-2">
              {webAuthnAvailable && (
                <button
                  type="button"
                  disabled={!isEmailStepReady || busyStep !== null}
                  onClick={handlePasskeyVerification}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/45 text-amber-200 font-semibold cursor-pointer disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      {busyStep === 'passkey'
                        ? 'A validar Passkey...'
                        : savedCredentialId
                        ? 'Confirmar com Passkey / Biometria'
                        : 'Associar e Confirmar Passkey Individual'}
                    </span>
                  </span>
                  <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </button>
              )}

              <button
                type="button"
                disabled={!isEmailStepReady || busyStep !== null}
                onClick={handleSecondFactorGoogleReauth}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {busyStep === 'reauth'
                      ? 'A verificar credencial...'
                      : mfaInfo.count > 0
                      ? 'Confirmar Google + MFA Firebase'
                      : 'Re-autenticar Conta Institucional e Entrar'}
                  </span>
                </span>
                <Lock className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>

          {statusNote && !errorMsg && (
            <div className="bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 rounded-xl px-3 py-2 text-[11px] flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{statusNote}</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-950/70 border border-rose-700/70 text-rose-200 rounded-xl px-3 py-2 text-[11px] flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="text-[10px] text-slate-400 text-center pt-1">
            Todos os acessos e tentativas recusadas ficam registados na auditoria imutável do PNAP.
          </div>
        </div>
      </div>
    </div>
  );
};
