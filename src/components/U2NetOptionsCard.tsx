'use client';

import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { OptionCard } from './OptionCard';
import { ToggleSwitch } from './ToggleSwitch';

export function U2NetOptionsCard() {
  const store = useAppStore();

  return (
    <OptionCard
      title="배경 제거 v2"
      subtitle="U2-Net"
      className="options-grid-full"
      contentClassName="bg-removal-content"
      headerAction={<ToggleSwitch checked={store.enableU2NetRemoval} onChange={c => store.setOption('enableU2NetRemoval', c)} />}
      disabled={!store.enableU2NetRemoval}
    >
      <p className="input-label u2net-desc">u2net 모델 기반 배경 제거. 인물 사진엔 인물 특화 모드를 권장합니다.</p>
      <div className="grid-cols-2-gap">
        {(['general', 'human'] as const).map((m) => (
          <label key={m} className="modal-option-item u2net-option-label">
            <input type="radio" className="hidden" checked={store.u2netModel === m} onChange={() => store.setOption('u2netModel', m)} disabled={!store.enableU2NetRemoval} />
            <div className={cn("radio-custom", store.u2netModel === m && "radio-custom-checked")}>
              {store.u2netModel === m && <div className="radio-custom-inner" />}
            </div>
            <span className="modal-option-text">{m === 'general' ? '범용 (U2-Net)' : '인물 특화 (U2-Net Human)'}</span>
          </label>
        ))}
      </div>
    </OptionCard>
  );
}
