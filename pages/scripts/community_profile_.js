//커뮤니티 프로필 페이지
// 아바타나 이름을 누르면 이 페이지로 옴, 그 사람이 쓴 글 / 좋아요한 글 / 팔로잉 목록을 볼 수 있음
//(활동 내역은 이 브라우저에 저장된 기록 기준)

document.addEventListener('DOMContentLoaded', function () {
  const MD = window.MD;
  const userArea = document.getElementById('userArea');
  const avatarEl = document.getElementById('profileAvatar');
  const nameEl = document.getElementById('profileName');
  const meBadge = document.getElementById('meBadge');
  const followSlot = document.getElementById('followSlot');
  const statPosts = document.getElementById('statPosts');
  const statLikes = document.getElementById('statLikes');
  const statFollowing = document.getElementById('statFollowing');
  const statFollowers = document.getElementById('statFollowers');
  const tabs = document.querySelectorAll('.profile-tabs a');
  const listEl = document.getElementById('profileList');
  const emptyMsg = document.getElementById('emptyMsg');

  MD.renderUserArea(userArea);

  const me = MD.myName();
  const params = new URLSearchParams(window.location.search);
  const target = params.get('user') || me; // 주소에 user가 없으면 내 프로필
  const isMe = target === me;
  let currentTab = 'posts'; // 'posts' | 'likes' | 'following'

  document.title = target + ' 프로필 - MusicDig';
  avatarEl.textContent = target.charAt(0);
  nameEl.textContent = target;
  meBadge.classList.toggle('hidden', !isMe);

  function renderFollowButton() {
    followSlot.replaceChildren();
    if (isMe) return; // 내 프로필에는 팔로우 버튼 없음
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'follow-btn';
    const following = MD.getFollowing(me).indexOf(target) >= 0;
    btn.classList.toggle('following', following);
    btn.textContent = following ? '팔로잉' : '팔로우';
    btn.addEventListener('click', function () {
      MD.toggleFollow(me, target);
      refresh();
    });
    followSlot.appendChild(btn);
  }

  function byNewest(a, b) { return b.ts - a.ts; }

  function refresh() {
    const allPosts = MD.getPosts().slice().sort(byNewest);
    const myPosts = allPosts.filter(function (p) { return p.author === target; });
    const likedPosts = allPosts.filter(function (p) {
      return Array.isArray(p.likedBy) && p.likedBy.indexOf(target) >= 0;
    });
    const followingList = MD.getFollowing(target);

    statPosts.textContent = myPosts.length;
    statLikes.textContent = likedPosts.length;
    statFollowing.textContent = followingList.length;
    statFollowers.textContent = MD.getFollowerCount(target);
    renderFollowButton();

    listEl.replaceChildren();
    let isEmpty = false;
    let emptyText = '';

    if (currentTab === 'posts') {
      myPosts.forEach(function (p) { listEl.appendChild(MD.renderPostCard(p, refresh)); });
      isEmpty = myPosts.length === 0;
      emptyText = isMe ? '아직 작성한 글이 없어요.' : target + '님이 작성한 글이 아직 없어요.';
    } else if (currentTab === 'likes') {
      likedPosts.forEach(function (p) { listEl.appendChild(MD.renderPostCard(p, refresh)); });
      isEmpty = likedPosts.length === 0;
      emptyText = '아직 좋아요를 누른 글이 없어요.';
    } else {
      const box = document.createElement('div');
      box.className = 'chip-list';
      followingList.forEach(function (name) {
        const chip = document.createElement('a');
        chip.className = 'user-chip';
        chip.href = MD.profileUrl(name);
        chip.textContent = name;
        box.appendChild(chip);
      });
      listEl.appendChild(box);
      isEmpty = followingList.length === 0;
      emptyText = '아직 팔로우한 사람이 없어요.';
    }

    emptyMsg.classList.toggle('show', isEmpty);
    emptyMsg.textContent = emptyText;
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      currentTab = tab.dataset.tab;
      tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
      refresh();
    });
  });

  refresh();
});
