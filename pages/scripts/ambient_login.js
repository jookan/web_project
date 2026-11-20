import { auth } from "./firebase_config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { ensureProfile } from "./firebase_data.js";

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var busy = false;
  let finishing = false;
  var toastTimer;

  function setBusy(value) {
    busy = value;
    $('googleLogin').disabled = value;
    $('remember').disabled = value;
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  async function finishLogin(user) {
    if (finishing) return;
    finishing = true;
    try {
      await ensureProfile(user);
      Session.clear();
      location.replace('ambient_hub.html');
    } finally { finishing = false; }
  }

  onAuthStateChanged(auth, async function (user) {
    if (!user || busy) return;
    try { await finishLogin(user); }
    catch (error) {
      console.error('프로필 저장 오류:', error.code);
      toast('프로필을 불러오지 못했어요. 새로고침해 주세요.');
    }
  });

  $('googleLogin').onclick = async function () {
    if (busy) return;
    setBusy(true);
    try {
      await setPersistence(auth, $('remember').checked ? browserLocalPersistence : browserSessionPersistence);
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      await finishLogin(result.user);
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') toast('로그인 실패: ' + (error.code || error.message));
    } finally { setBusy(false); }
  };
})();
