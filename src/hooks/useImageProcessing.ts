import { useAppStore, type ImageItem } from '@/store/useAppStore';
import { processImage } from '@/lib/imageProcessor';
import { verifyPermission, getUniqueFileHandle, getDownloadFilename, downloadSingleImage, downloadAsZip } from '@/lib/fileUtils';

export function useImageProcessing() {
  const store = useAppStore();

  const handleDownloadAll = async ({ skipPermissionRequest = false }: { skipPermissionRequest?: boolean } = {}) => {
    const targetImages = store.images.filter(img => img.status === 'done' && img.processedUrl && !img.isDownloaded);
    if (targetImages.length === 0) return;

    let dirHandle = null;
    if (store.downloadMode === 'custom' && store.customDirectoryHandle) {
      const hasPerm = await verifyPermission(store.customDirectoryHandle, true, !skipPermissionRequest);
      if (hasPerm) {
        const d = new Date();
        const folderName = `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dirHandle = await (store.customDirectoryHandle as any).getDirectoryHandle(folderName, { create: true });
      }
    }

    if (dirHandle) {
      for (const img of targetImages) {
        try {
          const res = await fetch(img.processedUrl!);
          const blob = await res.blob();
          const fileHandle = await getUniqueFileHandle(dirHandle, getDownloadFilename(img.file.name, blob.type));
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          store.updateImageStatus(img.id, { isDownloaded: true });
        } catch (e) { console.error(e); }
      }
    } else {
      if (targetImages.length === 1) {
        await handleSingleDownload(targetImages[0]);
      } else {
        await downloadAsZip(targetImages);
        targetImages.forEach(img => store.updateImageStatus(img.id, { isDownloaded: true }));
      }
    }
  };

  const handleSingleDownload = async (img: ImageItem) => {
    await downloadSingleImage(img);
    store.updateImageStatus(img.id, { isDownloaded: true });
  };

  const handleStartProcessing = async (onResizeError: (msg: string | null) => void) => {
    if (store.enableResize && !store.resizeWidth.trim() && !store.resizeHeight.trim()) {
      onResizeError('가로 또는 세로 크기를 한 개 이상 입력해주세요.');
      return;
    }
    onResizeError(null);

    const pendingImages = store.images.filter(img => img.status === 'pending');
    if (pendingImages.length === 0) return;

    for (const img of pendingImages) {
      store.updateImageStatus(img.id, { status: 'processing' });
      try {
        const resultUrl = await processImage(img.file, store);
        const req = await fetch(resultUrl);
        const blob = await req.blob();
        store.updateImageStatus(img.id, { status: 'done', processedUrl: resultUrl, processedSize: blob.size });
      } catch (err) {
        console.error(err);
        store.updateImageStatus(img.id, { status: 'error' });
      }
    }

    if (store.autoDownloadAfterProcessing) {
      await handleDownloadAll({ skipPermissionRequest: true });
    }
  };

  return { handleStartProcessing, handleDownloadAll, handleSingleDownload };
}
