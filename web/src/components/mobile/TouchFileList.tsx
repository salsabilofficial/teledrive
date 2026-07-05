import { useRef, useCallback, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { FileTypeIcon } from '../shared/FileTypeIcon';
import { TelegramFile } from '../../types';

interface TouchFileListProps {
  files: TelegramFile[];
  isLoading: boolean;
  onPreview: (file: TelegramFile) => void;
  selectedIds: number[];
  onToggleSelection: (id: number) => void;
  onShowActions: (file: TelegramFile) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export function TouchFileList({
  files,
  isLoading,
  onPreview,
  selectedIds,
  onToggleSelection,
  onShowActions,
  hasMore,
  onLoadMore,
  loadingMore
}: TouchFileListProps) {
  const isSelectionActive = selectedIds.length > 0;

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !onLoadMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        onLoadMore();
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  // Long-press detection refs
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);
  const LONG_PRESS_DURATION = 500;

  // Long-press handlers — defined BEFORE any early returns to satisfy Rules of Hooks.
  // On Android, long-press opens the action popover (file options menu).
  const handlePointerDown = useCallback((e: React.PointerEvent, file: TelegramFile) => {
    if (isSelectionActive) return;
    longPressFiredRef.current = false;
    longPressPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      // Haptic feedback — short vibration pulse (Web Vibration API, supported in Android WebView)
      navigator.vibrate?.(15);
      onShowActions(file);
    }, LONG_PRESS_DURATION);
  }, [isSelectionActive, onShowActions]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!longPressPosRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - longPressPosRef.current.x);
    const dy = Math.abs(e.clientY - longPressPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      longPressPosRef.current = null;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressPosRef.current = null;
  }, []);

  return (
    <>
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
          <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-telegram-primary"></div>
          <p className="text-xs text-telegram-subtext font-semibold">Retrieving your files...</p>
        </div>
      )}

      {!isLoading && files.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center px-4">
          <div className="p-4 rounded-2xl bg-telegram-hover/10 text-telegram-subtext border border-telegram-border/10">
            📁
          </div>
          <h4 className="text-sm font-bold text-telegram-text">This folder is empty</h4>
          <p className="text-xs text-telegram-subtext max-w-xs leading-relaxed">
            Upload files or synchronise folders to begin managing content.
          </p>
        </div>
      )}

      {!isLoading && files.length > 0 && (
        <div className="space-y-2 pb-24">
          {files.map((file) => {
            const isSelected = selectedIds.includes(file.id);
            return (
              <div
                key={file.id}
                onPointerDown={(e) => handlePointerDown(e, file)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={(e) => {
                  if (longPressFiredRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  if (isSelectionActive) {
                    onToggleSelection(file.id);
                  } else {
                    onPreview(file);
                  }
                }}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 active:scale-[0.99] select-none ${
                  isSelected
                    ? 'bg-telegram-primary/10 border-telegram-primary/30 shadow-sm'
                    : 'bg-telegram-hover/10 border-telegram-border/20 hover:border-telegram-border/40'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Selection checkbox or custom icon */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelection(file.id);
                    }}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-telegram-primary border-telegram-primary'
                        : isSelectionActive
                        ? 'border-telegram-border bg-black/10'
                        : 'border-transparent bg-transparent'
                    }`}
                  >
                    {isSelected ? (
                      <div className="w-1.5 h-1.5 bg-black rounded-full" />
                    ) : (
                      !isSelectionActive && <FileTypeIcon filename={file.name} size="sm" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-telegram-text truncate max-w-[200px] leading-snug">{file.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-telegram-subtext/80 font-medium font-mono">{file.sizeStr}</span>
                      <span className="w-1 h-1 bg-telegram-border rounded-full" />
                      <span className="text-[10px] text-telegram-subtext/80 font-medium">{file.created_at || 'Sync'}</span>
                    </div>
                  </div>
                </div>

                {/* ⋮ menu button */}
                {!isSelectionActive && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowActions(file);
                    }}
                    className="flex-shrink-0 p-2 rounded-xl hover:bg-telegram-hover/40 active:bg-telegram-hover/60 text-telegram-subtext/60 hover:text-telegram-subtext transition-all duration-200"
                    aria-label="File actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore ? (
                <div className="w-6 h-6 border-3 border-telegram-primary border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span className="text-xs text-telegram-subtext/50">Load more...</span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
