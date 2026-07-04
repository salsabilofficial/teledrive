import { Home, Folder, Download, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type TabType = 'home' | 'files' | 'downloads' | 'settings';

interface BottomNavBarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isAndroid?: boolean;
}

export function BottomNavBar({ activeTab, setActiveTab, isAndroid }: BottomNavBarProps) {
  const { t } = useTranslation();

  const tabs = [
    { id: 'home', labelKey: 'common.home', icon: Home },
    { id: 'files', labelKey: 'common.files', icon: Folder },
    { id: 'downloads', labelKey: 'common.transfers', icon: Download },
    { id: 'settings', labelKey: 'common.settings', icon: Settings },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-telegram-surface/95 backdrop-blur-xl border-t border-telegram-border/30 flex justify-around py-2.5 pb-[calc(10px+env(safe-area-inset-bottom,12px))] z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      {tabs.map(({ id, labelKey, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center gap-1.5 transition-all duration-200 relative px-4 py-1 ${
              isActive ? 'text-telegram-primary scale-105 font-bold' : 'text-telegram-subtext hover:text-telegram-text'
            }`}
          >
            <Icon className="w-5.5 h-5.5" />
            <span className="text-[10px] tracking-wide uppercase font-semibold">
              {id === 'home' ? 'Home' : id === 'files' ? 'Files' : id === 'downloads' ? 'Transfers' : 'Settings'}
            </span>
            {isActive && (
              <span className="absolute -bottom-1.5 w-1.5 h-1.5 bg-telegram-primary rounded-full shadow-[0_0_8px_var(--telegram-primary)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
