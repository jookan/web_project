// PDF 파일과 악보별 설정을 현재 브라우저에 저장한다.
const status = document.querySelector("#storage-status");
let database;
let pendingWrites = 0;
let failedWrite = false;

export async function openScoreStorage() {
    try {
        database = await new Promise((resolve, reject) => {
            const request = indexedDB.open("sheet-music-library", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("scores", { keyPath: "id" });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("다른 탭이 데이터베이스를 사용하고 있어요."));
        });
        return await new Promise((resolve, reject) => {
            const request = database.transaction("scores").objectStore("scores").getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        showStorageError(error);
        return [];
    }
}

function showStorageError(error) {
    console.error("악보 저장 오류:", error);
    status.textContent = "브라우저에 저장하지 못했어요. 새로고침하면 변경 사항이 사라질 수 있어요.";
    status.classList.add("is-error");
}

export function saveScore(score) {
    if (!database || !score || !score.file) return;
    // 트랜잭션을 즉시 만들어 같은 저장소에 대한 쓰기를 순서대로 요청한다.
    const record = {
        id: score.id, file: score.file, pageNumber: score.pageNumber,
        practice: structuredClone(score.practice)
    };
    try {
        const transaction = database.transaction("scores", "readwrite");
        pendingWrites++;
        status.textContent = "악보와 설정을 저장하고 있어요.";
        transaction.objectStore("scores").put(record);
        transaction.oncomplete = () => {
            pendingWrites--;
            if (!pendingWrites && !failedWrite) {
                status.textContent = "이 브라우저에 악보와 설정을 저장했어요.";
                status.classList.remove("is-error");
            }
        };
        transaction.onabort = () => {
            pendingWrites--;
            failedWrite = true;
            showStorageError(transaction.error);
        };
    } catch (error) {
        failedWrite = true;
        showStorageError(error);
    }
}
