import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/gtag';

export type Tool = 'erase' | 'restore' | 'wand' | 'crop' | 'paint' | 'bucket' | 'eyedropper' | 'marquee-rect' | 'marquee-circle' | 'move' | 'text' | 'clone' | 'heal' | 'blur-brush';
export type BrushShape = 'circle' | 'square' | 'rect-h' | 'rect-v' | 'rect-h-thin' | 'rect-v-thin' | 'diamond';

export function useBrushConfig() {
    const [tool, setTool] = useState<Tool>('wand');
    const [brushSize, setBrushSize] = useState(30);
    const [brushOpacity, setBrushOpacity] = useState(100);
    const [brushColor, setBrushColor] = useState('#4f46e5');
    const [brushBgColor, setBrushBgColor] = useState('#ffffff');
    const [brushShape, setBrushShape] = useState<BrushShape>('circle');
    const [brushHardness, setBrushHardness] = useState(50);
    const [brushBlur, setBrushBlur] = useState(1);
    const [tolerance, setTolerance] = useState(30);

    // wand settings
    const [wandExpand, setWandExpand] = useState(0);
    const [wandSmooth, setWandSmooth] = useState(1);

    // performance refs
    const toolRef = useRef<Tool>(tool);

    useEffect(() => {
        toolRef.current = tool;
        trackEvent('tool_activated', { tool_name: tool });
    }, [tool]);

    const swapColors = useCallback(() => {
        setBrushColor(prev => {
            const currentBg = brushBgColor;
            setBrushBgColor(prev);
            return currentBg;
        });
    }, [brushBgColor]);

    const resetColors = useCallback(() => {
        setBrushColor('#000000');
        setBrushBgColor('#ffffff');
    }, []);

    return {
        tool,
        setTool,
        toolRef,
        brushSize,
        setBrushSize,
        brushOpacity,
        setBrushOpacity,
        brushColor,
        setBrushColor,
        brushBgColor,
        setBrushBgColor,
        swapColors,
        resetColors,
        brushShape,
        setBrushShape,
        brushHardness,
        setBrushHardness,
        brushBlur,
        setBrushBlur,
        tolerance,
        setTolerance,
        wandExpand,
        setWandExpand,
        wandSmooth,
        setWandSmooth
    };
}
