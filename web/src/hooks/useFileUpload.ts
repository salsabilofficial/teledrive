import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QueueItem } from '../types';
import { isAndroidPlatform, showFileDialogFallback, pickWithFallback } from '../utils';
import { useSettings } from '../context/SettingsContext';
import { WebStore } from '../api/storage';
import { api } from '../api/client';

export function useFileUpload(activeFolderId: number | null, store: WebStore | null) {
    const queryClient = useQueryClient();
    const { settings } = useSettings();
    const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());
    const activeCountRef = useRef(0);
    const filesRef = useRef<Map<string, File>>(new Map());

    useEffect(() => {
        if (!store || initialized) return;
        store.get<QueueItem[]>('uploadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setUploadQueue(pending);
                    toast.info(`Restored ${pending.length} pending uploads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    useEffect(() => {
        if (!store || !initialized) return;
        const pending = uploadQueue.filter(i => i.status === 'pending');
        store.set('uploadQueue', pending).then(() => store.save());
    }, [store, uploadQueue, initialized]);

    useEffect(() => {
        const maxConcurrent = settings.maxConcurrentUploads || 1;
        const available = maxConcurrent - activeCountRef.current;
        if (available <= 0) return;
        const pendingItems = uploadQueue.filter(i => i.status === 'pending').slice(0, available);
        for (const item of pendingItems) {
            processItem(item);
        }
    }, [uploadQueue, settings.maxConcurrentUploads]);

    const processItem = async (item: QueueItem) => {
        activeCountRef.current++;
        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i));
        try {
            const file = filesRef.current.get(item.id);
            if (file) {
                await api.uploadFile(file, item.folderId);
            }
            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                queryClient.invalidateQueries({ queryKey: ['files', item.folderId] });
            }
        } catch (e) {
            if (!cancelledRef.current.has(item.id)) {
                const errMsg = String(e);
                if (errMsg.includes('FILE_TOO_BIG') || errMsg.includes('too large') || errMsg.includes('2 GB')) {
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: errMsg } : i));
                    toast.error(`Upload failed: Telegram has a 2 GB file size limit. Try splitting large folders.`);
                } else {
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: errMsg } : i));
                    toast.error(`Upload failed: ${e}`);
                }
            } else {
                cancelledRef.current.delete(item.id);
            }
        } finally {
            activeCountRef.current--;
        }
    };

    const queueFiles = (files: File[]) => {
        if (!files || files.length === 0) return;
        const newItems: QueueItem[] = files.map((file) => {
            const id = Math.random().toString(36).substr(2, 9);
            filesRef.current.set(id, file);
            return {
                id,
                path: file.name,
                folderId: activeFolderId,
                status: 'pending' as const,
            };
        });
        setUploadQueue(prev => [...prev, ...newItems]);
        toast.info(`Queued ${files.length} file${files.length !== 1 ? 's' : ''} for upload`);
    };

    const handleManualUpload = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = () => {
            if (input.files && input.files.length > 0) {
                queueFiles(Array.from(input.files));
            }
            input.remove();
        };
        input.click();
    };

    const handleDropUpload = (files: File[]) => {
        if (!files || files.length === 0) return;
        queueFiles(files);
    };

    const handleFolderUpload = async () => {
        toast.info('Folder upload is not available in the web version');
    };

    const cancelAll = () => {
        setUploadQueue(q => {
            const activeItems = q.filter(i => i.status === 'uploading' || i.status === 'downloading');
            for (const item of activeItems) {
                cancelledRef.current.add(item.id);
                filesRef.current.delete(item.id);
            }
            return q
                .filter(i => i.status !== 'pending')
                .map(i => (i.status === 'uploading' || i.status === 'downloading') ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All uploads cancelled');
    };

    const cancelItem = (id: string) => {
        setUploadQueue(q => {
            const item = q.find(i => i.id === id);
            if (item?.status === 'uploading' || item?.status === 'downloading') {
                cancelledRef.current.add(id);
                filesRef.current.delete(id);
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            if (item?.status === 'pending') {
                filesRef.current.delete(id);
                return q.filter(i => i.id !== id);
            }
            return q;
        });
    };

    const retryItem = (id: string) => {
        setUploadQueue(q => q.map(i =>
            i.id === id && (i.status === 'error' || i.status === 'cancelled')
                ? { ...i, status: 'pending' as const, error: undefined, progress: undefined, uploadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined }
                : i
        ));
    };

    const handleUrlUpload = (_url: string, _folderId: number | null) => {
        toast.info('URL upload is not available in the web version');
    };

    return {
        uploadQueue,
        setUploadQueue,
        handleManualUpload,
        handleFolderUpload,
        handleDropUpload,
        handleUrlUpload,
        cancelAll,
        cancelItem,
        retryItem,
    };
}
