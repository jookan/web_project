// 커뮤니티 공통 기능 (피드 / 글쓰기 / 프로필 페이지에서 같이 사용)

(function () {
  const POSTS_KEY = 'musicdig_posts';
  const FOLLOW_PREFIX = 'musicdig_following_'; // + 사용자 이름
  const CURRENT_KEY = 'musicdig_currentUser';

  const COMMENT_PAGE_SIZE = 3;

  const CATEGORY_LABEL = { song: '곡 추천', sheet: '악보 공유', free: '자유' };

  // ---------- 저장소 도우미 ----------
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
      return false; // 저장 공간 부족 등
    }
  }

  // 예시 댓글 
  function sampleComments() {
    const now = Date.now();
    const min = 60 * 1000;
    return {
      seed1: [
        {
          id: 's1c1', author: '사용자2', ts: now - 300 * min,
          text: '저는 요즘 로파이 플레이리스트를 계속 틀어놓고 있어요',
          replies: [
            { id: 's1c1r1', author: '사용자1', ts: now - 280 * min, text: '@사용자2 오 그거 저도 궁금해요, 공유해주세요!' },
            { id: 's1c1r2', author: '사용자2', ts: now - 260 * min, text: '@사용자1 이따 커뮤니티에 올릴게요 ㅎㅎ' }
          ]
        },
        { id: 's1c2', author: '사용자3', ts: now - 200 * min, text: '추천해주신 곡 들어봤는데 분위기 좋네요', replies: [] },
        { id: 's1c3', author: '사용자2', ts: now - 120 * min, text: '출퇴근길에 듣기 딱 좋아요', replies: [] },
        {
          id: 's1c4', author: '사용자3', ts: now - 60 * min,
          text: '다음에도 이런 곡 추천 부탁드려요!',
          replies: [
            { id: 's1c4r1', author: '사용자1', ts: now - 30 * min, text: '@사용자3 네, 좋아해주셔서 감사합니다!' }
          ]
        },
        { id: 's1c5', author: '사용자2', ts: now - 10 * min, text: '저도 이 곡 플레이리스트에 담았어요', replies: [] }
      ],
      seed2: [
        { id: 's2c1', author: '사용자1', ts: now - 8 * min, text: '악보 감사합니다! 바로 연습해볼게요', replies: [] },
        { id: 's2c2', author: '사용자3', ts: now - 4 * min, text: '혹시 난이도가 어느 정도인가요?', replies: [
          { id: 's2c2r1', author: '사용자2', ts: now - 2 * min, text: '@사용자3 중급 정도예요, 천천히 하시면 괜찮아요' }
        ] }
      ],
      seed3: [
        { id: 's3c1', author: '사용자1', ts: now - 40 * min, text: '3시간이면 진짜 대단하시네요 ㅋㅋ', replies: [] }
      ]
    };
  }

  // 처음 열었을 때 보여줄 예시 글
  function seedPosts() {
    const now = Date.now();
    const seed = [
      {
        id: 'seed1', author: '사용자1', category: 'song', ts: now,
        text: '요즘 계속 돌려 듣는 곡인데 추천드려요, 다들 어떤 곡 듣고 계세요?',
        baseLikes: 128, likedBy: [], files: []
      },
      {
        id: 'seed2', author: '사용자2', category: 'sheet', ts: now - 12 * 60 * 1000,
        text: '연습하면서 만든 악보 공유합니다. 다들 참고해보세요!',
        baseLikes: 52, likedBy: [], files: []
      },
      {
        id: 'seed3', author: '사용자3', category: 'free', ts: now - 60 * 60 * 1000,
        text: '오늘 노래방 3시간 있었는데 목 다 쉬었어요 ㅋㅋ 그래도 재밌었음',
        baseLikes: 31, likedBy: [], files: []
      }
    ];
    savePosts(seed);
    return seed;
  }

  // 댓글 목록이 없는 예전 글에는 빈 목록 넣어줌
  function withComments(posts) {
    let changed = false;
    const samples = sampleComments();
    posts.forEach(function (p) {
      if (!Array.isArray(p.commentList)) {
        p.commentList = samples[p.id] || [];
        changed = true;
      }
    });
    if (changed) savePosts(posts);
    return posts;
  }

  function getPosts() {
    const posts = readJSON(localStorage, POSTS_KEY);
    return withComments(Array.isArray(posts) ? posts : seedPosts());
  }

  // ---------- 팔로우 ----------
  function getFollowing(name) {
    const list = readJSON(localStorage, FOLLOW_PREFIX + name);
    return Array.isArray(list) ? list : [];
  }

  // 팔로우 <-> 팔로잉 전환
  function toggleFollow(me, target) {
    const list = getFollowing(me);
    const idx = list.indexOf(target);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(target);
    try {
      localStorage.setItem(FOLLOW_PREFIX + me, JSON.stringify(list));
    } catch (err) { /* 저장 실패 무시 */ }
    return idx < 0;
  }

  // 이 사람을 팔로우하는 사용자 수
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

  // ---------- 댓글 데이터 ----------
  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // 댓글 + 답글 전체 개수
  function countComments(post) {
    const list = Array.isArray(post.commentList) ? post.commentList : [];
    return list.reduce(function (sum, c) {
      return sum + 1 + (Array.isArray(c.replies) ? c.replies.length : 0);
    }, 0);
  }

  function addComment(postId, author, text) {
    const posts = getPosts();
    const target = posts.find(function (p) { return p.id === postId; });
    if (!target) return false;
    target.commentList.push({ id: newId('c'), author: author, ts: Date.now(), text: text, replies: [] });
    return savePosts(posts);
  }

  function addReply(postId, commentId, author, text) {
    const posts = getPosts();
    const target = posts.find(function (p) { return p.id === postId; });
    if (!target) return false;
    const comment = target.commentList.find(function (c) { return c.id === commentId; });
    if (!comment) return false;
    if (!Array.isArray(comment.replies)) comment.replies = [];
    comment.replies.push({ id: newId('r'), author: author, ts: Date.now(), text: text });
    return savePosts(posts);
  }

  // ---------- 표시용 도우미 ----------
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

  // 상단: 로그인 상태 표시 ("○○님 / 로그아웃" 또는 "로그인" 링크)
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

  // ---------- 화면 조각 만들기 도우미 (입력값은 항상 textContent로 넣어 HTML 삽입 방지) ----------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function linkBtn(label, onClick) {
    const btn = el('button', 'link-btn', label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  const AVATAR_COLORS = ['#f2b08a,#e9808f', '#a99cff,#7c6cf0', '#7fd1c7,#4aa8c9', '#f0c27a,#e08f5a'];

  function avatarLink(name, extraClass) {
    const a = el('a', 'avatar' + (extraClass ? ' ' + extraClass : ''), name.charAt(0));
    if (extraClass === 'small') { // 댓글 아바타 이름마다 색 다르게
      let h = 0;
      for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
      a.style.background = 'linear-gradient(135deg,' + AVATAR_COLORS[h % AVATAR_COLORS.length] + ')';
    }
    a.href = profileUrl(name);
    a.title = name + ' 프로필 보기';
    return a;
  }

  function nameLink(name) {
    const a = el('a', 'author-name', name);
    a.href = profileUrl(name);
    return a;
  }

  // @이름 부분만 색을 다르게 표시
  function textWithMention(text) {
    const p = el('p', 'comment-text');
    const m = /^(@\S+)(\s*)([\s\S]*)$/.exec(text);
    if (m) {
      p.appendChild(el('span', 'mention', m[1]));
      p.appendChild(document.createTextNode(m[2] + m[3]));
    } else {
      p.textContent = text;
    }
    return p;
  }

  // ---------- 댓글창 ----------
  // 글마다 댓글창 상태(열림 여부, 보이는 개수, 펼친 답글 등) 기억 (페이지 새로고침하면 초기화)
  const uiState = {};
  function getUi(postId) {
    if (!uiState[postId]) {
      uiState[postId] = { open: false, visible: COMMENT_PAGE_SIZE, openReplies: {}, replyTo: null, focus: null };
    }
    return uiState[postId];
  }

  // 한글 입력 중에 누른 Enter는 제출로 보지 않음
  function isSubmitKey(e) {
    return e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;
  }

  function renderCommentForm(post, ui, refreshCard) {
    const wrap = el('div', 'comment-form-wrap');
    const form = el('div', 'comment-form');
    const input = el('input');
    input.type = 'text';
    input.placeholder = '댓글을 입력하세요';
    input.maxLength = 300;
    const submitBtn = el('button', 'submit-btn', '등록');
    submitBtn.type = 'button';
    const hint = el('p', 'form-hint');

    function submit() {
      const text = input.value.trim();
      if (text === '') {
        hint.textContent = '내용을 입력해주세요.';
        return;
      }
      if (!addComment(post.id, myName(), text)) {
        hint.textContent = '저장 공간이 부족해요.';
        return;
      }
      ui.focus = 'comment'; // 등록 후에도 바로 이어서 쓸 수 있게 입력칸에 커서 유지
      refreshCard();
    }

    submitBtn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (isSubmitKey(e)) {
        e.preventDefault();
        submit();
      }
    });

    form.appendChild(input);
    form.appendChild(submitBtn);
    wrap.appendChild(form);
    wrap.appendChild(hint);
    return wrap;
  }

  function renderReplyForm(post, comment, ui, refreshCard) {
    const wrap = el('div', 'reply-form-wrap');
    const form = el('div', 'reply-form');
    const input = el('input');
    input.type = 'text';
    input.placeholder = '답글을 입력하세요';
    input.maxLength = 300;
    input.value = ui.replyTo.mention || '';
    const submitBtn = el('button', 'submit-btn', '등록');
    submitBtn.type = 'button';
    const cancelBtn = el('button', 'cancel-btn', '취소');
    cancelBtn.type = 'button';
    const hint = el('p', 'form-hint');

    function submit() {
      const text = input.value.trim();
      const mention = (ui.replyTo.mention || '').trim();
      if (text === '' || text === mention) {
        hint.textContent = '내용을 입력해주세요.';
        return;
      }
      if (!addReply(post.id, comment.id, myName(), text)) {
        hint.textContent = '저장 공간이 부족해요.';
        return;
      }
      ui.replyTo = null;
      ui.openReplies[comment.id] = true;
      refreshCard();
    }

    function cancel() {
      ui.replyTo = null;
      refreshCard();
    }

    submitBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', function (e) {
      if (isSubmitKey(e)) {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        cancel();
      }
    });

    form.appendChild(input);
    form.appendChild(submitBtn);
    form.appendChild(cancelBtn);
    wrap.appendChild(form);
    wrap.appendChild(hint);
    return wrap;
  }

  // 답글 한 줄 (답글에 다시 답해도 같은 단계에 붙고, 입력칸에 @이름이 미리 들어감)
  function renderReply(post, comment, reply, ui, refreshCard) {
    const item = el('div', 'reply');
    item.appendChild(avatarLink(reply.author, 'small'));

    const body = el('div', 'comment-body');
    const line = el('div', 'comment-line');
    line.appendChild(nameLink(reply.author));
    line.appendChild(el('span', 'time', timeAgo(reply.ts)));
    body.appendChild(line);
    body.appendChild(textWithMention(reply.text));

    const actions = el('div', 'comment-actions');
    actions.appendChild(linkBtn('답글', function () {
      ui.replyTo = { commentId: comment.id, mention: '@' + reply.author + ' ' };
      ui.focus = 'reply';
      refreshCard();
    }));
    body.appendChild(actions);
    item.appendChild(body);
    return item;
  }

  function renderComment(post, comment, ui, refreshCard) {
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const item = el('div', 'comment');
    item.appendChild(avatarLink(comment.author, 'small'));

    const body = el('div', 'comment-body');
    const line = el('div', 'comment-line');
    line.appendChild(nameLink(comment.author));
    line.appendChild(el('span', 'time', timeAgo(comment.ts)));
    body.appendChild(line);
    body.appendChild(textWithMention(comment.text));

    const actions = el('div', 'comment-actions');
    actions.appendChild(linkBtn('답글', function () {
      ui.openReplies[comment.id] = true;
      ui.replyTo = { commentId: comment.id, mention: '' };
      ui.focus = 'reply';
      refreshCard();
    }));
    if (replies.length > 0) {
      const opened = !!ui.openReplies[comment.id];
      actions.appendChild(linkBtn(opened ? '답글 숨기기' : '답글 ' + replies.length + '개 보기', function () {
        ui.openReplies[comment.id] = !opened;
        if (opened && ui.replyTo && ui.replyTo.commentId === comment.id) ui.replyTo = null;
        refreshCard();
      }));
    }
    body.appendChild(actions);

    if (ui.openReplies[comment.id]) {
      const replyBox = el('div', 'reply-list');
      replies.forEach(function (r) {
        replyBox.appendChild(renderReply(post, comment, r, ui, refreshCard));
      });
      if (ui.replyTo && ui.replyTo.commentId === comment.id) {
        replyBox.appendChild(renderReplyForm(post, comment, ui, refreshCard));
      }
      body.appendChild(replyBox);
    }

    item.appendChild(body);
    return item;
  }

  // 댓글 목록: 오래된 순으로 쌓고, 최근 n개만 보여준 뒤 위쪽의 "이전 댓글 더 보기"로 n개씩 더 펼침
  function renderCommentPanel(post, ui, refreshCard) {
    const panel = el('div', 'comment-panel');
    const head = el('div', 'comment-head', '댓글 ');
    head.appendChild(el('span', '', String(countComments(post))));
    panel.appendChild(head);
    const list = post.commentList;
    const total = list.length;
    const start = Math.max(0, total - ui.visible);

    if (start > 0) {
      const moreBtn = el('button', 'more-btn', '이전 댓글 ' + Math.min(COMMENT_PAGE_SIZE, start) + '개 더 보기');
      moreBtn.type = 'button';
      moreBtn.addEventListener('click', function () {
        ui.visible += COMMENT_PAGE_SIZE;
        refreshCard();
      });
      panel.appendChild(moreBtn);
    }

    if (total === 0) {
      panel.appendChild(el('p', 'comment-empty', '아직 댓글이 없어요. 첫 댓글을 남겨보세요!'));
    }

    list.slice(start).forEach(function (c) {
      panel.appendChild(renderComment(post, c, ui, refreshCard));
    });

    panel.appendChild(renderCommentForm(post, ui, refreshCard));
    return panel;
  }

  // ---------- 게시글 카드 만들기 ----------
  // onChange: 팔로우/좋아요 상태가 바뀐 뒤 목록 다시 그려야 할 때 호출됨
  function renderPostCard(post, onChange) {
    const me = myName();
    const ui = getUi(post.id);
    const card = document.createElement('article');
    card.className = 'post-card';

    // 이 카드 하나만 최신 데이터로 다시 그림 (댓글 열기/등록 등)
    function refreshCard() {
      const latest = getPosts().find(function (p) { return p.id === post.id; }) || post;
      const fresh = renderPostCard(latest, onChange);
      card.replaceWith(fresh);
      if (fresh._focusFn) fresh._focusFn();
    }

    // 머리 부분: 아바타(클릭 시 프로필) + 이름 + 시간/카테고리 + 팔로우 버튼
    const header = document.createElement('div');
    header.className = 'post-header';

    const info = document.createElement('div');
    info.appendChild(nameLink(post.author));
    const meta = document.createElement('div');
    meta.className = 'post-meta';
    meta.appendChild(document.createTextNode(timeAgo(post.ts) + ' · '));
    const tag = document.createElement('span');
    tag.className = 'post-tag';
    tag.textContent = CATEGORY_LABEL[post.category] || '';
    meta.appendChild(tag);
    info.appendChild(meta);

    header.appendChild(avatarLink(post.author));
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

    // 본문
    const content = document.createElement('p');
    content.className = 'post-content';
    content.textContent = post.text;
    card.appendChild(content);

    // 첨부 파일
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

    // 하단: 좋아요 + 댓글 버튼
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

    const commentBtn = el('button', 'comment-btn', '💬 ' + countComments(post));
    commentBtn.type = 'button';
    commentBtn.classList.toggle('open', ui.open);
    commentBtn.title = ui.open ? '댓글 닫기' : '댓글 보기';
    commentBtn.addEventListener('click', function () {
      ui.open = !ui.open;
      if (ui.open) ui.visible = COMMENT_PAGE_SIZE; // 열 때마다 최근 n개부터 보여줌
      ui.replyTo = null;
      refreshCard();
    });

    footer.appendChild(likeBtn);
    footer.appendChild(document.createTextNode(' · '));
    footer.appendChild(commentBtn);
    card.appendChild(footer);

    // 댓글창 (열려 있을 때만)
    if (ui.open) {
      card.appendChild(renderCommentPanel(post, ui, refreshCard));
    }

    // 다시 그린 뒤 입력칸에 커서를 돌려놓기 위한 함수
    if (ui.focus) {
      card._focusFn = function () {
        const selector = ui.focus === 'reply' ? '.reply-form input' : '.comment-form input';
        const input = card.querySelector(selector);
        ui.focus = null;
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      };
    }

    return card;
  }

  window.MD = {
    CATEGORY_LABEL: CATEGORY_LABEL,
    COMMENT_PAGE_SIZE: COMMENT_PAGE_SIZE,
    getCurrentUser: getCurrentUser,
    myName: myName,
    getPosts: getPosts,
    savePosts: savePosts,
    getFollowing: getFollowing,
    toggleFollow: toggleFollow,
    getFollowerCount: getFollowerCount,
    countComments: countComments,
    timeAgo: timeAgo,
    formatSize: formatSize,
    profileUrl: profileUrl,
    renderUserArea: renderUserArea,
    renderPostCard: renderPostCard
  };
})();
