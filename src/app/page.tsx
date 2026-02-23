'use client';

import { useAppStore } from '@/store/useAppStore';
import { useCallback, useRef, useState, useEffect } from 'react';
import { UploadCloud, Plus, Minus, Save, Trash2, Download, Pencil, GripVertical, Check, Settings, History, Layers, Zap, Share2 } from 'lucide-react';
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
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Profile } from '@/store/useAppStore';

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

interface SortablePresetItemProps {
  p: Profile;
  isActive: boolean;
  onLoad: (id: string) => void;
  onUpdate: (id: string, name: string) => void;
  onRename: (id: string, oldName: string) => void;
  onDelete: (id: string, name: string) => void;
}

function SortablePresetItem({ p, isActive, onLoad, onUpdate, onRename, onDelete }: SortablePresetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: p.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group glass px-3 py-1.5 rounded-xl flex items-center justify-between cursor-pointer border transition-all",
        isActive ? "bg-indigo-500/10 border-indigo-500/30" : "border-transparent hover:bg-white/5",
        isDragging && "opacity-50 scale-[1.02] shadow-xl bg-white/10 border-white/20"
      )}
      onClick={() => onLoad(p.id)}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-white/20 group-hover:text-white/40">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <span className="text-sm font-bold truncate max-w-[160px]">{p.name}</span>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(p.id, p.name); }}
          className="p-1.5 hover:text-emerald-400 transition-colors cursor-pointer"
          title="현재 설정 저장 (덮어쓰기)"
        >
          <Save className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRename(p.id, p.name); }}
          className="p-1.5 hover:text-indigo-400 transition-colors cursor-pointer"
          title="이름 수정"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(p.id, p.name); }}
          className="p-1.5 hover:text-red-400 transition-colors cursor-pointer"
          title="삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
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

function Glass({ children, className, contentClassName, variant = 'default' }: { children: React.ReactNode, className?: string, contentClassName?: string, variant?: 'default' | 'bright' | 'thick' | 'card' }) {
  const variantClass = variant === 'default' ? 'glass' : `glass-${variant}`;
  return (
    <div className={cn("glass-container", variantClass, className)}>
      <div className="glass-filter" />
      <div className="glass-overlay" />
      <div className="glass-specular" />
      <div className={cn("glass-content", contentClassName)}>{children}</div>
    </div>
  );
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
    <div className="min-h-screen bg-galaxy text-white flex flex-col font-sans selection:bg-indigo-500/30">
      {/* SVG Filter for Liquid Glass distortion - Top level for reliability */}
      <svg width="0" height="0" className="absolute pointer-events-none overflow-hidden" aria-hidden="true">
        <filter id="lg-dist" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.012" numOctaves="4" seed="92" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="120" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {/* Header */}
      <header className="z-20 w-full px-8 py-3.5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="Image51" className="w-10 h-10 object-contain drop-shadow-[0_0_12px_rgba(139,92,246,0.6)]" />
            <div>
              <h1 className="text-2xl font-black italic tracking-tighter text-white drop-shadow-md">Image51</h1>
              {/* <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-[0.2em] leading-none">Smart Client AI</p> */}
            </div>
          </div>

          <button onClick={() => setIsSettingsOpen(true)} className="btn-glass px-4 py-2 flex items-center gap-2 hover:scale-105 cursor-pointer">
            <Settings className="w-4 h-4" />
            환경 설정
          </button>
        </div>
      </header >

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={() => setIsSettingsOpen(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Glass variant="thick" className="rounded-3xl overflow-hidden shadow-2xl" contentClassName="p-0">
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/40 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-white/50" />
                  </div>
                  <h2 className="text-base font-bold text-white">환경 설정</h2>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="w-8 h-8 rounded-xl bg-white/5 border border-white/40 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all cursor-pointer text-sm">✕</button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Download Mode */}
                <div>
                  <h3 className="text-[11px] font-bold text-white/100 uppercase tracking-widest mb-3">다운로드 저장 방식</h3>
                  <div className="space-y-1">
                    {(['default', 'custom'] as const).map((mode) => (
                      <label key={mode} className="flex items-center gap-3 cursor-pointer group px-3 py-3 rounded-2xl hover:bg-white/5 transition-all">
                        <input type="radio" className="hidden" checked={store.downloadMode === mode} onChange={() => store.setOption('downloadMode', mode)} />
                        <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0", store.downloadMode === mode ? "border-indigo-500" : "border-white/40 group-hover:border-white/40")}>
                          {store.downloadMode === mode && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                        </div>
                        <span className="text-sm text-white/100 group-hover:text-white/90 transition-colors">{mode === 'default' ? '브라우저 다운로드 (Zip 압축)' : '특정 폴더에 직접 저장'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Custom Folder Picker */}
                {store.downloadMode === 'custom' && (
                  <div className="bg-white/3 rounded-2xl border border-white/8 p-4 mb-4">
                    <button onClick={async () => {
                      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
                      store.setCustomDirectoryHandle(handle);
                      await setHandle('customDownloadDir', handle);
                    }} className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-100 py-3 rounded-xl border border-indigo-500/20 text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer">
                      📁 저장 폴더 지정하기
                    </button>
                    {store.customDirectoryHandle && (
                      <p className="text-emerald-400 text-[11px] font-bold flex items-center gap-2 px-1 mt-3">
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

      <main className="flex-1 w-full max-w-[1500px] mx-auto flex items-start px-12 pt-3 pb-32 gap-6 overflow-hidden h-[calc(100vh-64px-48px)]">
        {/* Left Sidebar */}
        <div className="w-[520px] flex flex-col gap-5 overflow-y-auto custom-scrollbar px-6 h-full">
          {/* Upload Section */}
          <section className="flex flex-col">
            <h2 className="text-[14px] font-bold mb-2 px-2 text-white/90 uppercase tracking-widest">이미지 업로드</h2>
            <div onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
              <Glass variant="bright" className="rounded-3xl cursor-pointer hover:scale-[1.02] transition-all duration-300 min-h-[380px] group border-dashed border-white/10 hover:border-white/20" contentClassName={store.images.length === 0 ? "flex flex-col items-center justify-center h-full min-h-[380px] py-28" : "flex flex-col p-5"}>
                {store.images.length === 0 ? (
                  <>
                    <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center mb-6 text-white/40 group-hover:scale-110 group-hover:text-white transition-all bg-white/5">
                      <Plus className="w-10 h-10" />
                    </div>
                    <p className="text-center font-bold text-xl text-white leading-tight">Click or<br /><span className="text-indigo-400">drag & drop</span></p>
                  </>
                ) : (
                  <div className="w-full flex flex-col cursor-default" onClick={e => e.stopPropagation()}>
                    <div className="space-y-3 overflow-y-auto max-h-[340px] custom-scrollbar pr-3">
                      {store.images.map(img => (
                        <div key={img.id} className="bg-white/5 backdrop-blur-md rounded-2xl p-2 flex items-center gap-4 border border-white/10">
                          <div className="w-14 h-14 rounded-xl checkered-bg relative overflow-hidden flex-shrink-0 border border-white/10">
                            <img src={img.status === 'done' ? img.processedUrl! : img.previewUrl} className="w-full h-full object-contain" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate text-white/90">{img.file.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", img.status === 'processing' ? 'bg-indigo-500/20 text-indigo-400' : img.status === 'done' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/40')}>{img.status}</span>
                              {img.status === 'done' && <span className="text-[10px] text-white/50">{formatBytes(img.processedSize!)}</span>}
                              {img.isDownloaded && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/5 text-white/80 flex items-center gap-1"><Check className="w-2.5 h-2.5" />저장됨</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {img.status === 'done' && img.processedUrl && (
                              <button onClick={() => handleSingleDownload(img)} className={cn("p-2 transition-colors", img.isDownloaded ? "text-white/15 hover:text-white/30" : "text-white/50 hover:text-emerald-400")}><Download className="w-5 h-5" /></button>
                            )}
                            <button onClick={() => store.removeImage(img.id)} className="p-2 text-white/20 hover:text-red-400 transition-colors"><Trash2 className="w-5 h-5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-center gap-6 pt-4 border-t border-white/5 mt-4">
                      <button onClick={() => fileInputRef.current?.click()} className="text-sm font-bold text-indigo-400 hover:text-white transition-colors underline underline-offset-4">+ 이미지 추가</button>
                      <button onClick={() => store.clearImages()} className="text-sm font-bold text-white/30 hover:text-red-400 transition-colors underline underline-offset-4">모두 지우기</button>
                    </div>
                  </div>
                )}
                <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files) store.addImages(Array.from(e.target.files)); e.target.value = ''; }} />
              </Glass>
            </div>
          </section>

          {/* Profile Section */}
          <section className="flex flex-col">
            <h2 className="text-[14px] font-bold mb-2 px-2 text-white/90 uppercase tracking-widest flex items-center justify-between">
              <span>프리셋 관리</span>
              <div className="flex gap-2">
                <button onClick={() => { const n = prompt('이름:'); if (n) store.saveProfile(n) }} className="p-1.5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </h2>
            <Glass variant="thick" className="h-[260px] overflow-hidden" contentClassName="flex flex-col h-full px-5 py-4">
              <div className="flex-1 overflow-y-auto p-2 pr-4 space-y-1 custom-scrollbar">
                {store.profiles.length === 0 ? (
                  <p className="text-center py-24 text-sm text-white/50">옵션 구성을 프리셋으로 저장해 보세요.</p>
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
        <div className="flex-1 overflow-y-auto custom-scrollbar h-full pr-1 pb-40">
          <h2 className="text-[14px] font-bold mb-2 px-2 text-white/90 uppercase tracking-widest">변환 옵션</h2>
          <div className="grid grid-cols-2 gap-5">
            {/* 1. Auto Crop */}
            <Glass variant="card" contentClassName="h-full">
              <div className="card-header"><span>여백 제거<span className="text-xs font-bold text-neutral-400 pl-2">(Auto Crop)</span></span><ToggleSwitch checked={store.enableAutoCrop} onChange={c => store.setOption('enableAutoCrop', c)} /></div>
              <div className={cn("card-content", !store.enableAutoCrop && "card-content-disabled")}>
                <div className="flex justify-between mb-1"><span className="input-label">여백을 없애고 사물에 맞게 조정</span><span className="text-sm font-black text-indigo-400">{store.autoCropMargin}</span></div>
                <input type="range" min="0" max="100" value={store.autoCropMargin} onChange={e => store.setOption('autoCropMargin', Number(e.target.value))} className="range-slider w-full" />
              </div>
            </Glass>

            {/* 2. Compression */}
            <Glass variant="card" contentClassName="h-full">
              <div className="card-header"><span>이미지 압축<span className="text-xs font-bold text-neutral-400 pl-2">(Compress)</span></span><ToggleSwitch checked={store.enableCompress} onChange={c => store.setOption('enableCompress', c)} /></div>
              <div className={cn("card-content", !store.enableCompress && "card-content-disabled")}>
                <div className="flex justify-between mb-1"><span className="input-label">품질 (%)</span><span className="text-sm font-black text-indigo-400">{store.quality}</span></div>
                <input type="range" min="1" max="100" value={store.quality} onChange={e => store.setOption('quality', Number(e.target.value))} className="range-slider w-full" />
              </div>
            </Glass>

            {/* 3. Resize */}
            <Glass variant="card" className="relative" contentClassName="h-full">
              <div className="card-header"><span>이미지 크기 조절<span className="text-xs font-bold text-neutral-400 pl-2">(Resize)</span></span><ToggleSwitch checked={store.enableResize} onChange={c => store.setOption('enableResize', c)} /></div>
              <div className={cn("card-content grid grid-cols-2 gap-x-4", !store.enableResize && "card-content-disabled")}>

                <div className="mb-3"><p className="input-label">가로</p><input type="text" value={store.resizeWidth} onChange={handleWidthChange} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-sm" placeholder="Auto" /></div>
                <div className="mb-3"><p className="input-label">세로</p><input type="text" value={store.resizeHeight} onChange={handleHeightChange} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-sm" placeholder="Auto" /></div>

                <div className="col-span-2 flex items-center justify-between ">
                  <span className="text-xs font-bold text-white/40">비율 유지</span>
                  <ToggleSwitch checked={store.keepRatio} onChange={c => store.setOption('keepRatio', c)} size="small" />
                </div>
              </div>
              {ratioTooltip && <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[11px] px-3 py-1.5 rounded-lg whitespace-nowrap animate-bounce">⚠️ {ratioTooltip.msg}</div>}
              {resizeError && <p className="text-[10px] text-red-500 text-center mt-2">{resizeError}</p>}
            </Glass>

            {/* 4. Grayscale */}
            <Glass variant="card" contentClassName="h-full">
              <div className="card-header"><span>흑백 처리<span className="text-xs font-bold text-neutral-400 pl-2">(Grayscale)</span></span><ToggleSwitch checked={store.enableGrayscale} onChange={c => store.setOption('enableGrayscale', c)} /></div>
              <div className={cn("card-content", !store.enableGrayscale && "card-content-disabled")}>
                <div className="flex justify-between mb-1">
                  <span className="input-label">강도 (%)</span>
                  <span className="text-sm font-black text-indigo-400">{store.grayscale}%</span>
                </div>
                <input type="range" min="0" max="100" value={store.grayscale} onChange={e => store.setOption('grayscale', Number(e.target.value))} className="range-slider w-full" />
              </div>
            </Glass>


            {/* 6. AI BG Removal (Detailed) */}
            <Glass variant="card" className="col-span-2 p-0 overflow-hidden" contentClassName="h-full">
              <div className="px-6 py-3 pb-2 flex justify-between items-center bg-white/5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <p className="font-black text-white tracking-tight text-[13px]">배경 제거 </p>
                  <span className="text-xs font-bold text-neutral-400">(Remove bg)</span>
                </div>
                <ToggleSwitch checked={store.enableBgRemoval} onChange={c => store.setOption('enableBgRemoval', c)} />
              </div>

              <div className={cn("py-5 px-8 space-y-8 transition-all duration-500", !store.enableBgRemoval && "card-content-disabled")}>
                <div className="grid grid-cols-2 gap-8">
                  <div className="card-sub">
                    <div className="flex items-center justify-between mb-6">
                      <p className="text-sm font-black text-white/80">고급 옵션<span className="text-xs font-bold text-neutral-400 pl-2">(Advanced Options)</span></p>
                      <ToggleSwitch checked={store.detailRemoval} onChange={c => store.setOption('detailRemoval', c)} size="small" />
                    </div>

                    <div className={cn("space-y-6 transition-opacity", !store.detailRemoval && "opacity-20 pointer-events-none")}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-white/60">경계 부드럽게</span>
                        <ToggleSwitch checked={store.alphaMatting} onChange={c => store.setOption('alphaMatting', c)} size="small" />
                      </div>

                      <div className={cn("space-y-4 transition-opacity", !store.alphaMatting && "opacity-30 pointer-events-none")}>
                        {/* 1. 피사체 감도 */}
                        <div className={cn("transition-opacity", !store.enableFgThreshold && "opacity-40")}>
                          <div className="flex justify-between items-end mb-1">
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">피사체 감도</p>
                            <span className="text-[11px] font-black text-indigo-400">{store.enableFgThreshold ? store.fgThreshold : 'AUTO'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <input type="range" min="0" max="255" disabled={!store.enableFgThreshold} value={store.fgThreshold} onChange={e => store.setOption('fgThreshold', Number(e.target.value))} className="range-slider w-full" />
                            <ToggleSwitch checked={store.enableFgThreshold} onChange={c => store.setOption('enableFgThreshold', c)} size="small" />
                          </div>
                        </div>

                        {/* 2. 배경 허용치 */}
                        <div className={cn("transition-opacity", !store.enableBgThreshold && "opacity-40")}>
                          <div className="flex justify-between items-end mb-1">
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">배경 허용치</p>
                            <span className="text-[11px] font-black text-indigo-400">{store.enableBgThreshold ? store.bgThreshold : 'AUTO'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <input type="range" min="0" max="50" disabled={!store.enableBgThreshold} value={store.bgThreshold} onChange={e => store.setOption('bgThreshold', Number(e.target.value))} className="range-slider w-full" />
                            <ToggleSwitch checked={store.enableBgThreshold} onChange={c => store.setOption('enableBgThreshold', c)} size="small" />
                          </div>
                        </div>

                        {/* 3. 경계 정리 */}
                        <div className={cn("transition-opacity", !store.enableErodeSize && "opacity-40")}>
                          <div className="flex justify-between items-end mb-1">
                            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">경계 정리</p>
                            <span className="text-[11px] font-black text-indigo-400">{store.enableErodeSize ? store.erodeSize : 'AUTO'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <input type="range" min="0" max="20" disabled={!store.enableErodeSize} value={store.erodeSize} onChange={e => store.setOption('erodeSize', Number(e.target.value))} className="range-slider w-full" />
                            <ToggleSwitch checked={store.enableErodeSize} onChange={c => store.setOption('enableErodeSize', c)} size="small" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="card-sub">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold text-neutral-400">가짜 투명 패턴 제거</span>
                        <ToggleSwitch checked={store.fakeTransRemoval} onChange={c => store.setOption('fakeTransRemoval', c)} size="small" />
                      </div>
                      <div className={cn("flex items-center gap-4 transition-opacity", !store.fakeTransRemoval && "opacity-20 pointer-events-none")}>
                        <input type="range" min="0" max="100" value={store.fakeTransTolerance} onChange={e => store.setOption('fakeTransTolerance', Number(e.target.value))} className="range-slider w-full" />
                        <span className="text-xs font-bold text-indigo-400 w-8">{store.fakeTransTolerance}</span>
                      </div>
                    </div>

                    <div className="card-sub">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold text-neutral-400">이미지 내부 배경 제거</span>
                        <ToggleSwitch checked={store.removeMatchBg} onChange={c => store.setOption('removeMatchBg', c)} size="small" />
                      </div>
                      <div className={cn("flex items-center gap-4 transition-opacity", !store.removeMatchBg && "opacity-20 pointer-events-none")}>
                        <input type="range" min="0" max="100" value={store.removeMatchBgTolerance} onChange={e => store.setOption('removeMatchBgTolerance', Number(e.target.value))} className="range-slider w-full" />
                        <span className="text-xs font-bold text-indigo-400 w-8">{store.removeMatchBgTolerance}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Glass>
          </div>

          {/* Floating Actions */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
            <button onClick={handleStartProcessing} disabled={store.images.filter(i => i.status === 'pending').length === 0} className="px-9 py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black hover:scale-105 active:scale-95 transition-all shadow-2xl disabled:opacity-30 uppercase tracking-tighter italic">변환 시작</button>
            {store.images.filter(i => i.status === 'done' && !i.isDownloaded).length > 0 && (
              <button onClick={handleDownloadAll} className="px-9 py-2.5 rounded-full bg-white text-indigo-600 font-black hover:scale-105 active:scale-95 transition-all shadow-2xl uppercase tracking-tighter italic border border-indigo-100 flex items-center gap-2">
                <Download className="w-5 h-5" /> 일괄 다운로드
              </button>
            )}
          </div>
        </div>
      </main >

      {/* Footer */}
      < footer className="fixed bottom-0 w-full h-12 flex items-center justify-between px-10 z-40" >
        <div className="flex items-center gap-4">


        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="hidden" checked={store.autoDownloadAfterProcessing} onChange={e => store.setOption('autoDownloadAfterProcessing', e.target.checked)} />
          <div className={cn("w-4 h-4 rounded border flex items-center justify-center", store.autoDownloadAfterProcessing ? "bg-indigo-500 border-indigo-500" : "border-white/60")}>{store.autoDownloadAfterProcessing && <Check className="w-3 h-3 text-white" />}</div>
          <span className="text-[10px] font-bold text-white/80">AUTO DOWNLOAD</span>
        </label>
      </footer >

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .range-slider { -webkit-appearance: none; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; outline: none; }
        .range-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: white; border-radius: 50%; cursor: pointer; border: 2px solid #6366f1; box-shadow: 0 0 10px rgba(99,102,241,0.5); }
      `}} />

    </div >
  );
}

function ToggleSwitch({ checked, onChange, size = 'default' }: { checked: boolean, onChange: (val: boolean) => void, size?: 'default' | 'small' }) {
  return (
    <div onClick={() => onChange(!checked)} className={cn("relative rounded-full cursor-pointer transition-all flex items-center shadow-inner", size === 'small' ? 'w-9 h-5' : 'w-11 h-6', checked ? "bg-indigo-500" : "bg-white/10")}>
      <div className={cn("bg-white rounded-full transition-all shadow-md", size === 'small' ? 'w-3.5 h-3.5 ml-0.5' : 'w-4.5 h-4.5 ml-0.8', checked ? (size === 'small' ? 'translate-x-4.5' : 'translate-x-5') : 'translate-x-0')} />
    </div>
  );
}
