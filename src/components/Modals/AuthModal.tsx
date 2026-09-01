import React, { useState } from 'react';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile,
  db,
  doc,
  setDoc,
  getDoc
} from '../../services/firebase';
import { Flame, Mail, Lock, User as UserIcon, Shield, ArrowRight, Sparkles, CheckCircle2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';

interface AuthModalProps {
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const isForgotPassword = mode === 'forgot_password';

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        // Sync user to Firestore
        const userDocRef = doc(db, 'users', res.user.uid);
        const existingDoc = await getDoc(userDocRef);
        if (!existingDoc.exists()) {
          await setDoc(userDocRef, {
            id: res.user.uid,
            name: res.user.displayName || 'Membro Braza',
            email: res.user.email,
            avatar: res.user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
            status: 'online',
            customStatus: '🔥 Conectado no Braza Talk',
            bio: 'Membro da comunidade Braza Talk.',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        onSuccess?.();
      }
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setError(err.message || 'Erro ao autenticar com o Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Por favor, informe seu endereço de e-mail cadastrado.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResetSuccessMessage(null);
      await sendPasswordResetEmail(auth, email.trim());
      setResetSuccessMessage(`Enviamos um link de redefinição de senha para ${email.trim()}. Verifique sua caixa de entrada e spam!`);
    } catch (err: any) {
      console.error('Password Reset Error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('Nenhuma conta encontrada com este e-mail.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Formato de e-mail inválido.');
      } else {
        setError(err.message || 'Erro ao solicitar redefinição de senha.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha o e-mail e a senha.');
      return;
    }
    if (isRegister && !displayName.trim()) {
      setError('Por favor, informe seu nome de exibição.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      if (isRegister) {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(res.user, {
          displayName: displayName.trim(),
          photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
        });

        // Create user document in Firestore
        const userDocRef = doc(db, 'users', res.user.uid);
        await setDoc(userDocRef, {
          id: res.user.uid,
          name: displayName.trim(),
          email: res.user.email,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
          status: 'online',
          customStatus: '🔥 Novo membro no Braza Talk',
          bio: 'Membro da comunidade Braza Talk.',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } else {
        const res = await signInWithEmailAndPassword(auth, email, password);
        // Ensure user document exists
        const userDocRef = doc(db, 'users', res.user.uid);
        const existingDoc = await getDoc(userDocRef);
        if (!existingDoc.exists()) {
          await setDoc(userDocRef, {
            id: res.user.uid,
            name: res.user.displayName || email.split('@')[0],
            email: res.user.email,
            avatar: res.user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
            status: 'online',
            customStatus: '🔥 Conectado no Braza Talk',
            bio: 'Membro da comunidade Braza Talk.',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
      onSuccess?.();
    } catch (err: any) {
      console.error('Email Auth Error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está cadastrado. Faça login.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setError(err.message || 'Erro na autenticação.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080d]/90 backdrop-blur-xl p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-[#10131d] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Glow accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6 relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-indigo-600/30 mb-3 border border-indigo-400/30">
            {isForgotPassword ? <KeyRound className="w-8 h-8 text-white" /> : <Flame className="w-8 h-8 fill-current text-white" />}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Braza Talk
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live DB & Auth
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            {isForgotPassword
              ? 'Recupere o acesso à sua conta informando seu e-mail cadastrado.'
              : isRegister
              ? 'Crie sua conta segura para acessar servidores, voz HD e bate-papo em tempo real.'
              : 'Entre na sua conta para se conectar aos seus servidores e canais.'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {resetSuccessMessage && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{resetSuccessMessage}</span>
          </div>
        )}

        {/* Forgot Password Flow */}
        {isForgotPassword ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">E-mail Cadastrado</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full bg-[#181c2b] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              id="btn-submit-forgot-password"
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Enviar Link de Recuperação</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setResetSuccessMessage(null);
              }}
              className="w-full py-2 flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao Login</span>
            </button>
          </form>
        ) : (
          <>
            {/* Google One-Click Button */}
            <button
              id="btn-google-auth"
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm transition-all shadow-md active:scale-[0.99] cursor-pointer disabled:opacity-50 mb-5"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continuar com o Google</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider">ou via e-mail</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            {/* Email & Password Form */}
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {isRegister && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nome de Usuário</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-auth-name"
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ex: Carlos Dev"
                      className="w-full bg-[#181c2b] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    className="w-full bg-[#181c2b] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">Senha</label>
                  {!isRegister && (
                    <button
                      id="btn-forgot-password-link"
                      type="button"
                      onClick={() => {
                        setMode('forgot_password');
                        setError(null);
                        setResetSuccessMessage(null);
                      }}
                      className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-[#181c2b] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <button
                id="btn-auth-submit"
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{isRegister ? 'Criar Conta' : 'Entrar na Plataforma'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Toggle Mode */}
            <div className="mt-5 text-center text-xs text-slate-400">
              {isRegister ? (
                <p>
                  Já possui uma conta?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                    }}
                    className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Faça login
                  </button>
                </p>
              ) : (
                <p>
                  Novo no Braza Talk?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError(null);
                    }}
                    className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Cadastre-se gratuitamente
                  </button>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

