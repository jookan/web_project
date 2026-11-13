import MD from "./community_common_.js";
import { showDataError } from "./firebase_data.js";

//커뮤니티 글쓰기 전용 페이지
// 글과 파일 정보는 Firestore에, 첨부 원본은 이 브라우저에 저장한다.

MD.ready.then(function () {
  const MAX_FILES = 3;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;  //파일 하나당 5MB까지 선택 가능

  const categorySelect = document.getElementById('category');
  const textArea = document.getElementById('postText');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const hint = document.getElementById('writeHint');
  const submitBtn = document.getElementById('submitPost');
  const cancelBtn = document.getElementById('cancelBtn');
  const userArea = document.getElementById('userArea');

  MD.renderUserArea(userArea);

  //주소의 ?category=song 값으로 카테고리를 미리 선택
  const params = new URLSearchParams(window.location.search);
  const presetCategory = params.get('category');
  if (presetCategory && MD.CATEGORY_LABEL[presetCategory]) {
    categorySelect.value = presetCategory;
  }

  //취소하면 원래 보던 탭으로 돌아가기
  function backUrl() {
    return 'community.html?tab=' + categorySelect.value;
  }
  cancelBtn.href = backUrl();
  categorySelect.addEventListener('change', function () {
    cancelBtn.href = backUrl();
  });

  // ---------파일 선택---------
  let selected = []; // 선택된 File 객체들

  function renderFiles() {
    fileList.replaceChildren();
    selected.forEach(function (file, index) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = '📎 ' + file.name + ' (' + MD.formatSize(file.size) + ')';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = '첨부 취소';
      removeBtn.addEventListener('click', function () {
        selected.splice(index, 1);
        renderFiles();
      });
      li.appendChild(label);
      li.appendChild(removeBtn);
      fileList.appendChild(li);
    });
  }

  fileInput.addEventListener('change', function () {
    hint.textContent = '';
    Array.from(fileInput.files).forEach(function (file) {
      if (selected.length >= MAX_FILES) {
        hint.textContent = '파일은 최대 ' + MAX_FILES + '개까지 첨부할 수 있어요.';
      } else if (file.size > MAX_FILE_SIZE) {
        hint.textContent = file.name + ' 파일이 너무 커요. (5MB 이하만 가능)';
      } else {
        selected.push(file);
      }
    });
    fileInput.value = ''; //같은 파일을 다시 선택할 수 있도록 초기화
    renderFiles();
  });

  // 첨부 원본은 로컬에, 글과 파일 정보는 Firestore에 저장한다.
  textArea.maxLength = 10000;
  if (!MD.myId()) {
    hint.textContent = '글을 작성하려면 Google로 로그인해 주세요.';
    submitBtn.disabled = true;
  }
  submitBtn.addEventListener('click', async function () {
    const text = textArea.value.trim();
    if (!text) { hint.textContent = '내용을 입력해주세요.'; return; }
    if (submitBtn.disabled) return;
    hint.textContent = '게시글을 저장하고 있어요.';
    submitBtn.disabled = true;
    try {
      await MD.createPost(categorySelect.value, text, selected);
      window.location.href = 'community.html?tab=' + categorySelect.value;
    } catch (error) {
      hint.textContent = error.message || '게시글을 저장하지 못했어요.';
      submitBtn.disabled = false;
    }
  });
}).catch(showDataError);
