import { useState } from 'react';
import { supabase } from '../../api/supabase';
import { api } from '../../api/client';
import { motion } from 'framer-motion';
import { Lock, Sun, Moon, Mail, UserPlus, LogIn, Loader2, Key } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { toast } from 'sonner';

interface PortalAuthProps {
  onAuthenticated: () => void;
}

export function PortalAuth({ onAuthenticated }: PortalAuthProps) {
  const { theme, toggleTheme } = useTheme();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Email and password are required');
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        if (!token.trim()) {
          toast.error('Invitation token is required');
          setIsLoading(false);
          return;
        }

        const res = await api.registerInvite(email, password, token.trim());
        toast.success(res.message || 'Registration successful! You can now log in.');
        setIsSignUp(false);
        setToken(''); // Reset token field
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Logged in successfully!');
        onAuthenticated();
      }
    } catch (e: any) {
      toast.error(e.message || 'An error occurred during authentication');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-telegram-bg relative overflow-hidden px-4">
      {/* Theme Toggle in Top Right */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl hover:bg-telegram-hover text-telegram-subtext hover:text-telegram-text transition-all bg-telegram-surface border border-telegram-border/50"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass bg-telegram-surface border border-telegram-border rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="w-16 h-16 bg-telegram-primary/10 rounded-2xl flex items-center justify-center text-telegram-primary">
              <img src="/logo.svg" className="w-12 h-12 drop-shadow-md" alt="Logo" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-telegram-text">TeleDrive</h1>
          <p className="text-xs text-telegram-subtext mt-1.5 text-center">
            {isSignUp ? 'Create your SaaS portal account' : 'Sign in to access your cloud storage'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-telegram-subtext pl-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-telegram-subtext/70" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
                className="w-full bg-telegram-bg border border-telegram-border rounded-xl pl-11 pr-4 py-3 text-sm text-telegram-text placeholder:text-telegram-subtext/40 focus:outline-none focus:ring-2 focus:ring-telegram-primary/50 focus:border-telegram-primary/50 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-telegram-subtext pl-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-telegram-subtext/70" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="w-full bg-telegram-bg border border-telegram-border rounded-xl pl-11 pr-4 py-3 text-sm text-telegram-text placeholder:text-telegram-subtext/40 focus:outline-none focus:ring-2 focus:ring-telegram-primary/50 focus:border-telegram-primary/50 transition-all"
              />
            </div>
          </div>

          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-telegram-subtext pl-1">Invitation Token</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-telegram-subtext/70" />
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your admin token here"
                  required
                  disabled={isLoading}
                  className="w-full bg-telegram-bg border border-telegram-border rounded-xl pl-11 pr-4 py-3 text-sm text-telegram-text placeholder:text-telegram-subtext/40 focus:outline-none focus:ring-2 focus:ring-telegram-primary/50 focus:border-telegram-primary/50 transition-all"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 bg-telegram-primary hover:bg-telegram-primary/95 text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-telegram-primary/20 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" />
                Sign Up
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            disabled={isLoading}
            className="text-xs text-telegram-primary hover:underline font-semibold"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </motion.div>

      {/* Decorative blurred backgrounds */}
      <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none -z-10" />
    </div>
  );
}
