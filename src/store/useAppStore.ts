/**
 * useAppStore.ts
 * 
 * Zustand를 사용한 전역 상태 관리 파일입니다.
 * 이미지 목록, 처리 옵션, 사용자 프로필(프리셋) 등을 관리하며, 이미지 처리 파이프라인의 흐름을 제어합니다.
 * 'persist' 미들웨어를 사용하여 브라우저 새로고침 후에도 설정과 프로필이 유지됩니다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 개별 이미지 객체의 상태와 정보를 정의합니다.
 */
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

import i18n from '../lib/i18n';

/**
 * 이미지 처리 엔진에 전달될 설정 옵션들을 정의합니다.
 */
export interface AppOptions {
    // 여백 제거 (Auto Crop)
    enableAutoCrop: boolean;
    autoCropMargin: number;

    // 배경 제거 (MediaPipe)
    enableBgRemoval: boolean;
    bgRemovalModel: 'selfie' | 'landscape';

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

    autoDownloadAfterProcessing: boolean; // 모든 변환 완료 후 자동 다운로드
    downloadMode: 'default' | 'custom';

    enableCustomFormat: boolean;
    customFormat: 'png' | 'jpg' | 'webp' | 'svg';

    // 언어 설정
    language: 'auto' | 'ko' | 'en';
}

/**
 * 사용자 정의 설정 프리셋(프로필) 구조입니다.
 */
export interface Profile {
    id: string;
    name: string;
    options: AppOptions;
}

/**
 * 앱 초기 실행 시 적용될 기본 설정값입니다.
 */
const defaultOptions: AppOptions = {
    enableAutoCrop: false,
    autoCropMargin: 0,

    enableBgRemoval: false,
    bgRemovalModel: 'selfie',

    enableCompress: true,
    quality: 60,

    enableResize: false,
    resizeWidth: '1200',
    resizeHeight: '',
    keepRatio: true,

    enableGrayscale: false,
    grayscale: 50,

    autoDownloadAfterProcessing: false,
    downloadMode: 'default',

    enableCustomFormat: false,
    customFormat: 'png',

    language: 'auto',
};

/**
 * 프로파일(프리셋)에 저장하거나 불러올 때 사용할 이미지 처리 관련 옵션 키들입니다.
 */
const imageOptionKeys = [
    'enableAutoCrop', 'autoCropMargin',
    'enableBgRemoval', 'bgRemovalModel',
    'enableCompress', 'quality',
    'enableResize', 'resizeWidth', 'resizeHeight', 'keepRatio',
    'enableGrayscale', 'grayscale',
    'enableCustomFormat', 'customFormat'
] as const;

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
    setLanguage: (lang: 'auto' | 'ko' | 'en') => void;
    setCustomDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void;
    resetOptions: () => void;

    // Profile Actions
    saveProfile: (name: string) => void;
    updateProfile: (id: string) => void;
    loadProfile: (id: string) => void;
    deleteProfile: (id: string) => void;
    renameProfile: (id: string, newName: string) => void;
    reorderProfiles: (startIndex: number, endIndex: number) => void;
}

/**
 * 헬퍼: 이미지의 URL 메모리를 해제합니다.
 */
function revokeImageUrls(img: ImageItem) {
    if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    if (img.processedUrl) URL.revokeObjectURL(img.processedUrl);
}

/**
 * 헬퍼: 현재 상태에서 이미지 처리와 관련된 옵션들만 추출합니다.
 */
function extractImageOptions(state: AppState): AppOptions {
    const options = {} as any;
    imageOptionKeys.forEach(key => {
        options[key] = state[key as keyof AppOptions];
    });
    // 언어 설정도 옵션에 포함시켜 프로필에 저장되도록 함
    options.language = state.language;
    return options as AppOptions;
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            images: [],
            profiles: [],
            activeProfileId: null,
            customDirectoryHandle: null,

            ...defaultOptions,

            addImages: (files: File[]) => set((state: AppState) => {
                // 기존에 변환이 완료된(done) 상태이면서 다운로드까지 완료된 이미지만 새 이미지가 추가될 때 자동 삭제
                const remainingImages = state.images.filter(img => {
                    if (img.status === 'done' && img.isDownloaded) {
                        revokeImageUrls(img);
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

            removeImage: (id: string) => set((state: AppState) => {
                const img = state.images.find(i => i.id === id);
                if (img) revokeImageUrls(img);
                return { images: state.images.filter(img => img.id !== id) };
            }),

            clearImages: () => set((state: AppState) => {
                state.images.forEach(revokeImageUrls);
                return { images: [] };
            }),

            updateImageStatus: (id: string, updates: Partial<ImageItem>) => set((state: AppState) => ({
                images: state.images.map(img => img.id === id ? { ...img, ...updates } : img)
            })),

            setOption: <K extends keyof AppOptions>(key: K, value: AppOptions[K]) => set({ [key]: value } as any),

            setLanguage: (lang: 'auto' | 'ko' | 'en') => {
                if (lang !== 'auto') {
                    i18n.changeLanguage(lang);
                }
                set({ language: lang });
            },

            setCustomDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => set({ customDirectoryHandle: handle }),

            resetOptions: () => set({ ...defaultOptions, activeProfileId: null }),

            saveProfile: (name: string) => {
                const state = get();
                const newProfile: Profile = {
                    id: Date.now().toString(),
                    name,
                    options: extractImageOptions(state),
                };
                set({ profiles: [...state.profiles, newProfile], activeProfileId: newProfile.id });
            },

            updateProfile: (id: string) => {
                const state = get();
                set({
                    profiles: state.profiles.map((p: Profile) => p.id === id ? { ...p, options: extractImageOptions(state) } : p)
                });
            },

            loadProfile: (id: string) => {
                const state = get();
                const profile = state.profiles.find(p => p.id === id);
                if (profile) {
                    set({ ...profile.options, activeProfileId: id });
                    // 프로필 로드 시 설정된 언어가 있다면 적용
                    if (profile.options.language && profile.options.language !== 'auto') {
                        i18n.changeLanguage(profile.options.language);
                    }
                }
            },

            deleteProfile: (id: string) => set((state: AppState) => ({
                profiles: state.profiles.filter(p => p.id !== id),
                activeProfileId: state.activeProfileId === id ? null : state.activeProfileId
            })),

            renameProfile: (id: string, newName: string) => set((state: AppState) => ({
                profiles: state.profiles.map(p => p.id === id ? { ...p, name: newName } : p)
            })),

            reorderProfiles: (startIndex: number, endIndex: number) => set((state: AppState) => {
                const result = Array.from(state.profiles);
                const [removed] = result.splice(startIndex, 1);
                result.splice(endIndex, 0, removed);
                return { profiles: result };
            }),
        }),
        {
            name: 'image51-storage',
            version: 1,
            partialize: (state: AppState) => {
                const { images, customDirectoryHandle, ...rest } = state;
                const result = rest as any;
                if (result.autoDownloadAfterProcessing === undefined) result.autoDownloadAfterProcessing = false;
                return result;
            },
            merge: (persistedState: any, currentState: AppState) => {
                const merged = { ...currentState, ...(persistedState as Partial<AppState>) };
                // 스토리지에서 불러온 직후 언어 설정 적용
                if (merged.language && merged.language !== 'auto') {
                    i18n.changeLanguage(merged.language);
                }
                return merged;
            }
        }
    )
);

