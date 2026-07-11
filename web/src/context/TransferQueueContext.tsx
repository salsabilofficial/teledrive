import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QueueItem, DownloadItem, TelegramFile } from '../types';
import { load, WebStore } from '../api/storage';
import { api } from '../api/client';
import { useSettings } from './SettingsContext';
import { sanitizeFilename } from '../utils';

interface TransferQueueContextType {
    // Uploads
    uploadQueue: QueueItem[];
    setUploadQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
    handleManualUpload: (folderId: number | null) => Promise<void>;
    handleDropUpload: (files: File[], folderId: number | null) => void;
    cancelAllUploads: () => void;
    cancelUploadItem: (id: string) => void;
    retryUploadItem: (id: string) => void;

    // Downloads
    downloadQueue: DownloadItem[];
    queueDownload: (messageId: number, filename: string, folderId: number | null) => void;
    queueBulkDownload: (files: TelegramFile[], folderId: number | null) => Promise<void>;
    cancelAllDownloads: () => void;
    cancelDownloadItem: (id: string) => void;
    retryDownloadItem: (id: string) => void;
    clearFinishedDownloads: () => void;
}

const TransferQueueContext = createContext<TransferQueueContextType | undefined>(undefined);

export function TransferQueueProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    const { settings } = useSettings();
    
    const [store, setStore] = useState<WebStore | null>(null);
    const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
    const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
    
    const [uploadsInitialized, setUploadsInitialized] = useState(false);
    const [downloadsInitialized, setDownloadsInitialized] = useState(false);
    
    const cancelledUploadsRef = useRef<Set<string>>(new Set());
    const activeUploadCountRef = useRef(0);
    const uploadFilesRef = useRef<Map<string, File>>(new Map());
    const activeUploadHandlesRef = useRef<Map<string, () => void>>(new Map());

    const cancelledDownloadsRef = useRef<Set<string>>(new Set());
    const activeDownloadCountRef = useRef(0);

    // Initialize WebStore
    useEffect(() => {
        load('config.json').then(setStore);
    }, []);

    // ── UPLOADS QUEUE LIFE CYCLE ──
    useEffect(() => {
        if (!store || uploadsInitialized) return;
        store.get<QueueItem[]>('uploadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setUploadQueue(pending);
                    toast.info(`Restored ${pending.length} pending uploads`);
                }
            }
            setUploadsInitialized(true);
        });
    }, [store, uploadsInitialized]);

    useEffect(() => {
        if (!store || !uploadsInitialized) return;
        const pending = uploadQueue.filter(i => i.status === 'pending');
        store.set('uploadQueue', pending).then(() => store.save());
    }, [store, uploadQueue, uploadsInitialized]);

    // concurrency uploads handler
    useEffect(() => {
        const maxConcurrent = settings.maxConcurrentUploads || 1;
        const available = maxConcurrent - activeUploadCountRef.current;
        if (available <= 0) return;
        const pendingItems = uploadQueue.filter(i => i.status === 'pending').slice(0, available);
        for (const item of pendingItems) {
            processUploadItem(item);
        }
    }, [uploadQueue, settings.maxConcurrentUploads]);

    const processUploadItem = async (item: QueueItem) => {
        activeUploadCountRef.current++;
        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i));
        let uploadHandle = null;

        try {
            const file = uploadFilesRef.current.get(item.id);
            if (!file) throw new Error('File not found in memory queue');

            uploadHandle = api.uploadFile(
                file,
                item.folderId,
                item.id,
                (progressEvent) => {
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, progress: progressEvent.percent } : i));
                }
            );
            
            activeUploadHandlesRef.current.set(item.id, uploadHandle.abort);
            await uploadHandle.promise;

            if (cancelledUploadsRef.current.has(item.id)) {
                cancelledUploadsRef.current.delete(item.id);
            } else {
                setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                queryClient.invalidateQueries({ queryKey: ['files', item.folderId] });
            }
        } catch (e) {
            if (!cancelledUploadsRef.current.has(item.id)) {
                const errMsg = String(e);
                if (errMsg.includes('FILE_TOO_BIG') || errMsg.includes('too large') || errMsg.includes('2 GB')) {
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: errMsg } : i));
                    toast.error(`Upload failed: Telegram has a 2 GB file size limit. Try splitting large folders.`);
                } else {
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: errMsg } : i));
                    toast.error(`Upload failed: ${e}`);
                }
            } else {
                cancelledUploadsRef.current.delete(item.id);
            }
        } finally {
            activeUploadHandlesRef.current.delete(item.id);
            activeUploadCountRef.current--;
        }
    };

    const queueUploadFiles = useCallback((files: File[], folderId: number | null) => {
        if (!files || files.length === 0) return;
        const newItems: QueueItem[] = files.map((file) => {
            const id = Math.random().toString(36).substr(2, 9);
            uploadFilesRef.current.set(id, file);
            return {
                id,
                path: file.name,
                folderId,
                status: 'pending' as const,
            };
        });
        setUploadQueue(prev => [...prev, ...newItems]);
        toast.info(`Queued ${files.length} file${files.length !== 1 ? 's' : ''} for upload`);
    }, []);

    const handleManualUpload = useCallback(async (folderId: number | null) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = () => {
            if (input.files && input.files.length > 0) {
                queueUploadFiles(Array.from(input.files), folderId);
            }
            input.remove();
        };
        input.click();
    }, [queueUploadFiles]);

    const handleDropUpload = useCallback((files: File[], folderId: number | null) => {
        queueUploadFiles(files, folderId);
    }, [queueUploadFiles]);

    const cancelAllUploads = useCallback(() => {
        setUploadQueue(q => {
            const activeItems = q.filter(i => i.status === 'uploading' || i.status === 'downloading');
            for (const item of activeItems) {
                cancelledUploadsRef.current.add(item.id);
                const abortFn = activeUploadHandlesRef.current.get(item.id);
                if (abortFn) {
                    try { abortFn(); } catch (_) {}
                }
                activeUploadHandlesRef.current.delete(item.id);
                uploadFilesRef.current.delete(item.id);
            }
            return q
                .filter(i => i.status !== 'pending')
                .map(i => (i.status === 'uploading' || i.status === 'downloading') ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All uploads cancelled');
    }, []);

    const cancelUploadItem = useCallback((id: string) => {
        setUploadQueue(q => {
            const item = q.find(i => i.id === id);
            if (item?.status === 'uploading' || item?.status === 'downloading') {
                cancelledUploadsRef.current.add(id);
                const abortFn = activeUploadHandlesRef.current.get(id);
                if (abortFn) {
                    try { abortFn(); } catch (_) {}
                }
                activeUploadHandlesRef.current.delete(id);
                uploadFilesRef.current.delete(id);
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            if (item?.status === 'pending') {
                uploadFilesRef.current.delete(id);
                return q.filter(i => i.id !== id);
            }
            return q;
        });
    }, []);

    const retryUploadItem = useCallback((id: string) => {
        setUploadQueue(q => q.map(i =>
            i.id === id && (i.status === 'error' || i.status === 'cancelled')
                ? { ...i, status: 'pending' as const, error: undefined, progress: undefined }
                : i
        ));
    }, []);


    // ── DOWNLOADS QUEUE LIFE CYCLE ──
    useEffect(() => {
        if (!store || downloadsInitialized) return;
        store.get<DownloadItem[]>('downloadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setDownloadQueue(pending);
                    toast.info(`Restored ${pending.length} pending downloads`);
                }
            }
            setDownloadsInitialized(true);
        });
    }, [store, downloadsInitialized]);

    useEffect(() => {
        if (!store || !downloadsInitialized) return;
        const pending = downloadQueue.filter(i => i.status === 'pending');
        store.set('downloadQueue', pending).then(() => store.save());
    }, [store, downloadQueue, downloadsInitialized]);

    // concurrency downloads handler
    useEffect(() => {
        const maxConcurrent = settings.maxConcurrentDownloads || 1;
        const available = maxConcurrent - activeDownloadCountRef.current;
        if (available <= 0) return;
        const pendingItems = downloadQueue.filter(i => i.status === 'pending').slice(0, available);
        for (const item of pendingItems) {
            processDownloadItem(item);
        }
    }, [downloadQueue, settings.maxConcurrentDownloads]);

    const processDownloadItem = async (item: DownloadItem) => {
        activeDownloadCountRef.current++;
        setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'downloading', progress: 0 } : i));
        try {
            const url = api.getDownloadUrl(item.messageId, item.folderId);
            const a = document.createElement('a');
            a.href = url;
            a.download = sanitizeFilename(item.filename);
            a.click();
            a.remove();

            if (cancelledDownloadsRef.current.has(item.id)) {
                cancelledDownloadsRef.current.delete(item.id);
            } else {
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                toast.success(`Downloaded: ${item.filename}`);
            }
        } catch (e) {
            if (!cancelledDownloadsRef.current.has(item.id)) {
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: String(e) } : i));
                toast.error(`Download failed: ${item.filename}`);
            } else {
                cancelledDownloadsRef.current.delete(item.id);
            }
        } finally {
            activeDownloadCountRef.current--;
        }
    };

    const queueDownload = useCallback((messageId: number, filename: string, folderId: number | null) => {
        const newItem: DownloadItem = {
            id: Math.random().toString(36).substr(2, 9),
            messageId,
            filename: sanitizeFilename(filename),
            folderId,
            status: 'pending'
        };
        setDownloadQueue(prev => [...prev, newItem]);
    }, []);

    const queueBulkDownload = useCallback(async (files: TelegramFile[], folderId: number | null) => {
        const newItems: DownloadItem[] = files.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            messageId: file.id,
            filename: sanitizeFilename(file.name),
            folderId,
            status: 'pending' as const,
        }));
        setDownloadQueue(prev => [...prev, ...newItems]);
        toast.info(`Queued ${files.length} files for download`);
    }, []);

    const clearFinishedDownloads = useCallback(() => {
        setDownloadQueue(q => q.filter(i => i.status !== 'success'));
    }, []);

    const cancelAllDownloads = useCallback(() => {
        setDownloadQueue(q => {
            const downloading = q.find(i => i.status === 'downloading');
            if (downloading) {
                cancelledDownloadsRef.current.add(downloading.id);
            }
            return q
                .filter(i => i.status !== 'pending')
                .map(i => i.status === 'downloading' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All downloads cancelled');
    }, []);

    const cancelDownloadItem = useCallback((id: string) => {
        setDownloadQueue(q => {
            const item = q.find(i => i.id === id);
            if (item?.status === 'downloading') {
                cancelledDownloadsRef.current.add(id);
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            if (item?.status === 'pending') {
                return q.filter(i => i.id !== id);
            }
            return q;
        });
    }, []);

    const retryDownloadItem = useCallback((id: string) => {
        setDownloadQueue(q => q.map(i =>
            i.id === id && (i.status === 'error' || i.status === 'cancelled')
                ? { ...i, status: 'pending' as const, error: undefined, progress: undefined }
                : i
        ));
    }, []);

    return (
        <TransferQueueContext.Provider
            value={{
                uploadQueue,
                setUploadQueue,
                handleManualUpload,
                handleDropUpload,
                cancelAllUploads,
                cancelUploadItem,
                retryUploadItem,
                downloadQueue,
                queueDownload,
                queueBulkDownload,
                cancelAllDownloads,
                cancelDownloadItem,
                retryDownloadItem,
                clearFinishedDownloads
            }}
        >
            {children}
        </TransferQueueContext.Provider>
    );
}

export const useTransferQueue = () => {
    const context = useContext(TransferQueueContext);
    if (!context) throw new Error('useTransferQueue must be used within a TransferQueueProvider');
    return context;
};
