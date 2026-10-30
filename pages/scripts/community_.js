

document.addEventListener('DOMContentLoaded', function () {
  const tabs = document.querySelectorAll('.tabs a');
  const postList = document.getElementById('postList');
  const emptyMsg = document.getElementById('emptyMsg');
  const writeBox = document.getElementById('writeBox');
  const categorySelect = document.getElementById('category');
  const textArea = document.getElementById('postText');
  const submitBtn = document.getElementById('submitPost');
  const writeHint = document.getElementById('writeHint');
  const userArea = document.getElementById('userArea');

  //로그인 정보 읽기 (login.js에서 저장한 값)
  const CURRENT_KEY = 'musicdig_currentUser';
  function getCurrentUser() {
    try {
      const raw = sessionStorage.getItem(CURRENT_KEY) || localStorage.getItem(CURRENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }
  const currentUser = getCurrentUser();

  //상단에 로그인 상태 표시
  if (currentUser) {
    const nameSpan = document.createElement('span');
    nameSpan.textContent = currentUser.name + '님';
    const logoutLink = document.createElement('a');
    logoutLink.href = '#';
    logoutLink.textContent = currentUser.guest ? '나가기' : '로그아웃';
    logoutLink.addEventListener('click', function (e) {
      e.preventDefault();
      try {
        sessionStorage.removeItem(CURRENT_KEY);
        localStorage.removeItem(CURRENT_KEY);
      } catch (err) { /* 저장소 못 쓰면 무시 */ }
      window.location.href = 'login.html';
    });
    userArea.appendChild(nameSpan);
    userArea.appendChild(logoutLink);
  } else {
    const loginLink = document.createElement('a');
    loginLink.href = 'login.html';
    loginLink.textContent = '로그인';
    userArea.appendChild(loginLink);
  }

  const categoryLabel = {
    song: '곡 추천',
    sheet: '악보 공유',
    free: '자유'
  };

  function applyFilter(tabKey) {
    const cards = postList.querySelectorAll('.post-card');
    let visibleCount = 0;

    cards.forEach(function (card) {
      let show = false;
      if (tabKey === 'following') {
        const followBtn = card.querySelector('.follow-btn');
        show = followBtn.classList.contains('following');
      } else {
        show = card.dataset.category === tabKey;
      }
      card.classList.toggle('hidden', !show);
      if (show) visibleCount++;
    });

    emptyMsg.classList.toggle('show', visibleCount === 0);
    if (tabKey === 'following') {
      emptyMsg.textContent = '아직 팔로우한 사람이 없어요. 글에서 팔로우를 눌러보세요!';
    } else {
      emptyMsg.textContent = '아직 이 카테고리에 글이 없어요.';
    }
  }

  //탭 클릭 = 카테고리별 필터링
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      applyFilter(tab.dataset.tab);
    });
  });

  //팔로우/좋아요 버튼은 이후 새 글에도 적용되도록 이벤트 위임 방식 사용
  postList.addEventListener('click', function (e) {
    const followBtn = e.target.closest('.follow-btn');
    if (followBtn) {
      const nowFollowing = followBtn.classList.toggle('following');
      followBtn.textContent = nowFollowing ? '팔로잉' : '팔로우';
      //현재 '팔로잉' 탭을 보고 있다면 목록도 바로 갱신
      const activeTab = document.querySelector('.tabs a.active');
      if (activeTab && activeTab.dataset.tab === 'following') {
        applyFilter('following');
      }
      return;
    }

    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) {
      const countEl = likeBtn.querySelector('.like-count');
      let count = parseInt(countEl.textContent, 10);
      const liked = likeBtn.classList.toggle('liked');
      count = liked ? count + 1 : count - 1;
      countEl.textContent = count;
    }
  });

  //글쓰기: 입력한 내용으로 새 게시글 카드를 목록 맨 위에 추가
  submitBtn.addEventListener('click', function () {
    const text = textArea.value.trim();
    if (text === '') {
      writeHint.textContent = '내용을 입력해주세요.';
      return;
    }
    writeHint.textContent = '';

    const category = categorySelect.value;
    const card = document.createElement('article');
    card.className = 'post-card';
    card.dataset.category = category;
    card.innerHTML =
      '<div class="post-header">' +
        '<div class="avatar"></div>' +
        '<div>' +
          '<strong class="author-name"></strong>' +
          '<div class="post-meta">방금 전 · <span class="post-tag">' + categoryLabel[category] + '</span></div>' +
        '</div>' +
        '<button type="button" class="follow-btn">팔로우</button>' +
      '</div>' +
      '<p class="post-content"></p>' +
      '<p class="post-meta">' +
        '<button type="button" class="like-btn"><span class="like-count">0</span> ❤</button> · 💬 0' +
      '</p>';
    card.querySelector('.post-content').textContent = text;
    const authorName = currentUser ? currentUser.name : '게스트';
    card.querySelector('.author-name').textContent = authorName;
    card.querySelector('.avatar').textContent = authorName.charAt(0);

    postList.prepend(card);
    textArea.value = '';
    writeBox.open = false;

    //방금 올린 글 바로 보여주기
    const matchingTab = document.querySelector('.tabs a[data-tab="' + category + '"]');
    if (matchingTab) {
      matchingTab.click();
    }
  });

  //처음 페이지를 열었을 때 현재 활성화 탭 기준으로 목록 맞춰줌
  const initialTab = document.querySelector('.tabs a.active');
  applyFilter(initialTab ? initialTab.dataset.tab : 'following');
});
