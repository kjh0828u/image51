import { useCallback, useEffect, useRef, useState } from 'react';

export function useCanvasCore(imageUrl: string, onImageLoaded: () => void) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
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

    const updateCanvasSize = useCallback((w: number, h: number) => {
        [canvasRef, overlayRef, originalRef, maskRef, aiResultRef].forEach((ref) => {
            if (ref.current) {
                ref.current.width = w;
                ref.current.height = h;
            }
        });
        setImageSize({ w, h });
    }, []);

    const compositeAndRender = useCallback(() => {
        if (!canvasRef.current || !originalRef.current || !maskRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalRef.current, 0, 0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskRef.current, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
    }, []);

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
        compositeAndRender
    };
}
