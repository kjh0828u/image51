import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FooterProps {
    autoDownload: boolean;
    onAutoDownloadChange: (checked: boolean) => void;
}

export function Footer({ autoDownload, onAutoDownloadChange }: FooterProps) {
    return (
        <footer className="app-footer">
            <label className="auto-download-label">
                <input
                    type="checkbox"
                    className="hidden"
                    checked={autoDownload}
                    onChange={e => onAutoDownloadChange(e.target.checked)}
                />
                <div className={cn("checkbox-custom", autoDownload && "checkbox-custom-checked")}>
                    {autoDownload && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="auto-download-text">AUTO DOWNLOAD</span>
            </label>
        </footer>
    );
}
