'use client';

import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { OptionCard } from './OptionCard';
import { ToggleSwitch } from './ToggleSwitch';

export function MediaPipeBgRemovalOptionsCard() {
    const store = useAppStore();

    return (
        <OptionCard
            title="배경 지우기"
            subtitle="Remove background"
            className="options-grid-full"
            contentClassName="bg-removal-content"
            headerAction={<ToggleSwitch checked={store.enableBgRemoval} onChange={c => store.setOption('enableBgRemoval', c)} />}
            disabled={!store.enableBgRemoval}
        >
            <div className="bg-removal-tabs mb-4">
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'person' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'person')}
                        disabled={!store.enableBgRemoval}
                    >
                        인물
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'object1' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'object1')}
                        disabled={!store.enableBgRemoval}
                    >
                        사물 1
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'object2' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'object2')}
                        disabled={!store.enableBgRemoval}
                    >
                        사물 2
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'object3' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'object3')}
                        disabled={!store.enableBgRemoval}
                    >
                        사물 3
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'object4' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'object4')}
                        disabled={!store.enableBgRemoval}
                    >
                        사물 4
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'object5' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'object5')}
                        disabled={!store.enableBgRemoval}
                    >
                        사물 5
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'object6' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'object6')}
                        disabled={!store.enableBgRemoval}
                    >
                        사물 6
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'object7' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'object7')}
                        disabled={!store.enableBgRemoval}
                    >
                        사물 7
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                            store.bgRemovalType === 'object8' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => store.setOption('bgRemovalType', 'object8')}
                        disabled={!store.enableBgRemoval}
                    >
                        사물 8
                    </button>
                </div>
            </div>

            {store.bgRemovalType === 'person' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">MediaPipe Selfie Segmentation 모델을 사용합니다.</p>
                    <div className="grid-cols-2-gap">
                        {(['general', 'landscape'] as const).map((m) => (
                            <label key={m} className="modal-option-item u2net-option-label">
                                <input
                                    type="radio"
                                    className="hidden"
                                    checked={store.mediaPipeModel === m}
                                    onChange={() => store.setOption('mediaPipeModel', m)}
                                    disabled={!store.enableBgRemoval}
                                />
                                <div className={cn("radio-custom", store.mediaPipeModel === m && "radio-custom-checked")}>
                                    {store.mediaPipeModel === m && <div className="radio-custom-inner" />}
                                </div>
                                <span className="modal-option-text">
                                    {m === 'general' ? 'General (기본)' : 'Landscape (원거리)'}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {store.bgRemovalType === 'object1' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">U²-Net (ONNX) 모델입니다. 강력한 사물 추출 성능을 제공합니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs text-center">가장 권장되는 사물 전용 모델입니다.</span>
                    </div>
                </div>
            )}

            {store.bgRemovalType === 'object2' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">Vision Segmentation(DeepLabV3) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">최신 MediaPipe 엔진으로 구동됩니다.</span>
                    </div>
                </div>
            )}

            {store.bgRemovalType === 'object3' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">MODNet (Portrait Matting) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">인물 및 사물 경계면을 정밀하게 분리합니다.</span>
                    </div>
                </div>
            )}

            {store.bgRemovalType === 'object4' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">MODNet (Portrait Matting) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">인물 및 사물 경계면을 정밀하게 분리합니다.</span>
                    </div>
                </div>
            )}

            {store.bgRemovalType === 'object5' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">RMBG-1.4 (briaai) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">제품·사물 배경 제거에 특화된 고성능 모델입니다.</span>
                    </div>
                </div>
            )}

            {store.bgRemovalType === 'object6' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">BEN2 (onnx-community) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">Transformers.js 최신 배경 제거 기본 모델입니다.</span>
                    </div>
                </div>
            )}

            {store.bgRemovalType === 'object7' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">MODNet (ONNX + onnxruntime-web) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">512×512 입력으로 직접 추론하는 Portrait Matting 모델입니다.</span>
                    </div>
                </div>
            )}

            {store.bgRemovalType === 'object8' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">U²-Net Full (ONNX) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">U²-Net Lite보다 큰 풀 버전 모델로 더 정밀한 추출을 제공합니다.</span>
                    </div>
                </div>
            )}
        </OptionCard>
    );
}
