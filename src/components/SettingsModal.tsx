'use client';

import { Settings, Check, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Glass } from './Glass';
import { useAppStore } from '@/store/useAppStore';
import { setHandle } from '@/lib/idb';
import { useTranslation } from 'react-i18next';

interface SettingsModalProps {
    onClose: () => void;
}

/**
 * SettingsModal 컴포넌트
 * 
 * 앱의 다운로드 방식 및 저장 폴더 설정을 담당하는 모달입니다.
 */
export function SettingsModal({ onClose }: SettingsModalProps) {
    const store = useAppStore();
    const { t } = useTranslation();

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <Glass variant="thick" className="modal-content" contentClassName="glass-content modal-glass-content">
                    {/* Header */}
                    <div className="modal-header">
                        <div className="modal-header-left">
                            <div className="modal-icon-container">
                                <Settings className="modal-icon" />
                            </div>
                            <h2 className="modal-title">{t('common.settings')}</h2>
                        </div>
                        <button onClick={onClose} className="modal-close-btn">✕</button>
                    </div>

                    {/* Content */}
                    <div className="modal-body">
                        {/* Language Selection */}
                        <div className="modal-section">
                            <h3 className="modal-section-title flex items-center gap-2">
                                <Globe className="w-4 h-4 opacity-70" />
                                {t('common.language')}
                            </h3>
                            <div className="flex gap-2 mt-2">
                                {(['auto', 'ko', 'en'] as const).map((lang) => (
                                    <button
                                        key={lang}
                                        onClick={() => store.setLanguage(lang)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-sm transition-all border",
                                            store.language === lang
                                                ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200"
                                                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                                        )}
                                    >
                                        {t(`common.${lang === 'auto' ? 'auto' : lang === 'ko' ? 'korean' : 'english'}`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Download Mode */}
                        <div className="modal-section">
                            <h3 className="modal-section-title">{t('settings.download_mode')}</h3>
                            <div>
                                {(['default', 'custom'] as const).map((mode) => (
                                    <label key={mode} className="modal-option-item">
                                        <input
                                            type="radio"
                                            className="hidden"
                                            checked={store.downloadMode === mode}
                                            onChange={() => store.setOption('downloadMode', mode)}
                                        />
                                        <div className={cn("radio-custom", store.downloadMode === mode && "radio-custom-checked")}>
                                            {store.downloadMode === mode && <div className="radio-custom-inner" />}
                                        </div>
                                        <span className="modal-option-text">
                                            {mode === 'default' ? t('settings.default_mode') : t('settings.custom_mode')}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Custom Folder Picker */}
                        {store.downloadMode === 'custom' && (
                            <div className="modal-folder-section">
                                <button
                                    onClick={async () => {
                                        try {
                                            const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
                                            store.setCustomDirectoryHandle(handle);
                                            await setHandle('customDownloadDir', handle);
                                        } catch (err) {
                                            console.error('Folder picker cancelled or failed', err);
                                        }
                                    }}
                                    className="btn-folder"
                                >
                                    📁 {t('settings.change_folder')}
                                </button>
                                {store.customDirectoryHandle && (
                                    <p className="modal-folder-success">
                                        <Check className="w-3.5 h-3.5" />{t('settings.folder_unselected')} {store.customDirectoryHandle.name}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </Glass>
            </div>
        </div>
    );
}

