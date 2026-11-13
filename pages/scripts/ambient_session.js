/* 게스트 입장 상태 도우미. 일반 계정 인증은 Firebase Authentication에서 확인한다.
 * 기존 저장 형식을 보존하며 비밀번호나 인증 토큰을 저장하지 않는다. */
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
      if (!read()) { location.replace(loginUrl || 'ambient_login.html'); return false; }
      return true;
    }
  };
})()
