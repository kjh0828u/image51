'use client';

import { useAppStore } from '@/store/useAppStore';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Plus, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHandle } from '@/lib/idb';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
  MediaPipeBgRemovalOptionsCard,
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
  const [activeTab, setActiveTab] = useState<Tab>('batch');
  const [individualImage, setIndividualImage] = useState<string | null>(null);
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
    const n = prompt('이름:');
    if (n) store.saveProfile(n);
  }, [store]);

  const handleUpdatePreset = useCallback((id: string, name: string) => {
    if (confirm(`현재 설정을 '${name}' 프리셋에 덮어씌우겠습니까?`)) store.updateProfile(id);
  }, [store]);

  const handleRenamePreset = useCallback((id: string, oldName: string) => {
    const newName = prompt('프리셋 이름 수정:', oldName);
    if (newName && newName.trim()) store.renameProfile(id, newName.trim());
  }, [store]);

  const handleDeletePreset = useCallback((id: string, name: string) => {
    if (confirm(`'${name}' 프리셋을 삭제하시겠습니까?`)) store.deleteProfile(id);
  }, [store]);

  const handleIndividualFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (individualImage) URL.revokeObjectURL(individualImage);
    setIndividualImage(URL.createObjectURL(file));
  }, [individualImage]);

  const handleIndividualDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleIndividualFile(file);
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
              <h2 className="section-title">이미지 업로드</h2>
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
                      <p className="upload-text">Click or<br /><span className="upload-text-accent">drag & drop</span></p>
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
                <span>프리셋 관리</span>
                <div className="section-header-actions">
                  <button onClick={handleSavePreset} className="btn-icon section-header-btn"><Plus className="w-3.5 h-3.5" /></button>
                </div>
              </h2>
              <Glass variant="thick" className="glass-profile-section" contentClassName="glass-content glass-profile-content">
                <div className="liquidGlass-effect"></div>
                <div className="preset-list custom-scrollbar">
                  {store.profiles.length === 0 ? (
                    <p className="empty-state">옵션 구성을 프리셋으로 저장해 보세요.</p>
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
            <h2 className="section-title">변환 옵션</h2>
            <div className="options-grid">
              <OptionCard title="자동 여백 제거" subtitle="Auto Crop" headerAction={<ToggleSwitch checked={store.enableAutoCrop} onChange={c => store.setOption('enableAutoCrop', c)} />} disabled={!store.enableAutoCrop}>
                <div className="option-row"><span className="input-label">여백을 없애고 사물에 맞게 조정</span><span className="option-value">{store.autoCropMargin}</span></div>
                <input type="range" min="0" max="100" value={store.autoCropMargin} onChange={e => store.setOption('autoCropMargin', Number(e.target.value))} className="range-slider" />
              </OptionCard>

              <OptionCard title="이미지 품질 압축" subtitle="Compress" headerAction={<ToggleSwitch checked={store.enableCompress} onChange={c => store.setOption('enableCompress', c)} />} disabled={!store.enableCompress}>
                <div className="option-row"><span className="input-label">품질 (%)</span><span className="option-value">{store.quality}</span></div>
                <input type="range" min="1" max="100" value={store.quality} onChange={e => store.setOption('quality', Number(e.target.value))} className="range-slider" />
              </OptionCard>

              <ResizeOptionsCard resizeError={resizeError} onResizeErrorChange={setResizeError} />

              <OptionCard title="흑백 필터 전환" subtitle="Grayscale" headerAction={<ToggleSwitch checked={store.enableGrayscale} onChange={c => store.setOption('enableGrayscale', c)} />} disabled={!store.enableGrayscale}>
                <div className="option-row"><span className="input-label">강도 (%)</span><span className="option-value">{store.grayscale}%</span></div>
                <input type="range" min="0" max="100" value={store.grayscale} onChange={e => store.setOption('grayscale', Number(e.target.value))} className="range-slider" />
              </OptionCard>

              <MediaPipeBgRemovalOptionsCard />
            </div>

            <div className="floating-actions">
              <button onClick={() => handleStartProcessing(setResizeError)} disabled={pendingCount === 0} className="btn-floating-primary">변환 시작</button>
              {downloadableCount > 0 && (
                <button onClick={() => handleDownloadAll()} className="btn-floating-secondary"><Download className="w-4 h-4" /> 일괄 다운로드</button>
              )}
            </div>
          </div>
        </main>
      )}

      {/* 개별 처리 탭 */}
      {activeTab === 'individual' && (
        <div className="individual-tab-content">
          {individualImage ? (
            <BrushEditor
              imageUrl={individualImage}
              onReset={() => {
                URL.revokeObjectURL(individualImage);
                setIndividualImage(null);
              }}
            />
          ) : (
            <div
              className="individual-upload-area"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleIndividualDrop}
              onClick={() => individualFileInputRef.current?.click()}
            >
              <Glass
                variant="bright"
                className="glass-interactive individual-upload-glass"
                contentClassName="glass-content individual-upload-content"
              >
                <div className="liquidGlass-effect"></div>
                <div className="upload-icon-container"><Plus className="w-10 h-10" /></div>
                <p className="upload-text">
                  이미지를 업로드하세요<br />
                  <span className="upload-text-accent">마법봉으로 배경을 정밀 제거</span>
                </p>
                <p className="individual-upload-hint">PNG · JPG · WEBP</p>
              </Glass>
              <input
                ref={individualFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleIndividualFile(file);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'batch' && (
        <Footer autoDownload={store.autoDownloadAfterProcessing} onAutoDownloadChange={c => store.setOption('autoDownloadAfterProcessing', c)} />
      )}
    </div>
  );
}
