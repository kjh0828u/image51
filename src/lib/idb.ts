/**
 * IndexedDB 연결을 공유하는 헬퍼 함수
 */
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('image51-db', 1);
        request.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('handles')) {
                db.createObjectStore('handles');
            }
        };
        request.onsuccess = (e: any) => resolve(e.target.result);
        request.onerror = () => reject(request.error);
    });
}

export async function setHandle(key: string, handle: FileSystemDirectoryHandle) {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    store.put(handle, key);
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
    const db = await openDB();
    if (!db.objectStoreNames.contains('handles')) return null;
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const getReq = store.get(key);
    return new Promise((resolve, reject) => {
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => reject(getReq.error);
    });
}
