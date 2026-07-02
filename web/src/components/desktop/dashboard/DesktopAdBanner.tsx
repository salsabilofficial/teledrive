import { useState, useEffect, useRef, useCallback } from 'react';


const AD_INTERVAL_MS = 1000 * 60 * 45;
const AUTO_DISMISS_SECONDS = 10;
const DISMISSED_AT_KEY = 'desktopAdDismissedAt';

const AD_CLICK_URL = 'https://www.highperformanceformat.com/9cf449272b7e1c83054b82b7639c6029';

const AD_SRCDOC = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 300px; height: 250px; overflow: hidden;
      background: #1a1a2e;
    }
  </style>
</head>
<body>
  <script>
    window.atOptions = {
      'key': '9cf449272b7e1c83054b82b7639c6029',
      'format': 'iframe',
      'height': 250,
      'width': 300,
      'params': {}
    };
  <\/script>
  <script src="https://www.highperformanceformat.com/9cf449272b7e1c83054b82b7639c6029/invoke.js" async><\/script>
</body>
</html>`;

function safeTryGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeTryRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { }
}
function safeTrySet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { }
}

export function DesktopAdBanner() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);
  const [isHovering, setIsHovering] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    safeTryRemove(DISMISSED_AT_KEY);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const check = () => {
      if (!mountedRef.current) return;
      const raw = safeTryGet(DISMISSED_AT_KEY);
      if (!raw) {
        setVisible(true);
        return;
      }
      const dismissedAt = parseInt(raw, 10);
      if (isNaN(dismissedAt) || Date.now() - dismissedAt >= AD_INTERVAL_MS) {
        safeTryRemove(DISMISSED_AT_KEY);
        setVisible(true);
      }
    };

    check();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (!visible) {
      interval = setInterval(check, 30_000);
    }
    return () => {
      mountedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [visible]);

  const handleDismissInternal = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank';
    }
    safeTrySet(DISMISSED_AT_KEY, Date.now().toString());
    setExiting(true);
    setCountdown(0);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 300);
  }, []);

  const handleAdClick = useCallback(async () => {
    try {
      window.open(AD_CLICK_URL, '_blank');
    } catch {
      window.open(AD_CLICK_URL, '_blank');
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setCountdown(AUTO_DISMISS_SECONDS);
      return;
    }
    if (countdown <= 0) {
      if (!exiting) handleDismissInternal();
      return;
    }
    if (isHovering) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [visible, countdown, exiting, isHovering, handleDismissInternal]);

  if (!visible) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label="Sponsored advertisement — closes automatically after 10 seconds"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={`
          fixed bottom-20 right-5 z-[100]
          bg-telegram-surface border border-telegram-border/60
          rounded-xl shadow-2xl overflow-hidden
          transition-all duration-300 ease-out
          ${exiting ? 'opacity-0 scale-95 translate-y-2' : 'opacity-100 scale-100'}
        `}
      >
        <div
          className="
            absolute top-1.5 right-1.5 z-20
            p-1 rounded-md text-[10px] font-bold
            flex items-center justify-center min-w-[24px] h-[20px]
            bg-white/5 text-white/40 border border-white/10
          "
          aria-label={`Advertisement closes in ${countdown} seconds`}
        >
          {countdown}s
        </div>

        <div className="flex items-center justify-center pl-4 pr-10 py-2 bg-telegram-hover/30 border-b border-telegram-border/30 select-none">
          <span className="text-[11px] font-medium text-telegram-text/80">
            Sponsored Ad — closes in <span className="font-bold text-telegram-primary tabular-nums">{countdown}</span>s
          </span>
        </div>

        <div aria-live="polite" className="sr-only">
          {countdown > 0
            ? `Advertisement closes in ${countdown} ${countdown === 1 ? 'second' : 'seconds'}`
            : 'Advertisement closed'}
        </div>

        <button
          onClick={handleAdClick}
          className="relative block cursor-pointer border-0 bg-transparent p-0 m-0 w-[300px] h-[250px]"
          aria-label="Click to open sponsored content in browser"
        >
          <iframe
            ref={iframeRef}
            srcDoc={AD_SRCDOC}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            title="Advertisement"
            width={300}
            height={250}
            style={{ border: 'none', overflow: 'hidden', pointerEvents: 'none' }}
            className="bg-telegram-bg/50"
          />
        </button>
      </div>
    </>
  );
}
