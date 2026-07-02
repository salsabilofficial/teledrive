import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { load } from '../api/storage';
import { SupportedLanguage } from '../i18n/languages';

export interface Settings {
    viewMode: 'grid' | 'list';
    autoUpdate: boolean;
    maxConcurrentUploads: number;
    maxConcurrentDownloads: number;
    zipFolders: boolean;
    language: SupportedLanguage;

    proxyEnabled: boolean;
    proxyType: 'socks5' | 'http' | 'https';
    proxyHost: string;
    proxyPort: number;
    proxyUsername: string;
    proxyPassword: string;
    proxyLiveStateEnabled: boolean;

    sidebarCollapsed: boolean;
    hideGroups: boolean;

    vpnMode: boolean;

    timeoutMultiplier: number;
    retryAttempts: number;
    retryBaseBackoffSec: number;
    retryMaxBackoffSec: number;
    adaptivePolling: boolean;
    pollingMinSec: number;
    pollingMaxSec: number;
    preferredDC: 'auto' | 'dc1' | 'dc2' | 'dc3' | 'dc4' | 'dc5';
    dcFallbackAttempts: number;
    floodWaitRespect: boolean;
    peerCacheSize: number;
    bandwidthLimitUpKBs: number;
    bandwidthLimitDownKBs: number;
    chunkSizeKb: number;
    keepAliveIntervalSec: number;
    autoDetectVpn: boolean;
    archiveMaxBytes: number;

    performanceMode: boolean;
    linuxRenderingFix: boolean;

    transcodeCacheMaxGb: number;
}

const defaultSettings: Settings = {
    viewMode: 'grid',
    autoUpdate: true,
    maxConcurrentUploads: 6,
    maxConcurrentDownloads: 6,
    zipFolders: true,
    language: 'en',

    proxyEnabled: false,
    proxyType: 'socks5',
    proxyHost: '',
    proxyPort: 1080,
    proxyUsername: '',
    proxyPassword: '',
    proxyLiveStateEnabled: true,

    sidebarCollapsed: false,
    hideGroups: false,

    vpnMode: false,
    timeoutMultiplier: 3,
    retryAttempts: 3,
    retryBaseBackoffSec: 1,
    retryMaxBackoffSec: 30,
    adaptivePolling: true,
    pollingMinSec: 15,
    pollingMaxSec: 60,
    preferredDC: 'auto',
    dcFallbackAttempts: 2,
    floodWaitRespect: true,
    peerCacheSize: 500,
    bandwidthLimitUpKBs: 0,
    bandwidthLimitDownKBs: 0,
    chunkSizeKb: 512,
    keepAliveIntervalSec: 0,
    autoDetectVpn: false,
    archiveMaxBytes: 256,

    performanceMode: false,
    linuxRenderingFix: true,

    transcodeCacheMaxGb: 5,
};

interface SettingsContextType {
    settings: Settings;
    updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
    resetSettings: () => void;
    isLoaded: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const store = await load('settings.json');
                const saved = await store.get<Settings>('settings');
                if (saved) {
                    const merged = { ...defaultSettings, ...saved };
                    if ((merged.proxyType as string) === 'mtproto') {
                        merged.proxyType = 'socks5';
                    }
                    setSettings(merged);
                }
            } catch {
            } finally {
                setIsLoaded(true);
            }
        };
        loadSettings();
    }, []);

    const persistSettings = useCallback(async (next: Settings) => {
        try {
            const store = await load('settings.json');
            await store.set('settings', next);
            await store.save();
        } catch {
        }
    }, []);

    const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
        setSettings(prev => {
            const next = { ...prev, [key]: value };
            persistSettings(next);
            return next;
        });
    }, [persistSettings]);

    const resetSettings = useCallback(() => {
        setSettings(defaultSettings);
        persistSettings(defaultSettings);
    }, [persistSettings]);

    return (
        <SettingsContext.Provider value={{ settings, updateSetting, resetSettings, isLoaded }}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) throw new Error('useSettings must be used within a SettingsProvider');
    return context;
};
