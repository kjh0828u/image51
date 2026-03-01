import { AppOptions } from "../store/useAppStore";
import { pipeline, env } from "@huggingface/transformers";
import Compressor from 'compressorjs';
import {
    getCanvasAndContext,
    getImageData,
    canvasToBlob,
    applyGrayscale,
    removeFakeTransparency
} from './canvasUtils';

env.allowLocalModels = false;
env.useBrowserCache = true;

// 전역(Global) 기반으로 ONNX/WebGPU 관련 안내성 경고 로그를 완전히 차단
if (typeof window !== 'undefined') {
    const noop = () => { };
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

let bgRemover: any = null;
const u2netModels: Record<string, any> = {};

async function getModel() {
    if (!bgRemover) {
        bgRemover = await pipeline("image-segmentation", "briaai/RMBG-1.4", { device: "webgpu" });
    }
    return bgRemover;
}

async function getU2NetModel(modelType: 'general' | 'human') {
    const modelId = modelType === 'human' ? 'BritishWerewolf/U-2-Net-Human-Seg' : 'BritishWerewolf/U-2-Net';
    if (!u2netModels[modelType]) {
        const { AutoModel } = await import('@huggingface/transformers');
        u2netModels[modelType] = await AutoModel.from_pretrained(modelId, { dtype: 'fp32' });
    }
    return u2netModels[modelType];
}

/**
 * U2Net 전처리: 320x320 리사이즈 및 ImageNet 정규화
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
 * U2Net 배경 제거
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
 * RMBG 1.4 배경 제거 및 커스텀 마스크 가공
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

    if (useAlpha) {
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            data[i + 3] = a >= fgT ? 255 : (a <= bgT ? 0 : Math.round(((a - bgT) / (fgT - bgT)) * 255));
        }
        if (eSize > 0) {
            const temp = new Uint8ClampedArray(data);
            for (let y = 0; y < maskImage.height; y++) {
                for (let x = 0; x < maskImage.width; x++) {
                    const idx = (y * maskImage.width + x) * 4;
                    if (temp[idx + 3] > 0) {
                        let minA = 255;
                        for (let dy = -eSize; dy <= eSize; dy++) {
                            for (let dx = -eSize; dx <= eSize; dx++) {
                                const ny = y + dy, nx = x + dx;
                                if (ny >= 0 && ny < maskImage.height && nx >= 0 && nx < maskImage.width) minA = Math.min(minA, temp[(ny * maskImage.width + nx) * 4 + 3]);
                                else minA = 0;
                            }
                        }
                        data[idx + 3] = minA;
                    }
                }
            }
        }
    }

    const { canvas: fgCanvas, ctx: fgCtx } = await getCanvasAndContext(origBmp);
    const mCanvas = document.createElement("canvas");
    mCanvas.width = maskImage.width; mCanvas.height = maskImage.height;
    mCanvas.getContext("2d")!.putImageData(maskIdata, 0, 0);

    fgCtx.globalCompositeOperation = "destination-in";
    fgCtx.drawImage(mCanvas, 0, 0, maskImage.width, maskImage.height, 0, 0, origBmp.width, origBmp.height);
    return canvasToBlob(fgCanvas);
}

/**
 * 메인 이미지 처리 파이프라인
 */
export async function processImage(file: File, options: AppOptions): Promise<string> {
    let currentBlob: Blob = file;

    if (options.enableU2NetRemoval) {
        currentBlob = await removeBackgroundU2Net(currentBlob, options.u2netModel);
    }

    const origBmp = await createImageBitmap(file);
    let originalImageData: ImageData | null = null;
    if (options.enableBgRemoval && options.removeMatchBg) {
        const { canvas } = await getCanvasAndContext(currentBlob);
        originalImageData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    }

    if (options.enableBgRemoval) {
        currentBlob = await applyBgRemoval(currentBlob, origBmp, options);
    }

    const { canvas, ctx } = await getCanvasAndContext(currentBlob);
    const imgData = getImageData(canvas, ctx);
    const data = imgData.data;

    if (options.enableBgRemoval && options.fakeTransRemoval) {
        removeFakeTransparency(data, options.fakeTransTolerance);
        ctx.putImageData(imgData, 0, 0);
    }

    if (options.enableBgRemoval && options.removeMatchBg && originalImageData) {
        let sumR = 0, sumG = 0, sumB = 0, cnt = 0;
        const origData = originalImageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (origData[i + 3] > 200 && data[i + 3] < 50) { sumR += origData[i]; sumG += origData[i + 1]; sumB += origData[i + 2]; cnt++; }
        }
        if (cnt > 0) {
            const avgR = sumR / cnt, avgG = sumG / cnt, avgB = sumB / cnt, tolSq = options.removeMatchBgTolerance ** 2;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0 && ((data[i] - avgR) ** 2 + (data[i + 1] - avgG) ** 2 + (data[i + 2] - avgB) ** 2 < tolSq)) data[i + 3] = 0;
            }
            ctx.putImageData(imgData, 0, 0);
        }
    }

    if (options.enableGrayscale && options.grayscale > 0) {
        applyGrayscale(data, options.grayscale / 100);
        ctx.putImageData(imgData, 0, 0);
    }

    let workCanvas = canvas;
    if (options.enableAutoCrop) {
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0, found = false;
        const curData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                if (curData[(y * canvas.width + x) * 4 + 3] > 0) {
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); found = true;
                }
            }
        }
        if (found) {
            const cW = maxX - minX + 1, cH = maxY - minY + 1, nW = cW + options.autoCropMargin * 2, nH = cH + options.autoCropMargin * 2;
            const cropCanvas = document.createElement("canvas");
            cropCanvas.width = nW; cropCanvas.height = nH;
            cropCanvas.getContext("2d")!.drawImage(workCanvas, minX, minY, cW, cH, options.autoCropMargin, options.autoCropMargin, cW, cH);
            workCanvas = cropCanvas;
        }
    }

    if (options.enableResize) {
        let nW = parseInt(options.resizeWidth, 10) || workCanvas.width, nH = parseInt(options.resizeHeight, 10) || workCanvas.height;
        if (options.keepRatio) {
            const ratio = Math.min(nW / workCanvas.width, nH / workCanvas.height);
            nW = Math.max(1, Math.round(workCanvas.width * ratio)); nH = Math.max(1, Math.round(workCanvas.height * ratio));
        }
        if (nW !== workCanvas.width || nH !== workCanvas.height) {
            const rCanvas = document.createElement("canvas");
            rCanvas.width = nW; rCanvas.height = nH;
            const rCtx = rCanvas.getContext("2d")!;
            rCtx.imageSmoothingEnabled = true; rCtx.imageSmoothingQuality = "high";
            rCtx.drawImage(workCanvas, 0, 0, workCanvas.width, workCanvas.height, 0, 0, nW, nH);
            workCanvas = rCanvas;
        }
    }

    let mimeType = (options.enableBgRemoval || options.enableU2NetRemoval) ? 'image/png' : (file.type || 'image/png');
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        const fCanvas = document.createElement('canvas');
        fCanvas.width = workCanvas.width; fCanvas.height = workCanvas.height;
        const fCtx = fCanvas.getContext('2d')!;
        fCtx.fillStyle = '#FFFFFF'; fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.drawImage(workCanvas, 0, 0);
        workCanvas = fCanvas;
    }

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
