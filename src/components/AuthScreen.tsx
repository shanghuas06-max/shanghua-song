import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  CheckCircle2,
  Cloud,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { UI_TEXT } from '../i18n/uiTranslations';
import type { UiLanguage } from '../types/erp';

type AuthMode = 'login' | 'register' | 'reset';

interface AuthScreenProps {
  uiLang: UiLanguage;
  onChangeUiLang: (lang: UiLanguage) => void;
  pendingVerifyUser: User | null;
  onVerifiedRefresh: () => Promise<void>;
}

function mapFirebaseAuthError(
  err: unknown,
  t: (typeof UI_TEXT)['zh'],
): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-email'
  ) {
    return t.authErrInvalidCreds;
  }
  if (code === 'auth/email-already-in-use') {
    return t.authErrEmailInUse;
  }
  if (code === 'auth/weak-password') {
    return t.authErrWeakPass;
  }
  if (code === 'auth/operation-not-allowed') {
    return t.authErrProviderDisabled;
  }
  return t.authErrGeneric;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  uiLang,
  onChangeUiLang,
  pendingVerifyUser,
  onVerifiedRefresh,
}) => {
  const t = UI_TEXT[uiLang];

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const langOptions: { code: UiLanguage; label: string }[] = [
    { code: 'zh', label: '中文' },
    { code: 'ja', label: '日本語' },
    { code: 'en', label: 'English' },
  ];

  const handleModeSwitch = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg(t.authErrMissingFields);
      return;
    }

    if (mode === 'reset') {
      setSubmitting(true);
      try {
        await sendPasswordResetEmail(auth, trimmedEmail);
        setInfoMsg(t.authResetSent);
      } catch (err) {
        setErrorMsg(mapFirebaseAuthError(err, t));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!password) {
      setErrorMsg(t.authErrMissingFields);
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setErrorMsg(t.authErrWeakPass);
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(t.authErrPasswordMismatch);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
        const cred = await createUserWithEmailAndPassword(
          auth,
          trimmedEmail,
          password,
        );
        const nameLabel = displayName.trim() || trimmedEmail.split('@')[0];
        await updateProfile(cred.user, {
          displayName: companyName.trim()
            ? `${nameLabel} (${companyName.trim()})`
            : nameLabel,
        });
        await sendEmailVerification(cred.user);
      }
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerified = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await onVerifiedRefresh();
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        setErrorMsg(t.authVerifyNotYet);
      }
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerify = async () => {
    if (!pendingVerifyUser) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await sendEmailVerification(pendingVerifyUser);
      setInfoMsg(t.authVerifyResent);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Language Strip */}
      <header className="w-full px-4 sm:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-slate-900 text-white font-bold text-sm">
            HL
          </span>
          <div>
            <div className="text-sm font-bold text-slate-900 tracking-tight">
              {t.brandTitle}
            </div>
            <div className="text-[11px] text-slate-500">{t.brandSub}</div>
          </div>
        </div>

        <div
          role="group"
          aria-label={t.uiLangLabel}
          className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-md p-1"
        >
          {langOptions.map((opt) => (
            <button
              key={opt.code}
              type="button"
              onClick={() => onChangeUiLang(opt.code)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                uiLang === opt.code
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Centered Auth Grid */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-sm">
          {/* Left Industrial Context Panel */}
          <section className="lg:col-span-5 bg-slate-900 text-slate-100 p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 tracking-wide uppercase">
                <ShieldCheck className="w-4 h-4" />
                <span>HARDLOCK MULTI-TENANT ERP</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                {t.authPortalTitle}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {t.authPortalSub}
              </p>
            </div>

            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>{t.authFeatureIsolation}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Cloud className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>{t.authFeatureCloudSync}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <FileSpreadsheet className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>{t.authFeatureDocs}</span>
              </li>
            </ul>
          </section>

          {/* Right Form or Email Verification Gate */}
          <section className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
            {pendingVerifyUser ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <MailCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {t.authVerifyTitle}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {pendingVerifyUser.email}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-md p-3.5">
                  {t.authVerifyDesc}{' '}
                  <span className="font-semibold text-slate-900">
                    {pendingVerifyUser.email}
                  </span>
                </p>

                {errorMsg && (
                  <div
                    role="alert"
                    className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3"
                  >
                    {errorMsg}
                  </div>
                )}
                {infoMsg && (
                  <div
                    role="status"
                    className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{infoMsg}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCheckVerified}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t.authBtnCheckVerified}</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleResendVerify}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60 transition-colors"
                  >
                    <span>{t.authBtnResendVerify}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => signOut(auth)}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t.authBtnSignOut}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Mode Tabs */}
                <div
                  role="tablist"
                  className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'login'}
                    onClick={() => handleModeSwitch('login')}
                    className={`py-2 px-2 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                      mode === 'login'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.authTabLogin}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'register'}
                    onClick={() => handleModeSwitch('register')}
                    className={`py-2 px-2 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                      mode === 'register'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.authTabRegister}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'reset'}
                    onClick={() => handleModeSwitch('reset')}
                    className={`py-2 px-2 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                      mode === 'reset'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.authTabReset}
                  </button>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3 leading-relaxed"
                  >
                    {errorMsg}
                  </div>
                )}
                {infoMsg && (
                  <div
                    role="status"
                    className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{infoMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
                  {mode === 'register' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="auth-display-name"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          {t.authDisplayNameLabel}
                        </label>
                        <input
                          id="auth-display-name"
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Zhang Wei"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="auth-company-name"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          {t.authCompanyNameLabel}
                        </label>
                        <input
                          id="auth-company-name"
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="HARDLOCK Export Dept."
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="auth-email"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {t.authEmailLabel}
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {mode !== 'reset' && (
                    <div>
                      <label
                        htmlFor="auth-password"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        {t.authPasswordLabel}
                      </label>
                      <input
                        id="auth-password"
                        type="password"
                        autoComplete={
                          mode === 'login' ? 'current-password' : 'new-password'
                        }
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  {mode === 'register' && (
                    <div>
                      <label
                        htmlFor="auth-confirm-password"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        {t.authConfirmPasswordLabel}
                      </label>
                      <input
                        id="auth-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors"
                  >
                    {mode === 'login' && <Lock className="w-4 h-4" />}
                    {mode === 'register' && <UserPlus className="w-4 h-4" />}
                    {mode === 'reset' && <KeyRound className="w-4 h-4" />}
                    <span>
                      {mode === 'login'
                        ? t.authBtnLogin
                        : mode === 'register'
                          ? t.authBtnRegister
                          : t.authBtnReset}
                    </span>
                  </button>
                </form>

                {/* Divider & Google Sign-In */}
                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-slate-200" />
                  <span className="shrink mx-3 text-xs text-slate-400">
                    {t.authOrDivider}
                  </span>
                  <div className="flex-grow border-t border-slate-200" />
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogleLogin}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>{t.authBtnGoogle}</span>
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
