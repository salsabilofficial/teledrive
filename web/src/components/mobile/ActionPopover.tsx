import { useEffect, useRef, useState } from 'react';

export interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

interface ActionPopoverProps {
  actions: ActionItem[];
  onClose: () => void;
  title?: string;
}

/**
 * A bottom-sheet-style action popover for mobile, replacing swipe-to-reveal.
 * Tapping a file's ⋮ button opens this popover with contextual actions.
 */
export function ActionPopover({ actions, onClose, title }: ActionPopoverProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 250); // duration matches transition duration (250ms)
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center pointer-events-none">
      {/* Backdrop (fades independently) */}
      <div
        ref={backdropRef}
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-in-out pointer-events-auto ${
          isMounted && !isClosing ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Drawer Sheet (slides down solidly without fading) */}
      <div
        className={`relative z-10 w-full max-w-lg bg-telegram-surface border-t border-telegram-border/40 rounded-t-3xl p-5 pb-8 shadow-2xl transition-transform duration-300 ease-out transform pointer-events-auto ${
          isMounted && !isClosing ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (clickable to close) */}
        <div 
          className="flex justify-center mb-4 cursor-pointer py-1.5 -mt-1 active:scale-95 transition-transform" 
          onClick={handleClose}
        >
          <div className="w-10 h-1 rounded-full bg-telegram-border/50 hover:bg-telegram-border/80 transition-colors" />
        </div>

        {title && (
          <h3 className="text-sm font-bold text-telegram-text mb-4 px-1 truncate">{title}</h3>
        )}

        <div className="space-y-1.5">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => {
                action.onClick();
                handleClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                action.destructive
                  ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25 border border-red-500/20'
                  : 'bg-telegram-hover/30 text-telegram-text hover:bg-telegram-hover/50 border border-telegram-border/20'
              }`}
            >
              {action.icon && <span className="flex-shrink-0">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
