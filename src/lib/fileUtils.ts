/**
 * fileUtils.ts
 * 
 * 파일 처리와 관련된 유틸리티 함수 모음입니다.
 * 브라우저 파일 시스템 API 접근 권한 확인, 고유 파일명 생성, Zip 압축 다운로드 등을 담당합니다.
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * 브라우저 네이티브 파일 시스템 API의 권한(읽기/쓰기)을 확인하고 요청합니다.
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
 * 파일 경로명에서 파일 본체 이름(base)과 확장자(ext)를 분리합니다.
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
 * 지정된 디렉토리 내에서 파일명이 중복되지 않도록 (1), (2) 번호를 붙여 고유한 핸들을 반환합니다.
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
 * 변환된 이미지의 원본 파일명과 Blob 타입을 기반으로 적절한 다운로드 파일명을 결정합니다.
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
 * 브라우저의 기본 기능을 사용하여 단일 이미지를 다운로드합니다.
 */
export async function downloadSingleImage(img: { file: File, processedUrl?: string | null }) {
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
 * 여러 개의 변환된 이미지를 하나의 Zip 파일로 압축하여 다운로드합니다.
 */
export async function downloadAsZip(targetImages: any[]) {
    const zip = new JSZip();
    const nameCounts: Record<string, number> = {};

    for (const img of targetImages) {
        if (!img.processedUrl) continue;
        const response = await fetch(img.processedUrl);
        const blob = await response.blob();
        let filename = getDownloadFilename(img.file.name, blob.type);

        // Zip 내부 파일명 중복 방지
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
 * 파일 크기(Byte)를 읽기 쉬운 단위(KB, MB 등)의 문자열로 변환합니다.
 */
export function formatBytes(bytes: number, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
