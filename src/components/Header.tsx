import React from 'react';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Tab = 'batch' | 'individual';

interface HeaderProps {
    onOpenSettings: () => void;
    activeTab: Tab;
    onTabChange: (tab: Tab) => void;
}

import Image from 'next/image';

export function Header({ onOpenSettings, activeTab, onTabChange }: HeaderProps) {
    const { t } = useTranslation();

    return (
        <header className="header">
            <div className="header-inner">
                <div className="header-brand">
                    <Image src="/logo-opt.webp" alt="Image51" width={43} height={43} className="header-logo" priority />
                    <Image src="/logo_typo-opt.webp" alt="Image51 文字" width={110} height={37} className="header-typo" priority />
                    <h1 className="sr-only">
                        {t('seo.title')}
                    </h1>
                </div>

                <div className="header-center">
                    <div className="header-tab-pill" role="tablist">
                        <button
                            onClick={() => onTabChange('individual')}
                            className={`header-tab-item ${activeTab === 'individual' ? 'header-tab-active' : ''}`}
                            role="tab"
                            aria-selected={activeTab === 'individual'}
                            aria-label={t('header.edit')}
                        >
                            {t('header.edit')}
                        </button>
                        <button
                            onClick={() => onTabChange('batch')}
                            className={`header-tab-item ${activeTab === 'batch' ? 'header-tab-active' : ''}`}
                            role="tab"
                            aria-selected={activeTab === 'batch'}
                            aria-label={t('header.batch')}
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

