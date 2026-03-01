'use client';

import { Settings, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Glass } from './Glass';
import { useAppStore } from '@/store/useAppStore';
import { setHandle } from '@/lib/idb';

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
                            <h2 className="modal-title">환경 설정</h2>
                        </div>
                        <button onClick={onClose} className="modal-close-btn">✕</button>
                    </div>

                    {/* Content */}
                    <div className="modal-body">
                        {/* Download Mode */}
                        <div className="modal-section">
                            <h3 className="modal-section-title">다운로드 저장 방식</h3>
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
                                            {mode === 'default' ? '브라우저 다운로드 (Zip 압축)' : '특정 폴더에 직접 저장'}
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
                                    📁 저장 폴더 지정하기
                                </button>
                                {store.customDirectoryHandle && (
                                    <p className="modal-folder-success">
                                        <Check className="w-3.5 h-3.5" />지정됨: {store.customDirectoryHandle.name}
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
