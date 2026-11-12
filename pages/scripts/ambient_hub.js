import { auth, db } from "./firebase_config.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

(function () {
  var $ = function (id) { return document.getElementById(id); };
  onAuthStateChanged(auth, async function (user) {
    var name = '회원';
    var isGuest = false;

    if (user) {
      name = user.displayName || '회원';

      try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        if (snapshot.exists()) {
          name = snapshot.data().displayName || name;
        }
      } catch (error) {
        console.error("프로필 조회 오류:", error.code);
      }
    } else {
      const session = Session.get();

      if (!session || !session.guest) return;

      name = '게스트';
      isGuest = true;
    }

    $('uname').textContent = name;
    $('hname').textContent = name;
    $('avatar').textContent = (name.trim()[0] || '?').toUpperCase();
    $('guestTag').hidden = !isGuest;
  });
  $('logout').onclick = async function () {
  this.disabled = true;

  try {
    await signOut(auth);
    Session.clear();
    location.replace('ambient_login.html');
  } catch (error) {
    console.error('로그아웃 오류:', error.code);
    this.disabled = false;
    alert('로그아웃하지 못했어요. 다시 시도해 주세요.');
  }
};
})();
