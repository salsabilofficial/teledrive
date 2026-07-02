import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, AlertTriangle, Loader2, RefreshCw, StopCircle, Maximize2, Minimize2, Volume2, VolumeX, Volume1, Play, Activity, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import Hls from 'hls.js';
import { TelegramFile, StreamingQuality, TranscodePrepareResult, TranscodeJobPhase, TranscodeCapabilities, QUALITY_LABELS, HLS_QUALITIES } from '../../../types';
import { useAdaptiveStreaming } from '../../../hooks/useAdaptiveStreaming';
import { QualitySelector } from '../../shared/QualitySelector';

interface AdaptiveMediaPlayerProps {
    file: TelegramFile;
    activeFolderId: number | null;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    streamUrl: string;
}

const STREAM_BASE_KEY = '/stream/';

export function AdaptiveMediaPlayer({
    file,
    activeFolderId,
    onClose,
    onNext,
    onPrev,
    currentIndex,
    totalItems,
    streamUrl,
}: AdaptiveMediaPlayerProps) {
    const [restartNonce, setRestartNonce] = useState(0);

    const [fmp4Remuxing, setFmp4Remuxing] = useState(false);
    const [fmp4RemuxError, setFmp4RemuxError] = useState<string | null>(null);
    const [fmp4StreamUrl, setFmp4StreamUrl] = useState<string | null>(null);
    const fmp4RemuxingRef = useRef(false);
    const remuxGenerationRef = useRef(0);

    const effectiveStreamUrl = fmp4StreamUrl || streamUrl;

    const restartStreamUrl = useMemo(() => {
        if (restartNonce > 0) {
            const sep = effectiveStreamUrl.includes('?') ? '&' : '?';
            return `${effectiveStreamUrl}${sep}_r=${restartNonce}`;
        }
        return effectiveStreamUrl;
    }, [effectiveStreamUrl, restartNonce]);

    const abortMseRef = useRef<(() => void) | null>(null);
    const logRef = useRef<((msg: string, ...args: unknown[]) => void) | null>(null);
    const transcodeCapsRef = useRef<TranscodeCapabilities | null>(null);

    const handleProgressiveDetected = useCallback(() => {
        logRef.current?.('Progressive MP4 detected — fMP4 remux not available in web version');
    }, []);

    const progressiveCallback = useMemo(
        () => handleProgressiveDetected,
        [handleProgressiveDetected],
    );

    const {
        videoRef: mseVideoRef,
        phase: msePhase,
        error: mseError,
        tracks,
        loadProgress,
        currentQuality,
        setQuality,
        adaptiveMode,
        setAdaptiveMode,
        measuredKbps,
        useFallback,
        fallbackUrl,
        abort: abortMse,
    } = useAdaptiveStreaming(restartStreamUrl, file.name, progressiveCallback);

    const [playbackMode, setPlaybackMode] = useState<'original' | 'hls'>('original');
    const [hlsQuality, setHlsQuality] = useState<StreamingQuality | null>(null);
    const [hlsPhase, setHlsPhase] = useState<TranscodeJobPhase>('idle');
    const [hlsProgress, setHlsProgress] = useState(0);
    const [hlsError, setHlsError] = useState<string | null>(null);
    const [hlsPlaylistUrl, setHlsPlaylistUrl] = useState<string | null>(null);
    const [transcodeCapabilities, setTranscodeCapabilities] = useState<TranscodeCapabilities | null>({ available: false, variants: [], mode: 'original' });
    const [hlsVariantStates, setHlsVariantStates] = useState<Record<string, TranscodeJobPhase>>({});

    const hlsRef = useRef<Hls | null>(null);
    const hlsVideoRef = useRef<HTMLVideoElement>(null);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const savedTimeRef = useRef<number>(0);
    const hlsQualityRef = useRef<StreamingQuality | null>(null);
    const streamTokenRef = useRef<string>('');
    const currentJobIdRef = useRef<string | null>(null);
    const streamBaseRef = useRef<string>('');
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const isFullscreenRef = useRef(false);
    const [hlsVideoReady, setHlsVideoReady] = useState(false);
    const hlsVideoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
        (hlsVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
        setHlsVideoReady(!!el);
    }, []);

    const log = useCallback((msg: string, ...args: unknown[]) => {
        console.log(`[AdaptivePlayer] ${msg}`, ...args);
    }, []);
    logRef.current = log;

    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const volumeBeforeMute = useRef(1);

    const [sourceResolution, setSourceResolution] = useState<{ w: number; h: number } | null>(null);
    const [playingResolution, setPlayingResolution] = useState<{ w: number; h: number } | null>(null);

    const sourceHeight = useMemo(() => {
        const videoTrack = tracks.find(t => t.type === 'video');
        if (videoTrack?.height) return videoTrack.height;
        if (sourceResolution?.h) return sourceResolution.h;
        return null;
    }, [tracks, sourceResolution]);

    const [debugOverlay, setDebugOverlay] = useState(() => {
        try { return localStorage.getItem('debug_overlay') === '1'; } catch { return false; }
    });
    const [debugBufferedSecs, setDebugBufferedSecs] = useState(0);

    const toggleDebugOverlay = useCallback(() => {
        setDebugOverlay(prev => {
            const next = !prev;
            try { localStorage.setItem('debug_overlay', next ? '1' : '0'); } catch {}
            return next;
        });
    }, []);

    const [clearingCache, setClearingCache] = useState(false);
    const fileKey = `${activeFolderId ?? 0}_${file.id}`;

    const handleClearTranscodeCache = useCallback(async () => {
        toast.info('Transcode cache clearing not available in web version');
    }, []);

    useEffect(() => {
        if (!debugOverlay) return;
        const interval = setInterval(() => {
            const video = (playbackMode === 'hls' ? hlsVideoRef.current : mseVideoRef.current);
            if (video && video.buffered.length > 0) {
                setDebugBufferedSecs(video.buffered.end(video.buffered.length - 1) - video.currentTime);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [debugOverlay, playbackMode]);

    useEffect(() => {
        const videoTrack = tracks.find(t => t.type === 'video');
        if (videoTrack?.width && videoTrack?.height && !sourceResolution) {
            setSourceResolution({ w: videoTrack.width, h: videoTrack.height });
        }
    }, [tracks, sourceResolution]);

    useEffect(() => {
        const interval = setInterval(() => {
            const video = (playbackMode === 'hls' ? hlsVideoRef.current : mseVideoRef.current);
            if (video && video.videoWidth > 0 && video.videoHeight > 0) {
                const pw = video.videoWidth;
                const ph = video.videoHeight;
                setPlayingResolution(prev => {
                    if (!prev || prev.w !== pw || prev.h !== ph) return { w: pw, h: ph };
                    return prev;
                });
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [playbackMode]);

    const applyVolume = useCallback((v: number, muted: boolean) => {
        const video = hlsVideoRef.current || mseVideoRef.current;
        if (video) {
            video.volume = muted ? 0 : v;
            video.muted = muted;
        }
    }, []);

    const handleVolumeChange = useCallback((newVolume: number) => {
        const clamped = Math.max(0, Math.min(1, newVolume));
        setVolume(clamped);
        setIsMuted(clamped === 0);
        applyVolume(clamped, clamped === 0);
        if (clamped > 0) volumeBeforeMute.current = clamped;
    }, [applyVolume]);

    abortMseRef.current = abortMse;

    const toggleMute = useCallback(() => {
        if (isMuted) {
            setIsMuted(false);
            setVolume(volumeBeforeMute.current);
            applyVolume(volumeBeforeMute.current, false);
        } else {
            volumeBeforeMute.current = volume || 1;
            setIsMuted(true);
            setVolume(volume);
            applyVolume(volume, true);
        }
    }, [isMuted, volume, applyVolume]);

    useEffect(() => {
        const video = hlsVideoRef.current || mseVideoRef.current;
        if (video) {
            video.volume = isMuted ? 0 : volume;
            video.muted = isMuted;
        }
    }, [isMuted, volume, hlsPhase, msePhase]);

    useEffect(() => {
        try {
            const url = new URL(streamUrl);
            const token = url.searchParams.get('token');
            if (token) streamTokenRef.current = token;
            const streamIdx = streamUrl.indexOf(STREAM_BASE_KEY);
            if (streamIdx !== -1) {
                streamBaseRef.current = streamUrl.substring(0, streamIdx);
            } else {
                streamBaseRef.current = url.origin;
            }
        } catch {}

        setFmp4Remuxing(false);
        setFmp4RemuxError(null);
        setFmp4StreamUrl(null);
        fmp4RemuxingRef.current = false;
        remuxGenerationRef.current += 1;
    }, [streamUrl]);

    const pollTranscodeStatus = useCallback((jobId: string, quality: StreamingQuality) => {
    }, []);

    const startTranscode = useCallback(async (quality: StreamingQuality) => {
        log('HLS transcode not available in web version');
    }, [log]);

    const handleQualityChange = useCallback((quality: StreamingQuality) => {
        log('handleQualityChange', { quality, currentPlaybackMode: playbackMode });

        setQuality(quality);

        if (quality === 'original') {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
            hlsQualityRef.current = null;
            currentJobIdRef.current = null;
            setPlaybackMode('original');
            setHlsPhase('idle');
            setHlsQuality(null);
            setHlsPlaylistUrl(null);
            setHlsError(null);
            setHlsVideoReady(false);
            setRestartNonce(n => n + 1);
        } else {
            log('HLS transcode not available — quality change only applies bandwidth throttle');
        }
    }, [setQuality, playbackMode, log]);

    const enterFullscreen = useCallback(async () => {
        try {
            const video = (hlsVideoRef.current || mseVideoRef.current) as HTMLVideoElement | null;
            if (video && typeof video.requestFullscreen === 'function') {
                await video.requestFullscreen({ navigationUI: 'hide' });
            } else if (containerRef.current) {
                await containerRef.current.requestFullscreen({ navigationUI: 'hide' });
            }
        } catch {}
        setIsFullscreen(true);
    }, []);

    const exitFullscreen = useCallback(async () => {
        if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => {});
        }
        setIsFullscreen(false);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        if (isFullscreenRef.current) {
            await exitFullscreen();
        } else {
            await enterFullscreen();
        }
    }, [enterFullscreen, exitFullscreen]);

    useEffect(() => {
        isFullscreenRef.current = isFullscreen;
    }, [isFullscreen]);

    useEffect(() => {
        let mounted = true;
        const onFsChange = () => {
            if (mounted) setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', onFsChange);
        return () => {
            mounted = false;
            document.removeEventListener('fullscreenchange', onFsChange);
        };
    }, []);

    useEffect(() => {
        if (playbackMode !== 'hls' || !hlsPlaylistUrl || hlsPhase !== 'ready') return;
        if (!hlsVideoReady) {
            log('hlsVideoRef not ready yet, waiting for callback ref...');
            return;
        }
        const video = hlsVideoRef.current;
        if (!video) return;

        log('Initializing HLS playback', { playlistUrl: hlsPlaylistUrl });

        const savedTime = savedTimeRef.current;

        const onHlsMetadata = () => {
            const v = hlsVideoRef.current;
            if (v) {
                console.log('[AdaptivePlayer] HLS metadata', {
                    width: v.videoWidth,
                    height: v.videoHeight,
                    src: v.currentSrc,
                });
                if (v.videoWidth > 0 && v.videoHeight > 0) {
                    setSourceResolution(prev => prev || { w: v.videoWidth, h: v.videoHeight });
                }
            }
        };

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = hlsPlaylistUrl;
            video.addEventListener('loadedmetadata', () => {
                onHlsMetadata();
                if (savedTime > 0) video.currentTime = savedTime;
                video.play().catch(() => {});
            }, { once: true });
        } else if (Hls.isSupported()) {
            const token = streamTokenRef.current;
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90,
                xhrSetup: (xhr, url) => {
                    if (token && url.includes('/hls/') && !/[?&]token=/.test(url)) {
                        const sep = url.includes('?') ? '&' : '?';
                        xhr.open('GET', `${url}${sep}token=${encodeURIComponent(token)}`, true);
                    }
                },
            });
            hlsRef.current = hls;

            hls.loadSource(hlsPlaylistUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                log('HLS MANIFEST_PARSED, seeking to', savedTime);
                onHlsMetadata();
                if (savedTime > 0) video.currentTime = savedTime;
                video.play().catch(() => {});
            });

            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                    log('HLS fatal error', data.type, data.details);
                    console.error('[HLS] Fatal error:', data.type, data.details);
                    setHlsError(`HLS playback error: ${data.details}`);
                    setHlsPhase('failed');
                    hls.destroy();
                    hlsRef.current = null;
                } else {
                    log('HLS non-fatal error', data.type, data.details);
                }
            });
        } else {
            log('HLS not supported in this browser');
            setHlsError('HLS playback not supported in this browser');
            setHlsPhase('failed');
        }

        return () => {
        };
    }, [playbackMode, hlsPlaylistUrl, hlsPhase, hlsVideoReady, log]);

    const cancelTranscode = useCallback(async () => {
        log('cancelTranscode');
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        hlsQualityRef.current = null;
        setPlaybackMode('original');
        setHlsPhase('idle');
        setHlsQuality(null);
        setHlsPlaylistUrl(null);
        setHlsError(null);
        setHlsVideoReady(false);
        setQuality('original');
        setRestartNonce(n => n + 1);
    }, [setQuality, log]);

    const retryTranscode = useCallback(() => {
        if (hlsQuality) startTranscode(hlsQuality);
    }, [hlsQuality, startTranscode]);

    useEffect(() => {
        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            const key = e.key.toLowerCase();
            if (e.key === 'ArrowRight' || key === 'l') { e.preventDefault(); onNext?.(); }
            else if (e.key === 'ArrowLeft' || key === 'j') { e.preventDefault(); onPrev?.(); }
            else if (e.key === 'Escape') {
                e.preventDefault();
                if (isFullscreenRef.current) {
                    toggleFullscreen();
                } else {
                    onClose();
                }
            }
            else if (key === 'f') { e.preventDefault(); toggleFullscreen(); }
            else if (key === 'm') { e.preventDefault(); toggleMute(); }
            else if (key === 'd') { e.preventDefault(); toggleDebugOverlay(); }
            else if (e.key === ' ') {
                e.preventDefault();
                const video = hlsVideoRef.current || mseVideoRef.current;
                if (video) {
                    video.paused ? video.play().catch(() => {}) : video.pause();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev, toggleFullscreen, toggleMute, toggleDebugOverlay]);

    const isHlsMode = playbackMode === 'hls';
    const hasVideoTrack = tracks.some(t => t.type === 'video');
    const isMseLoading = msePhase === 'loading' || msePhase === 'initializing';
    const isHlsLoading = hlsPhase === 'preparing' || hlsPhase === 'caching' || hlsPhase === 'transcoding';
    const displayPhase: string = isHlsMode ? hlsPhase : (isMseLoading ? 'loading' : msePhase);
    const displayError: string | null = isHlsMode ? hlsError : mseError;
    const showOriginalVideo = !isHlsMode && !useFallback;

    const effectiveQuality: StreamingQuality = isHlsMode ? (hlsQuality || 'original') : currentQuality;

    return (
        <div
            className={`fixed inset-0 z-[200] bg-black/90 animate-in fade-in duration-200 ${isFullscreen ? 'p-0' : 'flex items-center justify-center p-4 backdrop-blur-md'}`}
            onClick={onClose}
        >
            <div ref={containerRef} className={`relative ${isFullscreen ? 'fixed inset-0 w-screen h-screen max-w-none' : 'w-full max-w-6xl flex flex-col items-center'}`} onClick={e => e.stopPropagation()}>
                <button onClick={onPrev} className={`absolute left-2 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-10 ${isFullscreen ? 'left-4' : ''}`} title="Previous (ArrowLeft / J)">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <button onClick={onNext} className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-10 ${isFullscreen ? 'right-4' : ''}`} title="Next (ArrowRight / L)">
                    <ChevronRight className="w-6 h-6" />
                </button>
                <div className={`absolute z-30 flex items-center gap-2 ${isFullscreen ? 'top-4 right-4' : '-top-12 right-0'}`}>
                    <button
                        onClick={toggleFullscreen}
                        className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
                        title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                    >
                        {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
                        title="Close (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className={`bg-black overflow-hidden flex items-center justify-center relative ${isFullscreen ? 'w-full h-full rounded-none shadow-none ring-0' : 'w-full aspect-video rounded-xl shadow-2xl ring-1 ring-white/10'}`}>
                    {fmp4Remuxing && (
                        <div className="flex flex-col items-center gap-4 text-white absolute inset-0 bg-black/80 z-10">
                            <Zap className="w-10 h-10 text-telegram-primary animate-pulse" />
                            <div className="flex flex-col items-center gap-1">
                                <p className="text-sm font-medium">Converting to streaming format...</p>
                                <p className="text-[11px] text-white/30 mt-1">
                                    Remuxing MP4 for optimal playback. This only happens once per file.
                                </p>
                            </div>
                        </div>
                    )}

                    {fmp4RemuxError && !fmp4Remuxing && (
                        <div className="flex flex-col items-center gap-3 text-white absolute inset-0 bg-black/80 z-10">
                            <AlertTriangle className="w-10 h-10 text-amber-400" />
                            <p className="text-sm text-amber-400 font-medium">Streaming conversion failed</p>
                            <p className="text-xs text-white/40 text-center max-w-md">
                                {fmp4RemuxError}
                            </p>
                            <p className="text-[11px] text-white/20">Falling back to native video player...</p>
                        </div>
                    )}

                    {(displayPhase === 'error' || displayPhase === 'failed') && (
                        <div className="flex flex-col items-center gap-3 text-white px-8">
                            <AlertTriangle className="w-10 h-10 text-red-400" />
                            <p className="text-sm text-red-400 font-medium">Playback Error</p>
                            <p className="text-xs text-white/40 text-center max-w-md">{displayError || 'Unknown error'}</p>
                            {isHlsMode && (
                                <button onClick={retryTranscode} className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Retry
                                </button>
                            )}
                        </div>
                    )}

                    {isHlsLoading && (
                        <div className="flex flex-col items-center gap-4 text-white absolute inset-0 bg-black/80 z-10">
                            <Loader2 className="w-10 h-10 text-telegram-primary animate-spin" />
                            <div className="flex flex-col items-center gap-1">
                                <p className="text-sm font-medium">
                                    {hlsPhase === 'preparing' ? `Preparing ${hlsQuality}...` :
                                     hlsPhase === 'caching' ? 'Downloading source...' :
                                     hlsPhase === 'transcoding' ? `Transcoding to ${hlsQuality}...` : ''}
                                </p>
                                {hlsProgress > 0 && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-telegram-primary rounded-full transition-all duration-300" style={{ width: `${Math.round(hlsProgress * 100)}%` }} />
                                        </div>
                                        <span className="text-[11px] text-white/40">{Math.round(hlsProgress * 100)}%</span>
                                    </div>
                                )}
                                {hlsPhase === 'preparing' && <p className="text-[11px] text-white/30 mt-1">Starting transcode job...</p>}
                            </div>
                            <button
                                onClick={cancelTranscode}
                                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-red-500/20 text-white/60 hover:text-red-400 rounded-lg text-xs font-medium transition-all border border-white/10 hover:border-red-500/30"
                                title="Cancel transcode"
                            >
                                <StopCircle className="w-3.5 h-3.5" />
                                Cancel
                            </button>
                        </div>
                    )}

                    {showOriginalVideo && isMseLoading && (
                        <div className="flex flex-col items-center gap-4 text-white absolute inset-0 bg-black/80 z-10">
                            <Loader2 className="w-10 h-10 text-telegram-primary animate-spin" />
                            <div className="flex flex-col items-center gap-1">
                                <p className="text-sm font-medium">Loading video</p>
                                {loadProgress > 0 && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-telegram-primary rounded-full transition-all duration-300" style={{ width: `${loadProgress}%` }} />
                                        </div>
                                        <span className="text-[11px] text-white/40">{loadProgress}%</span>
                                    </div>
                                )}
                                <p className="text-[11px] text-white/30 mt-1">
                                    {msePhase === 'initializing' ? 'Initializing decoder...' : 'Parsing video metadata...'}
                                </p>
                            </div>
                        </div>
                    )}

                    {useFallback && !isHlsMode && (
                        <video src={fallbackUrl} controls controlsList="nodownload" autoPlay className="w-full h-full object-contain" />
                    )}

                    {isHlsMode && (
                        <video
                            ref={hlsVideoCallbackRef}
                            controls={hlsPhase === 'ready'}
                            controlsList="nodownload"
                            autoPlay
                            className={`w-full h-full object-contain ${hlsPhase === 'ready' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}
                        />
                    )}

                    {showOriginalVideo && (
                        <video
                            ref={mseVideoRef}
                            controls
                            controlsList="nodownload"
                            autoPlay
                            className={`w-full h-full object-contain ${(isMseLoading || msePhase === 'error') ? 'opacity-0' : 'opacity-100'}`}
                        />
                    )}
                </div>

                {(displayPhase === 'playing' || displayPhase === 'ready') && (
                    <div className={`absolute ${isFullscreen ? 'bottom-16 left-4' : 'top-3 right-3'} z-20 flex items-center gap-2`}>
                        <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-xs font-medium text-white/90 shadow-lg pointer-events-none">
                            {isHlsMode && hlsQuality ? QUALITY_LABELS[hlsQuality] : `${effectiveQuality === 'original' ? 'Original' : QUALITY_LABELS[effectiveQuality]}${measuredKbps > 0 && effectiveQuality !== 'original' ? ` · ${(measuredKbps / 1000).toFixed(0)}k` : ''}`}
                        </div>
                        {(sourceResolution || playingResolution) && (
                            <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-[10px] font-medium text-white/70 shadow-lg pointer-events-none flex items-center gap-1.5">
                                {sourceResolution && (
                                    <span>Source: {sourceResolution.w}×{sourceResolution.h}</span>
                                )}
                                {playingResolution && (!sourceResolution || playingResolution.w !== sourceResolution.w || playingResolution.h !== sourceResolution.h) && (
                                    <span>· Playing: {playingResolution.w}×{playingResolution.h}</span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {debugOverlay && (
                    <div className={`absolute z-40 pointer-events-none ${isFullscreen ? 'bottom-20 left-4' : 'bottom-4 left-4'}`}>
                        <div className="px-3 py-2 rounded-lg bg-black/80 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-white/80 shadow-xl space-y-1">
                            <div className="flex items-center gap-2 text-[11px] font-semibold text-white/60 mb-0.5">
                                <Activity className="w-3 h-3" />
                                Debug
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-white/40">Speed</span>
                                <span>{isHlsMode ? '—' : measuredKbps > 999 ? `${(measuredKbps / 1000).toFixed(1)} Mbps` : `${Math.round(measuredKbps)} Kbps`}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-white/40">Cap</span>
                                <span>{effectiveQuality === 'original' ? 'Unlimited' : `${QUALITY_LABELS[effectiveQuality]}${!transcodeCapabilities?.available ? ' (throttle)' : ''}`}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-white/40">Buffered</span>
                                <span>{debugBufferedSecs.toFixed(1)}s</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-white/40">Mode</span>
                                <span className={isHlsMode ? 'text-emerald-400' : effectiveQuality !== 'original' && !transcodeCapabilities?.available ? 'text-amber-400' : 'text-white/60'}>
                                    {isHlsMode ? 'HLS' : effectiveQuality !== 'original' && !transcodeCapabilities?.available ? 'Bandwidth capped' : 'Original'}
                                </span>
                            </div>
                            {(sourceResolution || playingResolution) && (
                                <div className="flex justify-between gap-4">
                                    <span className="text-white/40">Size</span>
                                    <span>
                                        {playingResolution ? `${playingResolution.w}×${playingResolution.h}` : ''}
                                        {playingResolution && sourceResolution && (playingResolution.w !== sourceResolution.w || playingResolution.h !== sourceResolution.h)
                                            ? ` (src: ${sourceResolution.w}×${sourceResolution.h})`
                                            : ''}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Controls bar */}
                <div className={`w-full ${isFullscreen ? 'absolute bottom-4 left-0 right-0 px-4' : 'mt-3'}`}>
                    <div className="flex items-center gap-3 px-4 py-3 bg-black/40 backdrop-blur-sm rounded-xl ring-1 ring-white/10">
                        {/* Quality selector (desktop) */}
                        <QualitySelector
                            currentQuality={effectiveQuality}
                            onChange={handleQualityChange}
                            onToggleAdaptive={() => setAdaptiveMode(!adaptiveMode)}
                            sourceHeight={sourceHeight}
                            adaptiveMode={adaptiveMode}
                        />

                        <div className="flex items-center gap-2 ml-auto">
                            <button
                                onClick={toggleMute}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                            >
                                {isMuted ? <VolumeX className="w-4 h-4" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={isMuted ? 0 : volume}
                                onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                                className="w-20 h-1 rounded-full appearance-none bg-white/20 accent-white cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {currentIndex !== undefined && totalItems !== undefined && totalItems > 1 && (
                    <div className={`text-center mt-2 ${isFullscreen ? 'absolute bottom-20 left-1/2 -translate-x-1/2' : ''}`}>
                        <span className="text-xs text-white/40">{currentIndex + 1} / {totalItems}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
