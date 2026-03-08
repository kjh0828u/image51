import React from 'react';
import { Settings } from 'lucide-react';

type Tab = 'batch' | 'individual';

interface HeaderProps {
    onOpenSettings: () => void;
    activeTab: Tab;
    onTabChange: (tab: Tab) => void;
}

export function Header({ onOpenSettings, activeTab, onTabChange }: HeaderProps) {
    return (
        <header className="header">
            <div className="header-inner">
                <div className="header-brand">
                    <img src="/logo.png" alt="Image51" className="header-logo" />
                    <img src="/logo_typo.png" alt="Image51" className="header-typo" />
                    <h1 className="sr-only">Image51</h1>
                </div>

                <div className="header-center">
                    <div className="header-tab-pill">
                        <button
                            onClick={() => onTabChange('batch')}
                            className={`header-tab-item ${activeTab === 'batch' ? 'header-tab-active' : ''}`}
                        >
                            일괄 처리
                        </button>
                        <button
                            onClick={() => onTabChange('individual')}
                            className={`header-tab-item ${activeTab === 'individual' ? 'header-tab-active' : ''}`}
                        >
                            개별 편집
                        </button>
                    </div>
                </div>

                <div className="header-end">
                    <button onClick={onOpenSettings} className="btn-glass">
                        <Settings className="w-4 h-4" />
                        환경 설정
                    </button>
                </div>
            </div>
        </header>
    );
}
