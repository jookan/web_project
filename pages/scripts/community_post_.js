import MD from "./community_common_.js";
import { showDataError } from "./firebase_data.js";

// 커뮤니티 글 상세 페이지 (주소: community_post.html?id=글번호)
// 글 내용, 좋아요, 댓글/답글, 내 글 삭제를 이 화면에서 한다.

MD.ready.then(function () {
  const postArea = document.getElementById('postArea');
  const emptyMsg = document.getElementById('emptyMsg');
  const backLink = document.getElementById('backLink');
  const userArea = document.getElementById('userArea');
  const id = new URLSearchParams(window.location.search).get('id');
  let lastCategory = 'following';
  let deleted = false;

  MD.renderUserArea(userArea);

  function goBack() {
    window.location.href = 'community.html?tab=' + lastCategory;
  }

  function render() {
    if (deleted) return;
    const post = MD.getPosts().find(function (p) { return p.id === id; });
    if (!post) {
      postArea.replaceChildren();
      emptyMsg.classList.add('show');
      emptyMsg.textContent = '글을 찾을 수 없어요. 삭제되었거나 주소가 잘못되었어요.';
      return;
    }
    emptyMsg.classList.remove('show');
    lastCategory = post.category;
    backLink.href = 'community.html?tab=' + post.category;
    document.title = MD.postTitle(post) + ' - Ambient';

    // 댓글 입력 중에 화면이 다시 그려져도 입력칸 내용은 MD 쪽에서 보관한다.
    const card = MD.renderPostCard(post, render, { detail: true, onDelete: function () { deleted = true; goBack(); } });
    postArea.replaceChildren(card);
    if (card._focusFn) card._focusFn();
  }

  MD.subscribe(render);
  render();
}).catch(showDataError);
