'use client';

import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { OptionCard } from './OptionCard';
import { ToggleSwitch } from './ToggleSwitch';

export function MediaPipeBgRemovalOptionsCard() {
    const setOption = useAppStore(s => s.setOption);
    const enableBgRemoval = useAppStore(s => s.enableBgRemoval);
    const bgRemovalType = useAppStore(s => s.bgRemovalType);
    const mediaPipeModel = useAppStore(s => s.mediaPipeModel);
    const onnxThreshold = useAppStore(s => s.onnxThreshold);

    return (
        <OptionCard
            title="배경 지우기"
            subtitle="Remove background"
            className="options-grid-full"
            contentClassName="bg-removal-content"
            headerAction={<ToggleSwitch checked={enableBgRemoval} onChange={c => setOption('enableBgRemoval', c)} />}
            disabled={!enableBgRemoval}
        >
            <div className="bg-removal-tabs mb-4">
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 custom-scrollbar overflow-x-auto">
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'person' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'person')}
                        disabled={!enableBgRemoval}
                    >
                        인물
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'object1' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'object1')}
                        disabled={!enableBgRemoval}
                    >
                        기본 사물
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'object2' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'object2')}
                        disabled={!enableBgRemoval}
                    >
                        사물 (DeepLab)
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'object3' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'object3')}
                        disabled={!enableBgRemoval}
                    >
                        인물 (MODNet)
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'object4' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'object4')}
                        disabled={!enableBgRemoval}
                    >
                        사물 (MODNet)
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'object5' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'object5')}
                        disabled={!enableBgRemoval}
                    >
                        제품 (RMBG)
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'object6' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'object6')}
                        disabled={!enableBgRemoval}
                    >
                        범용 (BEN2)
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'object7' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'object7')}
                        disabled={!enableBgRemoval}
                    >
                        정밀 (MODNet)
                    </button>
                    <button
                        className={cn(
                            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                            bgRemovalType === 'object8' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/60"
                        )}
                        onClick={() => setOption('bgRemovalType', 'object8')}
                        disabled={!enableBgRemoval}
                    >
                        고성능 (U²Net)
                    </button>
                </div>
            </div>

            {bgRemovalType === 'person' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">MediaPipe Selfie Segmentation 모델을 사용합니다.</p>
                    <div className="grid-cols-2-gap">
                        {(['general', 'landscape'] as const).map((m) => (
                            <label key={m} className="modal-option-item u2net-option-label">
                                <input
                                    type="radio"
                                    className="hidden"
                                    checked={mediaPipeModel === m}
                                    onChange={() => setOption('mediaPipeModel', m)}
                                    disabled={!enableBgRemoval}
                                />
                                <div className={cn("radio-custom", mediaPipeModel === m && "radio-custom-checked")}>
                                    {mediaPipeModel === m && <div className="radio-custom-inner" />}
                                </div>
                                <span className="modal-option-text">
                                    {m === 'general' ? 'General (기본)' : 'Landscape (원거리)'}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {bgRemovalType === 'object1' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">U²-Net (ONNX) 모델입니다. 강력한 사물 추출 성능을 제공합니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs text-center">가장 권장되는 사물 전용 모델입니다.</span>
                    </div>
                </div>
            )}

            {bgRemovalType === 'object2' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">Vision Segmentation(DeepLabV3) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">최신 MediaPipe 엔진으로 구동됩니다.</span>
                    </div>
                </div>
            )}

            {bgRemovalType === 'object3' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">MODNet (Portrait Matting) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">인물 및 사물 경계면을 정밀하게 분리합니다.</span>
                    </div>
                </div>
            )}

            {bgRemovalType === 'object4' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">MODNet (Portrait Matting) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">인물 및 사물 경계면을 정밀하게 분리합니다.</span>
                    </div>
                </div>
            )}

            {bgRemovalType === 'object5' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">RMBG-1.4 (briaai) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">제품·사물 배경 제거에 특화된 고성능 모델입니다.</span>
                    </div>
                </div>
            )}

            {bgRemovalType === 'object6' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">BEN2 (onnx-community) 모델입니다.</p>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                        <span className="text-white/40 text-xs">Transformers.js 최신 배경 제거 기본 모델입니다.</span>
                    </div>
                </div>
            )}

            {bgRemovalType === 'object7' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">MODNet (ONNX + onnxruntime-web) 모델입니다.</p>
                    <div className="slider-row-wide mt-2">
                        <span className="input-label w-16 shrink-0 mb-0">임계값</span>
                        <input
                            type="range"
                            className="range-slider"
                            min={0} max={100} step={5}
                            value={Math.round(onnxThreshold * 100)}
                            onChange={e => setOption('onnxThreshold', Number(e.target.value) / 100)}
                            disabled={!enableBgRemoval}
                        />
                        <span className="slider-value">{Math.round(onnxThreshold * 100)}%</span>
                    </div>
                </div>
            )}

            {bgRemovalType === 'object8' && (
                <div className="bg-removal-inner animate-in fade-in slide-in-from-bottom-2">
                    <p className="input-label u2net-desc mb-3">U²-Net Full (ONNX) 모델입니다.</p>
                    <div className="slider-row-wide mt-2">
                        <span className="input-label w-16 shrink-0 mb-0">임계값</span>
                        <input
                            type="range"
                            className="range-slider"
                            min={0} max={100} step={5}
                            value={Math.round(onnxThreshold * 100)}
                            onChange={e => setOption('onnxThreshold', Number(e.target.value) / 100)}
                            disabled={!enableBgRemoval}
                        />
                        <span className="slider-value">{Math.round(onnxThreshold * 100)}%</span>
                    </div>
                </div>
            )}
        </OptionCard>
    );
}
