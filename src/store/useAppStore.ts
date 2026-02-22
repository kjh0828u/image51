import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ImageItem {
    id: string;
    file: File;
    previewUrl: string;
    processedUrl?: string | null;
    status: 'pending' | 'processing' | 'done' | 'error';
    originalSize: number;
    processedSize?: number;
    isDownloaded?: boolean;
}

export interface AppOptions {
    // 여백 제거 (Auto Crop)
    enableAutoCrop: boolean;
    autoCropMargin: number;

    // 이미지 압축 (Compress)
    enableCompress: boolean;
    quality: number;

    // 이미지 크기 조절 (Resize)
    enableResize: boolean;
    resizeWidth: string;
    resizeHeight: string;
    keepRatio: boolean;

    // 흑백 처리 (Grayscale)
    enableGrayscale: boolean;
    grayscale: number;

    // 배경 제거 (Background Removal)
    enableBgRemoval: boolean;
    detailRemoval: boolean;
    alphaMatting: boolean;
    fgThreshold: number;
    bgThreshold: number;
    erodeSize: number;

    fakeTransRemoval: boolean;
    fakeTransTolerance: number;

    removeMatchBg: boolean;
    removeMatchBgTolerance: number;

    openFolderAfterProcessing: boolean; // 다운로드 완료 시 폴더 열기
    autoDownloadAfterProcessing: boolean; // 모든 변환 완료 후 자동 다운로드
    downloadMode: 'default' | 'custom';
}

export interface Profile {
    id: string;
    name: string;
    options: AppOptions;
}

const defaultOptions: AppOptions = {
    enableAutoCrop: false,
    autoCropMargin: 0,

    enableCompress: false,
    quality: 60,

    enableResize: false,
    resizeWidth: '200',
    resizeHeight: '',
    keepRatio: true,

    enableGrayscale: false,
    grayscale: 50,

    enableBgRemoval: false,
    detailRemoval: false,
    alphaMatting: true,
    fgThreshold: 240,
    bgThreshold: 5,
    erodeSize: 5,

    fakeTransRemoval: false,
    fakeTransTolerance: 20,

    removeMatchBg: false,
    removeMatchBgTolerance: 30,

    openFolderAfterProcessing: true,
    autoDownloadAfterProcessing: false,
    downloadMode: 'default',
};

export interface AppState extends AppOptions {
    images: ImageItem[];
    profiles: Profile[];
    activeProfileId: string | null;
    customDirectoryHandle: FileSystemDirectoryHandle | null;

    // Actions
    addImages: (newFiles: File[]) => void;
    removeImage: (id: string) => void;
    clearImages: () => void;
    updateImageStatus: (id: string, updates: Partial<ImageItem>) => void;

    setOption: <K extends keyof AppOptions>(key: K, value: AppOptions[K]) => void;
    setCustomDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void;
    resetOptions: () => void;

    // Profile Actions
    saveProfile: (name: string) => void;
    loadProfile: (id: string) => void;
    deleteProfile: (id: string) => void;
    renameProfile: (id: string, newName: string) => void;
    reorderProfiles: (startIndex: number, endIndex: number) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            images: [],
            profiles: [],
            activeProfileId: null,
            customDirectoryHandle: null,

            ...defaultOptions,

            addImages: (files) => set((state) => {
                // 기존에 변환이 완료된(done) 상태이면서 다운로드까지 완료된 이미지만 새 이미지가 추가될 때 자동 삭제
                const remainingImages = state.images.filter(img => {
                    if (img.status === 'done' && img.isDownloaded) {
                        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
                        if (img.processedUrl) URL.revokeObjectURL(img.processedUrl);
                        return false;
                    }
                    return true;
                });

                const newItems = files.map(file => ({
                    id: Math.random().toString(36).substring(7),
                    file,
                    previewUrl: URL.createObjectURL(file),
                    status: 'pending' as const,
                    originalSize: file.size,
                }));
                return { images: [...remainingImages, ...newItems] };
            }),

            removeImage: (id) => set((state) => {
                const img = state.images.find(i => i.id === id);
                if (img?.previewUrl) URL.revokeObjectURL(img.previewUrl);
                if (img?.processedUrl) URL.revokeObjectURL(img.processedUrl);

                return { images: state.images.filter(img => img.id !== id) };
            }),

            clearImages: () => set((state) => {
                state.images.forEach(img => {
                    if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
                    if (img?.processedUrl) URL.revokeObjectURL(img.processedUrl);
                });
                return { images: [] };
            }),

            updateImageStatus: (id, updates) => set((state) => ({
                images: state.images.map(img => img.id === id ? { ...img, ...updates } : img)
            })),

            setOption: (key, value) => set({ [key]: value }),
            setCustomDirectoryHandle: (handle) => set({ customDirectoryHandle: handle }),

            resetOptions: () => set({ ...defaultOptions, activeProfileId: null }),

            saveProfile: (name) => {
                const state = get();
                const curOptions = Object.keys(defaultOptions).reduce((acc, k) => {
                    const key = k as keyof AppOptions;
                    (acc as any)[key] = state[key];
                    return acc;
                }, {} as AppOptions);

                const newProfile: Profile = {
                    id: Date.now().toString(),
                    name,
                    options: curOptions,
                };
                set({ profiles: [...state.profiles, newProfile], activeProfileId: newProfile.id });
            },

            loadProfile: (id) => {
                const state = get();
                const profile = state.profiles.find(p => p.id === id);
                if (profile) {
                    set({ ...profile.options, activeProfileId: id });
                }
            },

            deleteProfile: (id) => set((state) => ({
                profiles: state.profiles.filter(p => p.id !== id),
                activeProfileId: state.activeProfileId === id ? null : state.activeProfileId
            })),

            renameProfile: (id, newName) => set((state) => ({
                profiles: state.profiles.map(p => p.id === id ? { ...p, name: newName } : p)
            })),

            reorderProfiles: (startIndex, endIndex) => set((state) => {
                const result = Array.from(state.profiles);
                const [removed] = result.splice(startIndex, 1);
                result.splice(endIndex, 0, removed);
                return { profiles: result };
            }),
        }),
        {
            name: 'image51-storage',
            // images, customDirectoryHandle 상태는 저장하지 않고(메모리 참조 에러 방지), 옵션과 프로파일만 로컬 스토리지에 유지
            partialize: (state) => {
                const { images, customDirectoryHandle, ...rest } = state;
                const result = rest as any;
                if (result.autoDownloadAfterProcessing === undefined) result.autoDownloadAfterProcessing = false;
                if (result.openFolderAfterProcessing === undefined) result.openFolderAfterProcessing = true;
                return result;
            },
        }
    )
);
