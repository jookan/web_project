// 개인 플레이리스트용 저장 어댑터. 로컬 캐시도 UID별로 구분한다.
import { auth, db } from "./firebase_config.js";
import { currentUser, assertAccount } from "./firebase_data.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

export function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

export async function openAccountState(name, legacyKey, defaultValue) {
  const user = await currentUser();
  const uid = user?.uid || "guest";
  const cacheKey = legacyKey + ":" + uid;
  let value = readLocal(cacheKey) ?? defaultValue();
  let loadError = null;
  const ref = user ? doc(db, "users", uid, "appData", name) : null;
  if (ref) {
    try {
      const snapshot = await getDoc(ref);
      if (snapshot.exists()) value = JSON.parse(snapshot.data().payload);
    } catch (error) { loadError = error; }
  }
  let pending = Promise.resolve();
  return {
    value, cacheKey, uid, user, loadError,
    legacy: () => readLocal(legacyKey),
    save(next) {
      const payload = JSON.stringify(next);
      try { localStorage.setItem(cacheKey, payload); } catch { /* 원격 저장은 계속 시도 */ }
      if (!ref) return Promise.resolve();
      // 최초 읽기에 실패했을 때 빈 로컬 상태로 원격 데이터를 덮어쓰지 않는다.
      if (loadError) return Promise.reject(loadError);
      if (new TextEncoder().encode(payload).length > 800000) {
        return Promise.reject(new Error("플레이리스트가 너무 커서 서버에 저장하지 못했어요. 목록을 나눠 주세요."));
      }
      pending = pending.catch(() => {}).then(async () => {
        assertAccount(uid);
        await setDoc(ref, { payload, updatedAt: serverTimestamp() });
      });
      return pending;
    },
    flush: () => pending,
    isCurrent: () => (auth.currentUser?.uid || "guest") === uid
  };
}

export function addImportButton(container, label, store, importValue, report) {
  if (!store.legacy()) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-ghost";
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (!store.isCurrent()) throw new Error("계정이 변경됐어요. 새로고침해 주세요.");
      await importValue(store.legacy());
      button.remove();
    } catch (error) { report(error); button.disabled = false; }
  });
  container.appendChild(button);
}
