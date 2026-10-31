// 커뮤니티 메인(피드) 페이지
// 공통 기능(글/팔로우/좋아요 저장, 카드 그리기)은 community_common_.js에

document.addEventListener('DOMContentLoaded', function () {
  const MD = window.MD;
  const tabs = document.querySelectorAll('.tabs a');
  const postList = document.getElementById('postList');
  const emptyMsg = document.getElementById('emptyMsg');
  const writeFab = document.getElementById('writeFab');
  const userArea = document.getElementById('userArea');

  MD.renderUserArea(userArea);

  //주소의 ?tab=song처럼 지정된 탭으로 시작(글쓰기 후 돌아올 때 사용). 없으면 팔로잉
  const validTabs = ['following', 'song', 'sheet', 'free'];
  const params = new URLSearchParams(window.location.search);
  let currentTab = validTabs.indexOf(params.get('tab')) >= 0 ? params.get('tab') : 'following';

  function render() {
    const me = MD.myName();
    const following = MD.getFollowing(me);

    let posts = MD.getPosts().slice().sort(function (a, b) { return b.ts - a.ts; });
    posts = posts.filter(function (p) {
      return currentTab === 'following' ? following.indexOf(p.author) >= 0 : p.category === currentTab;
    });

    postList.replaceChildren();
    posts.forEach(function (p) {
      postList.appendChild(MD.renderPostCard(p, render));
    });

    emptyMsg.classList.toggle('show', posts.length === 0);
    emptyMsg.textContent = currentTab === 'following'
      ? '아직 팔로우한 사람의 글이 없어요. 다른 탭에서 마음에 드는 글쓴이를 팔로우해보세요!'
      : '아직 이 카테고리에 글이 없어요. 첫 글을 남겨보세요!';

    //팔로잉 탭에서는 글쓰기 버튼을 숨기고, 그 외 탭에서는 해당 카테고리가 선택된 채로 글쓰기 페이지로 이동
    writeFab.classList.toggle('hidden', currentTab === 'following');
    writeFab.href = 'community_write.html?category=' + currentTab;
  }

  function setActiveTab() {
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === currentTab);
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      currentTab = tab.dataset.tab;
      setActiveTab();
      try {
        history.replaceState(null, '', '?tab=' + currentTab);
      } catch (err) { /* 무시 */ }
      render();
    });
  });

  setActiveTab();
  render();
});
