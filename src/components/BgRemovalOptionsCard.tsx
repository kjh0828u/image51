'use client';

import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { OptionCard } from './OptionCard';
import { OptionToggleCard } from './OptionToggleCard';
import { ToggleSwitch } from './ToggleSwitch';
import { ThresholdSlider } from './ThresholdSlider';

export function BgRemovalOptionsCard() {
  const store = useAppStore();

  return (
    <OptionCard
      title="배경 제거"
      subtitle="Remove bg"
      className="options-grid-full"
      contentClassName="bg-removal-content"
      headerAction={<ToggleSwitch checked={store.enableBgRemoval} onChange={c => store.setOption('enableBgRemoval', c)} />}
      disabled={!store.enableBgRemoval}
    >
      <div className="grid-cols-2-gap-lg">
        <div className="card-sub">
          <div className="card-sub-content">
            <p className="card-header-title-with-icon">
              고급 옵션<span className="card-header-subtitle-inline">(Advanced)</span>
            </p>
            <ToggleSwitch checked={store.detailRemoval} onChange={c => store.setOption('detailRemoval', c)} size="small" />
          </div>
          <div className={cn(!store.detailRemoval && "opacity-20 pointer-events-none", "disabled-transition")}>
            <div className="toggle-row">
              <span className="toggle-label">경계 부드럽게</span>
              <ToggleSwitch checked={store.alphaMatting} onChange={c => store.setOption('alphaMatting', c)} size="small" />
            </div>
            <div className={cn(!store.alphaMatting && "opacity-30 pointer-events-none", "advanced-section disabled-transition")}>
              <ThresholdSlider label="피사체 감도" value={store.fgThreshold} enabled={store.enableFgThreshold} onChange={v => store.setOption('fgThreshold', v)} onToggle={c => store.setOption('enableFgThreshold', c)} max={255} isFirst />
              <ThresholdSlider label="배경 허용치" value={store.bgThreshold} enabled={store.enableBgThreshold} onChange={v => store.setOption('bgThreshold', v)} onToggle={c => store.setOption('enableBgThreshold', c)} max={50} />
              <ThresholdSlider label="경계 정리" value={store.erodeSize} enabled={store.enableErodeSize} onChange={v => store.setOption('erodeSize', v)} onToggle={c => store.setOption('enableErodeSize', c)} max={20} />
            </div>
          </div>
        </div>
        <div className="sub-options-container">
          <OptionToggleCard label="가짜 투명 패턴 제거" checked={store.fakeTransRemoval} onChange={c => store.setOption('fakeTransRemoval', c)}>
            <div className={cn(!store.fakeTransRemoval && "opacity-20 pointer-events-none", "slider-row-wide disabled-transition")}>
              <input type="range" min="0" max="100" value={store.fakeTransTolerance} onChange={e => store.setOption('fakeTransTolerance', Number(e.target.value))} className="range-slider" />
              <span className="slider-value">{store.fakeTransTolerance}</span>
            </div>
          </OptionToggleCard>
          <OptionToggleCard label="이미지 내부 배경 제거" checked={store.removeMatchBg} onChange={c => store.setOption('removeMatchBg', c)}>
            <div className={cn(!store.removeMatchBg && "opacity-20 pointer-events-none", "slider-row-wide disabled-transition")}>
              <input type="range" min="0" max="100" value={store.removeMatchBgTolerance} onChange={e => store.setOption('removeMatchBgTolerance', Number(e.target.value))} className="range-slider" />
              <span className="slider-value">{store.removeMatchBgTolerance}</span>
            </div>
          </OptionToggleCard>
        </div>
      </div>
    </OptionCard>
  );
}
