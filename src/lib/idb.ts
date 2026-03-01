/**
 * idb.ts
 * 
 * IndexedDB를 사용하여 브라우저 로컬 데이터베이스에 데이터를 저장하는 유틸리티입니다.
 * 주로 사용자가 선택한 특정 폴더의 'FileSystemDirectoryHandle'을 저장하여, 사이트 재방문 시에도 권한을 유지하기 위해 사용됩니다.
 */

/**
 * IndexedDB 연결을 공유하는 내부 헬퍼 함수입니다.
 * 'handles' 오브젝트 스토어를 생성하거나 초기화합니다.
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

/**
 * 지정된 키(key)에 해당하는 데이터(handle)를 데이터베이스에 저장합니다.
 */
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

/**
 * 데이터베이스로부터 지정된 키(key)에 해당하는 데이터를 불러옵니다.
 */
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
