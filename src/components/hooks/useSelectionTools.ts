import { useCallback, useRef, useState } from 'react';
import {
    blurAndThresholdBinary,
    expandSelection,
    floodFillSelect
} from '../../lib/canvasUtils';

interface UseSelectionToolsParams {
    originalRef: React.RefObject<HTMLCanvasElement | null>;
    maskRef: React.RefObject<HTMLCanvasElement | null>;
    overlayRef: React.RefObject<HTMLCanvasElement | null>;
    overlayCache: React.MutableRefObject<ImageData | null>;
    selectionRef: React.MutableRefObject<Uint8Array | null>;
    baseSelectionRef: React.MutableRefObject<Uint8Array | null>;
    cachedSelKey: React.MutableRefObject<Uint8Array | null>;
    marchingSegs: React.MutableRefObject<number[]>;
    marchingOffset: React.MutableRefObject<number>;
    isSliding: React.MutableRefObject<boolean>;
    tolerance: number;
    wandSmooth: number;
    wandExpand: number;
    compositeAndRender: () => void;
    saveMaskSnapshot: (label: string) => void;
    drawCropOverlay: (rect: any) => void;
    cropRectRef: React.MutableRefObject<any>;
    toolRef: React.MutableRefObject<string>;
    zoom: number;
}

export function useSelectionTools({
    originalRef,
    maskRef,
    overlayRef,
    overlayCache,
    selectionRef,
    baseSelectionRef,
    cachedSelKey,
    marchingSegs,
    marchingOffset,
    isSliding,
    tolerance,
    wandSmooth,
    wandExpand,
    compositeAndRender,
    saveMaskSnapshot,
    drawCropOverlay,
    cropRectRef,
    toolRef,
    zoom
}: UseSelectionToolsParams) {
    const [hasSelection, setHasSelection] = useState(false);
    const marchingRafId = useRef<number | null>(null);
    const lastMarchingTime = useRef<number>(0);

    const drawMarching = useCallback(() => {
        const overlay = overlayRef.current;
        const sel = selectionRef.current;
        if (!overlay || !sel) return;

        // 원본 이미지 크기 정보 확보 (stride mismatch 방지)
        let w = originalRef.current?.width || 0;
        let h = originalRef.current?.height || 0;

        // 만약 originalRef가 비어있다면 overlay 크기와 zoom으로 역산 (폴백)
        if (w === 0 || h === 0) {
            w = Math.round(overlay.width / zoom);
            h = Math.round(overlay.height / zoom);
        }

        const ctx = overlay.getContext('2d')!;

        if (cachedSelKey.current !== sel) {
            cachedSelKey.current = sel;

            // 다운샘플링 배수 계산 (최대 너비를 800px 정도로 제한하여 성능 확보)
            const MAX_CALC_SIZE = 800;
            const calcScale = Math.min(1, MAX_CALC_SIZE / Math.max(w, h));
            const sw = Math.floor(w * calcScale);
            const sh = Math.floor(h * calcScale);

            const highlight = new ImageData(w, h);
            const buf = highlight.data;
            for (let i = 0; i < sel.length; i++) {
                if (!sel[i]) continue;
                buf[i * 4] = 100;
                buf[i * 4 + 1] = 180;
                buf[i * 4 + 2] = 255;
                buf[i * 4 + 3] = 60;
            }
            overlayCache.current = highlight;

            const segs: number[] = [];
            const s = (x: number, y: number) => {
                const ox = Math.min(w - 1, Math.floor(x / calcScale));
                const oy = Math.min(h - 1, Math.floor(y / calcScale));
                return sel[oy * w + ox] || 0;
            };

            for (let cy = 0; cy < sh; cy++) {
                for (let cx = 0; cx < sw; cx++) {
                    const tl = s(cx, cy);
                    const tr = s(cx + 1, cy);
                    const br = s(cx + 1, cy + 1);
                    const bl = s(cx, cy + 1);
                    const idx = (tl << 3) | (tr << 2) | (br << 1) | bl;
                    if (idx === 0 || idx === 15) continue;

                    const tx = (cx + 0.5) / calcScale, ty = cy / calcScale;
                    const rx = (cx + 1) / calcScale, ry = (cy + 0.5) / calcScale;
                    const bx = (cx + 0.5) / calcScale, by = (cy + 1) / calcScale;
                    const lx = cx / calcScale, ly = (cy + 0.5) / calcScale;

                    switch (idx) {
                        case 1: segs.push(bx, by, lx, ly); break;
                        case 2: segs.push(rx, ry, bx, by); break;
                        case 3: segs.push(rx, ry, lx, ly); break;
                        case 4: segs.push(tx, ty, rx, ry); break;
                        case 5: segs.push(tx, ty, lx, ly); segs.push(rx, ry, bx, by); break;
                        case 6: segs.push(tx, ty, bx, by); break;
                        case 7: segs.push(tx, ty, lx, ly); break;
                        case 8: segs.push(lx, ly, tx, ty); break;
                        case 9: segs.push(bx, by, tx, ty); break;
                        case 10: segs.push(lx, ly, bx, by); segs.push(tx, ty, rx, ry); break;
                        case 11: segs.push(rx, ry, tx, ty); break;
                        case 12: segs.push(lx, ly, rx, ry); break;
                        case 13: segs.push(bx, by, rx, ry); break;
                        case 14: segs.push(lx, ly, bx, by); break;
                    }
                }
            }
            marchingSegs.current = segs;
        }

        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.save();
        ctx.scale(zoom, zoom);

        if (overlayCache.current) {
            const temp = document.createElement('canvas');
            temp.width = w; temp.height = h;
            temp.getContext('2d')!.putImageData(overlayCache.current, 0, 0);
            ctx.drawImage(temp, 0, 0);
        }

        if (isSliding.current) return;

        const segs = marchingSegs.current;
        if (!segs || segs.length === 0) return;

        const t = marchingOffset.current;
        const colors = [
            [168, 85, 247],
            [255, 255, 255],
            [56, 189, 248],
            [236, 72, 153],
            [255, 255, 255],
            [168, 85, 247],
        ];
        const steps = colors.length - 1;
        const pos = t * steps;
        const idx = Math.floor(pos);
        const frac = pos - idx;
        const [r1, g1, b1] = colors[idx]!;
        const [r2, g2, b2] = colors[idx + 1]!;
        const r = Math.round(r1 + (r2 - r1) * frac);
        const g = Math.round(g1 + (g2 - g1) * frac);
        const b = Math.round(b1 + (b2 - b1) * frac);

        const drawPath = () => {
            ctx.beginPath();
            for (let i = 0; i < segs.length; i += 4) {
                ctx.moveTo(segs[i]!, segs[i + 1]!);
                ctx.lineTo(segs[i + 2]!, segs[i + 3]!);
            }
            ctx.stroke();
        };

        ctx.save();
        ctx.setLineDash([]);
        ctx.lineWidth = 3 / zoom;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        drawPath();
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        drawPath();
        ctx.restore();
        ctx.restore(); // for scale
    }, [originalRef, overlayRef, selectionRef, cachedSelKey, overlayCache, marchingSegs, isSliding, marchingOffset, zoom]);

    const startMarching = useCallback(() => {
        const loop = (time: number) => {
            if (!lastMarchingTime.current) lastMarchingTime.current = time;
            const dt = (time - lastMarchingTime.current) / 1000;
            lastMarchingTime.current = time;

            if (!isSliding.current) {
                marchingOffset.current = (marchingOffset.current + 0.2 * dt) % 1;

                const currentTool = toolRef.current;
                if ((currentTool === 'wand' || currentTool === 'marquee-rect' || currentTool === 'marquee-circle') && selectionRef.current) {
                    drawMarching();
                } else if (currentTool === 'crop' && cropRectRef.current) {
                    drawCropOverlay(cropRectRef.current);
                } else if ((currentTool === 'marquee-rect' || currentTool === 'marquee-circle') && cropRectRef.current) {
                    drawCropOverlay(cropRectRef.current);
                }
            }
            marchingRafId.current = requestAnimationFrame(loop);
        };
        if (marchingRafId.current) cancelAnimationFrame(marchingRafId.current);
        marchingRafId.current = requestAnimationFrame(loop);
    }, [toolRef, selectionRef, isSliding, marchingOffset, drawMarching, drawCropOverlay, cropRectRef]);

    const stopMarching = useCallback(() => {
        if (marchingRafId.current) {
            cancelAnimationFrame(marchingRafId.current);
            marchingRafId.current = null;
        }
        if (overlayRef.current) {
            overlayRef.current.getContext('2d')!.clearRect(
                0, 0,
                overlayRef.current.width,
                overlayRef.current.height
            );
        }
        selectionRef.current = null;
        baseSelectionRef.current = null;
        overlayCache.current = null;
        marchingSegs.current = [];
        cachedSelKey.current = null;
        isSliding.current = false;
        setHasSelection(false);
    }, [overlayRef, selectionRef, baseSelectionRef, overlayCache, marchingSegs, cachedSelKey, isSliding]);

    const handleWand = useCallback(
        (pos: { x: number; y: number }, additive: boolean) => {
            if (!originalRef.current) return;
            const w = originalRef.current.width;
            const h = originalRef.current.height;

            // 이미지 범위를 벗어난 클릭은 무시
            if (pos.x < 0 || pos.x >= w || pos.y < 0 || pos.y >= h) return;

            const x = Math.max(0, Math.min(w - 1, pos.x));
            const y = Math.max(0, Math.min(h - 1, pos.y));

            const origData = originalRef.current.getContext('2d')!.getImageData(0, 0, w, h);
            const rawSel = floodFillSelect(origData, x, y, tolerance);
            const radius = Math.min(3, Math.floor(wandSmooth / 6));
            const iterations = wandSmooth >= 12 ? 2 : 1;
            const newSel = radius > 0
                ? blurAndThresholdBinary(rawSel, w, h, radius, 0.5, iterations)
                : rawSel;

            let baseSel: Uint8Array;
            if (additive && baseSelectionRef.current) {
                baseSel = new Uint8Array(baseSelectionRef.current.length);
                for (let i = 0; i < baseSel.length; i++) {
                    baseSel[i] = baseSelectionRef.current[i]! | newSel[i]!;
                }
            } else {
                baseSel = newSel;
            }

            baseSelectionRef.current = baseSel;
            const expanded = expandSelection(baseSel, w, h, wandExpand + 1);
            selectionRef.current = expanded;

            setHasSelection(true);
            drawMarching();
            startMarching();
        },
        [originalRef, tolerance, wandSmooth, wandExpand, baseSelectionRef, selectionRef, drawMarching, startMarching]
    );

    const handleSelectAll = useCallback(() => {
        if (!originalRef.current) return;
        const w = originalRef.current.width;
        const h = originalRef.current.height;
        const all = new Uint8Array(w * h).fill(1);
        baseSelectionRef.current = all;
        selectionRef.current = all;
        setHasSelection(true);
        drawMarching();
        startMarching();
    }, [originalRef, baseSelectionRef, selectionRef, drawMarching, startMarching]);

    const applySelectionToMask = useCallback(
        (mode: 'erase' | 'restore') => {
            const sel = selectionRef.current;
            if (!sel || !maskRef.current) return;

            const maskCtx = maskRef.current.getContext('2d')!;
            const maskData = maskCtx.getImageData(
                0, 0,
                maskRef.current.width,
                maskRef.current.height
            );
            const val = mode === 'erase' ? 0 : 255;

            for (let i = 0; i < sel.length; i++) {
                if (sel[i]) {
                    maskData.data[i * 4] = 0;
                    maskData.data[i * 4 + 1] = 0;
                    maskData.data[i * 4 + 2] = 0;
                    maskData.data[i * 4 + 3] = val;
                }
            }
            maskCtx.putImageData(maskData, 0, 0);
            compositeAndRender();
            stopMarching();
            saveMaskSnapshot(mode === 'erase' ? 'Erase Selection' : 'Restore Selection');
        },
        [selectionRef, maskRef, compositeAndRender, stopMarching, saveMaskSnapshot]
    );

    return {
        hasSelection,
        setHasSelection,
        drawMarching,
        startMarching,
        stopMarching,
        handleWand,
        handleSelectAll,
        applySelectionToMask
    };
}
