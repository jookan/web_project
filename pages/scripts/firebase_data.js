// 공통 인증과 프로필. 이메일·외부 서비스 토큰은 공개 프로필에 넣지 않는다.
import { auth, db } from "./firebase_config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

export async function currentUser() {
  await auth.authStateReady();
  return auth.currentUser;
}

export function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인한 뒤 사용할 수 있어요.");
  return user;
}

export function assertAccount(uid) {
  if (auth.currentUser?.uid !== uid) throw new Error("계정이 변경됐어요. 새로고침해 주세요.");
}

export async function ensureProfile(user) {
  const privateRef = doc(db, "users", user.uid);
  const publicRef = doc(db, "publicProfiles", user.uid);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(privateRef);
    const saved = snapshot.exists() ? snapshot.data() : {};
    const profile = {
      displayName: typeof saved.displayName === "string" && saved.displayName.trim()
        ? saved.displayName.trim().slice(0, 80) : (user.displayName || "회원").slice(0, 80),
      photoURL: typeof saved.photoURL === "string" ? saved.photoURL : (user.photoURL || "")
    };
    if (!snapshot.exists()) transaction.set(privateRef, { ...profile, createdAt: serverTimestamp() });
    transaction.set(publicRef, { ...profile, updatedAt: serverTimestamp() });
    return { uid: user.uid, name: profile.displayName, ...profile };
  });
}

export async function readMyProfile(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  const data = snapshot.exists() ? snapshot.data() : {};
  return {
    uid: user.uid,
    name: typeof data.displayName === "string" && data.displayName.trim() ? data.displayName : (user.displayName || "회원"),
    photoURL: typeof data.photoURL === "string" ? data.photoURL : (user.photoURL || "")
  };
}

export async function logout() {
  await signOut(auth);
  window.Session?.clear();
  try {
    sessionStorage.removeItem("musicdig_currentUser");
    localStorage.removeItem("musicdig_currentUser");
  } catch { /* 브라우저 저장소가 차단돼도 Firebase 로그아웃은 완료한다. */ }
  location.replace("ambient_login.html");
}

export function showDataError(error) {
  console.error("데이터 연결 오류:", error.code || error.message);
  let message = document.getElementById("cloud-data-error");
  if (!message) {
    message = document.createElement("p");
    message.id = "cloud-data-error";
    message.setAttribute("role", "alert");
    message.style.cssText = "padding:12px 16px;color:#ffbba8;white-space:pre-wrap";
    (document.querySelector("main") || document.body).prepend(message);
  }
  message.textContent = error.code === "permission-denied"
    ? "서버 데이터 접근 권한을 확인하지 못했어요. 관리자에게 문의하거나 잠시 후 새로고침해 주세요."
    : (error.message || "데이터를 불러오지 못했어요. 연결 상태를 확인해 주세요.");
}
