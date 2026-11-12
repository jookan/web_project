import { auth } from "./firebase_config.js";
import { currentUser, readMyProfile, logout, showDataError } from "./firebase_data.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

export async function initializeUserArea(container) {
  const user = await currentUser();
  const uid = user?.uid || "";
  // 다른 탭에서 계정이 바뀌면 이전 계정의 개인 화면을 계속 표시하지 않는다.
  onAuthStateChanged(auth, next => {
    if ((next?.uid || "") !== uid) location.replace("ambient_login.html");
  });
  if (!container) return;
  let profile = user ? { name: user.displayName || "회원" } : null;
  if (user) {
    try { profile = await readMyProfile(user); } catch (error) { showDataError(error); }
  }
  container.replaceChildren();
  const link = document.createElement("a");
  link.href = user ? "community_profile.html?user=" + encodeURIComponent(uid) : "ambient_login.html";
  link.textContent = profile ? profile.name + "님" : "로그인";
  container.appendChild(link);
  if (user || window.Session?.get()?.guest) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = user ? "로그아웃" : "나가기";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await logout(); } catch (error) { showDataError(error); button.disabled = false; }
    });
    container.appendChild(button);
  }
}
