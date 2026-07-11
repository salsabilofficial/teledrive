import { useCallback, useRef } from 'react';
import { sanitizeFilename } from '../utils';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFile } from '../types';
import { api } from '../api/client';

export function useFileOperations(
    activeFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[],
    queueBulkDownload?: (files: TelegramFile[], folderId: number | null) => void,
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;
    const displayedFilesRef = useRef(displayedFiles);
    displayedFilesRef.current = displayedFiles;

    const handleDelete = useCallback(async (id: number) => {
        if (!await confirm({ title: "Delete File", message: "Are you sure you want to delete this file?", confirmText: "Delete", variant: 'danger' })) return;
        
        // Optimistic UI Update
        const queryKey = ['files', activeFolderId];
        await queryClient.cancelQueries({ queryKey });
        const previousData = queryClient.getQueryData(queryKey);
        
        queryClient.setQueryData(queryKey, (old: any) => {
            if (!old) return old;
            return {
                ...old,
                pages: old.pages.map((page: any) => ({
                    ...page,
                    data: page.data.filter((f: any) => f.id !== id)
                }))
            };
        });

        try {
            await api.deleteFile(id, activeFolderId);
            queryClient.invalidateQueries({ queryKey });
            toast.success("File deleted");
        } catch (e) {
            // Rollback on error
            queryClient.setQueryData(queryKey, previousData);
            toast.error(`Delete failed: ${e}`);
        }
    }, [activeFolderId, confirm, queryClient]);

    const handleBulkDelete = useCallback(async () => {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        if (!await confirm({ title: "Delete Files", message: `Are you sure you want to delete ${ids.length} files?`, confirmText: "Delete All", variant: 'danger' })) return;

        // Optimistic UI Update
        const queryKey = ['files', activeFolderId];
        await queryClient.cancelQueries({ queryKey });
        const previousData = queryClient.getQueryData(queryKey);
        
        queryClient.setQueryData(queryKey, (old: any) => {
            if (!old) return old;
            return {
                ...old,
                pages: old.pages.map((page: any) => ({
                    ...page,
                    data: page.data.filter((f: any) => !ids.includes(f.id))
                }))
            };
        });

        setSelectedIds([]);

        let success = 0;
        let fail = 0;
        for (const id of ids) {
            try {
                await api.deleteFile(id, activeFolderId);
                success++;
            } catch {
                fail++;
            }
        }
        
        queryClient.invalidateQueries({ queryKey });
        if (success > 0) toast.success(`Deleted ${success} files.`);
        if (fail > 0) {
            // Partial rollback if failures happen (simple full invalidation/refetch suffices)
            toast.error(`Failed to delete ${fail} files.`);
        }
    }, [activeFolderId, confirm, queryClient, setSelectedIds]);

    const handleBulkDownload = useCallback(async () => {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        const currentFiles = displayedFilesRef.current;
        const targetFiles = currentFiles.filter((f) => ids.includes(f.id));
        if (targetFiles.length === 0) return;
        if (queueBulkDownload) {
            queueBulkDownload(targetFiles, activeFolderId);
            setSelectedIds([]);
            return;
        }
        let successCount = 0;
        for (const file of targetFiles) {
            const url = api.getDownloadUrl(file.id, activeFolderId);
            try {
                const a = document.createElement('a');
                a.href = url;
                a.download = sanitizeFilename(file.name);
                a.click();
                a.remove();
                successCount++;
            } catch { }
        }
        toast.success(`Downloaded ${successCount} files.`);
        setSelectedIds([]);
    }, [activeFolderId, setSelectedIds, queueBulkDownload]);

    const handleBulkMove = useCallback(async (targetFolderId: number | null, onSuccess?: () => void) => {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        const currentFiles = displayedFilesRef.current;

        // Optimistic UI Update (Remove from source folder)
        const sourceQueryKey = ['files', activeFolderId];
        const targetQueryKey = ['files', targetFolderId];
        
        await queryClient.cancelQueries({ queryKey: sourceQueryKey });
        await queryClient.cancelQueries({ queryKey: targetQueryKey });
        
        const previousSourceData = queryClient.getQueryData(sourceQueryKey);

        queryClient.setQueryData(sourceQueryKey, (old: any) => {
            if (!old) return old;
            return {
                ...old,
                pages: old.pages.map((page: any) => ({
                    ...page,
                    data: page.data.filter((f: any) => !ids.includes(f.id))
                }))
            };
        });

        try {
            for (const id of ids) {
                const file = currentFiles.find(f => f.id === id);
                if (file) {
                    await api.renameFile(id, file.name, targetFolderId);
                }
            }
            toast.success(`Moved ${ids.length} files.`);
            queryClient.invalidateQueries({ queryKey: sourceQueryKey });
            queryClient.invalidateQueries({ queryKey: targetQueryKey });
            setSelectedIds([]);
            if (onSuccess) onSuccess();
        } catch {
            // Rollback source on failure
            queryClient.setQueryData(sourceQueryKey, previousSourceData);
            toast.error('Failed to move files');
        }
    }, [activeFolderId, queryClient, setSelectedIds]);

    const handleDownloadFolder = useCallback(async () => {
        const files = displayedFilesRef.current;
        if (files.length === 0) {
            toast.info("Folder is empty.");
            return;
        }
        if (queueBulkDownload) {
            queueBulkDownload(files, activeFolderId);
            return;
        }
        let successCount = 0;
        toast.info(`Downloading folder contents (${files.length} files)...`);
        for (const file of files) {
            const url = api.getDownloadUrl(file.id, activeFolderId);
            try {
                const a = document.createElement('a');
                a.href = url;
                a.download = sanitizeFilename(file.name);
                a.click();
                a.remove();
                successCount++;
            } catch { }
        }
        toast.success(`Folder Download Complete: ${successCount} files.`);
    }, [activeFolderId, queueBulkDownload]);

    const handleGlobalSearch = useCallback(async (query: string) => {
        try {
            const result = await api.searchFiles(query);
            return result.data as TelegramFile[];
        } catch {
            return [];
        }
    }, []);

    return {
        handleDelete,
        handleBulkDelete,
        handleBulkDownload,
        handleBulkMove,
        handleDownloadFolder,
        handleGlobalSearch,
    };
}
