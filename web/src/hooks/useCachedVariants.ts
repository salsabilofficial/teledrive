import { useQuery } from '@tanstack/react-query';

interface CachedVariantInfo {
    quality: string;
    available: boolean;
}

const STALE_TIME = 60_000;

export function useCachedVariants(
    messageId: number,
    folderId: number | null,
    fileName: string,
) {
    const isMp4 = fileName.toLowerCase().endsWith('.mp4');

    return useQuery({
        queryKey: ['cached-variants', folderId ?? 0, messageId],
        queryFn: async (): Promise<CachedVariantInfo[]> => {
            if (!isMp4) return [];
            return [];
        },
        enabled: isMp4,
        staleTime: STALE_TIME,
        retry: 1,
    });
}
