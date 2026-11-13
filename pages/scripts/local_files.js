// 첨부파일 원본은 작성자의 브라우저에만 보관한다.
let opened;
function database() {
  if (!opened) opened = new Promise((resolve, reject) => {
    const request = indexedDB.open("ambient-local-attachments", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opened;
}

export async function storeAttachments(uid, postId, files) {
  if (!files.length) return [];
  const db = await database();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    files.forEach((file, index) => transaction.objectStore("files").put(file, uid + ":" + postId + ":" + index));
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
  return files.map(file => ({ name: file.name, size: file.size, type: file.type }));
}

export async function downloadAttachment(uid, postId, index) {
  const db = await database();
  const file = await new Promise((resolve, reject) => {
    const request = db.transaction("files").objectStore("files").get(uid + ":" + postId + ":" + index);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!file) throw new Error("이 기기에 원본 파일이 없어요. 파일을 저장한 브라우저에서 열어 주세요.");
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
