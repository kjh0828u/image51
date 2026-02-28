import { AppOptions } from "../store/useAppStore";
import { pipeline, env } from "@huggingface/transformers";
import Compressor from 'compressorjs';

env.allowLocalModels = false;
env.useBrowserCache = true;

// 전역(Global) 기반으로 ONNX/WebGPU 관련 안내성 경고 로그를 완전히 차단
if (typeof window !== 'undefined') {
    const origWarn = console.warn;
    const origError = console.error;

    console.warn = (...args: any[]) => {
        const msg = args.map(a => String(a)).join(' ');
        if (msg.includes('VerifyEachNodeIsAssignedToAnEp')) return;
        if (msg.includes('powerPreference option is currently ignored')) return;
        if (msg.includes('Rerunning with verbose output')) return;
        origWarn(...args);
    };

    console.error = (...args: any[]) => {
        const msg = args.map(a => String(a)).join(' ');
        if (msg.includes('VerifyEachNodeIsAssignedToAnEp')) return;
        if (msg.includes('Rerunning with verbose output')) return;
        origError(...args);
    };
}

let bgRemover: unknown = null;

async function getModel() {
    if (!bgRemover) {
        bgRemover = await pipeline("image-segmentation", "briaai/RMBG-1.4", {
            device: "webgpu",
        });
    }
    return bgRemover;
}

// U2Net 모델 캐시 (general / human 각각 따로)
const u2netModels: Record<string, unknown> = {};

async function getU2NetModel(modelType: 'general' | 'human') {
    const modelId = modelType === 'human'
        ? 'BritishWerewolf/U-2-Net-Human-Seg'
        : 'BritishWerewolf/U-2-Net';

    if (!u2netModels[modelType]) {
        const { AutoModel } = await import('@huggingface/transformers');
        u2netModels[modelType] = await AutoModel.from_pretrained(modelId, { dtype: 'fp32' });
    }
    return u2netModels[modelType];
}

// U2Net 전처리: Canvas로 320×320 리사이즈 후 ImageNet 정규화 Float32 텐서 생성
function u2netPreprocess(blob: ImageBitmap): Float32Array {
    const SIZE = 320;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(blob, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    // ImageNet mean/std 정규화
    const mean = [0.485, 0.456, 0.406];
    const std  = [0.229, 0.224, 0.225];
    const tensor = new Float32Array(3 * SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
        tensor[0 * SIZE * SIZE + i] = (data[i * 4 + 0] / 255 - mean[0]) / std[0]; // R
        tensor[1 * SIZE * SIZE + i] = (data[i * 4 + 1] / 255 - mean[1]) / std[1]; // G
        tensor[2 * SIZE * SIZE + i] = (data[i * 4 + 2] / 255 - mean[2]) / std[2]; // B
    }
    return tensor;
}

// U2Net으로 배경 제거 수행 → 투명 PNG Blob 반환
export async function removeBackgroundU2Net(
    blob: Blob,
    modelType: 'general' | 'human'
): Promise<Blob> {
    const { Tensor } = await import('@huggingface/transformers');
    const model = await getU2NetModel(modelType);

    const origBmp = await createImageBitmap(blob);
    const origW = origBmp.width;
    const origH = origBmp.height;

    // 전처리: [1, 3, 320, 320] Float32 텐서
    const SIZE = 320;
    const pixelData = u2netPreprocess(origBmp);
    const inputTensor = new Tensor('float32', pixelData, [1, 3, SIZE, SIZE]);

    // 입력 키: "input.1" (ONNX config 확인)
    const output = await (model as any)({ 'input.1': inputTensor });

    // 출력 키: "1959" (primary composite output), 없으면 첫 번째 키로 폴백
    const outTensor = output['1959'] ?? output[Object.keys(output)[0]];
    const rawData = outTensor.data as Float32Array;
    const outH = outTensor.dims[outTensor.dims.length - 2] as number;
    const outW = outTensor.dims[outTensor.dims.length - 1] as number;

    // 디버그: rawData 범위 확인
    let dbgMin = Infinity, dbgMax = -Infinity, dbgPos = 0, dbgNeg = 0;
    for (let i = 0; i < rawData.length; i++) {
        if (rawData[i] < dbgMin) dbgMin = rawData[i];
        if (rawData[i] > dbgMax) dbgMax = rawData[i];
        if (rawData[i] > 0) dbgPos++; else dbgNeg++;
    }
    console.log('[U2Net] rawData min:', dbgMin.toFixed(3), 'max:', dbgMax.toFixed(3), 'pos(>0):', dbgPos, 'neg(<=0):', dbgNeg, 'total:', rawData.length);

    // rawData < 0 → foreground(유지), rawData > 0 → background(제거)
    // 완전 이진화 후 원본 해상도로 nearest-neighbor 스케일링 (흐림 방지)
    const maskRgba = new Uint8ClampedArray(outW * outH * 4);
    for (let i = 0; i < outW * outH; i++) {
        const v = rawData[i] < 0 ? 255 : 0;
        maskRgba[i * 4 + 0] = v;
        maskRgba[i * 4 + 1] = v;
        maskRgba[i * 4 + 2] = v;
        maskRgba[i * 4 + 3] = v;
    }

    // 마스크를 원본 해상도로 nearest-neighbor 업스케일 (이진 마스크가 흐려지지 않도록)
    const scaledMaskCanvas = document.createElement('canvas');
    scaledMaskCanvas.width = origW;
    scaledMaskCanvas.height = origH;
    const scaledCtx = scaledMaskCanvas.getContext('2d')!;
    const scaledMaskData = new Uint8ClampedArray(origW * origH * 4);
    for (let y = 0; y < origH; y++) {
        for (let x = 0; x < origW; x++) {
            const srcX = Math.floor(x * outW / origW);
            const srcY = Math.floor(y * outH / origH);
            const srcIdx = (srcY * outW + srcX) * 4;
            const dstIdx = (y * origW + x) * 4;
            scaledMaskData[dstIdx + 0] = maskRgba[srcIdx + 0];
            scaledMaskData[dstIdx + 1] = maskRgba[srcIdx + 1];
            scaledMaskData[dstIdx + 2] = maskRgba[srcIdx + 2];
            scaledMaskData[dstIdx + 3] = maskRgba[srcIdx + 3];
        }
    }
    scaledCtx.putImageData(new ImageData(scaledMaskData, origW, origH), 0, 0);

    // 원본 캔버스에 destination-in으로 마스크 합성
    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = origW;
    fgCanvas.height = origH;
    const fgCtx = fgCanvas.getContext('2d')!;
    fgCtx.drawImage(origBmp, 0, 0);
    fgCtx.globalCompositeOperation = 'destination-in';
    fgCtx.imageSmoothingEnabled = false;
    fgCtx.drawImage(scaledMaskCanvas, 0, 0);
    fgCtx.globalCompositeOperation = 'source-over';

    return new Promise<Blob>((resolve) =>
        fgCanvas.toBlob((b) => resolve(b!), 'image/png')
    );
}

// 캔버스에 이미지를 그리고 ImageData를 반환하는 헬퍼 함수
async function getImageDataFromBlob(blob: Blob): Promise<{ imgData: ImageData, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }> {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { imgData, canvas, ctx };
}

export async function processImage(file: File, options: AppOptions): Promise<string> {
    const {
        enableAutoCrop, autoCropMargin,
        enableCompress, quality,
        enableResize, resizeWidth, resizeHeight, keepRatio,
        enableGrayscale, grayscale,
        enableBgRemoval, detailRemoval, alphaMatting, fgThreshold, bgThreshold, erodeSize,
        fakeTransRemoval, fakeTransTolerance,
        removeMatchBg, removeMatchBgTolerance,
        enableU2NetRemoval, u2netModel,
    } = options;

    let currentBlob: Blob = file;

    // 0. U2Net 배경 제거 (기존 RMBG와 독립적으로 먼저 실행)
    if (enableU2NetRemoval) {
        currentBlob = await removeBackgroundU2Net(currentBlob, u2netModel);
    }

    // 원본 이미지 크기 파악
    const origBmp = await createImageBitmap(file);
    const origW = origBmp.width;
    const origH = origBmp.height;

    let originalImageData: ImageData | null = null;

    // 1. AI 배경 제거 (디테일 컷)
    if (enableBgRemoval) {
        // 원본 이미지 데이터 백업 (removeMatchBg에서 사용)
        if (removeMatchBg) {
            const { imgData } = await getImageDataFromBlob(currentBlob);
            originalImageData = imgData;
        }

        const remover: any = await getModel();
        const fileUrl = URL.createObjectURL(currentBlob);

        // AI 처리 수행 (고정된 1024x1024 등의 크기로 백그라운드 구동될 수 있음)
        const result: any = await (remover as any)(fileUrl, {
            // 기본 threshold를 넘김 (마스킹 후처리는 우리가 JS 코드로 수행)
            threshold: 0.5,
            mask_threshold: 0.5,
        });

        // 결과물 마스크 추출
        let maskImage;
        if (Array.isArray(result)) {
            maskImage = result.find((r: any) => r.label === 'foreground')?.mask || result[0].mask || result[0];
        } else {
            maskImage = result.mask || result;
        }

        let maskIdata: ImageData | null = null;
        if (maskImage && maskImage.data) {
            let pixelData = maskImage.data;
            if (!(pixelData instanceof Uint8ClampedArray)) {
                pixelData = new Uint8ClampedArray(maskImage.data);
            }

            // 만약 1채널 흑백 이미지라면 RGBA로 변환
            if (maskImage.channels === 1 && pixelData.length === maskImage.width * maskImage.height) {
                const rgbaData = new Uint8ClampedArray(maskImage.width * maskImage.height * 4);
                for (let i = 0; i < pixelData.length; i++) {
                    const val = pixelData[i];
                    rgbaData[i * 4] = val; rgbaData[i * 4 + 1] = val; rgbaData[i * 4 + 2] = val; rgbaData[i * 4 + 3] = val; // 알파 채널에 마스크 적용
                }
                maskIdata = new ImageData(rgbaData, maskImage.width, maskImage.height);
            } else if (maskImage.channels === 4) {
                maskIdata = new ImageData(pixelData, maskImage.width, maskImage.height);
            }
        }

        if (!maskIdata) {
            throw new Error(`Invalid output from transformers.js: ${typeof maskImage}`);
        }

        const mWidth = maskIdata.width;
        const mHeight = maskIdata.height;

        // Custom Alpha Matting / Thresholding / Erosion 알고리즘 직접 구현
        if (maskIdata) {
            const data = maskIdata.data;
            const { detailRemoval, alphaMatting, enableFgThreshold, fgThreshold, enableBgThreshold, bgThreshold, enableErodeSize, erodeSize } = options;
            const useAlpha = detailRemoval ? alphaMatting : true;
            const fgT = detailRemoval && enableFgThreshold ? fgThreshold : 240;
            const bgT = detailRemoval && enableBgThreshold ? bgThreshold : 5;
            const eSize = detailRemoval && enableErodeSize ? erodeSize : 5;

            // 1. Threshold 처리
            if (useAlpha) {
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3];
                    if (alpha >= fgT) {
                        data[i + 3] = 255;
                    } else if (alpha <= bgT) {
                        data[i + 3] = 0;
                    } else {
                        // 선형 스케일링
                        const range = fgT - bgT;
                        if (range > 0) {
                            data[i + 3] = Math.round(((alpha - bgT) / range) * 255);
                        }
                    }
                    // 색상은 흰색으로 강제 유지 (마스크의 목적)
                    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
                }

                // 2. Erosion 처리
                if (eSize > 0) {
                    const tempData = new Uint8ClampedArray(data);
                    const w = mWidth, h = mHeight;
                    for (let y = 0; y < h; y++) {
                        for (let x = 0; x < w; x++) {
                            const idx = (y * w + x) * 4;
                            if (tempData[idx + 3] > 0) {
                                let minAlpha = 255;
                                // Box filtering
                                for (let dy = -eSize; dy <= eSize; dy++) {
                                    for (let dx = -eSize; dx <= eSize; dx++) {
                                        const ny = y + dy;
                                        const nx = x + dx;
                                        if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                                            const nIdx = (ny * w + nx) * 4;
                                            if (tempData[nIdx + 3] < minAlpha) {
                                                minAlpha = tempData[nIdx + 3];
                                            }
                                        } else {
                                            minAlpha = 0;
                                        }
                                    }
                                }
                                data[idx + 3] = minAlpha;
                            }
                        }
                    }
                }
            }
        }

        // 💡 AI 마스크를 원본 이미지 위에 덮어씌워 색상과 해상력을 완벽 보존
        const fgCanvas = document.createElement("canvas");
        fgCanvas.width = origW;
        fgCanvas.height = origH;
        const fgCtx = fgCanvas.getContext("2d")!;
        fgCtx.drawImage(origBmp, 0, 0); // 원본 색상

        const mCanvas = document.createElement("canvas");
        mCanvas.width = mWidth;
        mCanvas.height = mHeight;
        mCanvas.getContext("2d")!.putImageData(maskIdata, 0, 0); // 마스크 모양

        // 마스크의 투명도 정보를 원본 이미지에 반영 (마스크 해상도를 원본 사이즈에 맞추면서 적용)
        fgCtx.globalCompositeOperation = "destination-in";
        fgCtx.imageSmoothingEnabled = true;
        fgCtx.imageSmoothingQuality = "high";
        fgCtx.drawImage(mCanvas, 0, 0, mWidth, mHeight, 0, 0, origW, origH);
        fgCtx.globalCompositeOperation = "source-over"; // 원상복구

        currentBlob = await new Promise<Blob>((resolve) => fgCanvas.toBlob((b) => resolve(b!), 'image/png'));
    }

    // 이후 과정은 Canvas API를 이용한 커스텀 후처리 파이프라인
    let { imgData, canvas, ctx } = await getImageDataFromBlob(currentBlob);

    let data = imgData.data;

    // 2. 가짜 투명도 제거 (체크무늬 감지)
    if (enableBgRemoval && fakeTransRemoval) {
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue; // 이미 투명하면 패스

            const r = data[i], g = data[i + 1], b = data[i + 2];
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const diff = maxC - minC;
            const avg = (r + g + b) / 3;

            // 흰/회색 톤 감지 및 밝기 제어
            if (diff < fakeTransTolerance && avg > 150) {
                data[i + 3] = 0; // Alpha 투명 처리
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    // 2-5. 이미지 내부 배경 제거 (AI가 날린 영역의 색상을 기반으로 살아남은 영역의 동일 색상 제거)
    if (enableBgRemoval && removeMatchBg && originalImageData) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        const origData = originalImageData.data;

        // 원본과 비교하여 배경 부분(AI에 의해 투명이 된 부분)의 평균 색상 구하기
        for (let i = 0; i < data.length; i += 4) {
            if (origData[i + 3] > 200 && data[i + 3] < 50) {
                sumR += origData[i];
                sumG += origData[i + 1];
                sumB += origData[i + 2];
                count++;
            }
        }

        if (count > 0) {
            const avgR = sumR / count;
            const avgG = sumG / count;
            const avgB = sumB / count;
            const tolSq = removeMatchBgTolerance * removeMatchBgTolerance;

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) {
                    const distSq = (data[i] - avgR) ** 2 + (data[i + 1] - avgG) ** 2 + (data[i + 2] - avgB) ** 2;
                    if (distSq < tolSq) {
                        data[i + 3] = 0;
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        }
    }

    // 3. 흑백 처리
    if (enableGrayscale && grayscale > 0) {
        const factor = grayscale / 100;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const avg = (r + g + b) / 3;
            data[i] = r * (1 - factor) + avg * factor;
            data[i + 1] = g * (1 - factor) + avg * factor;
            data[i + 2] = b * (1 - factor) + avg * factor;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    // 여기서부터 캔버스 사이즈가 변경될 수 있는 파이프라인
    let workCanvas = canvas;
    let workCtx = ctx;

    // 4. 여백 제거 (Auto Crop)
    if (enableAutoCrop) {
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        const curData = workCtx.getImageData(0, 0, canvas.width, canvas.height).data;
        let found = false;

        // Python PIL.Image.getbbox() 동작과 100% 동일하게 복구 (비투명 픽셀만 감지)
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const index = (y * canvas.width + x) * 4;
                const a = curData[index + 3];

                if (a > 0) { // 완전 투명(a=0)이 아닌 모든 픽셀을 콘텐츠로 인식
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    found = true;
                }
            }
        }

        if (found) {
            const cropW = maxX - minX + 1;
            const cropH = maxY - minY + 1;

            const newW = cropW + (autoCropMargin * 2);
            const newH = cropH + (autoCropMargin * 2);

            // 여백이 있거나 크롭해야 하는 상황에서만 캔버스 교체
            if (newW !== canvas.width || newH !== canvas.height || minX !== 0 || minY !== 0) {
                const cropCanvas = document.createElement("canvas");
                cropCanvas.width = newW;
                cropCanvas.height = newH;
                const cropCtx = cropCanvas.getContext("2d")!;

                // 잘라낸 이미지를 Margin 오프셋에 맞춰서 그림
                cropCtx.drawImage(workCanvas, minX, minY, cropW, cropH, autoCropMargin, autoCropMargin, cropW, cropH);

                workCanvas = cropCanvas;
                workCtx = cropCtx;
            }
        }
    }

    // 5. 이미지 크기 조절 (Resize)
    if (enableResize) {
        const origW = workCanvas.width;
        const origH = workCanvas.height;

        // Python의 resize_image 함수 비율 공식 100% 동일하게 복원
        let newW = parseInt(resizeWidth, 10);
        let newH = parseInt(resizeHeight, 10);

        if (isNaN(newW) || newW <= 0) newW = origW;
        if (isNaN(newH) || newH <= 0) newH = origH;

        if (keepRatio) {
            const ratio = Math.min(newW / origW, newH / origH);
            newW = Math.max(1, Math.round(origW * ratio));
            newH = Math.max(1, Math.round(origH * ratio));
        }

        if (newW !== origW || newH !== origH) {
            const resizeCanvas = document.createElement("canvas");
            resizeCanvas.width = newW;
            resizeCanvas.height = newH;
            const resizeCtx = resizeCanvas.getContext("2d")!;
            // 부드러운 스케일링을 위해 설정
            resizeCtx.imageSmoothingEnabled = true;
            resizeCtx.imageSmoothingQuality = "high";

            resizeCtx.drawImage(workCanvas, 0, 0, origW, origH, 0, 0, newW, newH);
            workCanvas = resizeCanvas;
            workCtx = resizeCtx;
        }
    }

    // 6. 결과물 인코딩 준비
    // 배경제거(RMBG 또는 U2Net) ON → PNG (투명도 보존), 그 외 → 입력 파일 포맷 유지
    let mimeType = (enableBgRemoval || enableU2NetRemoval) ? 'image/png' : (file.type || 'image/png');

    // JPG는 투명 부분 렌더링 시 흰색 배경 추가 (형식 유지)
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        const flatCanvas = document.createElement('canvas');
        flatCanvas.width = workCanvas.width;
        flatCanvas.height = workCanvas.height;
        const fCtx = flatCanvas.getContext('2d')!;
        fCtx.fillStyle = '#FFFFFF';
        fCtx.fillRect(0, 0, flatCanvas.width, flatCanvas.height);
        fCtx.drawImage(workCanvas, 0, 0);
        workCanvas = flatCanvas;
    }

    // 1차적으로 Canvas에서 Blob으로 추출
    const initialBlob = await new Promise<Blob>((resolve, reject) => {
        workCanvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas to Blob Failed"));
        }, mimeType, 1.0); // 1차는 최고 화질로 추출 후 라이브러리로 정밀 압축
    });

    // 7. 정밀 용량 압축 (Lightweight Library: Compressor.js)
    if (enableCompress) {
        return new Promise((resolve, reject) => {
            const qRatio = quality / 100.0;
            new Compressor(initialBlob, {
                quality: qRatio,
                mimeType,
                strict: true,
                checkOrientation: false,
                success(result) {
                    resolve(URL.createObjectURL(result));
                },
                error(err) {
                    console.error("Compressor.js failed:", err.message);
                    resolve(URL.createObjectURL(initialBlob));
                },
            });
        });
    }

    return URL.createObjectURL(initialBlob);
}
