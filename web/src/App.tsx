import React, { useState, useEffect, Suspense } from "react";
import { api } from "./api/client";
import { isMobileWeb } from "./api/platform";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthWizard } from "./components/shared/AuthWizard";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { PortalAuth } from "./components/shared/PortalAuth";
import { supabase } from "./api/supabase";
import { Toaster } from "sonner";
import "./App.css";

const DesktopDashboard = React.lazy(() => import("./components/desktop/DesktopDashboard").then(m => ({ default: m.Dashboard })));
const MobileDashboard = React.lazy(() => import("./components/mobile/MobileDashboard.tsx"));

import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { TransferQueueProvider } from "./context/TransferQueueContext";
import { useTranslation } from "react-i18next";

const queryClient = new QueryClient();

type AuthStatus = "loading" | "portal_unauthenticated" | "telegram_unauthenticated" | "telegram_authenticated";

function AppContent() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const { theme } = useTheme();
  const { settings, updateSetting, isLoaded } = useSettings();
  const { i18n } = useTranslation();
  const isMobile = isMobileWeb();

  useEffect(() => {
    if (!isLoaded) return;
    i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
    document.documentElement.dir = settings.language === 'ar' ? 'rtl' : 'ltr';
  }, [settings.language, isLoaded, i18n]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches && !settings.performanceMode) {
      updateSetting('performanceMode', true);
    }
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && !settings.performanceMode) {
        updateSetting('performanceMode', true);
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (settings.performanceMode) {
      document.body.classList.add('performance-mode');
    } else {
      document.body.classList.remove('performance-mode');
    }
  }, [settings.performanceMode, isLoaded]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setAuthStatus("portal_unauthenticated");
          return;
        }

        const status = await api.authStatus()
          .then(res => ({ ...res, unauthorized: false }))
          .catch((err: any) => {
            if (err && err.status === 401) {
              return { authenticated: false, unauthorized: true };
            }
            return { authenticated: false, unauthorized: false };
          });

        if (status.unauthorized) {
          setAuthStatus("portal_unauthenticated");
        } else if (status.authenticated) {
          setAuthStatus("telegram_authenticated");
        } else {
          setAuthStatus("telegram_unauthenticated");
        }
      } catch {
        setAuthStatus("portal_unauthenticated");
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const status = await api.authStatus()
          .then(res => ({ ...res, unauthorized: false }))
          .catch((err: any) => {
            if (err && err.status === 401) {
              return { authenticated: false, unauthorized: true };
            }
            return { authenticated: false, unauthorized: false };
          });

        if (status.unauthorized) {
          setAuthStatus("portal_unauthenticated");
        } else if (status.authenticated) {
          setAuthStatus("telegram_authenticated");
        } else {
          setAuthStatus("telegram_unauthenticated");
        }
      } else if (event === 'SIGNED_OUT') {
        setAuthStatus("portal_unauthenticated");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (authStatus === "loading") {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-telegram-bg">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg" className="w-16 h-16 drop-shadow-lg animate-pulse" alt="Telegram Drive" />
          <p className="text-sm text-telegram-subtext tracking-wide">Restoring session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="absolute inset-0 text-telegram-text overflow-hidden selection:bg-telegram-primary/30">
      <Toaster theme={theme} position="bottom-center" />
      {authStatus === "telegram_authenticated" && (
        <Suspense fallback={
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-telegram-bg">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-telegram-primary"></div>
          </div>
        }>
          {isMobile ? (
            <ErrorBoundary>
              <MobileDashboard onLogout={async () => {
                await api.logout();
                await supabase.auth.signOut();
              }} />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary>
              <DesktopDashboard onLogout={async () => {
                await api.logout();
                await supabase.auth.signOut();
              }} />
            </ErrorBoundary>
          )}
        </Suspense>
      )}
      {authStatus === "telegram_unauthenticated" && (
        <AuthWizard onLogin={() => setAuthStatus("telegram_authenticated")} />
      )}
      {authStatus === "portal_unauthenticated" && (
        <PortalAuth onAuthenticated={() => {
          // Auth status is automatically updated by onAuthStateChange listener
        }} />
      )}
    </main>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ConfirmProvider>
            <SettingsProvider>
              <TransferQueueProvider>
                <AppContent />
              </TransferQueueProvider>
            </SettingsProvider>
          </ConfirmProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
