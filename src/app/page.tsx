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
import { Glass, ToggleSwitch, SortablePresetItem } from '@/components';

async function verifyPermission(fileHandle: any, readWrite: boolean = true) {
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}

function useHydrate() {
  const [isHydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return isHydrated;
}

function formatBytes(bytes: number, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// 파일명에서 확장자를 제외한 기본 이름과 확장자를 분리하여 반환
function getFilenameParts(filename: string) {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return { base: filename, ext: '' };
  return {
    base: filename.substring(0, dotIndex),
    ext: filename.substring(dotIndex)
  };
}

// 저장 공간에 동일한 이름이 있을 경우 숫자를 붙여 유니크한 파일 핸들을 반환
async function getUniqueFileHandle(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<FileSystemFileHandle> {
  const { base, ext } = getFilenameParts(filename);
  let currentName = filename;
  let counter = 1;

  while (true) {
    try {
      // 해당 이름의 파일이 이미 있는지 확인
      await dirHandle.getFileHandle(currentName);
      // 에러가 발생하지 않으면 파일이 존재하는 것이므로 이름 변경
      currentName = `${base}_${counter}${ext}`;
      counter++;
    } catch (e: any) {
      // NotFoundError인 경우 해당 이름을 사용할 수 있음
      if (e.name === 'NotFoundError') {
        return await dirHandle.getFileHandle(currentName, { create: true });
      }
      throw e;
    }
  }
}

// 파일 타입에 따른 확장자 결정 및 기본 파일명 생성
function getDownloadFilename(originalName: string, blobType: string): string {
  const { base } = getFilenameParts(originalName);
  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extMap[blobType] || originalName.split('.').pop() || 'png';
  return `${base}.${ext}`;
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
      await handleDownloadAll();
    }
  };

  const handleDownloadAll = async () => {
    const targetImages = useAppStore.getState().images.filter(img => img.status === 'done' && img.processedUrl && !img.isDownloaded);
    if (targetImages.length === 0) return;

    // Check custom directory handle
    let dirHandle = null;
    if (store.downloadMode === 'custom' && store.customDirectoryHandle) {
      const hasPerm = await verifyPermission(store.customDirectoryHandle, true);
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
      {/* SVG Filter for Liquid Glass distortion - Top level for reliability */}
      <svg width="0" height="0" className="svg-filter-container" aria-hidden="true">
        <filter id="lg-dist" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.012" numOctaves="4" seed="92" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="120" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <img src="/logo.webp" alt="Image51" className="header-logo" />
            <div>
              <h1 className="header-title">Image51</h1>
            </div>
          </div>

          <button onClick={() => setIsSettingsOpen(true)} className="btn-glass">
            <Settings className="w-4 h-4" />
            환경 설정
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <Glass variant="thick" className="modal-content" contentClassName="glass-content modal-glass-content">
              {/* Header */}
              <div className="modal-header">
                <div className="modal-header-left">
                  <div className="modal-icon-container">
                    <Settings className="modal-icon" />
                  </div>
                  <h2 className="modal-title">환경 설정</h2>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="modal-close-btn">✕</button>
              </div>

              {/* Content */}
              <div className="modal-body">
                {/* Download Mode */}
                <div className="modal-section">
                  <h3 className="modal-section-title">다운로드 저장 방식</h3>
                  <div>
                    {(['default', 'custom'] as const).map((mode) => (
                      <label key={mode} className="modal-option-item">
                        <input type="radio" className="hidden" checked={store.downloadMode === mode} onChange={() => store.setOption('downloadMode', mode)} />
                        <div className={cn("radio-custom", store.downloadMode === mode && "radio-custom-checked")}>
                          {store.downloadMode === mode && <div className="radio-custom-inner" />}
                        </div>
                        <span className="modal-option-text">{mode === 'default' ? '브라우저 다운로드 (Zip 압축)' : '특정 폴더에 직접 저장'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Custom Folder Picker */}
                {store.downloadMode === 'custom' && (
                  <div className="modal-folder-section">
                    <button onClick={async () => {
                      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
                      store.setCustomDirectoryHandle(handle);
                      await setHandle('customDownloadDir', handle);
                    }} className="btn-folder">
                      📁 저장 폴더 지정하기
                    </button>
                    {store.customDirectoryHandle && (
                      <p className="modal-folder-success">
                        <Check className="w-3.5 h-3.5" />지정됨: {store.customDirectoryHandle.name}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Glass>
          </div>
        </div>
      )}

      <main className="main-content">
        {/* Left Sidebar */}
        <div className="sidebar custom-scrollbar">
          {/* Upload Section */}
          <section>
            <h2 className="section-title">이미지 업로드</h2>
            <div onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
              <Glass variant="bright" className={cn("glass-interactive glass-upload", store.images.length === 0 ? "upload-zone upload-zone-empty" : "upload-zone upload-zone-with-files")} contentClassName={store.images.length === 0 ? "glass-content upload-zone upload-zone-empty" : "glass-content upload-zone upload-zone-with-files"}>
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
                            <img src={img.status === 'done' ? img.processedUrl! : img.previewUrl} />
                          </div>
                          <div className="image-info">
                            <p className="image-filename">{img.file.name}</p>
                            <div className="image-meta">
                              <span className={cn("image-status-badge", img.status === 'processing' ? 'status-processing' : img.status === 'done' ? 'status-done' : 'status-pending')}>{img.status}</span>
                              {img.status === 'done' && <span className="image-size">{formatBytes(img.processedSize!)}</span>}
                              {img.isDownloaded && <span className="image-downloaded-badge"><Check className="w-2.5 h-2.5" />저장됨</span>}
                            </div>
                          </div>
                          <div className="image-actions">
                            {img.status === 'done' && img.processedUrl && (
                              <button onClick={() => handleSingleDownload(img)} className={cn("btn-icon", img.isDownloaded ? "text-white/15 hover:text-white/30" : "")}><Download className="w-5 h-5" /></button>
                            )}
                            <button onClick={() => store.removeImage(img.id)} className="btn-icon-delete"><Trash2 className="w-5 h-5" /></button>
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
                <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files) store.addImages(Array.from(e.target.files)); e.target.value = ''; }} />
              </Glass>
            </div>
          </section>

          {/* Profile Section */}
          <section>
            <h2 className="section-title section-header-with-action">
              <span>프리셋 관리</span>
              <div className="section-header-actions">
                <button onClick={() => { const n = prompt('이름:'); if (n) store.saveProfile(n) }} className="btn-icon section-header-btn"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </h2>
            <Glass variant="thick" className="glass-profile-section" contentClassName="glass-content glass-profile-content">
              <div className="preset-list custom-scrollbar">
                {store.profiles.length === 0 ? (
                  <p className="empty-state">옵션 구성을 프리셋으로 저장해 보세요.</p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={store.profiles.map(p => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {store.profiles.map(p => (
                        <SortablePresetItem
                          key={p.id}
                          p={p}
                          isActive={store.activeProfileId === p.id}
                          onLoad={store.loadProfile}
                          onUpdate={(id, name) => {
                            if (confirm(`현재 설정을 '${name}' 프리셋에 덮어씌우겠습니까?`)) {
                              store.updateProfile(id);
                            }
                          }}
                          onRename={(id, oldName) => {
                            const newName = prompt('프리셋 이름 수정:', oldName);
                            if (newName && newName.trim()) store.renameProfile(id, newName.trim());
                          }}
                          onDelete={(id, name) => {
                            if (confirm(`'${name}' 프리셋을 삭제하시겠습니까?`)) {
                              store.deleteProfile(id);
                            }
                          }}
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
            {/* 1. Auto Crop */}
            <Glass variant="card" contentClassName="glass-content glass-content-full">
              <div className="card-header"><span className="card-header-title">여백 제거<span className="card-header-subtitle">(Auto Crop)</span></span><ToggleSwitch checked={store.enableAutoCrop} onChange={c => store.setOption('enableAutoCrop', c)} /></div>
              <div className={cn("card-content", !store.enableAutoCrop && "card-content-disabled")}>
                <div className="option-row"><span className="input-label">여백을 없애고 사물에 맞게 조정</span><span className="option-value">{store.autoCropMargin}</span></div>
                <input type="range" min="0" max="100" value={store.autoCropMargin} onChange={e => store.setOption('autoCropMargin', Number(e.target.value))} className="range-slider" />
              </div>
            </Glass>

            {/* 2. Compression */}
            <Glass variant="card" contentClassName="glass-content glass-content-full">
              <div className="card-header"><span className="card-header-title">이미지 압축<span className="card-header-subtitle">(Compress)</span></span><ToggleSwitch checked={store.enableCompress} onChange={c => store.setOption('enableCompress', c)} /></div>
              <div className={cn("card-content", !store.enableCompress && "card-content-disabled")}>
                <div className="option-row"><span className="input-label">품질 (%)</span><span className="option-value">{store.quality}</span></div>
                <input type="range" min="1" max="100" value={store.quality} onChange={e => store.setOption('quality', Number(e.target.value))} className="range-slider" />
              </div>
            </Glass>

            {/* 3. Resize */}
            <Glass variant="card" className="resize-card" contentClassName="glass-content glass-content-full">
              <div className="card-header"><span className="card-header-title">이미지 크기 조절<span className="card-header-subtitle">(Resize)</span></span><ToggleSwitch checked={store.enableResize} onChange={c => store.setOption('enableResize', c)} /></div>
              <div className={cn("card-content grid-cols-2-gap", !store.enableResize && "card-content-disabled")}>

                <div className="form-field"><p className="input-label">가로</p><input type="text" value={store.resizeWidth} onChange={handleWidthChange} className="input-field" placeholder="Auto" /></div>
                <div className="form-field"><p className="input-label">세로</p><input type="text" value={store.resizeHeight} onChange={handleHeightChange} className="input-field" placeholder="Auto" /></div>

                <div className="grid-span-2 option-row-items">
                  <span className="toggle-label-muted">비율 유지</span>
                  <ToggleSwitch checked={store.keepRatio} onChange={c => store.setOption('keepRatio', c)} size="small" />
                </div>
              </div>
              {ratioTooltip && <div className="tooltip">⚠️ {ratioTooltip.msg}</div>}
              {resizeError && <p className="error-message">{resizeError}</p>}
            </Glass>

            {/* 4. Grayscale */}
            <Glass variant="card" contentClassName="glass-content glass-content-full">
              <div className="card-header"><span className="card-header-title">흑백 처리<span className="card-header-subtitle">(Grayscale)</span></span><ToggleSwitch checked={store.enableGrayscale} onChange={c => store.setOption('enableGrayscale', c)} /></div>
              <div className={cn("card-content", !store.enableGrayscale && "card-content-disabled")}>
                <div className="option-row">
                  <span className="input-label">강도 (%)</span>
                  <span className="option-value">{store.grayscale}%</span>
                </div>
                <input type="range" min="0" max="100" value={store.grayscale} onChange={e => store.setOption('grayscale', Number(e.target.value))} className="range-slider" />
              </div>
            </Glass>


            {/* 6. AI BG Removal (Detailed) */}
            <Glass variant="card" className="options-grid-full" contentClassName="glass-content glass-content-full">
              <div className="card-header">
                <div className="card-header-with-icon">
                  <span className="card-header-title">배경 제거 </span>
                  <span className="card-header-subtitle">(Remove bg)</span>
                </div>
                <ToggleSwitch checked={store.enableBgRemoval} onChange={c => store.setOption('enableBgRemoval', c)} />
              </div>

              <div className={cn(!store.enableBgRemoval && "card-content-disabled", "bg-removal-content")}>
                <div className="grid-cols-2-gap-lg">
                  <div className="card-sub">
                    <div className="card-sub-content">
                      <p className="card-header-title-with-icon">고급 옵션<span className="card-header-subtitle-inline">(Advanced Options)</span></p>
                      <ToggleSwitch checked={store.detailRemoval} onChange={c => store.setOption('detailRemoval', c)} size="small" />
                    </div>

                    <div className={cn(!store.detailRemoval && "opacity-20 pointer-events-none", "disabled-transition")}>
                      <div className="toggle-row">
                        <span className="toggle-label">경계 부드럽게</span>
                        <ToggleSwitch checked={store.alphaMatting} onChange={c => store.setOption('alphaMatting', c)} size="small" />
                      </div>

                      <div className={cn(!store.alphaMatting && "opacity-30 pointer-events-none", "advanced-section disabled-transition")}>
                        {/* 1. 피사체 감도 */}
                        <div className={cn(!store.enableFgThreshold && "opacity-40", "threshold-option-first disabled-transition")}>
                          <div className="threshold-row">
                            <p className="threshold-label">피사체 감도</p>
                            <span className="option-value-small">{store.enableFgThreshold ? store.fgThreshold : 'AUTO'}</span>
                          </div>
                          <div className="slider-row">
                            <input type="range" min="0" max="255" disabled={!store.enableFgThreshold} value={store.fgThreshold} onChange={e => store.setOption('fgThreshold', Number(e.target.value))} className="range-slider" />
                            <ToggleSwitch checked={store.enableFgThreshold} onChange={c => store.setOption('enableFgThreshold', c)} size="small" />
                          </div>
                        </div>

                        {/* 2. 배경 허용치 */}
                        <div className={cn(!store.enableBgThreshold && "opacity-40", "threshold-option disabled-transition")}>
                          <div className="threshold-row">
                            <p className="threshold-label">배경 허용치</p>
                            <span className="option-value-small">{store.enableBgThreshold ? store.bgThreshold : 'AUTO'}</span>
                          </div>
                          <div className="slider-row">
                            <input type="range" min="0" max="50" disabled={!store.enableBgThreshold} value={store.bgThreshold} onChange={e => store.setOption('bgThreshold', Number(e.target.value))} className="range-slider" />
                            <ToggleSwitch checked={store.enableBgThreshold} onChange={c => store.setOption('enableBgThreshold', c)} size="small" />
                          </div>
                        </div>

                        {/* 3. 경계 정리 */}
                        <div className={cn(!store.enableErodeSize && "opacity-40", "threshold-option disabled-transition")}>
                          <div className="threshold-row">
                            <p className="threshold-label">경계 정리</p>
                            <span className="option-value-small">{store.enableErodeSize ? store.erodeSize : 'AUTO'}</span>
                          </div>
                          <div className="slider-row">
                            <input type="range" min="0" max="20" disabled={!store.enableErodeSize} value={store.erodeSize} onChange={e => store.setOption('erodeSize', Number(e.target.value))} className="range-slider" />
                            <ToggleSwitch checked={store.enableErodeSize} onChange={c => store.setOption('enableErodeSize', c)} size="small" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="sub-options-container">
                    <div className="card-sub">
                      <div className="option-toggle-card">
                        <span className="toggle-label-muted">가짜 투명 패턴 제거</span>
                        <ToggleSwitch checked={store.fakeTransRemoval} onChange={c => store.setOption('fakeTransRemoval', c)} size="small" />
                      </div>
                      <div className={cn(!store.fakeTransRemoval && "opacity-20 pointer-events-none", "slider-row-wide disabled-transition")}>
                        <input type="range" min="0" max="100" value={store.fakeTransTolerance} onChange={e => store.setOption('fakeTransTolerance', Number(e.target.value))} className="range-slider" />
                        <span className="slider-value">{store.fakeTransTolerance}</span>
                      </div>
                    </div>

                    <div className="card-sub">
                      <div className="option-toggle-card">
                        <span className="toggle-label-muted">이미지 내부 배경 제거</span>
                        <ToggleSwitch checked={store.removeMatchBg} onChange={c => store.setOption('removeMatchBg', c)} size="small" />
                      </div>
                      <div className={cn(!store.removeMatchBg && "opacity-20 pointer-events-none", "slider-row-wide disabled-transition")}>
                        <input type="range" min="0" max="100" value={store.removeMatchBgTolerance} onChange={e => store.setOption('removeMatchBgTolerance', Number(e.target.value))} className="range-slider" />
                        <span className="slider-value">{store.removeMatchBgTolerance}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Glass>
          </div>

          {/* Floating Actions */}
          <div className="floating-actions">
            <button onClick={handleStartProcessing} disabled={store.images.filter(i => i.status === 'pending').length === 0} className="btn-primary">변환 시작</button>
            {store.images.filter(i => i.status === 'done' && !i.isDownloaded).length > 0 && (
              <button onClick={handleDownloadAll} className="btn-secondary">
                <Download className="w-5 h-5" /> 일괄 다운로드
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-left">


        </div>
        <label className="auto-download-label">
          <input type="checkbox" className="hidden" checked={store.autoDownloadAfterProcessing} onChange={e => store.setOption('autoDownloadAfterProcessing', e.target.checked)} />
          <div className={cn("checkbox-custom", store.autoDownloadAfterProcessing && "checkbox-custom-checked")}>{store.autoDownloadAfterProcessing && <Check className="w-3 h-3 text-white" />}</div>
          <span className="auto-download-text">AUTO DOWNLOAD</span>
        </label>
      </footer>

    </div>
  );
}
