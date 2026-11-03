/* 로그인 세션 도우미 (데모용 — 서버 없이 이 브라우저에만 저장돼요)
 * 비밀번호는 저장하지 않고, 표시용 이름/이메일만 보관해요. */
(function () {
  var KEY = 'ambient-session';
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  window.Session = {
    get: read,
    set: function (user, remember) {
      var s = JSON.stringify({ name: user.name, email: user.email || '', guest: !!user.guest, at: Date.now() });
      try {
        (remember ? localStorage : sessionStorage).setItem(KEY, s);
        (remember ? sessionStorage : localStorage).removeItem(KEY);
      } catch (e) {}
    },
    clear: function () { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {} },
    require: function (loginUrl) {
      if (!read()) { location.replace(loginUrl || '../'); return false; }
      return true;
    }
  };
})()
