import { useCallback, useEffect, useRef, useState } from 'react';

export type Tool = 'erase' | 'restore' | 'wand' | 'crop' | 'paint' | 'bucket' | 'eyedropper' | 'marquee-rect' | 'marquee-circle' | 'move' | 'text' | 'clone' | 'heal' | 'blur-brush';
export type BrushShape = 'circle' | 'square' | 'rect-h' | 'rect-v' | 'rect-h-thin' | 'rect-v-thin' | 'diamond';

export function useBrushConfig() {
    const [tool, setTool] = useState<Tool>('wand');
    const [brushSize, setBrushSize] = useState(30);
    const [brushOpacity, setBrushOpacity] = useState(100);
    const [brushColor, setBrushColor] = useState('#4f46e5');
    const [brushShape, setBrushShape] = useState<BrushShape>('circle');
    const [brushHardness, setBrushHardness] = useState(50);
    const [tolerance, setTolerance] = useState(30);

    // wand settings
    const [wandExpand, setWandExpand] = useState(0);
    const [wandSmooth, setWandSmooth] = useState(1);

    // performance refs
    const toolRef = useRef<Tool>(tool);

    useEffect(() => {
        toolRef.current = tool;
    }, [tool]);

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
        brushShape,
        setBrushShape,
        brushHardness,
        setBrushHardness,
        tolerance,
        setTolerance,
        wandExpand,
        setWandExpand,
        wandSmooth,
        setWandSmooth
    };
}
