import React from 'react';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from './ToggleSwitch';

interface ThresholdSliderProps {
    label: string;
    value: number;
    enabled: boolean;
    onChange: (v: number) => void;
    onToggle: (c: boolean) => void;
    max: number;
    isFirst?: boolean;
}

export function ThresholdSlider({ label, value, enabled, onChange, onToggle, max, isFirst }: ThresholdSliderProps) {
    return (
        <div className={cn(
            !enabled && "opacity-40",
            isFirst ? "threshold-option-first" : "threshold-option",
            "disabled-transition"
        )}>
            <div className="threshold-row">
                <p className="threshold-label">{label}</p>
                <span className="option-value-small">{enabled ? value : 'AUTO'}</span>
            </div>
            <div className="slider-row">
                <input
                    type="range"
                    min="0"
                    max={max}
                    disabled={!enabled}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="range-slider"
                    aria-label={label}
                />
                <ToggleSwitch checked={enabled} onChange={onToggle} size="small" />
            </div>
        </div>
    );
}
