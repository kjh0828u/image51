import React from 'react';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Tab = 'batch' | 'individual';

interface HeaderProps {
    onOpenSettings: () => void;
    activeTab: Tab;
    onTabChange: (tab: Tab) => void;
}

export function Header({ onOpenSettings, activeTab, onTabChange }: HeaderProps) {
    const { t } = useTranslation();

    return (
        <header className="header">
            <div className="header-inner">
                <div className="header-brand">
                    <img src="/logo.png" alt="Image51" className="header-logo" />
                    <img src="/logo_typo.png" alt="Image51" className="header-typo" />
                    <h1 className="sr-only">
                        {t('seo.title')}
                    </h1>
                </div>

                <div className="header-center">
                    <div className="header-tab-pill">
                        <button
                            onClick={() => onTabChange('individual')}
                            className={`header-tab-item ${activeTab === 'individual' ? 'header-tab-active' : ''}`}
                        >
                            {t('header.edit')}
                        </button>
                        <button
                            onClick={() => onTabChange('batch')}
                            className={`header-tab-item ${activeTab === 'batch' ? 'header-tab-active' : ''}`}
                        >
                            {t('header.batch')}
                        </button>
                    </div>
                </div>

                <div className="header-end">
                    <button onClick={onOpenSettings} className="btn-glass" aria-label={t('common.settings')}>
                        <Settings className="w-4 h-4" aria-hidden="true" />
                        {t('common.settings')}
                    </button>
                </div>
            </div>
        </header>
    );
}

