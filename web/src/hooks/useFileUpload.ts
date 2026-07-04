import { useTransferQueue } from '../context/TransferQueueContext';
import { toast } from 'sonner';

export function useFileUpload(activeFolderId: number | null, store: any = null) {
    const {
        uploadQueue,
        setUploadQueue,
        handleManualUpload: globalManualUpload,
        handleDropUpload: globalDropUpload,
        cancelAllUploads,
        cancelUploadItem,
        retryUploadItem
    } = useTransferQueue();

    const handleManualUpload = async () => {
        await globalManualUpload(activeFolderId);
    };

    const handleDropUpload = (files: File[]) => {
        globalDropUpload(files, activeFolderId);
    };

    const handleFolderUpload = async () => {
        toast.info('Folder upload is not available in the web version');
    };

    const handleUrlUpload = async () => {
        toast.info('URL upload is not available in the web version');
    };

    return {
        uploadQueue,
        setUploadQueue,
        handleManualUpload,
        handleDropUpload,
        handleFolderUpload,
        handleUrlUpload,
        cancelAll: cancelAllUploads,
        cancelItem: cancelUploadItem,
        retryItem: retryUploadItem
    };
}
