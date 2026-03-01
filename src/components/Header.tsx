import React from 'react';
import { Settings } from 'lucide-react';

interface HeaderProps {
    onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
    return (
        <header className="header">
            <div className="header-inner">
                <div className="header-brand">
                    <img src="/logo.png" alt="Image51" className="header-logo" />
                    <h1 className="header-title">Image51</h1>
                </div>

                <button onClick={onOpenSettings} className="btn-glass">
                    <Settings className="w-4 h-4" />
                    환경 설정
                </button>
            </div>
        </header>
    );
}
