'use client';

import { useAppStore } from '@/store/useAppStore';
import { useCallback, useRef, useState, useEffect } from 'react';
import { UploadCloud, Plus, Minus, Save, Trash2, Download, Pencil, GripVertical, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { processImage } from '@/lib/imageProcessor';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getHandle, setHandle } from '@/lib/idb';

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

// 컴포넌트 마운트 전에는 렌더링 무효화 (Zustand persist hydrate 에러 방지)
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

export default function Home() {
  const isHydrated = useHydrate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const store = useAppStore();

  useEffect(() => {
    // 앱 초기 로드 시 IndexedDB에서 권한 핸들을 불러와 스토어에 복원 (영구 저장 연동)
    getHandle('customDownloadDir').then(handle => {
      if (handle) store.setCustomDirectoryHandle(handle);
    }).catch(e => console.error("IDB load error", e));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSettingsOpen(false);
    };
    if (isSettingsOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      store.addImages(Array.from(e.dataTransfer.files));
    }
  }, [store]);

  const handleStartProcessing = async () => {
    const pendingImages = store.images.filter(img => img.status === 'pending');

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
      setTimeout(() => {
        handleDownloadAll();
      }, 500); // 돔 렌더링 후 다운로드 되도록 약간의 지연시간 추가
    }
  };
  const getDateFolderName = () => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const getTargetDirectory = async () => {
    if (store.downloadMode === 'custom' && store.customDirectoryHandle) {
      const hasPerm = await verifyPermission(store.customDirectoryHandle, true);
      if (!hasPerm) {
        alert("폴더 접근 권한이 없습니다. 상단 설정에서 폴더를 다시 지정해주세요.");
        return null;
      }
      const folderName = getDateFolderName();
      return await (store.customDirectoryHandle as any).getDirectoryHandle(folderName, { create: true });
    }
    return null;
  };

  const handleDownloadAll = async () => {
    const targetImages = useAppStore.getState().images.filter(img => img.status === 'done' && img.processedUrl && !img.isDownloaded);
    if (targetImages.length === 0) return;

    const dirHandle = await getTargetDirectory();

    if (dirHandle) {
      // 지정 폴더 저장 모드
      for (const img of targetImages) {
        if (!img.processedUrl) continue;
        try {
          const response = await fetch(img.processedUrl);
          const blob = await response.blob();
          const fileHandle = await dirHandle.getFileHandle(`converted_${img.file.name}`, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          useAppStore.getState().updateImageStatus(img.id, { isDownloaded: true });
        } catch (err) {
          console.error('Failed to save file to directory', err);
        }
      }
    } else {
      // 기존 기본 다운로드 (Zip 묶어서) 모드
      if (targetImages.length === 1) {
        handleSingleDownload(targetImages[0]);
        return;
      }

      const zip = new JSZip();
      for (const img of targetImages) {
        if (!img.processedUrl) continue;
        try {
          const response = await fetch(img.processedUrl);
          const blob = await response.blob();
          zip.file(`converted_${img.file.name}`, blob);
        } catch (err) {
          console.error('Failed to fetch blob for zip', err);
        }
      }

      try {
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'image51_converted.zip');
        targetImages.forEach(img => useAppStore.getState().updateImageStatus(img.id, { isDownloaded: true }));
      } catch (err) {
        console.error('Failed to generate zip', err);
      }
    }
  };
  const handleSingleDownload = async (img: any) => {
    if (!img.processedUrl) return;

    const dirHandle = await getTargetDirectory();
    if (dirHandle) {
      try {
        const response = await fetch(img.processedUrl);
        const blob = await response.blob();
        const fileHandle = await dirHandle.getFileHandle(`converted_${img.file.name}`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        useAppStore.getState().updateImageStatus(img.id, { isDownloaded: true });
      } catch (err) {
        console.error('Failed to save single file to directory', err);
      }
    } else {
      const a = document.createElement('a');
      a.href = img.processedUrl!;
      a.download = `converted_${img.file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      useAppStore.getState().updateImageStatus(img.id, { isDownloaded: true });
    }
  };

  if (!isHydrated) return null; // Hydration mismatch 방지

  return (
    <div className="min-h-screen bg-[#1A1A24] text-neutral-200 flex flex-col font-sans selection:bg-indigo-500/30">

      {/* Header */}
      <header className="bg-[#14141d] border-b border-[#2a2a35] shadow-sm z-10 w-full">
        <div className="w-full max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex-shrink-0 flex items-center justify-center text-white font-bold italic text-lg shadow-sm"></div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex-shrink-0">Image51</h1>
          <p className="text-sm text-neutral-500 ml-4 font-medium truncate flex-1"></p>
          <button onClick={() => setIsSettingsOpen(true)} className="px-4 py-1.5 bg-[#252532] text-neutral-300 hover:text-white rounded border border-[#2a2a35] hover:border-[#3a3a46] transition-colors text-sm font-medium shadow-sm">⚙️ 환경 설정</button>
        </div>
      </header>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="bg-[#1e1e28] rounded-xl border border-[#2a2a35] shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 bg-[#21212c] border-b border-[#2a2a35]">
              <h2 className="text-lg font-bold text-white">환경 설정</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-neutral-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-neutral-200 mb-3 block">다운로드 저장 방식</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input type="radio" className="peer sr-only" checked={store.downloadMode === 'default'} onChange={() => store.setOption('downloadMode', 'default')} />
                      <div className="w-5 h-5 rounded-full border-2 border-neutral-500 peer-checked:border-indigo-500 transition-colors" />
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 absolute scale-0 peer-checked:scale-100 transition-transform" />
                    </div>
                    <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">기본 다운로드 폴더 (Zip 압축)</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input type="radio" className="peer sr-only" checked={store.downloadMode === 'custom'} onChange={() => store.setOption('downloadMode', 'custom')} />
                      <div className="w-5 h-5 rounded-full border-2 border-neutral-500 peer-checked:border-indigo-500 transition-colors" />
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 absolute scale-0 peer-checked:scale-100 transition-transform" />
                    </div>
                    <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">특정 폴더에 직접 저장 (날짜별 자동분류)</span>
                  </label>
                </div>
              </div>

              {store.downloadMode === 'custom' && (
                <div className="bg-[#14141d] rounded-lg border border-[#2a2a35] p-4 text-sm">
                  <p className="text-neutral-400 mb-2">저장될 기준 폴더를 선택해주세요. (폴더 내부에 YY-MM-DD 폴더가 자동 생성됩니다)</p>
                  <button
                    onClick={async () => {
                      try {
                        const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
                        store.setCustomDirectoryHandle(handle);
                        await setHandle('customDownloadDir', handle); // IDB에 영구 저장
                      } catch (err) {
                        console.error("User cancelled or failed to pick directory", err);
                      }
                    }}
                    className="w-full bg-[#252532] hover:bg-[#2a2a35] text-white border border-[#3a3a46] rounded py-2 transition-colors mb-2 font-medium">
                    📁 저장 폴더 지정하기
                  </button>
                  {store.customDirectoryHandle && (
                    <p className="text-emerald-400 font-medium break-all flex items-center gap-2">
                      <Check className="w-4 h-4" /> 지정 완료: <span className="text-amber-300 font-mono">{(store.customDirectoryHandle as any).name}</span> 폴더
                    </p>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-[#2a2a35]">
                <h3 className="text-sm font-bold text-neutral-200 mb-4 block">기타 설정</h3>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn("relative rounded-full cursor-pointer transition-colors duration-200 flex items-center w-10 h-5", store.openFolderAfterProcessing ? "bg-indigo-500" : "bg-[#2a2a35]")}>
                    <div className={cn("bg-white rounded-full w-4 h-4 shadow-sm transform transition-transform duration-200 ml-0.5", store.openFolderAfterProcessing ? "translate-x-5" : "translate-x-0")} />
                  </div>
                  <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">다운로드 완료 시 폴더 열기</span>
                  <input type="checkbox" className="hidden" checked={store.openFolderAfterProcessing} onChange={e => store.setOption('openFolderAfterProcessing', e.target.checked)} />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-[1200px] mx-auto flex items-start p-6 gap-6">
        {/* Left Column (Upload + Profiles) */}
        <div className="w-[32rem] flex flex-col gap-6 sticky top-6">

          <div className="flex flex-col shrink-0">
            <h2 className="text-lg font-bold mb-4 px-2 text-white">이미지 업로드</h2>
            <section className="flex flex-col h-[400px] panel mt-0">
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#3a3a46] rounded-xl flex-1 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-[#252532] transition-colors relative min-h-0"
              >
                {store.images.length === 0 ? (
                  <>
                    <div className="w-16 h-16 rounded-full border-2 border-indigo-500/50 flex items-center justify-center mb-4 text-indigo-400">
                      <Plus className="w-8 h-8" />
                    </div>
                    <p className="text-center font-bold text-lg leading-snug">Click here or<br />drag and drop images</p>
                  </>
                ) : (
                  <div className="absolute inset-0 p-4 overflow-y-auto space-y-2 cursor-default" onClick={e => e.stopPropagation()}>
                    {store.images.map(img => (
                      <div key={img.id} className="bg-[#14141d] p-3 rounded-lg flex items-center gap-3 border border-[#2a2a35]">
                        <div className="w-12 h-12 bg-[#0f0f15] rounded border border-[#2a2a35] checkered-bg relative overflow-hidden flex-shrink-0">
                          {img.status === 'done' && img.processedUrl ? (
                            <img src={img.processedUrl} alt="processed" className="w-full h-full object-contain" />
                          ) : (
                            <img src={img.previewUrl} alt="preview" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-neutral-300">{img.file.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-neutral-500">
                              {img.status === 'processing' ? '변환 중...' : img.status === 'error' ? '오류 발생' : img.status === 'pending' ? '대기 중' : '변환 완료'}
                            </p>
                            {img.status === 'done' && img.processedSize && (
                              <p className="text-xs font-mono text-neutral-400">
                                <span className={cn("inline-block", img.processedSize < img.originalSize ? 'text-neutral-500 ' : 'text-neutral-400')}>{formatBytes(img.originalSize)}</span>
                                <span className="mx-1 text-neutral-600">→</span>
                                <span className={cn("font-bold", img.processedSize < img.originalSize ? 'text-emerald-400' : 'text-amber-400')}>{formatBytes(img.processedSize)}</span>
                                {img.processedSize < img.originalSize && (
                                  <span className="ml-2 text-[12px] text-emerald-500 bg-emerald-500/10 px-1 py-0.5 rounded">
                                    -{Math.round((1 - img.processedSize / img.originalSize) * 100)}%
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {img.status === 'done' && (
                            <button onClick={() => handleSingleDownload(img)} className={cn("p-2 transition-colors", img.isDownloaded ? "text-emerald-500" : "text-indigo-400 hover:text-indigo-300")} title={img.isDownloaded ? "다운로드 완료" : "다운로드"}>
                              {img.isDownloaded ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                            </button>
                          )}
                          <button onClick={() => store.removeImage(img.id)} className="p-2 hover:text-red-400" title="삭제">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="sticky bottom-0 bg-gradient-to-t from-[rgba(30,30,40,1)] pt-4 pb-2 flex items-center justify-center gap-6">
                      <button onClick={() => fileInputRef.current?.click()} className="text-sm text-indigo-400 hover:text-indigo-300 underline font-medium">
                        + 이미지 더 추가하기
                      </button>
                      <button onClick={() => store.clearImages()} className="text-sm text-red-500 hover:text-red-400 underline font-medium">
                        모두 삭제
                      </button>
                    </div>
                  </div>
                )}
                <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files) store.addImages(Array.from(e.target.files)); e.target.value = ''; }} />
              </div>
            </section>
          </div>

          <div className="flex flex-col shrink-0">
            <div className="flex justify-between items-center mb-4 px-2">
              <h2 className="text-lg font-bold text-white">프로파일 관리</h2>
              <div className="flex bg-[#1e1e28] overflow-hidden rounded-md border border-[#2a2a35] shadow-sm">
                <button onClick={() => {
                  const name = prompt('새 프로파일 이름:');
                  if (name) store.saveProfile(name);
                }} className="px-3 py-1.5 hover:bg-[#252532] text-neutral-400 hover:text-white transition"><Plus className="w-4 h-4" /></button>
                <div className="w-px bg-[#2a2a35]" />
                <button onClick={() => {
                  if (store.activeProfileId) store.deleteProfile(store.activeProfileId)
                }} className="px-3 py-1.5 hover:bg-[#252532] text-neutral-400 hover:text-white transition"><Minus className="w-4 h-4" /></button>
                <div className="w-px bg-[#2a2a35]" />
                <button onClick={() => {
                  if (store.activeProfileId) { store.deleteProfile(store.activeProfileId); store.saveProfile(store.profiles.find(p => p.id === store.activeProfileId)?.name || 'Updated'); }
                }} className="px-4 py-1.5 hover:bg-[#2a2a35] flex items-center gap-2 border-l border-[#2a2a35] text-sm font-medium transition"><Save className="w-4 h-4" /> 저장</button>
              </div>
            </div>
            <section className="panel mt-0">
              <div className="bg-[#14141d] rounded border border-[#2a2a35] h-[230px] overflow-y-auto custom-scrollbar flex flex-col items-stretch">
                {store.profiles.length === 0 ? (
                  <p className="text-sm text-neutral-500 p-4 text-center">저장된 프로파일이 없습니다.</p>
                ) : (
                  <div className="flex-1 pb-2">
                    {store.profiles.map((p, index) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDraggedItemIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedItemIndex !== null && draggedItemIndex !== index) {
                            store.reorderProfiles(draggedItemIndex, index);
                          }
                          setDraggedItemIndex(null);
                        }}
                        onDragEnd={() => setDraggedItemIndex(null)}
                        onClick={() => store.loadProfile(p.id)}
                        onDoubleClick={() => {
                          const newName = prompt('프로파일 이름 수정:', p.name);
                          if (newName && newName.trim()) store.renameProfile(p.id, newName.trim());
                        }}
                        className={cn(
                          "group flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer border-b border-[#2a2a35] last:border-b-0 border-l-4 transition-colors select-none",
                          store.activeProfileId === p.id ? "bg-[#20202d] border-l-indigo-500 text-white font-bold" : "border-l-transparent hover:bg-[#1a1a24] text-neutral-400"
                        )}>
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-neutral-600 opacity-0 group-hover:opacity-100 cursor-grab" />
                          <span className="truncate max-w-[150px]">{p.name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newName = prompt('프로파일 이름 수정:', p.name);
                            if (newName && newName.trim()) store.renameProfile(p.id, newName.trim());
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-[#252532] rounded transition-colors text-neutral-500 hover:text-white"
                          title="이름 수정"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

        </div>

        {/* Right Column (Options Grid) */}
        <div className="flex-1 flex flex-col min-w-0 pb-10">
          <h2 className="text-lg font-bold mb-4 px-2 text-white">변환 옵션</h2>

          <div className="space-y-4">

            <div className="grid grid-cols-2 gap-4">
              {/* 여백 제거 */}
              <div className="card">
                <div className="card-header">
                  <span>여백 제거</span>
                  <ToggleSwitch checked={store.enableAutoCrop} onChange={c => store.setOption('enableAutoCrop', c)} />
                </div>
                <div className={cn("card-content", !store.enableAutoCrop && "card-content-disabled")}>
                  <p className="input-label">가장자리로부터 여백 크기</p>
                  <div className="flex items-center gap-4">
                    <input type="range" min="0" max="100" value={store.autoCropMargin} onChange={e => store.setOption('autoCropMargin', Number(e.target.value))} className="range-slider" />
                    <span className="text-sm font-bold text-indigo-400 min-w-8 text-right">{store.autoCropMargin} px</span>
                  </div>
                </div>
              </div>

              {/* 이미지 압축 */}
              <div className="card">
                <div className="card-header">
                  <span>이미지 압축</span>
                  <ToggleSwitch checked={store.enableCompress} onChange={c => store.setOption('enableCompress', c)} />
                </div>
                <div className={cn("card-content", !store.enableCompress && "card-content-disabled")}>
                  <p className="input-label">품질</p>
                  <div className="flex items-center gap-4">
                    <input type="range" min="1" max="100" value={store.quality} onChange={e => store.setOption('quality', Number(e.target.value))} className="range-slider" />
                    <span className="text-sm font-bold text-indigo-400 min-w-8 text-right">{store.quality}%</span>
                  </div>
                </div>
              </div>

              {/* 이미지 크기 조절 */}
              <div className="card">
                <div className="card-header">
                  <span>이미지 크기 조절</span>
                  <ToggleSwitch checked={store.enableResize} onChange={c => store.setOption('enableResize', c)} />
                </div>
                <div className={cn("grid grid-cols-2 gap-4 transition-opacity", !store.enableResize && "card-content-disabled")}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-400">가로:</span>
                      <input type="text" value={store.resizeWidth} onChange={e => store.setOption('resizeWidth', e.target.value)} className="w-20 bg-[#14141d] border border-[#2a2a35] rounded px-2 py-1 text-sm text-white" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-400">세로:</span>
                      <input type="text" value={store.resizeHeight} onChange={e => store.setOption('resizeHeight', e.target.value)} className="w-20 bg-[#14141d] border border-[#2a2a35] rounded px-2 py-1 text-sm text-white focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center border-l border-[#2a2a35]">
                    <span className="text-xs text-neutral-500 mb-2">비율 유지</span>
                    <ToggleSwitch checked={store.keepRatio} onChange={c => store.setOption('keepRatio', c)} />
                  </div>
                </div>
              </div>

              {/* 흑백 처리 */}
              <div className="card">
                <div className="card-header">
                  <span>흑백 처리</span>
                  <ToggleSwitch checked={store.enableGrayscale} onChange={c => store.setOption('enableGrayscale', c)} />
                </div>
                <div className={cn("card-content", !store.enableGrayscale && "card-content-disabled")}>
                  <p className="input-label">흑백 처리 강도</p>
                  <div className="flex items-center gap-4">
                    <input type="range" min="0" max="100" value={store.grayscale} onChange={e => store.setOption('grayscale', Number(e.target.value))} className="range-slider" />
                    <span className="text-sm font-bold text-indigo-400 min-w-8 text-right">{store.grayscale}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 배경 제거 (풀 위드스) */}
            <div className="bg-[#1e1e28] rounded-xl border border-[#2a2a35] shadow-sm overflow-hidden">
              <div className="p-4 flex justify-between items-center bg-[#21212c]">
                <span className="text-sm font-bold text-white">배경 제거</span>
                <ToggleSwitch checked={store.enableBgRemoval} onChange={c => store.setOption('enableBgRemoval', c)} />
              </div>

              <div className={cn("p-4 space-y-4 bg-[#1e1e28] transition-opacity", !store.enableBgRemoval && "opacity-50 pointer-events-none")}>
                {/* 디테일 제거 */}
                <div className="bg-[#16161f] rounded-lg border border-[#2a2a35] p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-neutral-200">디테일 제거 <span className="text-xs text-neutral-500 font-normal ml-2">(AI 모델 활성화)</span></span>
                    <ToggleSwitch checked={store.detailRemoval} onChange={c => store.setOption('detailRemoval', c)} size="small" />
                  </div>

                  <div className={cn("transition-opacity pl-2 border-l-2 border-[#2a2a35]", !store.detailRemoval && "opacity-50 pointer-events-none")}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-sm text-neutral-400">경계 부드럽게 자르기</span>
                      <ToggleSwitch checked={store.alphaMatting} onChange={c => store.setOption('alphaMatting', c)} size="small" />
                    </div>

                    <div className={cn("grid grid-cols-3 gap-4 transition-opacity", !store.alphaMatting && "opacity-50 pointer-events-none")}>
                      <div className="space-y-2">
                        <p className="text-xs text-neutral-400">사물 확정 감도</p>
                        <div className="flex items-center gap-2"><input type="range" min="0" max="255" value={store.fgThreshold} onChange={e => store.setOption('fgThreshold', Number(e.target.value))} className="w-full h-1 accent-indigo-500 bg-[#14141d]" /> <span className="text-xs font-mono text-indigo-400 w-6 text-right">{store.fgThreshold}</span></div>
                        <p className="text-[10px] text-neutral-600">추천: 240</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-neutral-400">배경 확정 감도</p>
                        <div className="flex items-center gap-2"><input type="range" min="0" max="50" value={store.bgThreshold} onChange={e => store.setOption('bgThreshold', Number(e.target.value))} className="w-full h-1 accent-indigo-500 bg-[#14141d]" /> <span className="text-xs font-mono text-indigo-400 w-6 text-right">{store.bgThreshold}</span></div>
                        <p className="text-[10px] text-neutral-600">추천: 5</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-neutral-400">경계 침식</p>
                        <div className="flex items-center gap-2"><input type="range" min="0" max="20" value={store.erodeSize} onChange={e => store.setOption('erodeSize', Number(e.target.value))} className="w-full h-1 accent-indigo-500 bg-[#14141d]" /> <span className="text-xs font-mono text-indigo-400 w-6 text-right">{store.erodeSize}</span></div>
                        <p className="text-[10px] text-neutral-600">추천: 5</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#16161f] rounded-lg border border-[#2a2a35] p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-neutral-200">가짜 패턴 지우기</span>
                      <ToggleSwitch checked={store.fakeTransRemoval} onChange={c => store.setOption('fakeTransRemoval', c)} size="small" />
                    </div>
                    <div className={cn("flex items-center gap-2 transition-opacity", !store.fakeTransRemoval && "opacity-50 pointer-events-none")}>
                      <input type="range" min="0" max="100" value={store.fakeTransTolerance} onChange={e => store.setOption('fakeTransTolerance', Number(e.target.value))} className="flex-1 h-1 accent-indigo-500 bg-[#14141d]" />
                      <span className="text-xs font-mono text-indigo-400 w-6 text-right">{store.fakeTransTolerance}</span>
                    </div>
                  </div>

                  <div className="bg-[#16161f] rounded-lg border border-[#2a2a35] p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-neutral-200">이미지 내부 배경 제거</span>
                      <ToggleSwitch checked={store.removeMatchBg} onChange={c => store.setOption('removeMatchBg', c)} size="small" />
                    </div>
                    <div className={cn("flex items-center gap-2 transition-opacity", !store.removeMatchBg && "opacity-50 pointer-events-none")}>
                      <span className="text-xs text-neutral-500 w-8">감도</span>
                      <input type="range" min="0" max="100" value={store.removeMatchBgTolerance} onChange={e => store.setOption('removeMatchBgTolerance', Number(e.target.value))} className="flex-1 h-1 accent-indigo-500 bg-[#14141d]" />
                      <span className="text-xs font-mono text-indigo-400 w-6 text-right">{store.removeMatchBgTolerance}</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>

      </main>

      {/* Footer / Action Bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-16 bg-[#16161f] border-t border-[#2a2a35] flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-400">
            {store.images.length === 0 ? "이미지를 추가하고 변환을 시작하세요" : `대기: ${store.images.filter(i => i.status === 'pending').length}건 | 완료: ${store.images.filter(i => i.status === 'done').length}건`}
          </span>
          {store.enableCompress && store.images.filter(i => i.status === 'done' && i.processedSize).length > 1 && (() => {
            const doneImages = store.images.filter(i => i.status === 'done' && i.processedSize);
            const totalOrig = doneImages.reduce((acc, curr) => acc + curr.originalSize, 0);
            const totalProc = doneImages.reduce((acc, curr) => acc + (curr.processedSize || 0), 0);
            if (totalProc < totalOrig) {
              const savedPercent = Math.round((1 - totalProc / totalOrig) * 100);
              return (
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                  <span className="text-xs font-bold text-emerald-400">최적화 완료</span>
                  <span className="text-xs text-emerald-500">총 {formatBytes(totalOrig - totalProc)} 절감 (-{savedPercent}%)</span>
                </div>
              );
            }
            return null;
          })()}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-neutral-300 hover:text-white transition group mr-2">
            <div className={cn("w-4 h-4 rounded-sm border flex items-center justify-center transition-colors", store.autoDownloadAfterProcessing ? "bg-indigo-500 border-indigo-500" : "bg-transparent border-neutral-600 group-hover:border-neutral-400")}>
              {store.autoDownloadAfterProcessing && <span className="text-white text-[10px] leading-none">✓</span>}
            </div>
            변환 완료 시 자동 다운로드
            <input type="checkbox" className="hidden" checked={store.autoDownloadAfterProcessing} onChange={e => store.setOption('autoDownloadAfterProcessing', e.target.checked)} />
          </label>

          <button onClick={store.resetOptions} className="px-6 py-2.5 rounded text-sm font-medium text-neutral-400 bg-[#1e1e28] hover:bg-[#252532] border border-[#2a2a35] transition">초기화</button>

          <button
            onClick={handleDownloadAll}
            disabled={store.images.filter(i => i.status === 'done' && !i.isDownloaded).length === 0}
            className="px-8 py-2.5 rounded text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 transition-colors shadow-sm">
            일괄 다운로드
          </button>

          <button
            onClick={handleStartProcessing}
            disabled={store.images.filter(i => i.status === 'pending').length === 0}
            className="px-8 py-2.5 rounded text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-400 disabled:bg-neutral-800 disabled:text-neutral-500 transition-colors shadow-[0_0_15px_rgba(99,102,241,0.3)]">
            변환 시작
          </button>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        .checkered-bg {
          background-image: 
            linear-gradient(45deg, #181822 25%, transparent 25%), 
            linear-gradient(-45deg, #181822 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, #181822 75%), 
            linear-gradient(-45deg, transparent 75%, #181822 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #14141d;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2a2a35;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3a3a46;
        }
      `}} />
    </div>
  );
}

// Reusable Toggle Switch Component
function ToggleSwitch({ checked, onChange, size = 'default' }: { checked: boolean, onChange: (val: boolean) => void, size?: 'default' | 'small' }) {
  const w = size === 'small' ? 'w-8' : 'w-10';
  const h = size === 'small' ? 'h-4' : 'h-5';
  const tw = size === 'small' ? 'w-3 h-3' : 'w-4 h-4';
  const tx = size === 'small' ? 'translate-x-4' : 'translate-x-5';

  return (
    <div
      onClick={() => onChange(!checked)}
      className={cn(
        "relative rounded-full cursor-pointer transition-colors duration-200 ease-in-out flex items-center",
        w, h,
        checked ? "bg-indigo-500" : "bg-[#2a2a35]"
      )}
    >
      <div className={cn(
        "bg-white rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ml-0.5",
        tw,
        checked ? tx : "translate-x-0"
      )} />
    </div>
  );
}
