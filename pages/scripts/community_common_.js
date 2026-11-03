//커뮤니티 공통 기능 (피드 / 글쓰기 / 프로필 페이지에서 같이 사용)
//글, 팔로우, 좋아요는 이 브라우저(localStorage)에만 저장

(function () {
  const POSTS_KEY = 'musicdig_posts';
  const FOLLOW_PREFIX = 'musicdig_following_'; //+사용자 이름
  const CURRENT_KEY = 'musicdig_currentUser';

  const CATEGORY_LABEL = { song: '곡 추천', sheet: '악보 공유', free: '자유' };

  // ---------저장소 도우미---------
  function readJSON(storage, key) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function getCurrentUser() {
    return readJSON(sessionStorage, CURRENT_KEY) || readJSON(localStorage, CURRENT_KEY);
  }

  function myName() {
    const user = getCurrentUser();
    return user && user.name ? user.name : '게스트';
  }

  function savePosts(posts) {
    try {
      localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
      return true;
    } catch (err) {
      return false; //저장 공간 부족 등
    }
  }

  //처음 열었을 때 보여줄 예시 글
  function seedPosts() {
    const now = Date.now();
    const seed = [
      {
        id: 'seed1', author: '사용자1', category: 'song', ts: now,
        text: '요즘 계속 돌려 듣는 곡인데 추천드려요, 다들 어떤 곡 듣고 계세요?',
        baseLikes: 128, likedBy: [], comments: 24, files: []
      },
      {
        id: 'seed2', author: '사용자2', category: 'sheet', ts: now - 12 * 60 * 1000,
        text: '연습하면서 만든 악보 공유합니다. 다들 참고해보세요!',
        baseLikes: 52, likedBy: [], comments: 9, files: []
      },
      {
        id: 'seed3', author: '사용자3', category: 'free', ts: now - 60 * 60 * 1000,
        text: '오늘 노래방 3시간 있었는데 목 다 쉬었어요 ㅋㅋ 그래도 재밌었음',
        baseLikes: 31, likedBy: [], comments: 5, files: []
      }
    ];
    savePosts(seed);
    return seed;
  }

  function getPosts() {
    const posts = readJSON(localStorage, POSTS_KEY);
    return Array.isArray(posts) ? posts : seedPosts();
  }

  // ---------팔로우---------
  function getFollowing(name) {
    const list = readJSON(localStorage, FOLLOW_PREFIX + name);
    return Array.isArray(list) ? list : [];
  }

  //팔로우 <-> 팔로잉 전환. 전환 후 "팔로잉 상태인지"를 돌려줌
  function toggleFollow(me, target) {
    const list = getFollowing(me);
    const idx = list.indexOf(target);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(target);
    try {
      localStorage.setItem(FOLLOW_PREFIX + me, JSON.stringify(list));
    } catch (err) { /* 저장 실패는 무시 */ }
    return idx < 0;
  }

  //이 사람을 팔로우하는 사용자 수 (이 브라우저에 저장된 기록 기준)
  function getFollowerCount(target) {
    let count = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.indexOf(FOLLOW_PREFIX) === 0 && key !== FOLLOW_PREFIX + target) {
          const list = readJSON(localStorage, key);
          if (Array.isArray(list) && list.indexOf(target) >= 0) count++;
        }
      }
    } catch (err) { /* 무시 */ }
    return count;
  }

  // ----------표시용 도우미----------
  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return min + '분 전';
    const hour = Math.floor(min / 60);
    if (hour < 24) return hour + '시간 전';
    return Math.floor(hour / 24) + '일 전';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  function profileUrl(name) {
    return 'community_profile.html?user=' + encodeURIComponent(name);
  }

  //상단: 로그인 상태 표시 ("○○님 / 로그아웃" 또는 "로그인" 링크)
  function renderUserArea(userArea) {
    const user = getCurrentUser();
    if (user) {
      const nameLink = document.createElement('a');
      nameLink.href = profileUrl(user.name);
      nameLink.textContent = user.name + '님';
      const logoutLink = document.createElement('a');
      logoutLink.href = '#';
      logoutLink.textContent = user.guest ? '나가기' : '로그아웃';
      logoutLink.addEventListener('click', function (e) {
        e.preventDefault();
        try {
          sessionStorage.removeItem(CURRENT_KEY);
          localStorage.removeItem(CURRENT_KEY);
        } catch (err) { /* 무시 */ }
        window.location.href = 'login.html';
      });
      userArea.appendChild(nameLink);
      userArea.appendChild(logoutLink);
    } else {
      const loginLink = document.createElement('a');
      loginLink.href = 'login.html';
      loginLink.textContent = '로그인';
      userArea.appendChild(loginLink);
    }
  }

  // ----------게시글 카드 만들기 ----------
  // onChange: 팔로우/좋아요 상태가 바뀐 뒤 목록을 다시 그려야 할 때 호출됨
  function renderPostCard(post, onChange) {
    const me = myName();
    const card = document.createElement('article');
    card.className = 'post-card';

    //머리 부분: 아바타(클릭 시 프로필) + 이름 + 시간/카테고리 + 팔로우 버튼
    const header = document.createElement('div');
    header.className = 'post-header';

    const avatar = document.createElement('a');
    avatar.className = 'avatar';
    avatar.href = profileUrl(post.author);
    avatar.title = post.author + ' 프로필 보기';
    avatar.textContent = post.author.charAt(0);

    const info = document.createElement('div');
    const nameLink = document.createElement('a');
    nameLink.className = 'author-name';
    nameLink.href = profileUrl(post.author);
    nameLink.textContent = post.author;
    const meta = document.createElement('div');
    meta.className = 'post-meta';
    meta.appendChild(document.createTextNode(timeAgo(post.ts) + ' · '));
    const tag = document.createElement('span');
    tag.className = 'post-tag';
    tag.textContent = CATEGORY_LABEL[post.category] || '';
    meta.appendChild(tag);
    info.appendChild(nameLink);
    info.appendChild(meta);

    header.appendChild(avatar);
    header.appendChild(info);

    if (post.author !== me) { // 내 글에는 팔로우 버튼을 보여주지 않음
      const followBtn = document.createElement('button');
      followBtn.type = 'button';
      followBtn.className = 'follow-btn';
      const following = getFollowing(me).indexOf(post.author) >= 0;
      followBtn.classList.toggle('following', following);
      followBtn.textContent = following ? '팔로잉' : '팔로우';
      followBtn.addEventListener('click', function () {
        toggleFollow(me, post.author);
        if (onChange) onChange();
      });
      header.appendChild(followBtn);
    }
    card.appendChild(header);

    //본문 (입력값은 항상 textContent로 넣어 HTML 삽입 방지)
    const content = document.createElement('p');
    content.className = 'post-content';
    content.textContent = post.text;
    card.appendChild(content);

    //첨부 파일
    if (Array.isArray(post.files) && post.files.length > 0) {
      const attachBox = document.createElement('div');
      attachBox.className = 'attachments';
      post.files.forEach(function (f) {
        if (typeof f.dataUrl === 'string' && f.dataUrl.indexOf('data:image/') === 0) {
          const img = document.createElement('img');
          img.className = 'attach-img';
          img.src = f.dataUrl;
          img.alt = f.name;
          attachBox.appendChild(img);
        } else {
          const chip = document.createElement('span');
          chip.className = 'attach-chip';
          chip.textContent = '📎 ' + f.name + ' (' + formatSize(f.size || 0) + ')';
          attachBox.appendChild(chip);
        }
      });
      card.appendChild(attachBox);
    }

    //하단: 좋아요 + 댓글 수
    const footer = document.createElement('p');
    footer.className = 'post-meta';
    const likeBtn = document.createElement('button');
    likeBtn.type = 'button';
    likeBtn.className = 'like-btn';
    const likeCount = document.createElement('span');
    likeCount.className = 'like-count';
    const liked = Array.isArray(post.likedBy) && post.likedBy.indexOf(me) >= 0;
    likeBtn.classList.toggle('liked', liked);
    likeCount.textContent = (post.baseLikes || 0) + (Array.isArray(post.likedBy) ? post.likedBy.length : 0);
    likeBtn.appendChild(likeCount);
    likeBtn.appendChild(document.createTextNode(' ❤'));
    likeBtn.addEventListener('click', function () {
      const posts = getPosts();
      const target = posts.find(function (p) { return p.id === post.id; });
      if (!target) return;
      if (!Array.isArray(target.likedBy)) target.likedBy = [];
      const idx = target.likedBy.indexOf(me);
      if (idx >= 0) target.likedBy.splice(idx, 1);
      else target.likedBy.push(me);
      savePosts(posts);
      if (onChange) onChange();
    });
    footer.appendChild(likeBtn);
    footer.appendChild(document.createTextNode(' · 💬 ' + (post.comments || 0)));
    card.appendChild(footer);

    return card;
  }

  window.MD = {
    CATEGORY_LABEL: CATEGORY_LABEL,
    getCurrentUser: getCurrentUser,
    myName: myName,
    getPosts: getPosts,
    savePosts: savePosts,
    getFollowing: getFollowing,
    toggleFollow: toggleFollow,
    getFollowerCount: getFollowerCount,
    timeAgo: timeAgo,
    formatSize: formatSize,
    profileUrl: profileUrl,
    renderUserArea: renderUserArea,
    renderPostCard: renderPostCard
  };
})();
