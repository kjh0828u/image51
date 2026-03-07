import { useCallback, useEffect, useRef, useState } from 'react';

export interface HistoryItem {
    mask: ImageData;
    original: ImageData;
    label: string;
    time: string;
}

interface UseHistoryParams {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    originalRef: React.RefObject<HTMLCanvasElement | null>;
    maskRef: React.RefObject<HTMLCanvasElement | null>;
    updateCanvasSize: (w: number, h: number) => void;
    compositeAndRender: () => void;
    stopMarching: () => void;
    setHasSelection?: (v: boolean) => void;
}

export function useHistory({
    canvasRef,
    originalRef,
    maskRef,
    updateCanvasSize,
    compositeAndRender,
    stopMarching,
    setHasSelection
}: UseHistoryParams) {
    const historyStack = useRef<HistoryItem[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [historyVersion, setHistoryVersion] = useState(0);

    const saveMaskSnapshot = useCallback((label: string) => {
        if (!maskRef.current || !originalRef.current) return;
        const mCtx = maskRef.current.getContext('2d', { willReadFrequently: true })!;
        const oCtx = originalRef.current.getContext('2d', { willReadFrequently: true })!;
        const mSnap = mCtx.getImageData(0, 0, maskRef.current.width, maskRef.current.height);
        const oSnap = oCtx.getImageData(0, 0, originalRef.current.width, originalRef.current.height);

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const newItem: HistoryItem = {
            mask: mSnap,
            original: oSnap,
            label,
            time: timeStr
        };

        // 현재 인덱스 이후의 히스토리는 삭제 (새로운 분기 시작)
        const newStack = historyStack.current.slice(0, historyIndex + 1);
        newStack.push(newItem);
        historyStack.current = newStack;
        setHistoryIndex(newStack.length - 1);
        setHistoryVersion(v => v + 1);
    }, [historyIndex]);

    const jumpToHistory = useCallback((index: number) => {
        if (index < 0 || index >= historyStack.current.length) return;
        const item = historyStack.current[index]!;

        if (!maskRef.current || !originalRef.current) return;
        const mCtx = maskRef.current.getContext('2d')!;
        const oCtx = originalRef.current.getContext('2d')!;

        if (item.mask.width !== maskRef.current.width || item.mask.height !== maskRef.current.height) {
            updateCanvasSize(item.mask.width, item.mask.height);
        }

        mCtx.putImageData(item.mask, 0, 0);
        oCtx.putImageData(item.original, 0, 0);

        setHistoryIndex(index);
        setHistoryVersion(v => v + 1);
        stopMarching();
        if (setHasSelection) setHasSelection(false);
        compositeAndRender();
    }, [updateCanvasSize, stopMarching, setHasSelection, compositeAndRender]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            jumpToHistory(historyIndex - 1);
        }
    }, [historyIndex, jumpToHistory]);

    const redo = useCallback(() => {
        if (historyIndex < historyStack.current.length - 1) {
            jumpToHistory(historyIndex + 1);
        }
    }, [historyIndex, jumpToHistory]);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < historyStack.current.length - 1;

    const resetHistory = useCallback(() => {
        historyStack.current = [];
        setHistoryIndex(-1);
        setHistoryVersion(0);
    }, []);

    return {
        historyStack,
        historyIndex,
        historyVersion,
        setHistoryVersion,
        saveMaskSnapshot,
        jumpToHistory,
        undo,
        redo,
        canUndo,
        canRedo,
        resetHistory
    };
}
