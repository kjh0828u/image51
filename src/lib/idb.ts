export async function setHandle(key: string, handle: FileSystemDirectoryHandle) {
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('image51-db', 1);
        request.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('handles')) {
                db.createObjectStore('handles');
            }
        };
        request.onsuccess = (e: any) => {
            const db = e.target.result;
            const tx = db.transaction('handles', 'readwrite');
            const store = tx.objectStore('handles');
            store.put(handle, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function getHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('image51-db', 1);
        request.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('handles')) {
                db.createObjectStore('handles');
            }
        };
        request.onsuccess = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('handles')) {
                resolve(null);
                return;
            }
            const tx = db.transaction('handles', 'readonly');
            const store = tx.objectStore('handles');
            const getReq = store.get(key);
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => reject(getReq.error);
        };
        request.onerror = () => reject(request.error);
    });
}
