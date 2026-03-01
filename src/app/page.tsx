'use client';

import { useAppStore } from '@/store/useAppStore';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Plus, Trash2, Download, Check, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { processImage } from '@/lib/imageProcessor';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getHandle, setHandle } from '@/lib/idb';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Glass, ToggleSwitch, SortablePresetItem, GlassDistortionFilter, OptionCard, SettingsModal } from '@/components';

import {
  verifyPermission,
  getUniqueFileHandle,
  getDownloadFilename,
  downloadSingleImage,
  downloadAsZip,
  formatBytes,
  getFilenameParts
} from '@/lib/fileUtils';

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
  const [ratioTooltip, setRatioTooltip] = useState<{ type: 'w' | 'h', msg: string } | null>(null);

  const store = useAppStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = store.profiles.findIndex((p) => p.id === active.id);
      const newIndex = store.profiles.findIndex((p) => p.id === over.id);
      store.reorderProfiles(oldIndex, newIndex);
    }
  };

  useEffect(() => {
    getHandle('customDownloadDir').then(handle => {
      if (handle) store.setCustomDirectoryHandle(handle);
    }).catch(e => console.error("IDB load error", e));
  }, []);

  // ESC 키로 환경설정 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSettingsOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      store.addImages(Array.from(e.dataTransfer.files));
    }
  }, [store]);

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (store.keepRatio && store.resizeHeight.trim() !== '' && val !== '') {
      setRatioTooltip({ type: 'w', msg: '비율 유지 중입니다. 수정하려면 세로 값을 지워주세요.' });
      setTimeout(() => setRatioTooltip(null), 3000);
      return;
    }
    store.setOption('resizeWidth', val);
    setResizeError(null);
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (store.keepRatio && store.resizeWidth.trim() !== '' && val !== '') {
      setRatioTooltip({ type: 'h', msg: '비율 유지 중입니다. 수정하려면 가로 값을 지워주세요.' });
      setTimeout(() => setRatioTooltip(null), 3000);
      return;
    }
    store.setOption('resizeHeight', val);
    setResizeError(null);
  };

  const handleStartProcessing = async () => {
    if (store.enableResize && !store.resizeWidth.trim() && !store.resizeHeight.trim()) {
      setResizeError('가로 또는 세로 크기를 한 개 이상 입력해주세요.');
      return;
    }
    setResizeError(null);

    const pendingImages = store.images.filter(img => img.status === 'pending');
    if (pendingImages.length === 0) return;

    for (const img of pendingImages) {
      store.updateImageStatus(img.id, { status: 'processing' });
      try {
        const resultUrl = await processImage(img.file, store);
        const req = await fetch(resultUrl);
        const blob = await req.blob();

        store.updateImageStatus(img.id, {
          status: 'done',
          processedUrl: resultUrl,
          processedSize: blob.size,
        });
      } catch (err) {
        console.error(err);
        store.updateImageStatus(img.id, { status: 'error' });
      }
    }

    if (useAppStore.getState().autoDownloadAfterProcessing) {
      await handleDownloadAll({ skipPermissionRequest: true });
    }
  };

  const handleDownloadAll = async ({ skipPermissionRequest = false }: { skipPermissionRequest?: boolean } = {}) => {
    const targetImages = useAppStore.getState().images.filter(img => img.status === 'done' && img.processedUrl && !img.isDownloaded);
    if (targetImages.length === 0) return;

    // Check custom directory handle
    let dirHandle = null;
    if (store.downloadMode === 'custom' && store.customDirectoryHandle) {
      const hasPerm = await verifyPermission(store.customDirectoryHandle, true, !skipPermissionRequest);
      if (hasPerm) {
        const d = new Date();
        const folderName = `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dirHandle = await (store.customDirectoryHandle as any).getDirectoryHandle(folderName, { create: true });
      }
    }

    if (dirHandle) {
      for (const img of targetImages) {
        if (!img.processedUrl) continue;
        try {
          const response = await fetch(img.processedUrl);
          const blob = await response.blob();
          const baseName = getDownloadFilename(img.file.name, blob.type);

          // 중복 확인 및 유니크한 핸들 획득
          const fileHandle = await getUniqueFileHandle(dirHandle, baseName);

          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          useAppStore.getState().updateImageStatus(img.id, { isDownloaded: true });
        } catch (err) {
          console.error(err);
        }
      }
    } else {
      if (targetImages.length === 1) {
        handleSingleDownload(targetImages[0]);
        return;
      }
      const zip = new JSZip();
      const nameCounts: Record<string, number> = {};

      for (const img of targetImages) {
        if (!img.processedUrl) continue;
        const response = await fetch(img.processedUrl);
        const blob = await response.blob();

        let filename = getDownloadFilename(img.file.name, blob.type);

        // Zip 내파일명 중복 체크
        if (nameCounts[filename]) {
          const { base, ext } = getFilenameParts(filename);
          const newName = `${base}_${nameCounts[filename]}${ext}`;
          nameCounts[filename]++;
          filename = newName;
        } else {
          nameCounts[filename] = 1;
        }

        zip.file(filename, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'image51_converted.zip');
      targetImages.forEach(img => useAppStore.getState().updateImageStatus(img.id, { isDownloaded: true }));
    }
  };

  const handleSingleDownload = async (img: any) => {
    if (!img.processedUrl) return;
    const response = await fetch(img.processedUrl);
    const blob = await response.blob();
    const filename = getDownloadFilename(img.file.name, blob.type);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    useAppStore.getState().updateImageStatus(img.id, { isDownloaded: true });
  };

  if (!isHydrated) return null;

  return (
    <div className="app-container">
      <GlassDistortionFilter />

      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <img src="/logo.png" alt="Image51" className="header-logo" />
            <h1 className="header-title">Image51</h1>
          </div>

          <button onClick={() => setIsSettingsOpen(true)} className="btn-glass">
            <Settings className="w-4 h-4" />
            환경 설정
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}

      <main className="main-content">
        {/* Left Sidebar */}
        <div className="sidebar custom-scrollbar">
          {/* Upload Section */}
          <section>
            <h2 className="section-title">이미지 업로드</h2>
            <div onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
              <Glass
                variant="bright"
                className={cn("glass-interactive glass-upload", store.images.length === 0 ? "upload-zone upload-zone-empty" : "upload-zone upload-zone-with-files")}
                contentClassName={store.images.length === 0 ? "glass-content upload-zone upload-zone-empty" : "glass-content upload-zone upload-zone-with-files"}
              >
                <div className="liquidGlass-effect"></div>
                {store.images.length === 0 ? (
                  <>
                    <div className="upload-icon-container">
                      <Plus className="w-10 h-10" />
                    </div>
                    <p className="upload-text">Click or<br /><span className="upload-text-accent">drag & drop</span></p>
                  </>
                ) : (
                  <div className="image-list" onClick={e => e.stopPropagation()}>
                    <div className="image-list-scroll custom-scrollbar">
                      {store.images.map(img => (
                        <div key={img.id} className="image-item">
                          <div className="image-preview checkered-bg">
                            <img src={img.status === 'done' ? img.processedUrl! : img.previewUrl} alt="" />
                          </div>
                          <div className="image-info">
                            <p className="image-filename">{img.file.name}</p>
                            <div className="image-meta">
                              <span className={cn("image-status-badge", img.status === 'processing' ? 'status-processing' : img.status === 'done' ? 'status-done' : 'status-pending')}>
                                {img.status}
                              </span>
                              {img.status === 'done' && <span className="image-size">{formatBytes(img.processedSize!)}</span>}
                              {img.isDownloaded && <span className="image-downloaded-badge"><Check className="w-2.5 h-2.5" />저장됨</span>}
                            </div>
                          </div>
                          <div className="image-actions">
                            {img.status === 'done' && img.processedUrl && (
                              <button onClick={() => handleSingleDownload(img)} className={cn("btn-icon", img.isDownloaded && "text-white/15 hover:text-white/30")}>
                                <Download className="w-5 h-5" />
                              </button>
                            )}
                            <button onClick={() => store.removeImage(img.id)} className="btn-icon-delete">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="image-list-footer">
                      <button onClick={() => fileInputRef.current?.click()} className="btn-text btn-text-primary">+ 이미지 추가</button>
                      <button onClick={() => store.clearImages()} className="btn-text btn-text-muted">모두 지우기</button>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => { if (e.target.files) store.addImages(Array.from(e.target.files)); e.target.value = ''; }}
                />
              </Glass>
            </div>
          </section>

          {/* Profile Section */}
          <section>
            <h2 className="section-title section-header-with-action">
              <span>프리셋 관리</span>
              <div className="section-header-actions">
                <button onClick={() => { const n = prompt('이름:'); if (n) store.saveProfile(n) }} className="btn-icon section-header-btn">
                  <Plus className="w-3.5 h-3.5" />
                </button>
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
                          key={p.id}
                          p={p}
                          isActive={store.activeProfileId === p.id}
                          onLoad={store.loadProfile}
                          onUpdate={(id, name) => { if (confirm(`현재 설정을 '${name}' 프리셋에 덮어씌우겠습니까?`)) store.updateProfile(id); }}
                          onRename={(id, oldName) => { const newName = prompt('프리셋 이름 수정:', oldName); if (newName && newName.trim()) store.renameProfile(id, newName.trim()); }}
                          onDelete={(id, name) => { if (confirm(`'${name}' 프리셋을 삭제하시겠습니까?`)) store.deleteProfile(id); }}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </Glass>
          </section>
        </div>

        {/* Right Content */}
        <div className="content-area custom-scrollbar">
          <h2 className="section-title">변환 옵션</h2>
          <div className="options-grid">

            <OptionCard
              title="여백 제거" subtitle="Auto Crop"
              headerAction={<ToggleSwitch checked={store.enableAutoCrop} onChange={c => store.setOption('enableAutoCrop', c)} />}
              disabled={!store.enableAutoCrop}
            >
              <div className="option-row">
                <span className="input-label">여백을 없애고 사물에 맞게 조정</span>
                <span className="option-value">{store.autoCropMargin}</span>
              </div>
              <input type="range" min="0" max="100" value={store.autoCropMargin} onChange={e => store.setOption('autoCropMargin', Number(e.target.value))} className="range-slider" />
            </OptionCard>

            <OptionCard
              title="이미지 압축" subtitle="Compress"
              headerAction={<ToggleSwitch checked={store.enableCompress} onChange={c => store.setOption('enableCompress', c)} />}
              disabled={!store.enableCompress}
            >
              <div className="option-row">
                <span className="input-label">품질 (%)</span>
                <span className="option-value">{store.quality}</span>
              </div>
              <input type="range" min="1" max="100" value={store.quality} onChange={e => store.setOption('quality', Number(e.target.value))} className="range-slider" />
            </OptionCard>

            <OptionCard
              title="이미지 크기 조절" subtitle="Resize"
              className="resize-card"
              headerAction={<ToggleSwitch checked={store.enableResize} onChange={c => store.setOption('enableResize', c)} />}
              disabled={!store.enableResize}
            >
              <div className="grid-cols-2-gap">
                <div className="form-field"><p className="input-label">가로</p><input type="text" value={store.resizeWidth} onChange={handleWidthChange} className="input-field" placeholder="Auto" /></div>
                <div className="form-field"><p className="input-label">세로</p><input type="text" value={store.resizeHeight} onChange={handleHeightChange} className="input-field" placeholder="Auto" /></div>
                <div className="grid-span-2 option-row-items">
                  <span className="toggle-label-muted">비율 유지</span>
                  <ToggleSwitch checked={store.keepRatio} onChange={c => store.setOption('keepRatio', c)} size="small" />
                </div>
              </div>
              {ratioTooltip && <div className="tooltip">⚠️ {ratioTooltip.msg}</div>}
              {resizeError && <p className="error-message">{resizeError}</p>}
            </OptionCard>

            <OptionCard
              title="흑백 처리" subtitle="Grayscale"
              headerAction={<ToggleSwitch checked={store.enableGrayscale} onChange={c => store.setOption('enableGrayscale', c)} />}
              disabled={!store.enableGrayscale}
            >
              <div className="option-row">
                <span className="input-label">강도 (%)</span>
                <span className="option-value">{store.grayscale}%</span>
              </div>
              <input type="range" min="0" max="100" value={store.grayscale} onChange={e => store.setOption('grayscale', Number(e.target.value))} className="range-slider" />
            </OptionCard>

            <OptionCard
              title="배경 제거 v2" subtitle="U2-Net" className="options-grid-full" contentClassName="bg-removal-content"
              headerAction={<ToggleSwitch checked={store.enableU2NetRemoval} onChange={c => store.setOption('enableU2NetRemoval', c)} />}
              disabled={!store.enableU2NetRemoval}
            >
              <p className="input-label" style={{ marginBottom: '10px' }}>
                u2net / u2net_human_seg 모델 기반 배경 제거. 사람 사진엔 <b>인물 특화</b> 모드를 권장합니다.
              </p>
              <div className="grid-cols-2-gap">
                {(['general', 'human'] as const).map((m) => (
                  <label key={m} className="modal-option-item" style={{ cursor: 'pointer' }}>
                    <input type="radio" className="hidden" checked={store.u2netModel === m} onChange={() => store.setOption('u2netModel', m)} disabled={!store.enableU2NetRemoval} />
                    <div className={cn("radio-custom", store.u2netModel === m && "radio-custom-checked")}>
                      {store.u2netModel === m && <div className="radio-custom-inner" />}
                    </div>
                    <span className="modal-option-text">{m === 'general' ? '범용 (U2-Net)' : '인물 특화 (U2-Net Human)'}</span>
                  </label>
                ))}
              </div>
            </OptionCard>

            <OptionCard
              title="배경 제거" subtitle="Remove bg" className="options-grid-full" contentClassName="bg-removal-content"
              headerAction={<ToggleSwitch checked={store.enableBgRemoval} onChange={c => store.setOption('enableBgRemoval', c)} />}
              disabled={!store.enableBgRemoval}
            >
              <div className="grid-cols-2-gap-lg">
                <div className="card-sub">
                  <div className="card-sub-content">
                    <p className="card-header-title-with-icon">고급 옵션<span className="card-header-subtitle-inline">(Advanced)</span></p>
                    <ToggleSwitch checked={store.detailRemoval} onChange={c => store.setOption('detailRemoval', c)} size="small" />
                  </div>
                  <div className={cn(!store.detailRemoval && "opacity-20 pointer-events-none", "disabled-transition")}>
                    <div className="toggle-row">
                      <span className="toggle-label">경계 부드럽게</span>
                      <ToggleSwitch checked={store.alphaMatting} onChange={c => store.setOption('alphaMatting', c)} size="small" />
                    </div>
                    <div className={cn(!store.alphaMatting && "opacity-30 pointer-events-none", "advanced-section disabled-transition")}>
                      <ThresholdSlider label="피사체 감도" value={store.fgThreshold} enabled={store.enableFgThreshold} onChange={v => store.setOption('fgThreshold', v)} onToggle={c => store.setOption('enableFgThreshold', c)} max={255} />
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

          </div>

          {/* Floating Actions */}
          <div className="floating-actions">
            <button onClick={handleStartProcessing} disabled={store.images.filter(i => i.status === 'pending').length === 0} className="btn-primary">변환 시작</button>
            {store.images.filter(i => i.status === 'done' && !i.isDownloaded).length > 0 && (
              <button onClick={handleDownloadAll} className="btn-secondary"><Download className="w-5 h-5" /> 일괄 다운로드</button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <label className="auto-download-label">
          <input type="checkbox" className="hidden" checked={store.autoDownloadAfterProcessing} onChange={e => store.setOption('autoDownloadAfterProcessing', e.target.checked)} />
          <div className={cn("checkbox-custom", store.autoDownloadAfterProcessing && "checkbox-custom-checked")}>{store.autoDownloadAfterProcessing && <Check className="w-3 h-3 text-white" />}</div>
          <span className="auto-download-text">AUTO DOWNLOAD</span>
        </label>
      </footer>
    </div>
  );
}

// Helper components for the refactored JSX
function ThresholdSlider({ label, value, enabled, onChange, onToggle, max }: { label: string, value: number, enabled: boolean, onChange: (v: number) => void, onToggle: (c: boolean) => void, max: number }) {
  return (
    <div className={cn(!enabled && "opacity-40", label.includes('피사체') ? "threshold-option-first" : "threshold-option", "disabled-transition")}>
      <div className="threshold-row">
        <p className="threshold-label">{label}</p>
        <span className="option-value-small">{enabled ? value : 'AUTO'}</span>
      </div>
      <div className="slider-row">
        <input type="range" min="0" max={max} disabled={!enabled} value={value} onChange={e => onChange(Number(e.target.value))} className="range-slider" />
        <ToggleSwitch checked={enabled} onChange={onToggle} size="small" />
      </div>
    </div>
  );
}

function OptionToggleCard({ label, checked, onChange, children }: { label: string, checked: boolean, onChange: (c: boolean) => void, children: React.ReactNode }) {
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
