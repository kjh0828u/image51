import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface FooterProps {
    autoDownload: boolean;
    onAutoDownloadChange: (checked: boolean) => void;
}

export function Footer({ autoDownload, onAutoDownloadChange }: FooterProps) {
    const { t } = useTranslation();

    return (
        <footer className="footer flex justify-between items-center px-6 py-4 border-t border-white/5 bg-[#0a0a0b]/80 backdrop-blur-md">
            <label className="auto-download-label flex items-center gap-3 cursor-pointer group">
                <input
                    type="checkbox"
                    className="sr-only"
                    checked={autoDownload}
                    onChange={e => onAutoDownloadChange(e.target.checked)}
                    aria-label={t('options.auto_download')}
                />
                <div className={cn(
                    "w-4 h-4 rounded-md border border-white/20 transition-all flex items-center justify-center group-hover:border-indigo-500",
                    autoDownload && "bg-indigo-500 border-indigo-500 shadow-lg shadow-indigo-500/20"
                )}>
                    {autoDownload && <Check className="w-3 h-3 text-white" aria-hidden="true" />}
                </div>
                <span className="text-[11px] font-bold text-gray-500 group-hover:text-gray-300 transition-colors uppercase tracking-wider">{t('options.auto_download')}</span>
            </label>

            <div className="flex flex-col items-end gap-1 opacity-40 hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-black text-white italic uppercase tracking-tighter">Image51 Editor v0.1.0</span>
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">© 2024 Image51 Team. All rights reserved.</span>
            </div>
        </footer>
    );
}

