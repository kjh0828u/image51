/**
 * imageProcessor.ts
 * 
 * AI 모델(Transformers.js)과 캔버스 유틸리티를 결합하여 실제 이미지 변환을 수행하는 핵심 로직입니다.
 * 배경 제거, 필터링, 이미지 압축, 크기 조절 등의 파이프라인을 관리합니다.
 */
import { AppOptions } from "../store/useAppStore";
import { pipeline, env } from "@huggingface/transformers";
import Compressor from 'compressorjs';
import {
    getCanvasAndContext,
    getImageData,
    canvasToBlob,
    applyGrayscale,
    removeFakeTransparency,
    autoCropCanvas,
    resizeCanvas,
    applyAlphaMatting,
    erodeAlpha,
    removeColorMatch
} from './canvasUtils';

// 모델 로딩 설정
env.allowLocalModels = false;
env.useBrowserCache = true;

/**
 * 전역 로그 제어: ONNX/WebGPU 관련 특정 콘솔 경고를 차단하여 개발자 도구의 가독성을 높입니다.
 */
if (typeof window !== 'undefined') {
    const filters = [
        'VerifyEachNodeIsAssignedToAnEp',
        'powerPreference option is currently ignored',
        'Rerunning with verbose output'
    ];

    const wrapLog = (orig: any) => (...args: any[]) => {
        const msg = args.map(a => String(a)).join(' ');
        if (filters.some(f => msg.includes(f))) return;
        orig(...args);
    };

    console.warn = wrapLog(console.warn);
    console.error = wrapLog(console.error);
}

// 모델 싱글톤 캐시
let bgRemover: any = null;
const u2netModels: Record<string, any> = {};

/**
 * RMBG 1.4 모델(배경 제거용)을 불러옵니다.
 */
async function getModel() {
    if (!bgRemover) {
        bgRemover = await pipeline("image-segmentation", "briaai/RMBG-1.4", { device: "webgpu" });
    }
    return bgRemover;
}

/**
 * U2Net 모델(일반/사람 전용 세그멘테이션)을 불러옵니다.
 */
async function getU2NetModel(modelType: 'general' | 'human') {
    const modelId = modelType === 'human' ? 'BritishWerewolf/U-2-Net-Human-Seg' : 'BritishWerewolf/U-2-Net';
    if (!u2netModels[modelType]) {
        const { AutoModel } = await import('@huggingface/transformers');
        u2netModels[modelType] = await AutoModel.from_pretrained(modelId, { dtype: 'fp32' });
    }
    return u2netModels[modelType];
}

/**
 * U2Net용 이미지 전처리: 320x320 크기로 조정 및 정규화를 수행합니다.
 */
function u2netPreprocess(blob: ImageBitmap): Float32Array {
    const SIZE = 320;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(blob, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    const tensor = new Float32Array(3 * SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
        tensor[0 * SIZE * SIZE + i] = (data[i * 4 + 0] / 255 - mean[0]) / std[0];
        tensor[1 * SIZE * SIZE + i] = (data[i * 4 + 1] / 255 - mean[1]) / std[1];
        tensor[2 * SIZE * SIZE + i] = (data[i * 4 + 2] / 255 - mean[2]) / std[2];
    }
    return tensor;
}

/** 
 * U2Net 모델을 사용하여 배경을 제거합니다.
 */
export async function removeBackgroundU2Net(blob: Blob, modelType: 'general' | 'human'): Promise<Blob> {
    const { Tensor } = await import('@huggingface/transformers');
    const model = await getU2NetModel(modelType);
    const origBmp = await createImageBitmap(blob);
    const { width: origW, height: origH } = origBmp;

    const SIZE = 320;
    const inputTensor = new Tensor('float32', u2netPreprocess(origBmp), [1, 3, SIZE, SIZE]);
    const output = await (model as any)({ 'input.1': inputTensor });
    const outTensor = output['1959'] ?? output[Object.keys(output)[0]];
    const rawData = outTensor.data as Float32Array;
    const outH = outTensor.dims[outTensor.dims.length - 2] as number;
    const outW = outTensor.dims[outTensor.dims.length - 1] as number;

    const maskRgba = new Uint8ClampedArray(outW * outH * 4);
    for (let i = 0; i < outW * outH; i++) {
        const v = rawData[i] < 0 ? 255 : 0;
        maskRgba[i * 4 + 0] = v; maskRgba[i * 4 + 1] = v; maskRgba[i * 4 + 2] = v; maskRgba[i * 4 + 3] = v;
    }

    const { canvas: scaledMaskCanvas, ctx: scaledCtx } = await getCanvasAndContext(origBmp);
    const scaledMaskData = new Uint8ClampedArray(origW * origH * 4);
    for (let y = 0; y < origH; y++) {
        for (let x = 0; x < origW; x++) {
            const srcIdx = (Math.floor(y * outH / origH) * outW + Math.floor(x * outW / origW)) * 4;
            const dstIdx = (y * origW + x) * 4;
            scaledMaskData[dstIdx + 3] = maskRgba[srcIdx + 3];
        }
    }
    scaledCtx.putImageData(new ImageData(scaledMaskData, origW, origH), 0, 0);

    const { canvas: fgCanvas, ctx: fgCtx } = await getCanvasAndContext(origBmp);
    fgCtx.globalCompositeOperation = 'destination-in';
    fgCtx.drawImage(scaledMaskCanvas, 0, 0);
    return canvasToBlob(fgCanvas);
}

/**
 * RMBG 1.4 모델 및 추가 후처리를 사용하여 배경을 제거합니다.
 */
async function applyBgRemoval(currentBlob: Blob, origBmp: ImageBitmap, options: AppOptions): Promise<Blob> {
    const { detailRemoval, alphaMatting, enableFgThreshold, fgThreshold, enableBgThreshold, bgThreshold, enableErodeSize, erodeSize } = options;
    const remover: any = await getModel();
    const result: any = await remover(URL.createObjectURL(currentBlob), { threshold: 0.5, mask_threshold: 0.5 });

    let maskImage = Array.isArray(result) ? (result.find((r: any) => r.label === 'foreground')?.mask || result[0].mask || result[0]) : (result.mask || result);
    let pixelData = maskImage.data instanceof Uint8ClampedArray ? maskImage.data : new Uint8ClampedArray(maskImage.data);

    if (maskImage.channels === 1) {
        const rgba = new Uint8ClampedArray(maskImage.width * maskImage.height * 4);
        for (let i = 0; i < pixelData.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = rgba[i * 4 + 3] = pixelData[i]; }
        pixelData = rgba;
    }

    const maskIdata = new ImageData(pixelData, maskImage.width, maskImage.height);
    const data = maskIdata.data;
    const useAlpha = detailRemoval ? alphaMatting : true;
    const fgT = detailRemoval && enableFgThreshold ? fgThreshold : 240;
    const bgT = detailRemoval && enableBgThreshold ? bgThreshold : 5;
    const eSize = detailRemoval && enableErodeSize ? erodeSize : 5;

    // 후처리 기능 수행
    if (useAlpha) {
        applyAlphaMatting(data, fgT, bgT);
        if (eSize > 0) {
            erodeAlpha(data, maskImage.width, maskImage.height, eSize);
        }
    }

    const { canvas: fgCanvas, ctx: fgCtx } = await getCanvasAndContext(origBmp);
    const { canvas: mCanvas } = await getCanvasAndContext(new ImageData(data, maskImage.width, maskImage.height));

    fgCtx.globalCompositeOperation = "destination-in";
    fgCtx.drawImage(mCanvas, 0, 0, maskImage.width, maskImage.height, 0, 0, origBmp.width, origBmp.height);
    return canvasToBlob(fgCanvas);
}

/**
 * [이미지 처리 통합 파이프라인]
 * 사용자가 선택한 옵션들을 순차적으로 적용하여 최종 변환된 이미지의 결과 URL을 반환합니다.
 */
export async function processImage(file: File, options: AppOptions): Promise<string> {
    let currentBlob: Blob = file;

    // 1. U2Net 배경 제거 (선택 시)
    if (options.enableU2NetRemoval) {
        currentBlob = await removeBackgroundU2Net(currentBlob, options.u2netModel);
    }

    const origBmp = await createImageBitmap(file);
    let originalImageData: ImageData | null = null;
    if (options.enableBgRemoval && options.removeMatchBg) {
        const { canvas } = await getCanvasAndContext(currentBlob);
        originalImageData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    }

    // 2. RMBG 배경 제거 (선택 시)
    if (options.enableBgRemoval) {
        currentBlob = await applyBgRemoval(currentBlob, origBmp, options);
    }

    const { canvas, ctx } = await getCanvasAndContext(currentBlob);
    const imgData = getImageData(canvas, ctx);
    const data = imgData.data;

    // 3. 체크무늬 투명 제거
    if (options.enableBgRemoval && options.fakeTransRemoval) {
        removeFakeTransparency(data, options.fakeTransTolerance);
        ctx.putImageData(imgData, 0, 0);
    }

    // 4. 컬러 매치 배경 제거
    if (options.enableBgRemoval && options.removeMatchBg && originalImageData) {
        removeColorMatch(data, originalImageData.data, options.removeMatchBgTolerance);
        ctx.putImageData(imgData, 0, 0);
    }

    // 5. 그레이스케일 처리
    if (options.enableGrayscale && options.grayscale > 0) {
        applyGrayscale(data, options.grayscale / 100);
        ctx.putImageData(imgData, 0, 0);
    }

    // 6. 자동 크롭 및 리사이징
    let workCanvas = canvas;
    if (options.enableAutoCrop) {
        workCanvas = autoCropCanvas(workCanvas, options.autoCropMargin);
    }
    if (options.enableResize) {
        workCanvas = resizeCanvas(workCanvas, options.resizeWidth, options.resizeHeight, options.keepRatio);
    }

    // 7. PNG/JPEG 포맷 처리
    let mimeType = (options.enableBgRemoval || options.enableU2NetRemoval) ? 'image/png' : (file.type || 'image/png');
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        const { canvas: fCanvas, ctx: fCtx } = await getCanvasAndContext(workCanvas);
        fCtx.fillStyle = '#FFFFFF'; fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.drawImage(workCanvas, 0, 0);
        workCanvas = fCanvas;
    }

    // 8. 압축 및 최종 결과 URL 생성
    let finalBlob = await canvasToBlob(workCanvas, mimeType);
    if (options.enableCompress) {
        finalBlob = await new Promise<Blob>((resolve) => {
            new Compressor(finalBlob, {
                quality: options.quality / 100, mimeType, strict: true, checkOrientation: false,
                success: resolve, error: () => resolve(finalBlob)
            });
        });
    }

    return URL.createObjectURL(finalBlob);
}
