import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layer } from './useLayers';

export function useCanvasCore(imageUrl: string, onImageLoaded: () => void) {
    // ── 캔버스 Refs ────────────────────────────────────────────────────────
    // display: 최종 합성 결과 표시
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // overlay: 선택 영역, 크롭 가이드 등 임시 드로잉
    const overlayRef = useRef<HTMLCanvasElement>(null);
    // 하위 호환: 단일 레이어 시절 직접 참조하던 original/mask
    // → Phase 4에서 각 도구가 useLayers의 activeLayerCanvases를 참조하도록 교체될 때까지 유지
    const originalRef = useRef<HTMLCanvasElement>(null);
    const maskRef = useRef<HTMLCanvasElement>(null);
    const aiResultRef = useRef<HTMLCanvasElement>(null);
    const maskSnapshotRef = useRef<HTMLCanvasElement>(null);
    const tempCanvasRef = useRef<HTMLCanvasElement>(null);
    const originalSnapshotRef = useRef<HTMLCanvasElement | null>(null);
    const blurCacheRef = useRef<HTMLCanvasElement | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const containerRectRef = useRef<DOMRect | null>(null);

    const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
    const [zoom, setZoom] = useState(1);
    const zoomRef = useRef<number>(zoom);

    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    // ── 캔버스 크기 동기화 ────────────────────────────────────────────────
    const updateCanvasSize = useCallback((w: number, h: number) => {
        [canvasRef, overlayRef, originalRef, maskRef, aiResultRef].forEach((ref) => {
            if (ref.current) {
                ref.current.width = w;
                ref.current.height = h;
            }
        });
        setImageSize({ w, h });
    }, []);

    // ── 단일 레이어 합성 (하위 호환 - originalRef + maskRef 사용) ─────────
    const compositeSingleLayer = useCallback(() => {
        if (!canvasRef.current || !originalRef.current || !maskRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalRef.current, 0, 0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskRef.current, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
    }, []);

    // ── 다중 레이어 합성 ──────────────────────────────────────────────────
    /**
     * layers 배열을 bottom-to-top 순서로 합성하여 canvasRef에 렌더링.
     * 텍스트 레이어는 별도로 래스터화하여 그린다.
     */
    const compositeLayersAndRender = useCallback((layers: Layer[]) => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const layer of layers) {
            if (!layer.visible) continue;

            ctx.globalAlpha = layer.opacity / 100;
            // Phase 1: blendMode는 항상 'source-over'
            ctx.globalCompositeOperation = 'source-over';

            if (layer.type === 'text') {
                // 텍스트 레이어: 직접 렌더링
                renderTextLayer(ctx, layer);
            } else if (layer.originalCanvas && layer.maskCanvas) {
                // 픽셀 레이어: temp에서 original + mask 합성 후 배치
                const { originalCanvas, maskCanvas, x, y } = layer;
                const temp = document.createElement('canvas');
                temp.width = originalCanvas.width;
                temp.height = originalCanvas.height;
                const tCtx = temp.getContext('2d')!;
                tCtx.drawImage(originalCanvas, 0, 0);
                tCtx.globalCompositeOperation = 'destination-in';
                tCtx.drawImage(maskCanvas, 0, 0);
                ctx.drawImage(temp, x, y);
            }
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }, []);

    /** 기존 코드 호환을 위한 통합 compositeAndRender.
     *  layers가 제공되면 다중 레이어 합성, 없으면 단일 레이어(originalRef+maskRef) 합성. */
    const compositeAndRender = useCallback((layers?: Layer[]) => {
        if (layers && layers.length > 0) {
            compositeLayersAndRender(layers);
        } else {
            compositeSingleLayer();
        }
    }, [compositeLayersAndRender, compositeSingleLayer]);

    // ── 텍스트 레이어 렌더링 ──────────────────────────────────────────────
    function renderTextLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
        const { textContent, textStyle, x, y } = layer;
        if (!textContent) return;

        const { fontFamily, fontSize, fontWeight, fontStyle, color, align,
                letterSpacing = 0, lineHeight = 1.3 } = textStyle;
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';

        const lines = textContent.split('\n');
        const lineH = fontSize * lineHeight;

        lines.forEach((line, i) => {
            const lineY = y + i * lineH;
            if (letterSpacing === 0) {
                ctx.textAlign = align;
                ctx.fillText(line, x, lineY);
            } else {
                // 자간 적용: 문자 하나씩 배치
                // align 처리를 위해 전체 너비 먼저 계산
                let totalW = 0;
                for (const ch of line) totalW += ctx.measureText(ch).width + letterSpacing;
                totalW -= letterSpacing; // 마지막 문자 후 간격 제거
                let curX = x;
                if (align === 'center') curX = x - totalW / 2;
                else if (align === 'right') curX = x - totalW;
                for (const ch of line) {
                    ctx.fillText(ch, curX, lineY);
                    curX += ctx.measureText(ch).width + letterSpacing;
                }
            }
        });
    }

    // ── 이미지 로드 ───────────────────────────────────────────────────────
    const onImageLoadedRef = useRef(onImageLoaded);
    useEffect(() => {
        onImageLoadedRef.current = onImageLoaded;
    }, [onImageLoaded]);

    useEffect(() => {
        if (!imageUrl) return;
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            updateCanvasSize(w, h);

            const containerW = containerRef.current?.clientWidth ?? 800;
            const containerH = containerRef.current?.clientHeight ?? 600;
            setZoom(Math.min((containerW - 40) / w, (containerH - 40) / h, 1));

            if (originalRef.current) {
                originalRef.current.getContext('2d')!.drawImage(img, 0, 0);
                const imgData = originalRef.current.getContext('2d')!.getImageData(0, 0, w, h);

                if (maskRef.current) {
                    const maskCtx = maskRef.current.getContext('2d')!;
                    const mData = maskCtx.createImageData(w, h);
                    for (let i = 0; i < imgData.data.length; i += 4) {
                        mData.data[i] = 0;
                        mData.data[i + 1] = 0;
                        mData.data[i + 2] = 0;
                        mData.data[i + 3] = imgData.data[i + 3]!;
                    }
                    maskCtx.putImageData(mData, 0, 0);
                }
            }

            if (aiResultRef.current) {
                aiResultRef.current.getContext('2d')!.drawImage(img, 0, 0);
            }

            compositeAndRender();
            onImageLoadedRef.current();
        };
        img.src = imageUrl;
    }, [imageUrl, updateCanvasSize, compositeAndRender]);

    return {
        canvasRef,
        overlayRef,
        originalRef,
        maskRef,
        aiResultRef,
        maskSnapshotRef,
        tempCanvasRef,
        originalSnapshotRef,
        blurCacheRef,
        containerRef,
        containerRectRef,
        imageSize,
        setImageSize,
        zoom,
        setZoom,
        zoomRef,
        updateCanvasSize,
        compositeAndRender,
        compositeLayersAndRender,
    };
}
