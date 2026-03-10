'use client';

import { useAppStore } from '@/store/useAppStore';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Plus, Download, ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHandle } from '@/lib/idb';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';
import {
  Glass,
  ToggleSwitch,
  SortablePresetItem,
  GlassDistortionFilter,
  OptionCard,
  SettingsModal,
  Header,
  Footer,
  ImageList,
  ResizeOptionsCard,
  BrushEditor,
} from '@/components';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { usePresetDragDrop } from '@/hooks/usePresetDragDrop';

type Tab = 'batch' | 'individual';

function useHydrate() {
  const [isHydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return isHydrated;
}

export default function Home() {
  const isHydrated = useHydrate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('individual');
  const { t } = useTranslation();

  // 멀티 탭 워크스페이스 상태
  interface TabItem { id: string; url: string; name: string; }
  const [individualTabs, setIndividualTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const individualFileInputRef = useRef<HTMLInputElement>(null);

  const store = useAppStore();
  const { handleStartProcessing, handleDownloadAll, handleSingleDownload } = useImageProcessing();
  const { sensors, handleDragEnd } = usePresetDragDrop();

  useEffect(() => {
    getHandle('customDownloadDir').then(handle => {
      if (handle) store.setCustomDirectoryHandle(handle);
    }).catch(e => console.error('IDB load error', e));

    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsSettingsOpen(false); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) store.addImages(Array.from(e.dataTransfer.files));
  }, [store]);

  const handleSavePreset = useCallback(() => {
    const n = prompt(t('presets.preset_name_prompt'));
    if (n) store.saveProfile(n);
  }, [store, t]);

  const handleUpdatePreset = useCallback((id: string, name: string) => {
    if (confirm(t('presets.update_confirm', { name }))) store.updateProfile(id);
  }, [store, t]);

  const handleRenamePreset = useCallback((id: string, oldName: string) => {
    const newName = prompt(t('presets.rename_prompt'), oldName);
    if (newName && newName.trim()) store.renameProfile(id, newName.trim());
  }, [store, t]);

  const handleDeletePreset = useCallback((id: string, name: string) => {
    if (confirm(t('presets.delete_confirm', { name }))) store.setOption('activeProfileId', null); // 임시 방편 (실제 삭제는 아래)
    // Confirm 로직은 store.deleteProfile(id) 호출용
    if (confirm(t('presets.delete_confirm'))) store.deleteProfile(id);
  }, [store, t]);

  const handleIndividualFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const newTab: TabItem = {
      id: Math.random().toString(36).substring(7),
      url: URL.createObjectURL(file),
      name: file.name
    };
    setIndividualTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const handleCloseTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIndividualTabs(prev => {
      const filtered = prev.filter(t => t.id !== id);
      const target = prev.find(t => t.id === id);
      if (target) URL.revokeObjectURL(target.url);

      if (activeTabId === id) {
        setActiveTabId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
      }
      return filtered;
    });
  }, [activeTabId]);

  const handleIndividualDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      Array.from(e.dataTransfer.files).forEach(file => {
        if (file.type.startsWith('image/')) handleIndividualFile(file);
      });
    }
  }, [handleIndividualFile]);

  if (!isHydrated) return null;

  const pendingCount = store.images.filter(i => i.status === 'pending').length;
  const downloadableCount = store.images.filter(i => i.status === 'done' && !i.isDownloaded).length;

  return (
    <div className="app-container">
      <GlassDistortionFilter />
      <Header onOpenSettings={() => setIsSettingsOpen(true)} activeTab={activeTab} onTabChange={setActiveTab} />
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}

      {/* 일괄 처리 탭 */}
      {activeTab === 'batch' && (
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
                <div className="option-row"><span className="input-label">{t('options.auto_crop_row')}</span><span className="option-value">{store.autoCropMargin}</span></div>
                <input type="range" min="0" max="100" value={store.autoCropMargin} onChange={e => store.setOption('autoCropMargin', Number(e.target.value))} className="range-slider" />
              </OptionCard>

              <OptionCard title={t('options.compress')} subtitle="Compress" headerAction={<ToggleSwitch checked={store.enableCompress} onChange={c => store.setOption('enableCompress', c)} />} disabled={!store.enableCompress}>
                <div className="option-row"><span className="input-label">{t('options.quality_row')}</span><span className="option-value">{store.quality}</span></div>
                <input type="range" min="1" max="100" value={store.quality} onChange={e => store.setOption('quality', Number(e.target.value))} className="range-slider" />
              </OptionCard>

              <ResizeOptionsCard resizeError={resizeError} onResizeErrorChange={setResizeError} />

              <OptionCard title={t('options.grayscale')} subtitle="Grayscale" headerAction={<ToggleSwitch checked={store.enableGrayscale} onChange={c => store.setOption('enableGrayscale', c)} />} disabled={!store.enableGrayscale}>
                <div className="option-row"><span className="input-label">{t('options.grayscale_intensity')}</span><span className="option-value">{store.grayscale}%</span></div>
                <input type="range" min="0" max="100" value={store.grayscale} onChange={e => store.setOption('grayscale', Number(e.target.value))} className="range-slider" />
              </OptionCard>

              <OptionCard title={t('options.format')} subtitle="Format" headerAction={<ToggleSwitch checked={store.enableCustomFormat} onChange={c => store.setOption('enableCustomFormat', c)} />} disabled={!store.enableCustomFormat}>
                <div className="flex gap-2 mt-2">
                  {(['png', 'jpg', 'webp', 'svg'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => store.setOption('customFormat', fmt)}
                      className={cn(
                        "flex-1 h-8 rounded text-xs font-bold transition-all",
                        store.customFormat === fmt ? "bg-indigo-500 text-white" : "bg-white/10 text-gray-400 hover:bg-white/20"
                      )}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </OptionCard>

            </div>

            <div className="floating-actions">
              <button onClick={() => handleStartProcessing(setResizeError)} disabled={pendingCount === 0} className="btn-floating-primary">{t('actions.start_process')}</button>
              {downloadableCount > 0 && (
                <button onClick={() => handleDownloadAll()} className="btn-floating-secondary"><Download className="w-4 h-4" /> {t('actions.batch_download')}</button>
              )}
            </div>
          </div>
        </main>
      )}

      {/* 개별 처리 탭 */}
      {activeTab === 'individual' && (
        <div className="individual-tab-content flex-1 flex flex-col pt-1">
          <div className="flex-1 relative bg-[#0a0a0b]">
            {individualTabs.length > 0 ? (
              individualTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    "absolute inset-0 transition-opacity duration-300",
                    activeTabId === tab.id ? "opacity-100 z-10 block" : "opacity-0 z-0 hidden"
                  )}
                >
                  <BrushEditor
                    tabId={tab.id}
                    imageUrl={tab.url}
                    originalName={tab.name}
                    onImageChange={handleIndividualFile}
                    onReset={() => handleCloseTab(tab.id, { stopPropagation: () => { } } as any)}
                    tabs={individualTabs}
                    activeTabId={activeTabId}
                    setActiveTabId={setActiveTabId}
                    onCloseTab={handleCloseTab}
                    onAddNewTab={() => individualFileInputRef.current?.click()}
                  />
                </div>
              ))
            ) : (
              <BrushEditor
                tabId=""
                imageUrl=""
                originalName=""
                onImageChange={handleIndividualFile}
                onReset={() => { }}
                onAddNewTab={() => individualFileInputRef.current?.click()}
              />
            )}
          </div>
          <input
            ref={individualFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                Array.from(e.target.files).forEach(file => handleIndividualFile(file));
              }
              e.target.value = '';
            }}
          />
        </div>
      )}

      {activeTab === 'batch' && (
        <Footer autoDownload={store.autoDownloadAfterProcessing} onAutoDownloadChange={c => store.setOption('autoDownloadAfterProcessing', c)} />
      )}
    </div>
  );
}

