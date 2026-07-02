import { useState, useCallback } from 'react';

interface UpdateState {
    checking: boolean;
    available: boolean;
    downloading: boolean;
    progress: number;
    error: string | null;
    version: string | null;
}

export function useUpdateCheck() {
    const [state] = useState<UpdateState>({
        checking: false,
        available: false,
        downloading: false,
        progress: 0,
        error: null,
        version: null,
    });

    const checkForUpdates = useCallback(async () => {
        // No-op: updates are not available in the web version
    }, []);

    const downloadAndInstall = useCallback(async () => {
        // No-op: updates are not available in the web version
    }, []);

    const dismissUpdate = useCallback(() => {
        // No-op
    }, []);

    return {
        ...state,
        checkForUpdates,
        downloadAndInstall,
        dismissUpdate,
    };
}
