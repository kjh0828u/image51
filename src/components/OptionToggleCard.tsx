import React from 'react';
import { ToggleSwitch } from './ToggleSwitch';

interface OptionToggleCardProps {
    label: string;
    checked: boolean;
    onChange: (c: boolean) => void;
    children: React.ReactNode;
}

export function OptionToggleCard({ label, checked, onChange, children }: OptionToggleCardProps) {
    return (
        <div className="card-sub">
            <div className="option-toggle-card">
                <span className="toggle-label-muted">{label}</span>
                <ToggleSwitch checked={checked} onChange={onChange} size="small" />
            </div>
            {children}
        </div>
    );
}
