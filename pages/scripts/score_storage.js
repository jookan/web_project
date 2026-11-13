// PDF 원본은 UID별 IndexedDB에, 악보 정보와 연습 설정은 Firestore에 저장한다.
import { db } from "./firebase_config.js";
import { currentUser, assertAccount } from "./firebase_data.js";
import { collection, doc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const status = document.querySelector("#storage-status");
let database, owner = null;
const records = new Map();
const waiting = new Map();
let writes = Promise.resolve();
let pendingCloud = 0;
const failedCloud = new Set();

function openDatabase(name) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains("scores")) request.result.createObjectStore("scores", { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("다른 탭의 악보 저장소를 닫고 다시 시도해 주세요."));
    });
}

function allRecords(store) {
    return new Promise((resolve, reject) => {
        const request = store.transaction("scores").objectStore("scores").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function putRecord(record) {
    if (!database) return Promise.reject(new Error("PDF 원본을 브라우저에 보관하지 못했어요."));
    return new Promise((resolve, reject) => {
        const transaction = database.transaction("scores", "readwrite");
        transaction.objectStore("scores").put(record);
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
    });
}

function message(text, failed = false) {
    status.textContent = text;
    status.classList.toggle("is-error", failed);
}

function showStorageError(error) {
    console.error("악보 저장 오류:", error.code || error.message);
    message("악보 저장을 완료하지 못했어요. 연결 상태와 브라우저 저장 공간을 확인해 주세요.", true);
}

async function documentKey(id) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function syncMetadata(record) {
    if (!owner) return;
    assertAccount(owner.uid);
    const key = await documentKey(record.id);
    await setDoc(doc(db, "users", owner.uid, "scores", key), {
        scoreId: record.id, fileName: record.file.name, fileSize: record.file.size,
        lastModified: record.file.lastModified, pageNumber: record.pageNumber,
        practice: record.practice, updatedAt: serverTimestamp()
    });
    if (records.get(record.id) === record) {
        record.cloudDirty = false;
        await putRecord(record);
    }
}

function commit(id) {
    const entry = waiting.get(id);
    if (!entry) return writes;
    clearTimeout(entry.timer);
    waiting.delete(id);
    pendingCloud++;
    writes = writes.catch(() => {}).then(() => syncMetadata(entry.record));
    writes.then(() => {
        pendingCloud--;
        failedCloud.delete(id);
        if (!waiting.size && !pendingCloud && !failedCloud.size) message("PDF 원본은 이 브라우저에, 악보 정보와 설정은 계정에 저장했어요.");
    }, error => {
        pendingCloud--;
        failedCloud.add(id);
        showStorageError(error);
    });
    return writes;
}

export function flushScoreWrites() {
    for (const id of Array.from(waiting.keys())) commit(id);
    return writes;
}

export function savedScore(id) { return records.get(id); }

export async function openScoreStorage() {
    owner = await currentUser();
    records.clear();
    try {
        database = await openDatabase("sheet-music-library-" + (owner?.uid || "guest"));
        for (const record of await allRecords(database)) records.set(record.id, record);
    } catch (error) { showStorageError(error); }
    if (owner) {
        try {
            const snapshot = await getDocs(collection(db, "users", owner.uid, "scores"));
            for (const item of snapshot.docs) {
                const data = item.data();
                const local = records.get(data.scoreId);
                if (!local?.cloudDirty) records.set(data.scoreId, {
                    ...local, id: data.scoreId, fileName: data.fileName, fileSize: data.fileSize,
                    lastModified: data.lastModified, pageNumber: data.pageNumber, practice: data.practice
                });
            }
            for (const record of records.values()) if (record.file && record.cloudDirty) await syncMetadata(record);
            message("계정의 악보 설정을 불러왔어요. 다른 기기에서는 같은 PDF 원본을 선택해 주세요.");
        } catch (error) { showStorageError(error); }
    } else message("게스트의 PDF와 설정은 이 브라우저에만 저장돼요.");
    return Array.from(records.values());
}

export function saveScore(score) {
    if (!score?.file) return;
    const record = { id: score.id, file: score.file, pageNumber: score.pageNumber,
        practice: structuredClone(score.practice), cloudDirty: !!owner };
    records.set(record.id, record);
    putRecord(record).then(() => {
        if (!owner) message("게스트의 PDF와 설정을 이 브라우저에 저장했어요.");
    }).catch(showStorageError);
    if (owner) {
        const previous = waiting.get(record.id);
        if (previous) clearTimeout(previous.timer);
        message("PDF는 브라우저에 보관하고 설정을 계정에 저장하고 있어요.");
        waiting.set(record.id, { record, timer: setTimeout(() => commit(record.id), 500) });
    }
}

export async function hasLegacyScores() {
    const legacy = await openDatabase("sheet-music-library");
    try {
        return await new Promise((resolve, reject) => {
            const request = legacy.transaction("scores").objectStore("scores").count();
            request.onsuccess = () => resolve(request.result > 0);
            request.onerror = () => reject(request.error);
        });
    } finally { legacy.close(); }
}

export async function importLegacyScores() {
    if (owner) assertAccount(owner.uid);
    const legacy = await openDatabase("sheet-music-library");
    let imported = 0;
    try {
        for (const record of await allRecords(legacy)) {
            if (records.has(record.id)) continue;
            record.cloudDirty = !!owner;
            records.set(record.id, record);
            await putRecord(record);
            if (owner) await syncMetadata(record);
            imported++;
        }
    } finally { legacy.close(); }
    return imported;
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushScoreWrites().catch(showStorageError);
});
