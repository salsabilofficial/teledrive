import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Download, Upload, Trash2, HardDrive, Globe, Key, Copy, Check, RefreshCw, FolderArchive, Shield, Zap, Activity, Gauge, Wifi, ChevronDown, Link, Sparkles, Info, Clipboard, Monitor, Loader2, Languages, Play, Palette, Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { useSettings } from '../../../context/SettingsContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../../i18n/languages';
import { version as appVersion } from '../../../../package.json';
import { useTheme } from '../../../context/ThemeContext';
import { CustomTheme, ThemeColorPalette, generateThemeId } from '../../../theme/themeEngine';
import { getDefaultPalette } from '../../../theme/presets';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type SettingsTab = 'general' | 'themes' | 'proxy' | 'vpn' | 'sharing';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { settings, updateSetting, resetSettings } = useSettings();
    const { confirm } = useConfirm();
    const { t } = useTranslation();
    const [clearing, setClearing] = useState(false);

    const [activeTab, setActiveTab] = useState<SettingsTab>('general');

    const handleCheckForUpdates = useCallback(async () => {
        toast.info('Update checking not available in web version');
    }, [t]);

    const [updateVersion, setUpdateVersion] = useState<string | null>(null);
    const [updateChecking, setUpdateChecking] = useState(false);
    const [updateDownloading, setUpdateDownloading] = useState(false);
    const [updateProgress, setUpdateProgress] = useState(0);

    const handleClearCache = useCallback(async () => {
        const ok = await confirm({
            title: t('settings.clear_cache_title'),
            message: t('settings.clear_cache_desc'),
            confirmText: t('settings.clear'),
            variant: 'danger',
        });
        if (!ok) return;
        setClearing(true);
        setTimeout(() => {
            toast.success(t('settings.cache_cleared'));
            setClearing(false);
        }, 500);
    }, [confirm, t]);

    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopyShare = (id: string) => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                        className="bg-telegram-surface border border-telegram-border rounded-xl w-[440px] shadow-2xl overflow-hidden flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-telegram-border flex justify-between items-center">
                            <h2 className="text-telegram-text font-semibold text-base">{t('settings.title')}</h2>
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-telegram-hover rounded-lg text-telegram-subtext hover:text-telegram-text transition"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="px-5 pt-3 pb-0 flex gap-1 justify-start overflow-x-auto border-b border-telegram-border scrollbar-none">
                            {([['general', Globe], ['themes', Palette], ['proxy', Shield], ['vpn', Zap], ['sharing', Link]] as const).map(([key, Icon]) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key as SettingsTab)}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors shrink-0 ${
                                        activeTab === key
                                            ? 'text-telegram-primary border-b-2 border-telegram-primary bg-telegram-primary/5'
                                            : 'text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover/50'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {t(`settings.tab_${key}`)}
                                </button>
                            ))}
                        </div>

                        <motion.div layout className="px-5 py-4 max-h-[70vh] overflow-y-auto overflow-x-hidden relative">
                            <AnimatePresence mode="popLayout" initial={false}>

                                {activeTab === 'general' && (
                                    <motion.div
                                        key="general"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 220, opacity: { duration: 0.15 } }}
                                        className="space-y-6 w-full"
                                    >

                            <section className="space-y-3">
                                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                                    <Upload className="w-3.5 h-3.5" />
                                    {t('settings.transfers')}
                                </h3>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <Upload className="w-4 h-4 text-telegram-subtext" />
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.concurrent_uploads')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.max_uploads_desc')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => updateSetting('maxConcurrentUploads', Math.max(1, settings.maxConcurrentUploads - 1))}
                                            className="w-7 h-7 flex items-center justify-center rounded-md bg-telegram-bg text-telegram-subtext hover:text-telegram-text hover:bg-telegram-border transition text-sm font-medium"
                                        >
                                            -
                                        </button>
                                        <span className="text-sm text-telegram-text font-medium w-5 text-center">
                                            {settings.maxConcurrentUploads}
                                        </span>
                                        <button
                                            onClick={() => updateSetting('maxConcurrentUploads', Math.min(10, settings.maxConcurrentUploads + 1))}
                                            className="w-7 h-7 flex items-center justify-center rounded-md bg-telegram-bg text-telegram-subtext hover:text-telegram-text hover:bg-telegram-border transition text-sm font-medium"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <Download className="w-4 h-4 text-telegram-subtext" />
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.concurrent_downloads')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.max_downloads_desc')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => updateSetting('maxConcurrentDownloads', Math.max(1, settings.maxConcurrentDownloads - 1))}
                                            className="w-7 h-7 flex items-center justify-center rounded-md bg-telegram-bg text-telegram-subtext hover:text-telegram-text hover:bg-telegram-border transition text-sm font-medium"
                                        >
                                            -
                                        </button>
                                        <span className="text-sm text-telegram-text font-medium w-5 text-center">
                                            {settings.maxConcurrentDownloads}
                                        </span>
                                        <button
                                            onClick={() => updateSetting('maxConcurrentDownloads', Math.min(10, settings.maxConcurrentDownloads + 1))}
                                            className="w-7 h-7 flex items-center justify-center rounded-md bg-telegram-bg text-telegram-subtext hover:text-telegram-text hover:bg-telegram-border transition text-sm font-medium"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <FolderArchive className="w-4 h-4 text-telegram-subtext" />
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.zip_before_upload')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.zip_folders_desc')}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSetting('zipFolders', !settings.zipFolders)}
                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.zipFolders ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.zipFolders ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <Tag className="w-4 h-4 text-telegram-subtext" />
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('common.hide_groups')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('common.hide_groups_desc')}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSetting('hideGroups', !settings.hideGroups)}
                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.hideGroups ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.hideGroups ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-telegram-subtext" />
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.performance_mode')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.performance_mode_desc')}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSetting('performanceMode', !settings.performanceMode)}
                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.performanceMode ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.performanceMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </section>

                            <section className="space-y-3">
                                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                                    <Languages className="w-3.5 h-3.5" />
                                    {t('settings.language_region')}
                                </h3>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <Globe className="w-4 h-4 text-telegram-subtext" />
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.app_language')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.choose_language')}</p>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <select
                                            value={settings.language}
                                            onChange={e => updateSetting('language', e.target.value as any)}
                                            className="appearance-none bg-telegram-bg border border-telegram-border rounded-md pl-3 pr-8 py-1.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/50 transition cursor-pointer"
                                        >
                                            {LANGUAGES.map(lang => (
                                                <option key={lang.code} value={lang.code}>
                                                    {lang.nativeLabel}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-telegram-subtext absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-3">
                                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                                    <HardDrive className="w-3.5 h-3.5" />
                                    {t('settings.storage')}
                                </h3>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <Trash2 className="w-4 h-4 text-telegram-subtext" />
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.clear_local_cache')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.clear_local_cache_desc')}</p>
                                        </div>
                                    </div>
                                    <button
                                        disabled={clearing}
                                        onClick={handleClearCache}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {clearing ? t('settings.clearing') : t('settings.clear')}
                                    </button>
                                </div>
                            </section>

                            <section className="space-y-3">
                                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {t('settings.updates')}
                                </h3>

                                <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Download className="w-4 h-4 text-telegram-subtext" />
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.check_for_updates')}</p>
                                                <p className="text-xs text-telegram-subtext">
                                                    {t('settings.check_updates_desc')}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleCheckForUpdates}
                                            disabled={updateChecking}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-telegram-primary/10 text-telegram-primary hover:bg-telegram-primary/20 transition disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-3 h-3 ${updateChecking ? 'animate-spin' : ''}`} />
                                            {updateChecking ? t('settings.checking') : t('settings.check_now')}
                                        </button>
                                    </div>
                                </div>
                            </section>

                                    </motion.div>
                                )}

                                {activeTab === 'proxy' && (
                                    <motion.section
                                        key="proxy"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 220, opacity: { duration: 0.15 } }}
                                        className="space-y-3 w-full"
                                    >
                                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                                    <Shield className="w-3.5 h-3.5" />
                                    {t('settings.proxy_config')}
                                </h3>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2.5 h-2.5 rounded-full ${
                                            !settings.proxyEnabled ? 'bg-gray-500' : 'bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                                        }`} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm text-telegram-text font-medium">{t('common.enable_proxy')}</p>
                                            </div>
                                            <p className="text-xs text-telegram-subtext">{t('settings.enable_proxy_desc')}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSetting('proxyEnabled', !settings.proxyEnabled)}
                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.proxyEnabled ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.proxyEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div>
                                        <p className="text-sm text-telegram-text font-medium">{t('common.proxy_type')}</p>
                                        <p className="text-xs text-telegram-subtext">
                                            {settings.proxyType === 'socks5'
                                                ? t('settings.socks5_desc')
                                                : t('settings.http_bridge_desc') || 'HTTP/HTTPS proxy tunneling via local SOCKS5 bridge.'}
                                        </p>
                                    </div>
                                    <div className="relative">
                                        <select
                                            value={settings.proxyType}
                                            onChange={e => updateSetting('proxyType', e.target.value as 'socks5' | 'http' | 'https')}
                                            className="appearance-none bg-telegram-bg border border-telegram-border rounded-md pl-3 pr-8 py-1.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/50 transition cursor-pointer"
                                        >
                                            <option value="socks5">SOCKS5</option>
                                            <option value="http">HTTP</option>
                                            <option value="https">HTTPS</option>
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-telegram-subtext absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div>
                                        <p className="text-sm text-telegram-text font-medium">{t('common.host')}</p>
                                        <p className="text-xs text-telegram-subtext">{t('settings.host_desc')}</p>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="e.g. 127.0.0.1"
                                        value={settings.proxyHost}
                                        onChange={e => updateSetting('proxyHost', e.target.value)}
                                        className="w-40 bg-telegram-bg border border-telegram-border rounded-md px-2 py-1 text-sm text-telegram-text text-right focus:outline-none focus:border-telegram-primary/50 transition placeholder:text-telegram-subtext/40"
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div>
                                        <p className="text-sm text-telegram-text font-medium">{t('common.port')}</p>
                                        <p className="text-xs text-telegram-subtext">{t('settings.port_desc')}</p>
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        max="65535"
                                        value={settings.proxyPort}
                                        onChange={e => updateSetting('proxyPort', Math.max(1, Math.min(65535, parseInt(e.target.value) || 1080)))}
                                        className="w-20 bg-telegram-bg border border-telegram-border rounded-md px-2 py-1 text-sm text-telegram-text text-center focus:outline-none focus:border-telegram-primary/50 transition"
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div>
                                        <p className="text-sm text-telegram-text font-medium">{t('common.username')}</p>
                                        <p className="text-xs text-telegram-subtext">{t('settings.optional')}</p>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder={t('settings.optional')}
                                        value={settings.proxyUsername}
                                        onChange={e => updateSetting('proxyUsername', e.target.value)}
                                        className="w-40 bg-telegram-bg border border-telegram-border rounded-md px-2 py-1 text-sm text-telegram-text text-right focus:outline-none focus:border-telegram-primary/50 transition placeholder:text-telegram-subtext/40"
                                    />
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div>
                                        <p className="text-sm text-telegram-text font-medium">{t('common.password')}</p>
                                        <p className="text-xs text-telegram-subtext">{t('settings.optional')}</p>
                                    </div>
                                    <input
                                        type="password"
                                        placeholder={t('settings.optional')}
                                        value={settings.proxyPassword}
                                        onChange={e => updateSetting('proxyPassword', e.target.value)}
                                        className="w-40 bg-telegram-bg border border-telegram-border rounded-md px-2 py-1 text-sm text-telegram-text text-right focus:outline-none focus:border-telegram-primary/50 transition placeholder:text-telegram-subtext/40"
                                    />
                                </div>
                            </motion.section>
                        )}

                        {activeTab === 'vpn' && (
                                    <motion.section
                                        key="vpn"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 220, opacity: { duration: 0.15 } }}
                                        className="space-y-3 w-full"
                                    >
                                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                                    <Zap className="w-3.5 h-3.5" />
                                    {t('settings.vpn_optimizer')}
                                </h3>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${settings.vpnMode ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-gray-500'}`} />
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.vpn_mode')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.vpn_mode_desc')}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => updateSetting('vpnMode', !settings.vpnMode)}
                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.vpnMode ? 'bg-emerald-500' : 'bg-telegram-border'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.vpnMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                {settings.vpnMode && (<>
                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.timeout_multiplier')}</p>
                                                <p className="text-xs text-telegram-subtext">{t('settings.timeout_multiplier_desc')}</p>
                                            </div>
                                            <span className="text-sm text-telegram-primary font-mono font-medium">{settings.timeoutMultiplier}×</span>
                                        </div>
                                        <input type="range" min="1" max="5" step="1" value={settings.timeoutMultiplier}
                                            onChange={e => updateSetting('timeoutMultiplier', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                    </div>

                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.retry_attempts')}</p>
                                                <p className="text-xs text-telegram-subtext">{t('settings.retry_attempts_desc')}</p>
                                            </div>
                                            <span className="text-sm text-telegram-primary font-mono font-medium">{settings.retryAttempts}</span>
                                        </div>
                                        <input type="range" min="0" max="5" step="1" value={settings.retryAttempts}
                                            onChange={e => updateSetting('retryAttempts', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                    </div>

                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <p className="text-sm text-telegram-text font-medium">{t('settings.retry_backoff')}</p>
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-telegram-subtext">{t('settings.base_delay')}</p>
                                            <span className="text-xs text-telegram-primary font-mono">{settings.retryBaseBackoffSec}s</span>
                                        </div>
                                        <input type="range" min="0.5" max="5" step="0.5" value={settings.retryBaseBackoffSec}
                                            onChange={e => updateSetting('retryBaseBackoffSec', parseFloat(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-telegram-subtext">{t('settings.max_delay')}</p>
                                            <span className="text-xs text-telegram-primary font-mono">{settings.retryMaxBackoffSec}s</span>
                                        </div>
                                        <input type="range" min="8" max="60" step="2" value={settings.retryMaxBackoffSec}
                                            onChange={e => updateSetting('retryMaxBackoffSec', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                    </div>

                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.adaptive_polling')}</p>
                                                <p className="text-xs text-telegram-subtext">{t('settings.adaptive_polling_desc')}</p>
                                            </div>
                                            <button
                                                onClick={() => updateSetting('adaptivePolling', !settings.adaptivePolling)}
                                                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.adaptivePolling ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                            >
                                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.adaptivePolling ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                        {settings.adaptivePolling && (<>
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-telegram-subtext">{t('settings.min_interval')}</p>
                                                <span className="text-xs text-telegram-primary font-mono">{settings.pollingMinSec}s</span>
                                            </div>
                                            <input type="range" min="10" max="30" step="5" value={settings.pollingMinSec}
                                                onChange={e => updateSetting('pollingMinSec', parseInt(e.target.value))}
                                                className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-telegram-subtext">{t('settings.max_interval')}</p>
                                                <span className="text-xs text-telegram-primary font-mono">{settings.pollingMaxSec}s</span>
                                            </div>
                                            <input type="range" min="45" max="120" step="15" value={settings.pollingMaxSec}
                                                onChange={e => updateSetting('pollingMaxSec', parseInt(e.target.value))}
                                                className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                        </>)}
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.preferred_dc')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.preferred_dc_desc')}</p>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={settings.preferredDC}
                                                onChange={e => updateSetting('preferredDC', e.target.value as typeof settings.preferredDC)}
                                                className="appearance-none bg-telegram-bg border border-telegram-border rounded-md pl-3 pr-8 py-1.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/50 transition cursor-pointer"
                                            >
                                                <option value="auto">{t('settings.auto')}</option>
                                                <option value="dc1">DC 1</option>
                                                <option value="dc2">DC 2</option>
                                                <option value="dc3">DC 3</option>
                                                <option value="dc4">DC 4</option>
                                                <option value="dc5">DC 5</option>
                                            </select>
                                            <ChevronDown className="w-4 h-4 text-telegram-subtext absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.dc_fallback_attempts')}</p>
                                                <p className="text-xs text-telegram-subtext">{t('settings.dc_fallback_desc')}</p>
                                            </div>
                                            <span className="text-sm text-telegram-primary font-mono font-medium">{settings.dcFallbackAttempts}</span>
                                        </div>
                                        <input type="range" min="1" max="4" step="1" value={settings.dcFallbackAttempts}
                                            onChange={e => updateSetting('dcFallbackAttempts', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.respect_flood')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.respect_flood_desc')}</p>
                                        </div>
                                        <button
                                            onClick={() => updateSetting('floodWaitRespect', !settings.floodWaitRespect)}
                                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.floodWaitRespect ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.floodWaitRespect ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>

                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.peer_cache_size')}</p>
                                                <p className="text-xs text-telegram-subtext">{t('settings.peer_cache_desc')}</p>
                                            </div>
                                            <span className="text-sm text-telegram-primary font-mono font-medium">{settings.peerCacheSize}</span>
                                        </div>
                                        <input type="range" min="100" max="2000" step="100" value={settings.peerCacheSize}
                                            onChange={e => updateSetting('peerCacheSize', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                    </div>

                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <p className="text-sm text-telegram-text font-medium flex items-center gap-1.5">
                                            <Gauge className="w-3.5 h-3.5 text-telegram-subtext" />
                                            {t('settings.bandwidth_throttle')}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-telegram-subtext">{t('settings.upload_limit')}</p>
                                            <span className="text-xs text-telegram-primary font-mono">
                                                {settings.bandwidthLimitUpKBs === 0 ? t('settings.unlimited') : `${settings.bandwidthLimitUpKBs} KB/s`}
                                            </span>
                                        </div>
                                        <input type="range" min="0" max="5120" step="128" value={settings.bandwidthLimitUpKBs}
                                            onChange={e => updateSetting('bandwidthLimitUpKBs', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-telegram-subtext">{t('settings.download_limit')}</p>
                                            <span className="text-xs text-telegram-primary font-mono">
                                                {settings.bandwidthLimitDownKBs === 0 ? t('settings.unlimited') : `${settings.bandwidthLimitDownKBs} KB/s`}
                                            </span>
                                        </div>
                                        <input type="range" min="0" max="5120" step="128" value={settings.bandwidthLimitDownKBs}
                                            onChange={e => updateSetting('bandwidthLimitDownKBs', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                        <div>
                                            <p className="text-sm text-telegram-text font-medium">{t('settings.transfer_chunk_size')}</p>
                                            <p className="text-xs text-telegram-subtext">{t('settings.chunk_size_desc')}</p>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={settings.chunkSizeKb}
                                                onChange={e => updateSetting('chunkSizeKb', parseInt(e.target.value))}
                                                className="appearance-none bg-telegram-bg border border-telegram-border rounded-md pl-3 pr-8 py-1.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/50 transition cursor-pointer"
                                            >
                                                <option value={128}>128 KB</option>
                                                <option value={256}>256 KB</option>
                                                <option value={512}>512 KB</option>
                                            </select>
                                            <ChevronDown className="w-4 h-4 text-telegram-subtext absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.keep_alive')}</p>
                                                <p className="text-xs text-telegram-subtext">{t('settings.keep_alive_desc')}</p>
                                            </div>
                                            <span className="text-sm text-telegram-primary font-mono font-medium">
                                                {settings.keepAliveIntervalSec === 0 ? t('settings.off') : `${settings.keepAliveIntervalSec}s`}
                                            </span>
                                        </div>
                                        <input type="range" min="0" max="120" step="15" value={settings.keepAliveIntervalSec}
                                            onChange={e => updateSetting('keepAliveIntervalSec', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                    </div>

                                    <div className="p-3 rounded-lg bg-telegram-hover/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.bulk_archive_limit')}</p>
                                                <p className="text-xs text-telegram-subtext">{t('settings.bulk_archive_desc')}</p>
                                            </div>
                                            <span className="text-sm text-telegram-primary font-mono font-medium">
                                                {settings.archiveMaxBytes === 0 ? t('settings.unlimited') : `${settings.archiveMaxBytes} MiB`}
                                            </span>
                                        </div>
                                        <input type="range" min="0" max="2048" step="64" value={settings.archiveMaxBytes}
                                            onChange={e => updateSetting('archiveMaxBytes', parseInt(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none bg-telegram-border accent-telegram-primary cursor-pointer" />
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg bg-telegram-hover/50">
                                        <div className="flex items-center gap-2">
                                            <Wifi className="w-4 h-4 text-telegram-subtext" />
                                            <div>
                                                <p className="text-sm text-telegram-text font-medium">{t('settings.auto_detect_vpn')}</p>
                                                <p className="text-xs text-telegram-subtext">
                                                    {t('settings.checking')}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => updateSetting('autoDetectVpn', !settings.autoDetectVpn)}
                                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.autoDetectVpn ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.autoDetectVpn ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </>)}
                                    </motion.section>
                                )}

                                {activeTab === 'sharing' && (
                                    <motion.section
                                        key="sharing"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 220, opacity: { duration: 0.15 } }}
                                        className="space-y-4 w-full"
                                    >
                                        <div className="py-8 text-center space-y-2">
                                            <Link className="w-8 h-8 text-telegram-subtext/40 mx-auto" />
                                            <p className="text-sm font-medium text-telegram-text">{t('settings.no_active_links')}</p>
                                            <p className="text-xs text-telegram-subtext">Share links are not available in the web version</p>
                                        </div>
                                    </motion.section>
                                )}
                                {activeTab === 'themes' && (
                                    <ThemesTab />
                                )}
                            </AnimatePresence>
                        </motion.div>

                        <div className="px-5 py-3 border-t border-telegram-border flex items-center justify-between">
                            <button
                                onClick={resetSettings}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-telegram-subtext hover:text-red-400 hover:bg-red-500/10 transition font-medium"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                {t('settings.reset_defaults')}
                            </button>
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-telegram-primary text-white hover:bg-telegram-primary/90 transition"
                            >
                                {t('settings.done')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

const PALETTE_KEYS: { key: keyof ThemeColorPalette; labelKey: string }[] = [
    { key: 'bg', labelKey: 'settings.color_bg' },
    { key: 'surface', labelKey: 'settings.color_surface' },
    { key: 'primary', labelKey: 'settings.color_primary' },
    { key: 'secondary', labelKey: 'settings.color_secondary' },
    { key: 'text', labelKey: 'settings.color_text' },
    { key: 'subtext', labelKey: 'settings.color_subtext' },
];

function ThemesTab() {
    const { t } = useTranslation();
    const {
        customThemes,
        activeCustomThemeId,
        setActiveCustomTheme,
        addCustomTheme,
        deleteCustomTheme,
        updateCustomTheme,
    } = useTheme();
    const { confirm } = useConfirm();

    const [editingId, setEditingId] = useState<string | null>(null);

    const builtinThemes = customThemes.filter(t => t.isBuiltin);
    const userThemes = customThemes.filter(t => !t.isBuiltin);
    const editingTheme = editingId ? customThemes.find(t => t.id === editingId) : null;

    const handleCreateTheme = () => {
        const id = generateThemeId();
        const newTheme: CustomTheme = {
            id,
            name: 'My Theme',
            isDark: true,
            palette: getDefaultPalette(true),
        };
        addCustomTheme(newTheme);
        setEditingId(id);
        setActiveCustomTheme(id);
    };

    const handleSelectTheme = (theme: CustomTheme) => {
        if (activeCustomThemeId === theme.id) {
            setActiveCustomTheme(null);
            setEditingId(null);
        } else {
            setActiveCustomTheme(theme.id);
            if (!theme.isBuiltin) {
                setEditingId(theme.id);
            } else {
                setEditingId(null);
            }
        }
    };

    const handleDeleteTheme = async (id: string) => {
        const ok = await confirm({
            title: t('settings.delete_theme'),
            message: t('settings.delete_theme_confirm'),
            confirmText: t('common.delete'),
            variant: 'danger',
        });
        if (!ok) return;
        deleteCustomTheme(id);
        if (editingId === id) setEditingId(null);
    };

    const handlePaletteChange = (key: keyof ThemeColorPalette, value: string) => {
        if (!editingTheme || editingTheme.isBuiltin) return;
        const newPalette = { ...editingTheme.palette, [key]: value };
        updateCustomTheme(editingTheme.id, { palette: newPalette });
    };

    const handleBaseToggle = (isDark: boolean) => {
        if (!editingTheme || editingTheme.isBuiltin) return;
        updateCustomTheme(editingTheme.id, { isDark });
    };

    const handleNameChange = (name: string) => {
        if (!editingTheme || editingTheme.isBuiltin) return;
        updateCustomTheme(editingTheme.id, { name });
    };

    return (
        <motion.section
            key="themes"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220, opacity: { duration: 0.15 } }}
            className="space-y-5 w-full"
        >
            <div className="space-y-2">
                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5" />
                    {t('settings.presets')}
                </h3>
                <div className="grid grid-cols-4 gap-2">
                    {builtinThemes.map(theme => (
                        <button
                            key={theme.id}
                            onClick={() => handleSelectTheme(theme)}
                            className={`relative rounded-lg p-0.5 transition-all duration-200 ${
                                activeCustomThemeId === theme.id
                                    ? 'ring-2 ring-telegram-primary ring-offset-1 ring-offset-telegram-surface'
                                    : 'hover:ring-1 hover:ring-telegram-subtext/30'
                            }`}
                            title={theme.name}
                        >
                            <div className="rounded-md overflow-hidden h-10 flex">
                                <div className="flex-1" style={{ background: theme.palette.bg }} />
                                <div className="flex-1" style={{ background: theme.palette.surface }} />
                                <div className="flex-1" style={{ background: theme.palette.primary }} />
                            </div>
                            <p className="text-[10px] text-telegram-subtext mt-1 truncate text-center">
                                {theme.name}
                            </p>
                            {activeCustomThemeId === theme.id && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-telegram-primary rounded-full flex items-center justify-center">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('settings.custom_themes')}
                </h3>

                {userThemes.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                        {userThemes.map(theme => (
                            <button
                                key={theme.id}
                                onClick={() => handleSelectTheme(theme)}
                                className={`relative rounded-lg p-0.5 transition-all duration-200 ${
                                    activeCustomThemeId === theme.id
                                        ? 'ring-2 ring-telegram-primary ring-offset-1 ring-offset-telegram-surface'
                                        : 'hover:ring-1 hover:ring-telegram-subtext/30'
                                }`}
                                title={theme.name}
                            >
                                <div className="rounded-md overflow-hidden h-10 flex">
                                    <div className="flex-1" style={{ background: theme.palette.bg }} />
                                    <div className="flex-1" style={{ background: theme.palette.surface }} />
                                    <div className="flex-1" style={{ background: theme.palette.primary }} />
                                </div>
                                <p className="text-[10px] text-telegram-subtext mt-1 truncate text-center">
                                    {theme.name}
                                </p>
                                {activeCustomThemeId === theme.id && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-telegram-primary rounded-full flex items-center justify-center">
                                        <Check className="w-2.5 h-2.5 text-white" />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                <button
                    onClick={handleCreateTheme}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-telegram-border text-telegram-subtext hover:text-telegram-primary hover:border-telegram-primary/50 transition-colors text-xs"
                >
                    <Plus className="w-3.5 h-3.5" />
                    {t('settings.create_theme')}
                </button>
            </div>

            {editingTheme && !editingTheme.isBuiltin && (
                <div className="space-y-3 p-3 rounded-lg bg-telegram-hover/30 border border-telegram-border/50">
                    <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">
                        {t('settings.edit_theme')}
                    </h3>

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-telegram-subtext w-16 shrink-0">{t('settings.theme_name')}</label>
                        <input
                            type="text"
                            value={editingTheme.name}
                            onChange={e => handleNameChange(e.target.value)}
                            className="flex-1 px-2 py-1.5 rounded-md text-xs bg-telegram-surface border border-telegram-border text-telegram-text focus:border-telegram-primary outline-none transition"
                            maxLength={32}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-telegram-subtext w-16 shrink-0">{t('settings.base_mode')}</label>
                        <div className="flex gap-1">
                            <button
                                onClick={() => handleBaseToggle(true)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                                    editingTheme.isDark
                                        ? 'bg-telegram-primary text-white'
                                        : 'bg-telegram-hover text-telegram-subtext hover:text-telegram-text'
                                }`}
                            >
                                Dark
                            </button>
                            <button
                                onClick={() => handleBaseToggle(false)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                                    !editingTheme.isDark
                                        ? 'bg-telegram-primary text-white'
                                        : 'bg-telegram-hover text-telegram-subtext hover:text-telegram-text'
                                }`}
                            >
                                Light
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {PALETTE_KEYS.map(({ key, labelKey }) => (
                            <div key={key} className="flex items-center gap-2">
                                <label className="text-xs text-telegram-subtext w-16 shrink-0">{t(labelKey)}</label>
                                <div className="flex items-center gap-1.5 flex-1">
                                    <input
                                        type="color"
                                        value={editingTheme.palette[key].startsWith('rgba') ? '#888888' : editingTheme.palette[key]}
                                        onChange={e => handlePaletteChange(key, e.target.value)}
                                        className="w-7 h-7 rounded-md border border-telegram-border cursor-pointer p-0.5 bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={editingTheme.palette[key]}
                                        onChange={e => handlePaletteChange(key, e.target.value)}
                                        className="flex-1 px-2 py-1 rounded-md text-xs bg-telegram-surface border border-telegram-border text-telegram-text focus:border-telegram-primary outline-none transition font-mono"
                                        maxLength={30}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => handleDeleteTheme(editingTheme.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('settings.delete_theme')}
                    </button>
                </div>
            )}

            {activeCustomThemeId && (
                <button
                    onClick={() => {
                        setActiveCustomTheme(null);
                        setEditingId(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-telegram-subtext hover:text-telegram-text bg-telegram-hover/50 hover:bg-telegram-hover transition"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {t('settings.reset_default')}
                </button>
            )}
        </motion.section>
    );
}
