// 커뮤니티 화면 공통 렌더러. 저장은 UID 기반 Firestore 어댑터에서 담당한다.
import * as store from "./community_store.js";
import { downloadAttachment } from "./local_files.js";
import { showDataError } from "./firebase_data.js";

(function () {
  const { getCurrentUser, myName, myId, getPosts, getFollowing, toggleFollow,
    getFollowerCount, countComments, addComment, addReply, renderUserArea,
    CATEGORY_LABEL } = store;
  const COMMENT_PAGE_SIZE = 3;

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

  function avatarLink(name, extraClass, uid) {
    const a = el('a', 'avatar' + (extraClass ? ' ' + extraClass : ''), name.charAt(0));
    if (extraClass === 'small') { // 댓글 아바타 이름마다 색 다르게
      let h = 0;
      for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
      a.style.background = 'linear-gradient(135deg,' + AVATAR_COLORS[h % AVATAR_COLORS.length] + ')';
    }
    a.href = profileUrl(uid || name);
    a.title = name + ' 프로필 보기';
    return a;
  }

  function nameLink(name, uid) {
    const a = el('a', 'author-name', name);
    a.href = profileUrl(uid || name);
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
    input.value = ui.commentDraft || '';
    input.addEventListener('input', () => { ui.commentDraft = input.value; });
    input.maxLength = 300;
    const submitBtn = el('button', 'submit-btn', '등록');
    submitBtn.type = 'button';
    const hint = el('p', 'form-hint');

    async function submit() {
      const text = input.value.trim();
      if (text === '') {
        hint.textContent = '내용을 입력해주세요.';
        return;
      }
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      try { await addComment(post.id, myName(), text); }
      catch (error) { hint.textContent = error.message || '댓글을 저장하지 못했어요.'; return; }
      finally { submitBtn.disabled = false; }
      ui.commentDraft = '';
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
    input.value = ui.replyTo.draft ?? ui.replyTo.mention ?? '';
    input.addEventListener('input', () => { if (ui.replyTo) ui.replyTo.draft = input.value; });
    const submitBtn = el('button', 'submit-btn', '등록');
    submitBtn.type = 'button';
    const cancelBtn = el('button', 'cancel-btn', '취소');
    cancelBtn.type = 'button';
    const hint = el('p', 'form-hint');

    async function submit() {
      const text = input.value.trim();
      const mention = (ui.replyTo.mention || '').trim();
      if (text === '' || text === mention) {
        hint.textContent = '내용을 입력해주세요.';
        return;
      }
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      try { await addReply(post.id, comment.id, myName(), text); }
      catch (error) { hint.textContent = error.message || '답글을 저장하지 못했어요.'; return; }
      finally { submitBtn.disabled = false; }
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
    item.appendChild(avatarLink(reply.author, 'small', reply.authorUid));

    const body = el('div', 'comment-body');
    const line = el('div', 'comment-line');
    line.appendChild(nameLink(reply.author, reply.authorUid));
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
    item.appendChild(avatarLink(comment.author, 'small', comment.authorUid));

    const body = el('div', 'comment-body');
    const line = el('div', 'comment-line');
    line.appendChild(nameLink(comment.author, comment.authorUid));
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
    const me = myId();
    const ui = getUi(post.id);
    const card = document.createElement('article');
    card.className = 'post-card';

    // 이 카드 하나만 최신 데이터로 다시 그림 (댓글 열기/등록 등)
    function refreshCard() {
      if (!card.isConnected && onChange) { onChange(); return; }
      const latest = getPosts().find(function (p) { return p.id === post.id; }) || post;
      const fresh = renderPostCard(latest, onChange);
      card.replaceWith(fresh);
      if (fresh._focusFn) fresh._focusFn();
    }

    // 머리 부분: 아바타(클릭 시 프로필) + 이름 + 시간/카테고리 + 팔로우 버튼
    const header = document.createElement('div');
    header.className = 'post-header';

    const info = document.createElement('div');
    info.appendChild(nameLink(post.author, post.authorUid));
    const meta = document.createElement('div');
    meta.className = 'post-meta';
    meta.appendChild(document.createTextNode(timeAgo(post.ts) + ' · '));
    const tag = document.createElement('span');
    tag.className = 'post-tag';
    tag.textContent = CATEGORY_LABEL[post.category] || '';
    meta.appendChild(tag);
    info.appendChild(meta);

    header.appendChild(avatarLink(post.author, '', post.authorUid));
    header.appendChild(info);

    if (post.authorUid !== me) { // 내 글에는 팔로우 버튼을 보여주지 않음
      const followBtn = document.createElement('button');
      followBtn.type = 'button';
      followBtn.className = 'follow-btn';
      const following = getFollowing(me).indexOf(post.authorUid) >= 0;
      followBtn.classList.toggle('following', following);
      followBtn.textContent = following ? '팔로잉' : '팔로우';
      followBtn.addEventListener('click', async function () {
        followBtn.disabled = true;
        try { await toggleFollow(me, post.authorUid); if (onChange) onChange(); }
        catch (error) { showDataError(error); }
        finally { followBtn.disabled = false; }
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
      post.files.forEach(function (f, index) {
        const chip = el('span', 'attach-chip', '📎 ' + f.name + ' (' + formatSize(f.size || 0) + ') · 원본은 작성자 기기에 보관');
        if (post.authorUid === myId()) {
          const download = linkBtn('이 기기에서 열기', async function () {
            try { await downloadAttachment(myId(), post.id, index); }
            catch (error) { showDataError(error); }
          });
          chip.appendChild(download);
        }
        attachBox.appendChild(chip);
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
    likeBtn.addEventListener('click', async function () {
      likeBtn.disabled = true;
      try { await store.toggleLike(post.id); if (onChange) onChange(); }
      catch (error) { showDataError(error); }
      finally { likeBtn.disabled = false; }
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
    ready: store.ready,
    subscribe: store.subscribe,
    myId: myId,
    getProfile: store.getProfile,
    resolveUid: store.resolveUid,
    createPost: store.createPost,
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

export default window.MD;
