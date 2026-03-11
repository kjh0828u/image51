import { useAppStore, type ImageItem } from '@/store/useAppStore';
import { processImage } from '@/lib/imageProcessor';
import { verifyPermission, getUniqueFileHandle, getDownloadFilename, downloadSingleImage, downloadAsZip, triggerBrowserDownload, saveBlobToDirectory } from '@/lib/fileUtils';

export function useImageProcessing() {
  const store = useAppStore();

  const performDownload = async (blob: Blob, filename: string, skipPermissionRequest = false) => {
    const currentState = useAppStore.getState();
    let dirHandle = null;

    if (currentState.downloadMode === 'custom' && currentState.customDirectoryHandle) {
      const hasPerm = await verifyPermission(currentState.customDirectoryHandle, true, !skipPermissionRequest);
      if (hasPerm) {
        const d = new Date();
        const folderName = `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dirHandle = await (currentState.customDirectoryHandle as any).getDirectoryHandle(folderName, { create: true });
      }
    }

    if (dirHandle) {
      await saveBlobToDirectory(dirHandle, blob, filename);
      return true;
    } else {
      triggerBrowserDownload(blob, filename);
      return false;
    }
  };

  const handleDownloadAll = async ({ skipPermissionRequest = false }: { skipPermissionRequest?: boolean } = {}) => {
    const currentState = useAppStore.getState();
    const targetImages = currentState.images.filter(img => img.status === 'done' && img.processedUrl && !img.isDownloaded);
    if (targetImages.length === 0) return;

    if (currentState.downloadMode === 'custom' && currentState.customDirectoryHandle) {
      const hasPerm = await verifyPermission(currentState.customDirectoryHandle, true, !skipPermissionRequest);
      if (hasPerm) {
        const d = new Date();
        const folderName = `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dirHandle = await (currentState.customDirectoryHandle as any).getDirectoryHandle(folderName, { create: true });

        for (const img of targetImages) {
          try {
            const res = await fetch(img.processedUrl!);
            const blob = await res.blob();
            const filename = getDownloadFilename(img.file.name, blob.type);
            await saveBlobToDirectory(dirHandle, blob, filename);
            currentState.updateImageStatus(img.id, { isDownloaded: true });
          } catch (e) { console.error(e); }
        }
        return;
      }
    }

    // fallback or default mode
    if (targetImages.length === 1) {
      await handleSingleDownload(targetImages[0], skipPermissionRequest);
    } else {
      // 만약 폴더 저장 모드가 설정되어있는데 여기까지 왔다면 권한 문제일 수 있으므로 
      // 한 번 더 시도하거나 기본 ZIP 방식을 사용합니다.
      await downloadAsZip(targetImages);
      targetImages.forEach(img => currentState.updateImageStatus(img.id, { isDownloaded: true }));
    }
  };

  const handleSingleDownload = async (img: ImageItem, skipPermissionRequest = false) => {
    const currentState = useAppStore.getState();
    if (!img.processedUrl) return;
    try {
      const res = await fetch(img.processedUrl);
      const blob = await res.blob();
      const filename = getDownloadFilename(img.file.name, blob.type);
      await performDownload(blob, filename, skipPermissionRequest);
      currentState.updateImageStatus(img.id, { isDownloaded: true });
    } catch (e) {
      console.error(e);
      // fallback to old method if fetch fails
      await downloadSingleImage(img);
      currentState.updateImageStatus(img.id, { isDownloaded: true });
    }
  };

  const handleStartProcessing = async (onResizeError?: (msg: string | null) => void) => {
    const initialState = useAppStore.getState();
    if (initialState.enableResize && !initialState.resizeWidth.trim() && !initialState.resizeHeight.trim()) {
      onResizeError?.('가로 또는 세로 크기를 한 개 이상 입력해주세요.');
      return;
    }
    onResizeError?.(null);

    const pendingImages = initialState.images.filter(img => img.status === 'pending');
    if (pendingImages.length === 0) return;

    // 만약 자동 다운로드가 켜져있고 실제 폴더 저장 모드라면, 시작할 때 미리 권한을 한 번 물어봅니다.
    // (작업 중간에 팝업이 뜨면 사용자 제스처 소실로 인해 실패하거나 다운로드 폴더로 리다이렉트 되는 것을 방지)
    if (initialState.autoDownloadAfterProcessing && initialState.downloadMode === 'custom' && initialState.customDirectoryHandle) {
      await verifyPermission(initialState.customDirectoryHandle, true, true);
    }

    for (const img of pendingImages) {
      initialState.updateImageStatus(img.id, { status: 'processing' });
      try {
        const currentOptions = useAppStore.getState();
        const resultUrl = await processImage(img.file, currentOptions);
        const req = await fetch(resultUrl);
        const blob = await req.blob();
        initialState.updateImageStatus(img.id, { status: 'done', processedUrl: resultUrl, processedSize: blob.size });
      } catch (err) {
        console.error(err);
        initialState.updateImageStatus(img.id, { status: 'error' });
      }
    }

    if (useAppStore.getState().autoDownloadAfterProcessing) {
      await handleDownloadAll({ skipPermissionRequest: true });
    }
  };

  return { handleStartProcessing, handleDownloadAll, handleSingleDownload, performDownload };
}
