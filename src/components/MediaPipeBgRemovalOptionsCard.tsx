'use client';

import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { OptionCard } from './OptionCard';
import { ToggleSwitch } from './ToggleSwitch';

export function MediaPipeBgRemovalOptionsCard() {
    const store = useAppStore();

    return (
        <OptionCard
            title="배경 지우기"
            subtitle="Remove background"
            className="options-grid-full"
            contentClassName="bg-removal-content"
            headerAction={<ToggleSwitch checked={store.enableBgRemoval} onChange={c => store.setOption('enableBgRemoval', c)} />}
            disabled={!store.enableBgRemoval}
        >
            <p className="input-label u2net-desc">MediaPipe Selfie Segmentation 모델을 사용합니다. 인물 탐지에 최적화되어 있습니다.</p>
            <div className="grid-cols-2-gap mt-3">
                {(['general', 'landscape'] as const).map((m) => (
                    <label key={m} className="modal-option-item u2net-option-label">
                        <input
                            type="radio"
                            className="hidden"
                            checked={store.mediaPipeModel === m}
                            onChange={() => store.setOption('mediaPipeModel', m)}
                            disabled={!store.enableBgRemoval}
                        />
                        <div className={cn("radio-custom", store.mediaPipeModel === m && "radio-custom-checked")}>
                            {store.mediaPipeModel === m && <div className="radio-custom-inner" />}
                        </div>
                        <span className="modal-option-text">
                            {m === 'general' ? 'General (기본 모델)' : 'Landscape (전신/원거리)'}
                        </span>
                    </label>
                ))}
            </div>
        </OptionCard>
    );
}

