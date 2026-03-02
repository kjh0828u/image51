/**
 * imageProcessor.ts
 *
 * MediaPipe Selfie Segmentation을 사용하여 이미지 변환을 수행하는 핵심 로직입니다.
 * 배경 제거, 필터링, 이미지 압축, 크기 조절 등의 파이프라인을 관리합니다.
 */
import { AppOptions } from "../store/useAppStore";
import Compressor from 'compressorjs';
import { pipeline, env as hfEnv } from '@huggingface/transformers';
import {
    getCanvasAndContext,
    getImageData,
    canvasToBlob,
    applyGrayscale,
    autoCropCanvas,
    resizeCanvas,
} from './canvasUtils';

// Transformers.js 환경 설정 (Next.js 로컬 서버 경로 탐색 완전 차단)
hfEnv.allowLocalModels = false;
hfEnv.allowRemoteModels = true;
hfEnv.useBrowserCache = true;

// MediaPipe Selfie Segmentation 동적 로딩 관련
let selfieSegmentation: any = null;

// ONNX Runtime 관련
let ort: any = null;
let u2netSession: any = null;
let modnetOnnxSession: any = null;
let u2netFullSession: any = null;

// Transformers.js pipeline 싱글톤 캐시 (사물 3, 4)
const pipelineCache: Record<string, any> = {};

// MediaPipe Tasks Vision 관련 (사물 2)
let imageSegmenter: any = null;

/**
 * MediaPipe Selfie Segmentation 초기화 및 모델 로드
 */
async function getSelfieSegmentation() {
    if (selfieSegmentation) return selfieSegmentation;

    // MediaPipe 스크립트 로드
    if (!(window as any).SelfieSegmentation) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
        await new Promise(resolve => {
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    const mpSelfie = (window as any).SelfieSegmentation;
    selfieSegmentation = new mpSelfie({
        locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
    });

    return selfieSegmentation;
}

/**
 * ONNX Runtime (ort) 라이브러리를 동적으로 로드하고 WASM 환경을 설정합니다.
 */
async function ensureORT() {
    if ((window as any).ort && ort) return ort;

    // 1. 스크립트 로드
    if (!(window as any).ort) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/ort.min.js';
        await new Promise(resolve => {
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    ort = (window as any).ort;

    // 2. WASM 경로 및 환경 설정
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;

    return ort;
}

/**
 * ONNX Runtime 초기화 및 U2-Net 모델 로드
 */
async function getU2NetSession() {
    if (u2netSession) return u2netSession;

    await ensureORT();

    // 모델 URL: u2netp (단일 파일 Lite 모델, 약 4MB)
    const modelUrl = 'https://huggingface.co/Xenova/u2netp/resolve/main/onnx/model.onnx';

    try {
        console.log('사물 제거 모델 로딩 시작...');
        u2netSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        console.log('사물 제거 모델 로드 완료.');
    } catch (e) {
        console.error('모델 로드 오류:', e);
        throw new Error('사물 제거 모델을 불러올 수 없습니다. 네트워크 상태를 확인해 주세요.');
    }
    return u2netSession;
}

/**
 * MediaPipe Tasks Vision (ImageSegmenter) 로드
 */
async function getImageSegmenter() {
    if (imageSegmenter) return imageSegmenter;

    // Turbopack의 정적 분석을 우회하여 외부 ESM 모듈을 동적으로 가져옵니다.
    const visionModule = await (new Function('return import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs")'))();

    const filesetResolver = await visionModule.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );

    imageSegmenter = await visionModule.ImageSegmenter.createFromOptions(filesetResolver, {
        baseOptions: {
            // 범용 사물 인식 모델인 DeepLabV3로 교체 (21개 카테고리 인식)
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite",
            delegate: "GPU"
        },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false
    });

    return imageSegmenter;
}

/**
 * MediaPipe를 사용하여 배경 제거 (인물용)
 */
async function applyBgRemoval(blob: Blob, modelType: 'general' | 'landscape'): Promise<Blob> {
    const segmenter = await getSelfieSegmentation();
    const imageBitmap = await createImageBitmap(blob);

    // 모델 옵션 설정 (0: general, 1: landscape)
    segmenter.setOptions({
        modelSelection: modelType === 'general' ? 0 : 1,
    });

    // 결과를 담을 프로미스 생성
    return new Promise((resolve, reject) => {
        // 결과 처리 콜백
        segmenter.onResults((results: any) => {
            const canvas = document.createElement('canvas');
            canvas.width = results.image.width;
            canvas.height = results.image.height;
            const ctx = canvas.getContext('2d')!;

            // 1. 마스크 그리기
            ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

            // 2. 소스 이미지를 합성
            ctx.globalCompositeOperation = 'source-in';
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

            // 결과 Blob 생성
            canvasToBlob(canvas, 'image/png').then(resolve).catch(reject);
        });

        // 처리 실행
        segmenter.send({ image: imageBitmap as any })
            .catch((err: any) => reject(err));
    });
}

/**
 * MediaPipe Tasks Vision을 사용한 배경 제거 (사물 2)
 */
async function applyVisionSegmentation(blob: Blob): Promise<Blob> {
    const segmenter = await getImageSegmenter();
    const imageBitmap = await createImageBitmap(blob);

    const result = segmenter.segment(imageBitmap);
    const categoryMask = result.categoryMask;
    const { width, height } = categoryMask;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // 마스크 데이터를 캔버스에 그리기
    const maskData = categoryMask.getAsUint8Array();
    const imageData = ctx.createImageData(width, height);

    // DeepLabV3 모델: 0번은 배경, 1~20번은 사물 클래스
    // 사물이 투명하게 나오는 현상을 막기 위해 전경 픽셀을 명시적으로 불투명(255) 처리
    for (let i = 0; i < maskData.length; i++) {
        const category = maskData[i];
        const isForeground = category > 0;

        // RGB는 검정(0), Alpha는 전경 여부에 따라 255 또는 0 설정
        imageData.data[i * 4] = 0;
        imageData.data[i * 4 + 1] = 0;
        imageData.data[i * 4 + 2] = 0;
        imageData.data[i * 4 + 3] = isForeground ? 255 : 0;
    }
    ctx.putImageData(imageData, 0, 0);

    // 최종 합성 (원본 크기에 맞게)
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = imageBitmap.width;
    finalCanvas.height = imageBitmap.height;
    const finalCtx = finalCanvas.getContext('2d')!;

    // 1. 마스크 그리기 (원본 크기로 확대)
    finalCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);

    // 2. 소스 이미지 합성
    finalCtx.globalCompositeOperation = 'source-in';
    finalCtx.drawImage(imageBitmap, 0, 0, finalCanvas.width, finalCanvas.height);

    return canvasToBlob(finalCanvas, 'image/png');
}

/**
 * U2-Net ONNX를 사용하여 배경 제거 (사물용)
 */
async function applyU2NetBgRemoval(blob: Blob): Promise<Blob> {
    const session = await getU2NetSession();
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await new Promise(res => img.onload = res);

    const targetSize = 320;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, targetSize, targetSize);

    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    const { data } = imgData;

    // Preprocessing: [H, W, C] -> [1, C, H, W] & Normalize
    const input = new Float32Array(targetSize * targetSize * 3);
    for (let i = 0; i < targetSize * targetSize; i++) {
        input[i] = (data[i * 4] / 255 - 0.485) / 0.229;
        input[i + targetSize * targetSize] = (data[i * 4 + 1] / 255 - 0.456) / 0.224;
        input[i + 2 * targetSize * targetSize] = (data[i * 4 + 2] / 255 - 0.406) / 0.225;
    }

    const tensor = new ort.Tensor('float32', input, [1, 3, targetSize, targetSize]);
    const results = await session.run({ input: tensor });
    const output = results[Object.keys(results)[0]].data; // 보통 첫 번째 출력이 마스크

    // Postprocessing: 마스크를 원본 크기로 복원 및 투명도 적용
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = targetSize;
    maskCanvas.height = targetSize;
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskData = maskCtx.createImageData(targetSize, targetSize);

    for (let i = 0; i < targetSize * targetSize; i++) {
        const val = output[i];
        const alpha = Math.floor(255 * (1 / (1 + Math.exp(-val)))); // Sigmoid
        maskData.data[i * 4] = 0;
        maskData.data[i * 4 + 1] = 0;
        maskData.data[i * 4 + 2] = 0;
        maskData.data[i * 4 + 3] = alpha;
    }
    maskCtx.putImageData(maskData, 0, 0);

    // 최종 합성
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = img.width;
    finalCanvas.height = img.height;
    const finalCtx = finalCanvas.getContext('2d')!;

    // 1. 마스크를 원본 크기로 늘려 그리기
    finalCtx.drawImage(maskCanvas, 0, 0, img.width, img.height);

    // 2. 소스 이미지 합성
    finalCtx.globalCompositeOperation = 'source-in';
    finalCtx.drawImage(img, 0, 0);

    return canvasToBlob(finalCanvas, 'image/png');
}

/**
 * MODNet ONNX 세션 로드 (사물 7)
 */
async function getModnetOnnxSession() {
    if (modnetOnnxSession) return modnetOnnxSession;
    await ensureORT();
    const modelUrl = 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx';
    try {
        console.log('MODNet ONNX 모델 로딩 시작...');
        modnetOnnxSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        console.log('MODNet ONNX 모델 로드 완료.');
    } catch (e) {
        console.error('MODNet 모델 로드 오류:', e);
        throw new Error('MODNet 모델을 불러올 수 없습니다.');
    }
    return modnetOnnxSession;
}

/**
 * U2-Net Full ONNX 세션 로드 (사물 8)
 */
async function getU2NetFullSession() {
    if (u2netFullSession) return u2netFullSession;
    await ensureORT();
    const modelUrl = 'https://huggingface.co/tomjackson2023/rembg/resolve/main/u2net.onnx';
    try {
        console.log('U2-Net Full 모델 로딩 시작...');
        u2netFullSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        console.log('U2-Net Full 모델 로드 완료.');
    } catch (e) {
        console.error('U2-Net Full 모델 로드 오류:', e);
        throw new Error('U2-Net Full 모델을 불러올 수 없습니다.');
    }
    return u2netFullSession;
}

/**
 * background-removal 파이프라인으로 배경 제거 (사물 3, 4 공통)
 * Xenova/modnet 등 공개 접근 가능한 background-removal 모델 사용
 */
async function applyBackgroundRemovalPipeline(blob: Blob, modelId: string): Promise<Blob> {
    if (!pipelineCache[modelId]) {
        console.log(`[배경제거 엔진] 모델 로딩 중: ${modelId}...`);
        pipelineCache[modelId] = await pipeline('background-removal', modelId);
    }
    const pipe = pipelineCache[modelId];

    const imageUrl = URL.createObjectURL(blob);
    try {
        // background-removal 파이프라인은 배경 제거된 이미지(RawImage)를 직접 반환
        const [result] = await pipe(imageUrl) as any[];
        // result.toBlob() 또는 result가 이미 Blob인 경우 처리
        if (result instanceof Blob) return result;
        if (result?.toBlob) return await result.toBlob();
        // RawImage를 Canvas로 변환
        const img = result as any;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        const imageData = new ImageData(
            new Uint8ClampedArray(img.data),
            img.width,
            img.height
        );
        ctx.putImageData(imageData, 0, 0);
        return canvasToBlob(canvas, 'image/png');
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

/**
 * MODNet 모델 배경 제거 (사물 3) - 인물 Portrait Matting 특화
 */
async function applyDPTBgRemoval(blob: Blob): Promise<Blob> {
    return applyBackgroundRemovalPipeline(blob, 'Xenova/modnet');
}

/**
 * MODNet 모델 배경 제거 (사물 4) - 동일 모델, 향후 다른 모델로 교체 가능
 */
async function applySegFormerBgRemoval(blob: Blob): Promise<Blob> {
    return applyBackgroundRemovalPipeline(blob, 'Xenova/modnet');
}

/**
 * ONNX 모델 공통 배경 제거 헬퍼 (U2-Net 계열 전처리/후처리 동일)
 */
async function applyOnnxBgRemoval(blob: Blob, session: any, targetSize: number): Promise<Blob> {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await new Promise(res => { img.onload = res; });

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, targetSize, targetSize);

    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    const { data } = imgData;

    const input = new Float32Array(targetSize * targetSize * 3);
    for (let i = 0; i < targetSize * targetSize; i++) {
        input[i] = (data[i * 4] / 255 - 0.485) / 0.229;
        input[i + targetSize * targetSize] = (data[i * 4 + 1] / 255 - 0.456) / 0.224;
        input[i + 2 * targetSize * targetSize] = (data[i * 4 + 2] / 255 - 0.406) / 0.225;
    }

    const tensor = new ort.Tensor('float32', input, [1, 3, targetSize, targetSize]);
    const inputName = session.inputNames[0];
    const results = await session.run({ [inputName]: tensor });
    const rawOutput = results[Object.keys(results)[0]].data as Float32Array;

    // 출력값 범위 감지: [0,1] 이면 직접 사용, 그 외(logit)이면 sigmoid 적용
    const maxVal = rawOutput.reduce((a: number, b: number) => Math.max(a, b), -Infinity);
    const minVal = rawOutput.reduce((a: number, b: number) => Math.min(a, b), Infinity);
    const isLogit = minVal < -0.5 || maxVal > 1.5;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = targetSize;
    maskCanvas.height = targetSize;
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskData = maskCtx.createImageData(targetSize, targetSize);

    for (let i = 0; i < targetSize * targetSize; i++) {
        const v = rawOutput[i];
        const alpha = isLogit
            ? Math.floor(255 * (1 / (1 + Math.exp(-v))))
            : Math.floor(255 * Math.min(1, Math.max(0, v)));
        maskData.data[i * 4 + 3] = alpha;
    }
    maskCtx.putImageData(maskData, 0, 0);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = img.width;
    finalCanvas.height = img.height;
    const finalCtx = finalCanvas.getContext('2d')!;
    finalCtx.drawImage(maskCanvas, 0, 0, img.width, img.height);
    finalCtx.globalCompositeOperation = 'source-in';
    finalCtx.drawImage(img, 0, 0);

    URL.revokeObjectURL(img.src);
    return canvasToBlob(finalCanvas, 'image/png');
}

/**
 * MODNet ONNX 배경 제거 (사물 7) - onnxruntime-web 직접 구동
 */
async function applyModnetOnnxBgRemoval(blob: Blob): Promise<Blob> {
    const session = await getModnetOnnxSession();
    return applyOnnxBgRemoval(blob, session, 512);
}

/**
 * U2-Net Full ONNX 배경 제거 (사물 8) - 고해상도 풀 모델
 */
async function applyU2NetFullBgRemoval(blob: Blob): Promise<Blob> {
    const session = await getU2NetFullSession();
    return applyOnnxBgRemoval(blob, session, 320);
}

/**
 * ISNet General 모델 배경 제거 (사물 5) - 범용 사물 배경 제거 특화
 */
async function applyISNetBgRemoval(blob: Blob): Promise<Blob> {
    return applyBackgroundRemovalPipeline(blob, 'briaai/RMBG-1.4');
}

/**
 * BEN2 모델 배경 제거 (사물 6) - Transformers.js background-removal 기본 모델
 */
async function applyBEN2BgRemoval(blob: Blob): Promise<Blob> {
    return applyBackgroundRemovalPipeline(blob, 'onnx-community/BEN2-ONNX');
}

/**
 * [이미지 처리 통합 파이프라인]
 * 사용자가 선택한 옵션들을 순차적으로 적용하여 최종 변환된 이미지의 결과 URL을 반환합니다.
 */
export async function processImage(file: File, options: AppOptions): Promise<string> {
    let currentBlob: Blob = file;

    // 1. 배경 제거
    if (options.enableBgRemoval) {
        if (options.bgRemovalType === 'person') {
            currentBlob = await applyBgRemoval(currentBlob, options.mediaPipeModel);
        } else if (options.bgRemovalType === 'object1') {
            currentBlob = await applyU2NetBgRemoval(currentBlob);
        } else if (options.bgRemovalType === 'object2') {
            currentBlob = await applyVisionSegmentation(currentBlob);
        } else if (options.bgRemovalType === 'object3') {
            currentBlob = await applyDPTBgRemoval(currentBlob);
        } else if (options.bgRemovalType === 'object4') {
            currentBlob = await applySegFormerBgRemoval(currentBlob);
        } else if (options.bgRemovalType === 'object5') {
            currentBlob = await applyISNetBgRemoval(currentBlob);
        } else if (options.bgRemovalType === 'object6') {
            currentBlob = await applyBEN2BgRemoval(currentBlob);
        } else if (options.bgRemovalType === 'object7') {
            currentBlob = await applyModnetOnnxBgRemoval(currentBlob);
        } else if (options.bgRemovalType === 'object8') {
            currentBlob = await applyU2NetFullBgRemoval(currentBlob);
        }
    }

    const origBmp = await createImageBitmap(currentBlob);
    const { canvas, ctx } = await getCanvasAndContext(origBmp);
    const imgData = getImageData(canvas, ctx);
    const data = imgData.data;

    // 2. 그레이스케일 처리
    if (options.enableGrayscale && options.grayscale > 0) {
        applyGrayscale(data, options.grayscale / 100);
        ctx.putImageData(imgData, 0, 0);
    }

    // 3. 자동 크롭 및 리사이징
    let workCanvas = canvas;
    if (options.enableAutoCrop) {
        workCanvas = autoCropCanvas(workCanvas, options.autoCropMargin);
    }
    if (options.enableResize) {
        workCanvas = resizeCanvas(workCanvas, options.resizeWidth, options.resizeHeight, options.keepRatio);
    }

    // 4. PNG/JPEG 포맷 처리
    let mimeType = options.enableBgRemoval ? 'image/png' : (file.type || 'image/png');
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        const { canvas: fCanvas, ctx: fCtx } = await getCanvasAndContext(workCanvas);
        fCtx.fillStyle = '#FFFFFF';
        fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.drawImage(workCanvas, 0, 0);
        workCanvas = fCanvas;
    }

    // 5. 압축 및 최종 결과 URL 생성
    let finalBlob = await canvasToBlob(workCanvas, mimeType);
    if (options.enableCompress) {
        finalBlob = await new Promise<Blob>((resolve) => {
            new Compressor(finalBlob, {
                quality: options.quality / 100,
                mimeType,
                strict: true,
                checkOrientation: false,
                success: resolve,
                error: () => resolve(finalBlob)
            });
        });
    }

    return URL.createObjectURL(finalBlob);
}

