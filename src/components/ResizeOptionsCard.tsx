'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { OptionCard } from './OptionCard';
import { ToggleSwitch } from './ToggleSwitch';
import { useTranslation } from 'react-i18next';

interface ResizeOptionsCardProps {
  resizeError: string | null;
  onResizeErrorChange: (msg: string | null) => void;
}

export function ResizeOptionsCard({ resizeError, onResizeErrorChange }: ResizeOptionsCardProps) {
  const store = useAppStore();
  const [ratioTooltip, setRatioTooltip] = useState<{ type: 'w' | 'h'; msg: string } | null>(null);
  const { t } = useTranslation();

  const createResizeHandler = (type: 'w' | 'h') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    const otherVal = type === 'w' ? store.resizeHeight : store.resizeWidth;
    if (store.keepRatio && otherVal.trim() !== '' && val !== '') {
      const otherLabel = type === 'w' ? t('options.height') : t('options.width');
      setRatioTooltip({ type, msg: t('options.resize_tooltip', { otherLabel }) });
      setTimeout(() => setRatioTooltip(null), 3000);
      return;
    }
    store.setOption(type === 'w' ? 'resizeWidth' : 'resizeHeight', val);
    onResizeErrorChange(null);
  };

  return (
    <OptionCard
      title={t('options.resize')}
      subtitle="Resize"
      className="resize-card"
      headerAction={<ToggleSwitch checked={store.enableResize} onChange={c => store.setOption('enableResize', c)} />}
      disabled={!store.enableResize}
    >
      <div className="grid-cols-2-gap">
        <div className="form-field">
          <p className="input-label">{t('options.width')}</p>
          <input
            type="text"
            value={store.resizeWidth}
            onChange={createResizeHandler('w')}
            className="input-field"
            placeholder={t("options.auto_placeholder")}
            aria-label={t('options.width')}
          />
        </div>
        <div className="form-field">
          <p className="input-label">{t('options.height')}</p>
          <input
            type="text"
            value={store.resizeHeight}
            onChange={createResizeHandler('h')}
            className="input-field"
            placeholder={t("options.auto_placeholder")}
            aria-label={t('options.height')}
          />
        </div>
        <div className="grid-span-2 option-row">
          <span className="toggle-label-muted">{t('options.keep_ratio')}</span>
          <ToggleSwitch checked={store.keepRatio} onChange={c => store.setOption('keepRatio', c)} size="small" />
        </div>
      </div>
      {ratioTooltip && <div className="tooltip">⚠️ {ratioTooltip.msg}</div>}
      {resizeError && <p className="error-message">{resizeError}</p>}
    </OptionCard>
  );
}

