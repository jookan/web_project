// 브라우저 통합 검사 전용 SDK 대역. 실제 Firebase 요청을 보내지 않는다.
const test = globalThis.__fakeFirebase ||= {
  user: JSON.parse(localStorage.getItem("__test_user") || "null"),
  data: JSON.parse(localStorage.getItem("__test_cloud") || "{}"),
  listeners: [], authListeners: [], writes: []
};
const persist = () => localStorage.setItem("__test_cloud", JSON.stringify(test.data));
function decode(data) {
  if (!data) return data;
  const result = structuredClone(data);
  for (const key of ["createdAt", "updatedAt"]) {
    if (typeof result[key] === "number") {
      const number = result[key]; result[key] = { toMillis: () => number };
    }
  }
  return result;
}
function snapshot(ref) {
  return { id: ref.path.split("/").at(-1), exists: () => Object.hasOwn(test.data, ref.path), data: () => decode(test.data[ref.path]) };
}
function collectionSnapshot(ref) {
  return { docs: Object.keys(test.data).filter(path => path.startsWith(ref.path + "/") && path.split("/").length === ref.path.split("/").length + 1)
    .map(path => snapshot({ path })) };
}
function notify() { for (const item of test.listeners) queueMicrotask(() => item.callback(collectionSnapshot(item.ref))); }
export const initializeApp = options => ({ options });
export function getAuth(app) {
  if (!test.auth) test.auth = { get currentUser() { return test.user; }, authStateReady: () => Promise.resolve() };
  test.auth.app = app;
  return test.auth;
}
export const getFirestore = app => ({ app });
export function doc(base, ...parts) {
  if (!parts.length) parts.push(crypto.randomUUID());
  const path = [base.path, ...parts].filter(Boolean).join("/");
  return { path, id: path.split("/").at(-1) };
}
export const collection = (base, ...parts) => ({ path: [base.path, ...parts].filter(Boolean).join("/") });
export async function getDoc(ref) {
  if (test.failRead) throw Object.assign(new Error("read failed"), { code: "permission-denied" });
  return snapshot(ref);
}
export async function getDocs(ref) {
  if (test.failRead) throw Object.assign(new Error("read failed"), { code: "permission-denied" });
  return collectionSnapshot(ref);
}
export async function setDoc(ref, data) {
  if (test.failWrite) throw Object.assign(new Error("write failed"), { code: "permission-denied" });
  test.data[ref.path] = structuredClone(data);
  test.writes.push(ref.path);
  persist(); notify();
}
export async function addDoc(ref, data) { const next = doc(ref); await setDoc(next, data); return next; }
export function onSnapshot(ref, callback) {
  const item = { ref, callback }; test.listeners.push(item);
  queueMicrotask(() => callback(collectionSnapshot(ref)));
  return () => { test.listeners = test.listeners.filter(value => value !== item); };
}
export async function runTransaction(db, callback) {
  const operations = [];
  const result = await callback({
    get: getDoc,
    set: (ref, data) => operations.push([ref.path, structuredClone(data)]),
    delete: ref => operations.push([ref.path, null])
  });
  if (test.failWrite) throw Object.assign(new Error("write failed"), { code: "permission-denied" });
  for (const [path, data] of operations) {
    if (data === null) delete test.data[path]; else test.data[path] = data;
    test.writes.push(path);
  }
  persist(); notify();
  return result;
}
export const serverTimestamp = () => Date.now();
export function onAuthStateChanged(auth, callback) {
  test.authListeners.push(callback);
  queueMicrotask(() => callback(test.user));
  return () => { test.authListeners = test.authListeners.filter(value => value !== callback); };
}
function changeUser(user) {
  test.user = user; localStorage.setItem("__test_user", JSON.stringify(user));
  for (const callback of test.authListeners) queueMicrotask(() => callback(user));
}
export class GoogleAuthProvider {}
export async function signInWithPopup() {
  const user = { uid: "user-a", displayName: "Auth name", photoURL: "" };
  changeUser(user); return { user };
}
export async function signInWithEmailAndPassword() { return signInWithPopup(); }
export async function createUserWithEmailAndPassword() { return signInWithPopup(); }
export async function updateProfile(user, values) { Object.assign(user, values); changeUser(user); }
export async function signOut() { changeUser(null); }
export async function sendPasswordResetEmail() {}
export const browserLocalPersistence = "local";
export const browserSessionPersistence = "session";
export async function setPersistence(auth, mode) { localStorage.setItem("__test_persistence", mode); }
