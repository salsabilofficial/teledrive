import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Folder, File, Archive, Loader2, AlertTriangle, FileArchive, Download, ChevronDown, HardDrive, Zap, Square, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ArchiveEntry, TelegramFile, TelegramFolder } from '../../../types';
import { formatBytes } from '../../../utils';
import { toast } from 'sonner';

interface ArchiveViewerModalProps {
    file: TelegramFile;
    activeFolderId?: number | null;
    folders: TelegramFolder[];
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    nextFile?: TelegramFile | null;
    prevFile?: TelegramFile | null;
}

export function ArchiveViewerModal({
    file,
    activeFolderId,
    folders,
    onClose,
    onNext,
    onPrev,
    currentIndex = 0,
    totalItems = 0,
    nextFile,
    prevFile,
}: ArchiveViewerModalProps) {
    const queryClient = useQueryClient();
    const [entries, setEntries] = useState<ArchiveEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const { t } = useTranslation();

    useEffect(() => {
        setLoading(false);
        setError('Archive viewer is not available in the web version');
    }, []);

    const totalSize = entries?.reduce((sum, e) => sum + (e.is_dir ? 0 : e.size), 0) ?? 0;
    const fileCount = entries?.filter(e => !e.is_dir).length ?? 0;
    const dirCount = entries?.filter(e => e.is_dir).length ?? 0;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {prevFile && onPrev && (
                <button
                    onClick={(e) => { e.stopPropagation(); onPrev(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-[210] p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white transition-all"
                    aria-label="Previous file"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
            )}
            {nextFile && onNext && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-[210] p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white transition-all"
                    aria-label="Next file"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
            )}

            <div
                className="bg-telegram-surface border border-telegram-border rounded-xl w-[520px] max-h-[70vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-telegram-border flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <FileArchive className="w-6 h-6 text-telegram-primary shrink-0" />
                        <div className="min-w-0">
                            <h3 className="text-telegram-text font-medium truncate">{file.name}</h3>
                            <p className="text-xs text-telegram-subtext">{file.sizeStr}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {totalItems > 1 && (
                            <span className="text-xs text-telegram-subtext mr-2">
                                {currentIndex + 1} / {totalItems}
                            </span>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-telegram-hover text-telegram-subtext hover:text-telegram-text transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-16 space-y-3">
                            <Loader2 className="w-8 h-8 text-telegram-primary animate-spin" />
                            <p className="text-sm text-telegram-subtext">{t('common.loading')}</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="flex flex-col items-center justify-center py-16 space-y-3 px-6">
                            <AlertTriangle className="w-10 h-10 text-amber-500" />
                            <p className="text-sm text-center text-telegram-text font-medium">
                                {t('archive.failed_read')}
                            </p>
                            <p className="text-xs text-center text-telegram-subtext max-w-sm break-words">
                                {error}
                            </p>
                        </div>
                    )}
                </div>

                <div className="p-3 border-t border-telegram-border bg-telegram-hover/10 shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 rounded-lg bg-telegram-hover hover:bg-telegram-hover/70 text-telegram-text text-sm font-medium transition-colors"
                    >
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    );
}
