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
  Footer,
  Glass,
  GlassDistortionFilter,
  Header,
  ImageList,
  OptionCard,
  ResizeOptionsCard,
  SettingsModal,
  SortablePresetItem,
  ToggleSwitch,
  BrushEditor,
} from '@/components';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { usePresetDragDrop } from '@/hooks/usePresetDragDrop';
import dynamic from 'next/dynamic';

// 일괄 처리 탭 동적 로드 (로딩 스피너를 빨리 멈추기 위해 백그라운드에서 로드)
const BatchTabContent = dynamic(() => import('./BatchTabContent'), {
  ssr: false
});

type Tab = 'batch' | 'individual';

function useHydrate() {
  const [isHydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return isHydrated;
}

interface HomeClientProps {
  initialSlug?: string;
}

export default function HomeClient({ initialSlug }: HomeClientProps) {
  const isHydrated = useHydrate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);

  // 초기 탭 설정 (서버에서 받은 initialSlug 활용)
  const [activeTab, setActiveTab] = useState<Tab>(initialSlug === 'batch' ? 'batch' : 'individual');
  const [shouldRenderBatch, setShouldRenderBatch] = useState(initialSlug === 'batch');
  const { t } = useTranslation();

  // 초기로딩 최적화: 브라우저가 한가할 때 일괄 처리 섹션을 미리 준비 (지연 마운트)
  useEffect(() => {
    if (initialSlug !== 'batch') {
      const timer = setTimeout(() => {
        setShouldRenderBatch(true);
      }, 1500); // 1.5초 후 또는 유휴 시간에 마운트
      return () => clearTimeout(timer);
    }
  }, [initialSlug]);

  // URL과 탭 동기화 로직 (뒤로가기/앞으로가기 대응)
  useEffect(() => {
    // 만약 루트(/)로 들어왔다면 기본적으로 주소창을 /image-editor로 변경
    if (window.location.pathname === '/' || window.location.pathname === '') {
      window.history.replaceState({ tab: 'individual' }, '', '/image-editor');
    }

    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/image-batch') {
        setActiveTab('batch');
        setShouldRenderBatch(true);
      } else if (path === '/image-editor') {
        setActiveTab('individual');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'batch') setShouldRenderBatch(true); // 탭 전환 시 즉시 렌더링 시작
    const newPath = tab === 'batch' ? '/image-batch' : '/image-editor';
    window.history.pushState({ tab }, '', newPath);
  }, []);

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
      <Header onOpenSettings={() => setIsSettingsOpen(true)} activeTab={activeTab} onTabChange={handleTabChange} />
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}

      {/* 일괄 처리 탭 (지연 렌더링 및 코드 분할 적용) */}
      {shouldRenderBatch && activeTab === 'batch' && (
        <BatchTabContent
          store={store}
          t={t}
          handleDragOver={handleDragOver}
          handleDrop={handleDrop}
          fileInputRef={fileInputRef}
          handleSingleDownload={handleSingleDownload}
          handleSavePreset={handleSavePreset}
          sensors={sensors}
          handleDragEnd={handleDragEnd}
          handleUpdatePreset={handleUpdatePreset}
          handleRenamePreset={handleRenamePreset}
          handleDeletePreset={handleDeletePreset}
          handleStartProcessing={handleStartProcessing}
          setResizeError={setResizeError}
          pendingCount={pendingCount}
          downloadableCount={downloadableCount}
          handleDownloadAll={handleDownloadAll}
        />
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

