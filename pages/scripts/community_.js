import MD from "./community_common_.js";
import { showDataError } from "./firebase_data.js";

// 커뮤니티 메인(피드) 페이지
// 공통 기능(글/팔로우/좋아요 저장, 카드 그리기)은 community_common_.js에

MD.ready.then(function () {
  const tabs = document.querySelectorAll('.tabs a');
  const postList = document.getElementById('postList');
  const emptyMsg = document.getElementById('emptyMsg');
  const writeFab = document.getElementById('writeFab');
  const userArea = document.getElementById('userArea');

  MD.renderUserArea(userArea);

  //주소의 ?tab=song처럼 지정된 탭으로 시작(글쓰기 후 돌아올 때 사용). 없으면 전체글
  const validTabs = ['all', 'following', 'song', 'sheet', 'free'];
  const params = new URLSearchParams(window.location.search);
  let currentTab = validTabs.indexOf(params.get('tab')) >= 0 ? params.get('tab') : 'all';

  function render() {
    const me = MD.myId();
    const following = MD.getFollowing(me);

    let posts = MD.getPosts().slice().sort(function (a, b) { return b.ts - a.ts; });
    posts = posts.filter(function (p) {
      if (currentTab === 'all') return true; // 전체글: 카테고리 상관없이 모두
      return currentTab === 'following' ? following.indexOf(p.authorUid) >= 0 : p.category === currentTab;
    });

    postList.replaceChildren();
    posts.forEach(function (p) {
      postList.appendChild(MD.renderPostRow(p, { showCategory: currentTab === 'all' || currentTab === 'following', from: currentTab }));
    });

    emptyMsg.classList.toggle('show', posts.length === 0);
    emptyMsg.textContent = currentTab === 'following'
      ? '아직 팔로우한 사람의 글이 없어요. 다른 탭에서 마음에 드는 글쓴이를 팔로우해보세요!'
      : currentTab === 'all'
        ? '아직 글이 없어요. 첫 글을 남겨보세요!'
        : '아직 이 카테고리에 글이 없어요. 첫 글을 남겨보세요!';

    //팔로잉 탭에서는 글쓰기 버튼을 숨기고, 카테고리 탭에서는 해당 카테고리가 선택된 채로 글쓰기 페이지로 이동 (전체글 탭은 카테고리를 고르게 함)
    writeFab.classList.toggle('hidden', currentTab === 'following');
    writeFab.href = (currentTab === 'all' || currentTab === 'following')
      ? 'community_write.html'
      : 'community_write.html?category=' + currentTab;
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

  MD.subscribe(render);
  setActiveTab();
  render();
}).catch(showDataError);
