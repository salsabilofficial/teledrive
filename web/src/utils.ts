import { toast } from 'sonner';
import { copyToClipboard as platformCopyToClipboard } from './api/platform';

export const isAndroidPlatform = ((): boolean => {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
})();

export function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'] as const;
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'opus'] as const;
const MEDIA_EXTENSIONS: readonly string[] = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'] as const;

const endsWithAny = (name: string, exts: readonly string[]) => {
    const lower = name.toLowerCase();
    return exts.some(ext => lower.endsWith(ext));
};

export const isMediaFile   = (name: string) => endsWithAny(name, MEDIA_EXTENSIONS);
export const isVideoFile   = (name: string) => endsWithAny(name, VIDEO_EXTENSIONS);
export const isAudioFile   = (name: string) => endsWithAny(name, AUDIO_EXTENSIONS);
export const isImageFile   = (name: string) => endsWithAny(name, IMAGE_EXTENSIONS);
export const isPdfFile     = (name: string) => name.toLowerCase().endsWith('.pdf');
export const isZipFile     = (name: string) => name.toLowerCase().endsWith('.zip');
export const isRarFile     = (name: string) => name.toLowerCase().endsWith('.rar');
export const isSevenZFile  = (name: string) => name.toLowerCase().endsWith('.7z');
export const isArchiveFile = (name: string) => isZipFile(name) || isRarFile(name) || isSevenZFile(name);

export interface FileDialogFallbackOptions {
  directory?: boolean;
  multiple?: boolean;
}

export async function pickWithFallback<T>(
    dialogFn: () => Promise<T | null>,
    onRetry: () => void,
    options: {
        errorTitle?: string;
        onBrowserPicker?: () => Promise<T | null>;
    } = {}
): Promise<T | null> {
    try {
        return await dialogFn();
    } catch (err) {
        console.error('Dialog failed:', err);
        return await new Promise<T | null>((resolve) => {
            let resolved = false;
            let browserPickerClicked = false;
            const done = (val: T | null) => {
                if (resolved) return;
                resolved = true;
                resolve(val);
            };

            const toastOptions: Record<string, unknown> = {
                description: String(err),
                duration: 8000,
                action: {
                    label: 'Retry',
                    onClick: () => {
                        done(null);
                        onRetry();
                    },
                },
                onDismiss: () => {
                    if (!browserPickerClicked) done(null);
                },
                onAutoClose: () => {
                    if (!browserPickerClicked) done(null);
                },
            };

            if (options.onBrowserPicker) {
                toastOptions.cancel = {
                    label: 'Browser Picker',
                    onClick: async () => {
                        browserPickerClicked = true;
                        const result = await options.onBrowserPicker!();
                        done(result);
                    },
                };
            }

            toast.error(options.errorTitle || 'Dialog failed', toastOptions as Parameters<typeof toast.error>[1]);
        });
    }
}

export async function copyToClipboard(text: string): Promise<void> {
    try {
        await platformCopyToClipboard(text);
    } catch {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }
    }
}

export async function nativeShareOrCopy(
    name: string,
    sizeStr: string,
    link: string,
    onCopy?: (link: string) => void
): Promise<void> {
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    if (canShare) {
        try {
            await navigator.share({
                title: `Shared file: ${name}`,
                text: `Download "${name}" (${sizeStr}) via TeleDrive`,
                url: link,
            });
            return;
        } catch (e: any) {
            if (e?.name !== 'AbortError') {
                toast.error('Share failed, but link has been copied');
            }
        }
    }
    if (onCopy) {
        onCopy(link);
    } else {
        navigator.clipboard.writeText(link);
        toast.success('Link copied to clipboard');
    }
}

export function showFileDialogFallback(options: FileDialogFallbackOptions = {}): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple ?? true;

    if (options.directory) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }

    let focusTimeout: ReturnType<typeof setTimeout> | undefined;
    let resolved = false;

    const cleanup = () => {
      window.removeEventListener('focus', onFocus);
      if (focusTimeout) clearTimeout(focusTimeout);
      input.remove();
    };

    const finish = (paths: string[]) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(paths);
    };

    input.onchange = () => {
      const paths: string[] = [];
      if (input.files) {
        for (let i = 0; i < input.files.length; i++) {
          const path = (input.files[i] as any).path as string | undefined;
          if (path && typeof path === 'string' && path.length > 0) {
            paths.push(path);
          }
        }
      }
      finish(paths);
    };

    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      focusTimeout = setTimeout(() => {
        if (input.parentNode) {
          finish([]);
        }
      }, 300);
    };
    window.addEventListener('focus', onFocus);

    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
  });
}

export function sanitizeFilename(name: string): string {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .trim()
        .replace(/^\.+|\.+$/g, '')
        || 'file';
}

export function createDragGhost(name: string, isFolder?: boolean, count?: number): HTMLElement {
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.left = '-9999px';
    ghost.style.top = '-9999px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.gap = '8px';
    ghost.style.padding = '8px 12px';
    ghost.style.background = 'rgba(30,30,35,0.95)';
    ghost.style.border = '1px solid rgba(0,136,204,0.4)';
    ghost.style.borderRadius = '8px';
    ghost.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
    ghost.style.maxWidth = '220px';

    const icon = document.createElement('span');
    icon.style.flexShrink = '0';
    icon.style.fontSize = '16px';
    icon.textContent = isFolder ? '📁' : '📄';
    ghost.appendChild(icon);

    const label = document.createElement('span');
    label.style.fontSize = '12px';
    label.style.fontWeight = '500';
    label.style.color = '#e4e4e7';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.textContent = name;
    ghost.appendChild(label);

    if (count && count > 1) {
        const badge = document.createElement('span');
        badge.style.flexShrink = '0';
        badge.style.marginLeft = '2px';
        badge.style.padding = '2px 6px';
        badge.style.background = 'rgba(0,136,204,0.85)';
        badge.style.color = '#fff';
        badge.style.fontSize = '10px';
        badge.style.fontWeight = '700';
        badge.style.borderRadius = '10px';
        badge.style.lineHeight = '1.2';
        badge.style.minWidth = '18px';
        badge.style.textAlign = 'center';
        badge.textContent = String(count);
        ghost.appendChild(badge);
    }

    document.body.appendChild(ghost);
    return ghost;
}
