(function () {
  var $ = function (id) { return document.getElementById(id); };
  var s = Session.get() || { name: '회원' };
  var name = s.name || '회원';
  $('uname').textContent = name; $('hname').textContent = name; $('avatar').textContent = (name.trim()[0] || '?').toUpperCase();
  if (s.guest) $('guestTag').hidden = false;
  $('logout').onclick = function () { Session.clear(); location.href = 'ambient_login.html'; };
})();
