import { useQuery } from '@tanstack/react-query';
import { VideoMetadata } from '../types';

const METADATA_STALE_TIME = 30 * 60 * 1000;

export function useVideoMetadata(
    messageId: number,
    folderId: number | null,
    fileName: string,
) {
    const isMp4 = fileName.toLowerCase().endsWith('.mp4');

    return useQuery({
        queryKey: ['video-metadata', folderId, messageId],
        queryFn: async (): Promise<VideoMetadata | null> => {
            if (!isMp4) return null;
            return null;
        },
        enabled: isMp4,
        staleTime: METADATA_STALE_TIME,
        retry: 1,
    });
}
