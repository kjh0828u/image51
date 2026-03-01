import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * 브라우저 파일 시스템 권한 확인
 */
export async function verifyPermission(fileHandle: any, readWrite: boolean = true, requestIfNeeded = true) {
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await fileHandle.queryPermission(options)) === 'granted') {
        return true;
    }
    if (requestIfNeeded && (await fileHandle.requestPermission(options)) === 'granted') {
        return true;
    }
    return false;
}

/**
 * 파일명에서 기본 이름과 확장자 분리
 */
export function getFilenameParts(filename: string) {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex === -1) return { base: filename, ext: '' };
    return {
        base: filename.substring(0, dotIndex),
        ext: filename.substring(dotIndex)
    };
}

/**
 * 저장 공간 내 중복 방지 ( (1), (2) 등 추가 )
 */
export async function getUniqueFileHandle(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<FileSystemFileHandle> {
    const { base, ext } = getFilenameParts(filename);
    let currentName = filename;
    let counter = 1;

    while (true) {
        try {
            await dirHandle.getFileHandle(currentName);
            currentName = `${base}_${counter}${ext}`;
            counter++;
        } catch (e: any) {
            if (e.name === 'NotFoundError') {
                return await dirHandle.getFileHandle(currentName, { create: true });
            }
            throw e;
        }
    }
}

/**
 * 다운로드될 파일명 결정
 */
export function getDownloadFilename(originalName: string, blobType: string): string {
    const { base } = getFilenameParts(originalName);
    const extMap: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };
    const ext = extMap[blobType] || originalName.split('.').pop() || 'png';
    return `${base}.${ext}`;
}

/**
 * 단일 이미지 다운로드 (브라우저 방식)
 */
export async function downloadSingleImage(img: { file: File, processedUrl?: string | null }, updateStatus?: (id: string, state: any) => void) {
    if (!img.processedUrl) return;
    const response = await fetch(img.processedUrl);
    const blob = await response.blob();
    const filename = getDownloadFilename(img.file.name, blob.type);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 다수 이미지 Zip 압축 다운로드
 */
export async function downloadAsZip(targetImages: any[]) {
    const zip = new JSZip();
    const nameCounts: Record<string, number> = {};

    for (const img of targetImages) {
        if (!img.processedUrl) continue;
        const response = await fetch(img.processedUrl);
        const blob = await response.blob();
        let filename = getDownloadFilename(img.file.name, blob.type);

        if (nameCounts[filename]) {
            const { base, ext } = getFilenameParts(filename);
            const newName = `${base}_${nameCounts[filename]}${ext}`;
            nameCounts[filename]++;
            filename = newName;
        } else {
            nameCounts[filename] = 1;
        }
        zip.file(filename, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'image51_converted.zip');
}

/**
 * 바이트 단위를 읽기 쉬운 단위로 변환 (KB, MB 등)
 */
export function formatBytes(bytes: number, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
