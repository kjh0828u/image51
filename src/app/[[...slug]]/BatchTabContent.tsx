'use client';

import { Plus, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';
import {
  Glass,
  ImageList,
  OptionCard,
  ResizeOptionsCard,
  SortablePresetItem,
  ToggleSwitch,
} from '@/components';

interface BatchTabContentProps {
  store: any;
  t: any;
  handleDragOver: any;
  handleDrop: any;
  fileInputRef: any;
  handleSingleDownload: any;
  handleSavePreset: any;
  sensors: any;
  handleDragEnd: any;
  handleUpdatePreset: any;
  handleRenamePreset: any;
  handleDeletePreset: any;
  handleStartProcessing: any;
  setResizeError: any;
  pendingCount: number;
  downloadableCount: number;
  handleDownloadAll: any;
}

export default function BatchTabContent({
  store, t, handleDragOver, handleDrop, fileInputRef,
  handleSingleDownload, handleSavePreset, sensors, handleDragEnd,
  handleUpdatePreset, handleRenamePreset, handleDeletePreset,
  handleStartProcessing, setResizeError, pendingCount,
  downloadableCount, handleDownloadAll
}: BatchTabContentProps) {
  return (
    <main className="main-content">
      <div className="sidebar custom-scrollbar">
        <section>
          <h2 className="section-title">{t('sidebar.upload_title')}</h2>
          <div onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
            <Glass
              variant="bright"
              className={cn('glass-interactive glass-upload', store.images.length === 0 ? 'upload-zone upload-zone-empty' : 'upload-zone upload-zone-with-files')}
              contentClassName={store.images.length === 0 ? 'glass-content upload-zone upload-zone-empty' : 'glass-content upload-zone upload-zone-with-files'}
            >
              <div className="liquidGlass-effect"></div>
              {store.images.length === 0 ? (
                <>
                  <div className="upload-icon-container"><Plus className="w-10 h-10" /></div>
                  <p className="upload-text">{t('sidebar.click_or_drag')}</p>
                </>
              ) : (
                <ImageList
                  images={store.images}
                  onRemove={store.removeImage}
                  onClear={store.clearImages}
                  onDownload={handleSingleDownload}
                  onAddFiles={() => fileInputRef.current?.click()}
                />
              )}
              <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files) store.addImages(Array.from(e.target.files)); e.target.value = ''; }} />
            </Glass>
          </div>
        </section>

        <section>
          <h2 className="section-title section-header-with-action">
            <span>{t('sidebar.preset_title')}</span>
            <div className="section-header-actions">
              <button onClick={handleSavePreset} className="btn-icon section-header-btn"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </h2>
          <Glass variant="thick" className="glass-profile-section" contentClassName="glass-content glass-profile-content">
            <div className="liquidGlass-effect"></div>
            <div className="preset-list custom-scrollbar">
              {store.profiles.length === 0 ? (
                <p className="empty-state">{t('presets.no_presets_desc')}</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={store.profiles.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    {store.profiles.map(p => (
                      <SortablePresetItem
                        key={p.id} p={p} isActive={store.activeProfileId === p.id} onLoad={store.loadProfile}
                        onUpdate={handleUpdatePreset}
                        onRename={handleRenamePreset}
                        onDelete={handleDeletePreset}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </Glass>
        </section>
      </div>

      <div className="content-area custom-scrollbar">
        <h2 className="section-title">{t('common.batch')}</h2>
        <div className="options-grid">
          <OptionCard title={t('options.auto_crop')} subtitle="Auto Crop" headerAction={<ToggleSwitch checked={store.enableAutoCrop} onChange={c => store.setOption('enableAutoCrop', c)} />} disabled={!store.enableAutoCrop}>
            <div className="option-row">
              <label htmlFor="batch-auto-crop-margin" className="input-label">{t('options.auto_crop_row')}</label>
              <span className="option-value">{store.autoCropMargin}</span>
            </div>
            <input id="batch-auto-crop-margin" type="range" min="0" max="100" value={store.autoCropMargin} onChange={e => store.setOption('autoCropMargin', Number(e.target.value))} className="range-slider" />
          </OptionCard>

          <OptionCard title={t('options.compress')} subtitle="Compress" headerAction={<ToggleSwitch checked={store.enableCompress} onChange={c => store.setOption('enableCompress', c)} />} disabled={!store.enableCompress}>
            <div className="option-row">
              <label htmlFor="batch-quality" className="input-label">{t('options.quality_row')}</label>
              <span className="option-value">{store.quality}</span>
            </div>
            <input id="batch-quality" type="range" min="1" max="100" value={store.quality} onChange={e => store.setOption('quality', Number(e.target.value))} className="range-slider" />
          </OptionCard>

          <ResizeOptionsCard resizeError={null} onResizeErrorChange={() => { }} />

          <OptionCard title={t('options.grayscale')} subtitle="Grayscale" headerAction={<ToggleSwitch checked={store.enableGrayscale} onChange={c => store.setOption('enableGrayscale', c)} />} disabled={!store.enableGrayscale}>
            <div className="option-row">
              <label htmlFor="batch-grayscale" className="input-label">{t('options.grayscale_intensity')}</label>
              <span className="option-value">{store.grayscale}%</span>
            </div>
            <input id="batch-grayscale" type="range" min="0" max="100" value={store.grayscale} onChange={e => store.setOption('grayscale', Number(e.target.value))} className="range-slider" />
          </OptionCard>

          <OptionCard title={t('options.format')} subtitle="Format" headerAction={<ToggleSwitch checked={store.enableCustomFormat} onChange={c => store.setOption('enableCustomFormat', c)} />} disabled={!store.enableCustomFormat}>
            <div className="flex gap-2 mt-2">
              {(['png', 'jpg', 'webp', 'svg'] as const).map(fmt => (
                <button
                  key={fmt}
                  disabled={!store.enableCustomFormat}
                  onClick={() => store.setOption('customFormat', fmt)}
                  className={cn(
                    "flex-1 h-8 rounded text-xs font-bold transition-all",
                    store.enableCustomFormat
                      ? (store.customFormat === fmt ? "bg-indigo-500 text-white shadow-lg" : "bg-white/10 text-gray-400 hover:bg-white/20")
                      : "bg-white/5 text-gray-600 cursor-not-allowed"
                  )}
                  aria-label={`${t('options.format')} ${fmt.toUpperCase()}`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </OptionCard>
        </div>

        <div className="floating-actions">
          <button
            onClick={() => handleStartProcessing(setResizeError)}
            disabled={pendingCount === 0}
            className="btn-floating-primary"
            aria-label={t('actions.start_process')}
          >
            {t('actions.start_process')}
          </button>
          {downloadableCount > 0 && (
            <button
              onClick={() => handleDownloadAll()}
              className="btn-floating-secondary"
              aria-label={t('actions.batch_download')}
            >
              <Download className="w-4 h-4" aria-hidden="true" /> {t('actions.batch_download')}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
