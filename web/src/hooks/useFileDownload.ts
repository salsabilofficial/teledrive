import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { DownloadItem, TelegramFile } from '../types';
import { sanitizeFilename } from '../utils';
import { useSettings } from '../context/SettingsContext';
import { WebStore } from '../api/storage';
import { api } from '../api/client';

export function useFileDownload(store: WebStore | null) {
    const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());
    const activeCountRef = useRef(0);
    const { settings } = useSettings();

    useEffect(() => {
        if (!store || initialized) return;
        store.get<DownloadItem[]>('downloadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setDownloadQueue(pending);
                    toast.info(`Restored ${pending.length} pending downloads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    useEffect(() => {
        if (!store || !initialized) return;
        const pending = downloadQueue.filter(i => i.status === 'pending');
        store.set('downloadQueue', pending).then(() => store.save());
    }, [store, downloadQueue, initialized]);

    useEffect(() => {
        const maxConcurrent = settings.maxConcurrentDownloads || 1;
        const available = maxConcurrent - activeCountRef.current;
        if (available <= 0) return;
        const pendingItems = downloadQueue.filter(i => i.status === 'pending').slice(0, available);
        for (const item of pendingItems) {
            processItem(item);
        }
    }, [downloadQueue, settings.maxConcurrentDownloads]);

    const processItem = async (item: DownloadItem) => {
        activeCountRef.current++;
        setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'downloading', progress: 0 } : i));

        try {
            const url = api.getDownloadUrl(item.messageId, item.folderId);
            const a = document.createElement('a');
            a.href = url;
            a.download = sanitizeFilename(item.filename);
            a.click();
            a.remove();

            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                toast.success(`Downloaded: ${item.filename}`);
            }
        } catch (e) {
            if (!cancelledRef.current.has(item.id)) {
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: String(e) } : i));
                toast.error(`Download failed: ${item.filename}`);
            } else {
                cancelledRef.current.delete(item.id);
            }
        } finally {
            activeCountRef.current--;
        }
    };

    const queueDownload = (messageId: number, filename: string, folderId: number | null) => {
        const newItem: DownloadItem = {
            id: Math.random().toString(36).substr(2, 9),
            messageId,
            filename: sanitizeFilename(filename),
            folderId,
            status: 'pending'
        };
        setDownloadQueue(prev => [...prev, newItem]);
    };

    const queueBulkDownload = async (files: TelegramFile[], folderId: number | null) => {
        const newItems: DownloadItem[] = files.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            messageId: file.id,
            filename: sanitizeFilename(file.name),
            folderId,
            status: 'pending' as const,
        }));
        setDownloadQueue(prev => [...prev, ...newItems]);
        toast.info(`Queued ${files.length} files for download`);
    };

    const clearFinished = () => {
        setDownloadQueue(q => q.filter(i => i.status !== 'success'));
    };

    const cancelAll = () => {
        setDownloadQueue(q => {
            const downloading = q.find(i => i.status === 'downloading');
            if (downloading) {
                cancelledRef.current.add(downloading.id);
            }
            return q
                .filter(i => i.status !== 'pending')
                .map(i => i.status === 'downloading' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All downloads cancelled');
    };

    const cancelItem = (id: string) => {
        setDownloadQueue(q => {
            const item = q.find(i => i.id === id);
            if (item?.status === 'downloading') {
                cancelledRef.current.add(id);
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            if (item?.status === 'pending') {
                return q.filter(i => i.id !== id);
            }
            return q;
        });
    };

    const retryItem = (id: string) => {
        setDownloadQueue(q => q.map(i =>
            i.id === id && (i.status === 'error' || i.status === 'cancelled')
                ? { ...i, status: 'pending' as const, error: undefined, progress: undefined, downloadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined }
                : i
        ));
    };

    return {
        downloadQueue,
        queueDownload,
        queueBulkDownload,
        clearFinished,
        cancelAll,
        cancelItem,
        retryItem,
    };
}
