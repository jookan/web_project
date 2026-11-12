import { auth } from "./firebase_config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { ensureProfile } from "./firebase_data.js";

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var mode = 'login', busy = false;
  var tabs = document.querySelector('.tabs');
  var COPY = {
    login:  { title: '다시 만나서 반가워요', sub: '로그인하고 음악 커뮤니티, 악보 연습, 스트리밍으로 들어가 보세요.', btn: '로그인' },
    signup: { title: '함께 시작해요', sub: '이름과 이메일만 있으면 바로 시작할 수 있어요.', btn: '회원가입' }
  };

  let finishing = false;
  function setBusy(value) {
    busy = value;
    ['submit', 'guest', 'googleLogin', 'tabLogin', 'tabSignup'].forEach(id => { $(id).disabled = value; });
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
    catch (error) { console.error('프로필 저장 오류:', error.code); toast('프로필을 불러오지 못했어요. 새로고침해 주세요.'); }
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

  function setMode(m) {
    mode = m;
    tabs.style.setProperty('--t', m === 'signup' ? 1 : 0);
    $('tabLogin').setAttribute('aria-selected', m === 'login');
    $('tabSignup').setAttribute('aria-selected', m === 'signup');
    $('title').textContent = COPY[m].title; $('sub').textContent = COPY[m].sub; $('submitText').textContent = COPY[m].btn;
    $('fName').hidden = m !== 'signup'; $('fPw2').hidden = m !== 'signup';
    $('pw').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    $('forgot').style.visibility = m === 'login' ? 'visible' : 'hidden';
    clearErrors();
  }
  $('tabLogin').onclick = function () { setMode('login'); };
  $('tabSignup').onclick = function () { setMode('signup'); };

  function clearErrors() { document.querySelectorAll('.field').forEach(function (f) { f.classList.remove('invalid'); }); }
  function fail(fieldId, msg) { var f = $(fieldId); f.classList.add('invalid'); f.querySelector('.err').textContent = msg; return f; }
  ['name', 'email', 'pw', 'pw2'].forEach(function (id) { $(id).addEventListener('input', function () { this.closest('.field').classList.remove('invalid'); }); });

  $('eye').onclick = function () {
    var show = $('pw').type === 'password';
    $('pw').type = show ? 'text' : 'password';
    this.setAttribute('aria-pressed', show); this.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
  };
  $('forgot').addEventListener('click', async function (event) {
    event.preventDefault();
    const email = $('email').value.trim();
    if (!email) { toast('재설정 메일을 받을 이메일을 입력해 주세요.'); return; }
    try { await sendPasswordResetEmail(auth, email); toast('가입된 이메일이라면 비밀번호 재설정 메일을 받을 수 있어요.'); }
    catch (error) { toast('메일 요청 실패: ' + error.code); }
  });

  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200); }

  function enter(user) {
    busy = true; $('submit').disabled = true; $('guest').disabled = true;
    $('submitText').outerHTML = '<span class="spinner" id="spin"></span>';
    Session.set(user, $('remember').checked && !user.guest);
    setTimeout(function () { $('shell').classList.add('leaving'); setTimeout(function () { location.href = 'ambient_hub.html'; }, 420); }, 550);
  }

  $('form').addEventListener('submit', async function (e) {
    e.preventDefault(); if (busy) return; clearErrors();
    var name = $('name').value.trim(), email = $('email').value.trim(), pw = $('pw').value, pw2 = $('pw2').value, first = null;
    var bad = function (id, m) { var f = fail(id, m); first = first || f; };
    if (mode === 'signup' && !name) bad('fName', '표시될 이름을 입력해 주세요.');
    if (!email) bad('fEmail', '이메일을 입력해 주세요.');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('fEmail', '이메일 형식이 올바르지 않아요.');
    if (!pw) bad('fPw', '비밀번호를 입력해 주세요.');
    else if (mode === 'signup' && pw.length < 6) bad('fPw', '비밀번호는 6자 이상이어야 해요.');
    if (mode === 'signup' && pw && pw2 !== pw) bad('fPw2', '비밀번호가 서로 달라요.');
    if (first) {
      var p = $('panel'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
      var inp = first.querySelector('input'); if (inp) inp.focus();
      return;
    }
    setBusy(true);
    try {
      await setPersistence(auth, $('remember').checked ? browserLocalPersistence : browserSessionPersistence);
      const result = mode === 'signup'
        ? await createUserWithEmailAndPassword(auth, email, pw)
        : await signInWithEmailAndPassword(auth, email, pw);
      if (mode === 'signup') await updateProfile(result.user, { displayName: name });
      await finishLogin(result.user);
    } catch (error) {
      toast(error.code === 'auth/operation-not-allowed'
        ? '이메일 로그인을 사용할 수 없어요. Google로 로그인해 주세요.'
        : '로그인 실패: ' + (error.code || error.message));
    } finally { setBusy(false); }
  });

  $('guest').onclick = async function () {
    if (busy) return;
    setBusy(true);
    try { await signOut(auth); enter({ name: '게스트', guest: true }); }
    catch (error) { toast('게스트 입장 실패: ' + error.code); setBusy(false); }
  };
  setMode('login');
})();
