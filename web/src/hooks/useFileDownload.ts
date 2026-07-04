import { useTransferQueue } from '../context/TransferQueueContext';
import { TelegramFile } from '../types';

export function useFileDownload(store: any = null) {
    const {
        downloadQueue,
        queueDownload,
        queueBulkDownload,
        cancelAllDownloads,
        cancelDownloadItem,
        retryDownloadItem,
        clearFinishedDownloads
    } = useTransferQueue();

    return {
        downloadQueue,
        queueDownload,
        queueBulkDownload,
        clearFinished: clearFinishedDownloads,
        cancelAll: cancelAllDownloads,
        cancelItem: cancelDownloadItem,
        retryItem: retryDownloadItem,
    };
}
