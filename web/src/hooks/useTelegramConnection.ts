import { useState, useEffect, useRef, useCallback } from 'react';
import { load } from '../api/storage';
import { api } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFolder, FolderGroup, FolderInviteInfo } from '../types';
import { useNetworkStatus } from './useNetworkStatus';

export function useTelegramConnection(onLogoutParent: () => void) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const [folders, setFolders] = useState<TelegramFolder[]>([]);
    const [groups, setGroups] = useState<FolderGroup[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [store, setStore] = useState<any>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    const networkIsOnline = useNetworkStatus();
    const handleSyncFoldersRef = useRef<((silentParam?: boolean | unknown) => Promise<void>) | null>(null);

    const fetchGroups = useCallback(async () => {
        try {
            const result = await api.listFolders();
            const grps = result.data.map((f: any, i: number) => ({
                id: f.id,
                name: f.name,
                color_hex: '#3B82F6',
                display_order: i,
            }));
            setGroups(grps);
        } catch (e) {
            console.error("Failed to fetch groups:", e);
        }
    }, []);

    useEffect(() => {
        const initStore = async () => {
            try {
                const _store = await load('config');
                const checkId = await _store.get<string>('api_id');
                setStore(_store);

                const result = await api.listFolders();
                const folderData = result.data.map((f: any) => ({
                    id: f.id,
                    name: f.name,
                    username: f.username,
                    is_public: f.is_public,
                }));
                setFolders(folderData);

                const savedActiveFolderId = await _store.get<number | null>('activeFolderId');
                if (savedActiveFolderId !== undefined) setActiveFolderId(savedActiveFolderId);

                setIsConnected(true);
                queryClient.invalidateQueries({ queryKey: ['files'] });
            } catch {
                // offline or not ready
            }
        };
        initStore();
    }, [queryClient]);

    useEffect(() => {
        if (!store || !isConnected) return;

        const syncAndRefresh = async () => {
            if (!handleSyncFoldersRef.current) return;
            await handleSyncFoldersRef.current(true);
            queryClient.invalidateQueries({ queryKey: ['files'] });
        };

        syncAndRefresh();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncAndRefresh();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [store, isConnected, queryClient]);

    useEffect(() => {
        setIsConnected(networkIsOnline);
    }, [networkIsOnline]);

    const handleLogout = async () => {
        if (!await confirm({ title: "Sign Out", message: "Are you sure you want to sign out? This will disconnect your active session.", confirmText: "Sign Out", variant: 'danger' })) return;

        try {
            await api.logout();
            if (store) {
                await store.delete('api_id');
                await store.delete('folders');
            }
            onLogoutParent();
        } catch {
            toast.error("Error signing out");
            onLogoutParent();
        }
    };

    const handleSyncFolders = async (silentParam?: boolean | unknown) => {
        const silent = silentParam === true;
        if (!store) return;
        setIsSyncing(true);
        try {
            const result = await api.listFolders();
            const folderData = result.data.map((f: any) => ({
                id: f.id,
                name: f.name,
                username: f.username,
                is_public: f.is_public,
            }));
            setFolders(folderData);
            await store.set('folders', folderData);
            await fetchGroups();
            if (!silent) {
                toast.success("Folders and groups synchronized.");
            }
        } catch (e) {
            if (!silent) {
                toast.error("Sync failed: " + e);
            }
        } finally {
            setIsSyncing(false);
        }
    };

    handleSyncFoldersRef.current = handleSyncFolders;

    const handleCreateFolder = async (name: string) => {
        if (!store) return;
        try {
            const newFolder = await api.createFolder(name);
            const folderItem: TelegramFolder = {
                id: newFolder.id,
                name: newFolder.name,
                username: newFolder.username,
                is_public: newFolder.is_public,
            };
            const updated = [...folders, folderItem];
            setFolders(updated);
            await store.set('folders', updated);
            toast.success(`Folder "${name}" created.`);
        } catch (e) {
            toast.error("Failed to create folder: " + e);
            throw e;
        }
    };

    const handleFolderDelete = async (folderId: number, folderName: string) => {
        if (!await confirm({
            title: "Delete Folder",
            message: `Are you sure you want to delete "${folderName}"?\nThis will delete the channel on Telegram.`,
            confirmText: "Delete",
            variant: 'danger'
        })) return;

        try {
            await api.deleteFolder(folderId);
            const updated = folders.filter(f => f.id !== folderId);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
            }
            if (activeFolderId === folderId) setActiveFolderId(null);
            toast.success(`Folder "${folderName}" deleted.`);
        } catch (e: unknown) {
            toast.error(`Failed to delete folder: ${e}`);
        }
    };

    const handleFolderRename = async (folderId: number, oldName: string, newNameOverride?: string) => {
        const newName = newNameOverride?.trim();
        if (!newName || newName === oldName) return;

        try {
            await api.renameFolder(folderId, newName);
            const updated = folders.map(f => f.id === folderId ? { ...f, name: newName } : f);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
            }
            toast.success(`Folder renamed to "${newName}".`);
        } catch (e) {
            toast.error("Failed to rename folder: " + e);
        }
    };

    const handleFolderToggleVisibility = async (folderId: number, makePublic: boolean, desiredUsername?: string) => {
        toast.error("Visibility toggle not available in web version yet");
        throw new Error("Not implemented");
    };

    const handleExportFolderInvite = async (folderId: number): Promise<FolderInviteInfo> => {
        throw new Error("Not implemented");
    };

    const handleSetActiveFolderId = async (id: number | null) => {
        setActiveFolderId(id);
        if (store) {
            await store.set('activeFolderId', id);
        }
    };

    const handleCreateGroup = async (name: string, colorHex: string = '#3B82F6') => {
        toast.success(`Group "${name}" created (local only).`);
    };

    const handleDeleteGroup = async (groupId: number) => {
        setGroups(prev => prev.filter(g => g.id !== groupId));
        toast.success("Group deleted (local only).");
    };

    const handleUpdateGroup = async (groupId: number, name: string, colorHex: string) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name, color_hex: colorHex } : g));
        toast.success("Group updated.");
    };

    const handleAssignFolderToGroup = async (folderId: number, groupId: number | null) => {
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, group_id: groupId } : f));
    };

    const handleReorderFolders = async (reordered: TelegramFolder[]) => {
        setFolders(reordered);
        if (store) {
            await store.set('folders', reordered);
        }
    };

    const handleUpdateGroupOrder = async (reorderedGroups: FolderGroup[]) => {
        setGroups(reorderedGroups);
    };

    return {
        store,
        folders,
        groups,
        activeFolderId,
        setActiveFolderId: handleSetActiveFolderId,
        isSyncing,
        isConnected,
        handleLogout,
        handleSyncFolders,
        handleCreateFolder,
        handleFolderDelete,
        handleFolderRename,
        handleFolderToggleVisibility,
        handleExportFolderInvite,
        handleCreateGroup,
        handleDeleteGroup,
        handleUpdateGroup,
        handleAssignFolderToGroup,
        handleReorderFolders,
        handleUpdateGroupOrder,
        fetchGroups
    };
}
