import { useCallback, useEffect, useRef, useState } from 'react';

// ── 타입 정의 ─────────────────────────────────────────────────────────────

export type LayerType = 'image' | 'paint' | 'text';
export type BlendMode = 'source-over'; // Phase 1은 Normal만

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number; // px (canvas image space)
  lineHeight: number;    // 배수 (1.0 = fontSize, 1.3 = default)
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;       // 0–100
  blendMode: BlendMode;
  locked: boolean;
  // 픽셀 레이어 (image / paint) 전용
  originalCanvas: HTMLCanvasElement | null;
  maskCanvas: HTMLCanvasElement | null;
  // 위치 오프셋 (move 툴용)
  x: number;
  y: number;
  // 텍스트 레이어 전용
  textContent: string;
  textStyle: TextStyle;
}

// 히스토리 엔트리: 레이어 배열 전체의 직렬화
export interface LayerHistoryEntry {
  layers: LayerSnapshot[];
  activeLayerId: string;
  label: string;
  time: string;
}

// 직렬화 가능한 레이어 스냅샷
export interface LayerSnapshot {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
  x: number;
  y: number;
  // 픽셀 데이터
  originalData: ImageData | null;
  maskData: ImageData | null;
  // 텍스트
  textContent: string;
  textStyle: TextStyle;
}

// ── 유틸 ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'sans-serif',
  fontSize: 48,
  fontWeight: 'bold',
  fontStyle: 'normal',
  color: '#ffffff',
  align: 'left',
  letterSpacing: 0,
  lineHeight: 1.3,
};

function layerToSnapshot(layer: Layer): LayerSnapshot {
  let originalData: ImageData | null = null;
  let maskData: ImageData | null = null;

  if (layer.originalCanvas && layer.originalCanvas.width > 0) {
    const ctx = layer.originalCanvas.getContext('2d', { willReadFrequently: true })!;
    originalData = ctx.getImageData(0, 0, layer.originalCanvas.width, layer.originalCanvas.height);
  }
  if (layer.maskCanvas && layer.maskCanvas.width > 0) {
    const ctx = layer.maskCanvas.getContext('2d', { willReadFrequently: true })!;
    maskData = ctx.getImageData(0, 0, layer.maskCanvas.width, layer.maskCanvas.height);
  }

  return {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    locked: layer.locked,
    x: layer.x,
    y: layer.y,
    originalData,
    maskData,
    textContent: layer.textContent,
    textStyle: { ...layer.textStyle },
  };
}

function snapshotToLayer(snap: LayerSnapshot, docW: number, docH: number): Layer {
  const w = snap.originalData?.width ?? docW;
  const h = snap.originalData?.height ?? docH;

  const originalCanvas = makeCanvas(w, h);
  const maskCanvas = makeCanvas(w, h);

  if (snap.originalData) {
    originalCanvas.getContext('2d')!.putImageData(snap.originalData, 0, 0);
  }
  if (snap.maskData) {
    maskCanvas.getContext('2d')!.putImageData(snap.maskData, 0, 0);
  }

  return {
    id: snap.id,
    name: snap.name,
    type: snap.type,
    visible: snap.visible,
    opacity: snap.opacity,
    blendMode: snap.blendMode,
    locked: snap.locked,
    x: snap.x,
    y: snap.y,
    originalCanvas,
    maskCanvas,
    textContent: snap.textContent,
    textStyle: { ...snap.textStyle },
  };
}

// ── 훅 ────────────────────────────────────────────────────────────────────

export function useLayers(docW: number, docH: number) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>('');
  const [historyVersion, setHistoryVersion] = useState(0);

  // 히스토리 스택
  const historyStack = useRef<LayerHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // ── 히스토리 저장 ──────────────────────────────────────────────────────

  const saveSnapshot = useCallback((
    currentLayers: Layer[],
    currentActiveId: string,
    label: string
  ) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const entry: LayerHistoryEntry = {
      layers: currentLayers.map(layerToSnapshot),
      activeLayerId: currentActiveId,
      label,
      time,
    };

    setHistoryIndex(prev => {
      const newIdx = prev + 1;
      // 미래 히스토리 삭제
      historyStack.current = historyStack.current.slice(0, newIdx);
      historyStack.current.push(entry);
      setHistoryVersion(v => v + 1);
      return newIdx;
    });
  }, []);

  // ── 히스토리 복원 ──────────────────────────────────────────────────────

  const jumpToHistory = useCallback((index: number) => {
    if (index < 0 || index >= historyStack.current.length) return;
    const entry = historyStack.current[index]!;
    const restored = entry.layers.map(snap => snapshotToLayer(snap, docW, docH));
    setLayers(restored);
    setActiveLayerId(entry.activeLayerId);
    setHistoryIndex(index);
    setHistoryVersion(v => v + 1);
  }, [docW, docH]);

  const undo = useCallback(() => {
    setHistoryIndex(prev => {
      if (prev <= 0) return prev;
      const newIdx = prev - 1;
      const entry = historyStack.current[newIdx]!;
      const restored = entry.layers.map(snap => snapshotToLayer(snap, docW, docH));
      setLayers(restored);
      setActiveLayerId(entry.activeLayerId);
      setHistoryVersion(v => v + 1);
      return newIdx;
    });
  }, [docW, docH]);

  const redo = useCallback(() => {
    setHistoryIndex(prev => {
      if (prev >= historyStack.current.length - 1) return prev;
      const newIdx = prev + 1;
      const entry = historyStack.current[newIdx]!;
      const restored = entry.layers.map(snap => snapshotToLayer(snap, docW, docH));
      setLayers(restored);
      setActiveLayerId(entry.activeLayerId);
      setHistoryVersion(v => v + 1);
      return newIdx;
    });
  }, [docW, docH]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyStack.current.length - 1;

  // ── 레이어 작업 헬퍼 (히스토리 자동 저장 버전) ──────────────────────

  /** 레이어 배열 + activeId를 함께 변경하고 히스토리 저장 */
  const commitLayers = useCallback((
    nextLayers: Layer[],
    nextActiveId: string,
    label: string
  ) => {
    setLayers(nextLayers);
    setActiveLayerId(nextActiveId);
    saveSnapshot(nextLayers, nextActiveId, label);
  }, [saveSnapshot]);

  // ── 레이어 생성 ────────────────────────────────────────────────────────

  /** 이미지(HTMLImageElement / HTMLCanvasElement)로부터 image 레이어 생성 */
  const addImageLayer = useCallback((
    source: HTMLImageElement | HTMLCanvasElement,
    name: string,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

    const originalCanvas = makeCanvas(w, h);
    originalCanvas.getContext('2d')!.drawImage(source, 0, 0);

    // 마스크: 원본 알파 채널 기반으로 초기화
    const maskCanvas = makeCanvas(w, h);
    const oCtx = originalCanvas.getContext('2d', { willReadFrequently: true })!;
    const imgData = oCtx.getImageData(0, 0, w, h);
    const mCtx = maskCanvas.getContext('2d')!;
    const mData = mCtx.createImageData(w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
      mData.data[i + 3] = imgData.data[i + 3]!;
    }
    mCtx.putImageData(mData, 0, 0);

    const newLayer: Layer = {
      id: makeId(),
      name,
      type: 'image',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
      originalCanvas,
      maskCanvas,
      x: 0,
      y: 0,
      textContent: '',
      textStyle: { ...DEFAULT_TEXT_STYLE },
    };

    const nextLayers = [...currentLayers, newLayer];
    commitLayers(nextLayers, newLayer.id, `Add Layer: ${name}`);
    return newLayer;
  }, [commitLayers]);

  /** 빈 페인트 레이어 추가 */
  const addPaintLayer = useCallback((
    name: string,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const w = docW || 800;
    const h = docH || 600;

    const originalCanvas = makeCanvas(w, h);
    const maskCanvas = makeCanvas(w, h);
    // 빈 페인트 레이어: 마스크 완전 불투명
    const mCtx = maskCanvas.getContext('2d')!;
    const mData = mCtx.createImageData(w, h);
    for (let i = 0; i < mData.data.length; i += 4) {
      mData.data[i + 3] = 255;
    }
    mCtx.putImageData(mData, 0, 0);

    const newLayer: Layer = {
      id: makeId(),
      name,
      type: 'paint',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
      originalCanvas,
      maskCanvas,
      x: 0,
      y: 0,
      textContent: '',
      textStyle: { ...DEFAULT_TEXT_STYLE },
    };

    const nextLayers = [...currentLayers, newLayer];
    commitLayers(nextLayers, newLayer.id, `Add Layer: ${name}`);
    return newLayer;
  }, [docW, docH, commitLayers]);

  /** 텍스트 레이어 추가 */
  const addTextLayer = useCallback((
    textContent: string,
    textStyle: Partial<TextStyle>,
    x: number,
    y: number,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const newLayer: Layer = {
      id: makeId(),
      name: `Text: "${textContent.substring(0, 12)}"`,
      type: 'text',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
      originalCanvas: null,
      maskCanvas: null,
      x,
      y,
      textContent,
      textStyle: { ...DEFAULT_TEXT_STYLE, ...textStyle },
    };

    const nextLayers = [...currentLayers, newLayer];
    commitLayers(nextLayers, newLayer.id, `Add Text`);
    return newLayer;
  }, [commitLayers]);

  // ── 레이어 속성 변경 ───────────────────────────────────────────────────

  const removeLayer = useCallback((
    id: string,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const nextLayers = currentLayers.filter(l => l.id !== id);
    let nextActiveId = currentActiveId;
    if (currentActiveId === id) {
      nextActiveId = nextLayers.length > 0 ? nextLayers[nextLayers.length - 1]!.id : '';
    }
    commitLayers(nextLayers, nextActiveId, 'Delete Layer');
  }, [commitLayers]);

  const reorderLayer = useCallback((
    id: string,
    newIndex: number,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const idx = currentLayers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const nextLayers = [...currentLayers];
    const [moved] = nextLayers.splice(idx, 1);
    nextLayers.splice(newIndex, 0, moved!);
    commitLayers(nextLayers, currentActiveId, 'Reorder Layers');
  }, [commitLayers]);

  const setLayerVisible = useCallback((
    id: string,
    visible: boolean,
    currentLayers: Layer[]
  ) => {
    const nextLayers = currentLayers.map(l => l.id === id ? { ...l, visible } : l);
    setLayers(nextLayers);
    // 가시성 변경은 히스토리 저장 안 함 (포토샵 동일)
    setHistoryVersion(v => v + 1);
  }, []);

  const setLayerOpacity = useCallback((
    id: string,
    opacity: number,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const nextLayers = currentLayers.map(l => l.id === id ? { ...l, opacity } : l);
    commitLayers(nextLayers, currentActiveId, 'Layer Opacity');
  }, [commitLayers]);

  const renameLayer = useCallback((
    id: string,
    name: string,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const nextLayers = currentLayers.map(l => l.id === id ? { ...l, name } : l);
    commitLayers(nextLayers, currentActiveId, 'Rename Layer');
  }, [commitLayers]);

  /** 텍스트 레이어 내용/스타일 업데이트 */
  const updateTextLayer = useCallback((
    id: string,
    textContent: string,
    textStyle: TextStyle,
    x: number,
    y: number,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const nextLayers = currentLayers.map(l =>
      l.id === id
        ? { ...l, textContent, textStyle: { ...textStyle }, x, y, name: `Text: "${textContent.substring(0, 12)}"` }
        : l
    );
    commitLayers(nextLayers, currentActiveId, 'Edit Text');
  }, [commitLayers]);

  /** 레이어 이동 (x, y 오프셋) - 드래그 중에는 히스토리 저장 없이 실시간 */
  const moveLayerPosition = useCallback((
    id: string,
    x: number,
    y: number,
    currentLayers: Layer[]
  ) => {
    const nextLayers = currentLayers.map(l => l.id === id ? { ...l, x, y } : l);
    setLayers(nextLayers);
    setHistoryVersion(v => v + 1);
    return nextLayers;
  }, []);

  /** 레이어 이동 완료 시 히스토리 저장 */
  const commitLayerMove = useCallback((
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    saveSnapshot(currentLayers, currentActiveId, 'Move Layer');
  }, [saveSnapshot]);

  // ── 병합 ──────────────────────────────────────────────────────────────

  /** 아래 레이어에 병합 (Merge Down) */
  const mergeDown = useCallback((
    id: string,
    currentLayers: Layer[],
    currentActiveId: string,
    compositeTemp: (layers: Layer[]) => ImageData | null
  ) => {
    const idx = currentLayers.findIndex(l => l.id === id);
    if (idx <= 0) return; // 맨 아래 레이어는 병합 불가

    const upper = currentLayers[idx]!;
    const lower = currentLayers[idx - 1]!;

    if (!lower.originalCanvas || !upper.originalCanvas) return;

    const w = Math.max(lower.originalCanvas.width, upper.originalCanvas.width);
    const h = Math.max(lower.originalCanvas.height, upper.originalCanvas.height);

    const mergedOriginal = makeCanvas(w, h);
    const mergedMask = makeCanvas(w, h);
    const mCtx = mergedMask.getContext('2d')!;

    // 마스크: 완전 불투명
    const mData = mCtx.createImageData(w, h);
    for (let i = 0; i < mData.data.length; i += 4) mData.data[i + 3] = 255;
    mCtx.putImageData(mData, 0, 0);

    // 픽셀: lower → upper 순으로 그리기
    const ctx = mergedOriginal.getContext('2d')!;

    // lower composite
    const tempL = makeCanvas(lower.originalCanvas.width, lower.originalCanvas.height);
    const tCtxL = tempL.getContext('2d')!;
    tCtxL.drawImage(lower.originalCanvas, 0, 0);
    tCtxL.globalCompositeOperation = 'destination-in';
    if (lower.maskCanvas) tCtxL.drawImage(lower.maskCanvas, 0, 0);
    ctx.globalAlpha = lower.opacity / 100;
    ctx.drawImage(tempL, lower.x, lower.y);

    // upper composite
    const tempU = makeCanvas(upper.originalCanvas.width, upper.originalCanvas.height);
    const tCtxU = tempU.getContext('2d')!;
    tCtxU.drawImage(upper.originalCanvas, 0, 0);
    tCtxU.globalCompositeOperation = 'destination-in';
    if (upper.maskCanvas) tCtxU.drawImage(upper.maskCanvas, 0, 0);
    ctx.globalAlpha = upper.opacity / 100;
    ctx.drawImage(tempU, upper.x, upper.y);
    ctx.globalAlpha = 1;

    const mergedLayer: Layer = {
      ...lower,
      id: makeId(),
      name: `${lower.name} (merged)`,
      type: 'image',
      originalCanvas: mergedOriginal,
      maskCanvas: mergedMask,
      x: 0,
      y: 0,
      opacity: 100,
    };

    const nextLayers = [
      ...currentLayers.slice(0, idx - 1),
      mergedLayer,
      ...currentLayers.slice(idx + 1),
    ];
    commitLayers(nextLayers, mergedLayer.id, 'Merge Down');
  }, [commitLayers]);

  /** 전체 평탄화 (Flatten) */
  const flattenAll = useCallback((
    currentLayers: Layer[],
    currentActiveId: string,
    docWidth: number,
    docHeight: number
  ) => {
    const w = docWidth || docW;
    const h = docHeight || docH;

    const mergedOriginal = makeCanvas(w, h);
    const mergedMask = makeCanvas(w, h);

    const ctx = mergedOriginal.getContext('2d')!;
    const mCtx = mergedMask.getContext('2d')!;

    for (const layer of currentLayers) {
      if (!layer.visible || !layer.originalCanvas) continue;
      const temp = makeCanvas(layer.originalCanvas.width, layer.originalCanvas.height);
      const tCtx = temp.getContext('2d')!;
      tCtx.drawImage(layer.originalCanvas, 0, 0);
      if (layer.maskCanvas) {
        tCtx.globalCompositeOperation = 'destination-in';
        tCtx.drawImage(layer.maskCanvas, 0, 0);
      }
      ctx.globalAlpha = layer.opacity / 100;
      ctx.drawImage(temp, layer.x, layer.y);
    }
    ctx.globalAlpha = 1;

    // 마스크: 완전 불투명
    const mData = mCtx.createImageData(w, h);
    for (let i = 0; i < mData.data.length; i += 4) mData.data[i + 3] = 255;
    mCtx.putImageData(mData, 0, 0);

    const flattened: Layer = {
      id: makeId(),
      name: 'Background',
      type: 'image',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
      originalCanvas: mergedOriginal,
      maskCanvas: mergedMask,
      x: 0,
      y: 0,
      textContent: '',
      textStyle: { ...DEFAULT_TEXT_STYLE },
    };

    commitLayers([flattened], flattened.id, 'Flatten Image');
  }, [docW, docH, commitLayers]);

  // ── 픽셀 작업용 - 활성 레이어 캔버스 getter ──────────────────────────

  const getActiveLayer = useCallback((): Layer | null => {
    return layers.find(l => l.id === activeLayerId) ?? null;
  }, [layers, activeLayerId]);

  /** 활성 레이어의 original/mask ref를 얻음 (기존 도구들이 ref처럼 사용) */
  const getActiveLayerCanvases = useCallback((): {
    original: HTMLCanvasElement | null;
    mask: HTMLCanvasElement | null;
  } => {
    const active = layers.find(l => l.id === activeLayerId);
    return {
      original: active?.originalCanvas ?? null,
      mask: active?.maskCanvas ?? null,
    };
  }, [layers, activeLayerId]);

  /** 픽셀 작업 완료 후 강제 히스토리 저장 (erase/paint/wand 등 툴에서 호출)
   * - React state의 최신값을 참조하기 위해 functional update 패턴 사용
   */
  const layersRef = useRef<Layer[]>([]);
  const activeLayerIdRef = useRef<string>('');
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { activeLayerIdRef.current = activeLayerId; }, [activeLayerId]);

  const savePixelSnapshot = useCallback((label: string) => {
    saveSnapshot(layersRef.current, activeLayerIdRef.current, label);
  }, [saveSnapshot]);

  // ── 초기화 ────────────────────────────────────────────────────────────

  const resetLayers = useCallback(() => {
    setLayers([]);
    setActiveLayerId('');
    historyStack.current = [];
    setHistoryIndex(-1);
    setHistoryVersion(0);
  }, []);

  return {
    // 상태
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    historyVersion,
    historyStack,
    historyIndex,
    canUndo,
    canRedo,

    // 히스토리
    saveSnapshot,
    jumpToHistory,
    undo,
    redo,

    // 레이어 CRUD
    addImageLayer,
    addPaintLayer,
    addTextLayer,
    removeLayer,
    reorderLayer,
    setLayerVisible,
    setLayerOpacity,
    renameLayer,
    updateTextLayer,

    // 이동
    moveLayerPosition,
    commitLayerMove,

    // 병합
    mergeDown,
    flattenAll,

    // 현재 레이어 접근
    getActiveLayer,
    getActiveLayerCanvases,
    savePixelSnapshot,

    // 초기화
    resetLayers,
    commitLayers,
  };
}
