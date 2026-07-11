import { useState } from 'react';
import { Filter, X, ChevronDown, Image, Video, FileText, Music, Archive, File } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface FileFilters {
    mime_type?: string;
    date_from?: string;
    date_to?: string;
    size_min?: number;
    size_max?: number;
    sort?: string;
    order?: string;
}

const MIME_PRESETS = [
    { key: 'image/', label: 'Images', icon: Image },
    { key: 'video/', label: 'Videos', icon: Video },
    { key: 'audio/', label: 'Audio', icon: Music },
    { key: 'application/pdf', label: 'PDF', icon: FileText },
    { key: 'application/zip', label: 'Archives', icon: Archive },
];

const SIZE_PRESETS = [
    { label: '< 1 MB', min: undefined, max: 1024 * 1024 },
    { label: '1–10 MB', min: 1024 * 1024, max: 10 * 1024 * 1024 },
    { label: '10–100 MB', min: 10 * 1024 * 1024, max: 100 * 1024 * 1024 },
    { label: '> 100 MB', min: 100 * 1024 * 1024, max: undefined },
];

interface FilterBarProps {
    filters: FileFilters;
    onFiltersChange: (filters: FileFilters) => void;
    totalResults?: number;
}

export function FilterBar({ filters, onFiltersChange, totalResults }: FilterBarProps) {
    const [expanded, setExpanded] = useState(false);
    const { t } = useTranslation();

    const hasActiveFilters = filters.mime_type || filters.date_from || filters.date_to ||
        filters.size_min != null || filters.size_max != null;

    const activeCount = [
        filters.mime_type,
        filters.date_from || filters.date_to,
        filters.size_min != null || filters.size_max != null
    ].filter(Boolean).length;

    const clearAll = () => {
        onFiltersChange({
            sort: filters.sort,
            order: filters.order
        });
    };

    const toggleMime = (mime: string) => {
        onFiltersChange({
            ...filters,
            mime_type: filters.mime_type === mime ? undefined : mime
        });
    };

    const setDateRange = (from?: string, to?: string) => {
        onFiltersChange({
            ...filters,
            date_from: from,
            date_to: to
        });
    };

    const setSizeRange = (min?: number, max?: number) => {
        const isSame = filters.size_min === min && filters.size_max === max;
        onFiltersChange({
            ...filters,
            size_min: isSame ? undefined : min,
            size_max: isSame ? undefined : max
        });
    };

    return (
        <div className="border-b border-telegram-border bg-telegram-surface/50">
            {/* Toggle row */}
            <div className="flex items-center gap-2 px-6 py-2">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition ${
                        hasActiveFilters
                            ? 'bg-telegram-primary/20 text-telegram-primary'
                            : 'text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'
                    }`}
                >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Filters</span>
                    {activeCount > 0 && (
                        <span className="bg-telegram-primary text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                            {activeCount}
                        </span>
                    )}
                    <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Active filter chips */}
                {hasActiveFilters && (
                    <>
                        {filters.mime_type && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telegram-primary/10 text-telegram-primary text-[11px]">
                                {MIME_PRESETS.find(m => m.key === filters.mime_type)?.label || filters.mime_type}
                                <button onClick={() => onFiltersChange({ ...filters, mime_type: undefined })} className="hover:text-red-400"><X className="w-3 h-3" /></button>
                            </span>
                        )}
                        {(filters.date_from || filters.date_to) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telegram-primary/10 text-telegram-primary text-[11px]">
                                {filters.date_from && filters.date_to
                                    ? `${filters.date_from} → ${filters.date_to}`
                                    : filters.date_from ? `From ${filters.date_from}` : `Until ${filters.date_to}`}
                                <button onClick={() => setDateRange(undefined, undefined)} className="hover:text-red-400"><X className="w-3 h-3" /></button>
                            </span>
                        )}
                        {(filters.size_min != null || filters.size_max != null) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-telegram-primary/10 text-telegram-primary text-[11px]">
                                {SIZE_PRESETS.find(s => s.min === filters.size_min && s.max === filters.size_max)?.label || 'Custom size'}
                                <button onClick={() => setSizeRange(undefined, undefined)} className="hover:text-red-400"><X className="w-3 h-3" /></button>
                            </span>
                        )}
                        <button onClick={clearAll} className="text-[11px] text-telegram-subtext hover:text-red-400 transition ml-1">
                            Clear all
                        </button>
                    </>
                )}

                {totalResults != null && (
                    <span className="text-[11px] text-telegram-subtext ml-auto">
                        {totalResults} file{totalResults !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Expanded filter panel */}
            {expanded && (
                <div className="px-6 pb-3 flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Type filter */}
                    <div>
                        <div className="text-[10px] text-telegram-subtext uppercase tracking-wider mb-1.5">Type</div>
                        <div className="flex flex-wrap gap-1">
                            {MIME_PRESETS.map(preset => {
                                const Icon = preset.icon;
                                const active = filters.mime_type === preset.key;
                                return (
                                    <button
                                        key={preset.key}
                                        onClick={() => toggleMime(preset.key)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
                                            active
                                                ? 'bg-telegram-primary text-white'
                                                : 'bg-telegram-hover text-telegram-subtext hover:text-telegram-text hover:bg-telegram-border'
                                        }`}
                                    >
                                        <Icon className="w-3 h-3" />
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Size filter */}
                    <div>
                        <div className="text-[10px] text-telegram-subtext uppercase tracking-wider mb-1.5">Size</div>
                        <div className="flex flex-wrap gap-1">
                            {SIZE_PRESETS.map(preset => {
                                const active = filters.size_min === preset.min && filters.size_max === preset.max;
                                return (
                                    <button
                                        key={preset.label}
                                        onClick={() => setSizeRange(preset.min, preset.max)}
                                        className={`px-2 py-1 rounded text-xs transition ${
                                            active
                                                ? 'bg-telegram-primary text-white'
                                                : 'bg-telegram-hover text-telegram-subtext hover:text-telegram-text hover:bg-telegram-border'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date filter */}
                    <div>
                        <div className="text-[10px] text-telegram-subtext uppercase tracking-wider mb-1.5">Date</div>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={filters.date_from || ''}
                                onChange={e => setDateRange(e.target.value || undefined, filters.date_to)}
                                className="bg-telegram-hover border border-telegram-border rounded px-2 py-1 text-xs text-telegram-text"
                            />
                            <span className="text-telegram-subtext text-xs">→</span>
                            <input
                                type="date"
                                value={filters.date_to || ''}
                                onChange={e => setDateRange(filters.date_from, e.target.value || undefined)}
                                className="bg-telegram-hover border border-telegram-border rounded px-2 py-1 text-xs text-telegram-text"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
