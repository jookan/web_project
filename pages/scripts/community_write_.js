//커뮤니티 글쓰기 전용 페이지
//서버가 없는 단계라 첨부 파일은 "이름/크기"만 저장하고,
//작은 이미지(700KB 이하)만 미리보기용으로 함께 저장

document.addEventListener('DOMContentLoaded', function () {
  const MD = window.MD;
  const MAX_FILES = 3;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;  //파일 하나당 5MB까지 선택 가능
  const MAX_PREVIEW_SIZE = 700 * 1024;    //이 크기 이하 이미지만 미리보기 저장

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

  // ---------등록---------
  function readFile(file) {
    return new Promise(function (resolve) {
      const info = { name: file.name, size: file.size, type: file.type };
      if (file.type.indexOf('image/') === 0 && file.size <= MAX_PREVIEW_SIZE) {
        const reader = new FileReader();
        reader.onload = function () {
          info.dataUrl = reader.result;
          resolve(info);
        };
        reader.onerror = function () { resolve(info); };
        reader.readAsDataURL(file);
      } else {
        resolve(info);
      }
    });
  }

  submitBtn.addEventListener('click', function () {
    const text = textArea.value.trim();
    if (text === '') {
      hint.textContent = '내용을 입력해주세요.';
      return;
    }
    hint.textContent = '';
    submitBtn.disabled = true;

    Promise.all(selected.map(readFile)).then(function (files) {
      const category = categorySelect.value;
      const posts = MD.getPosts();
      posts.push({
        id: 'p' + Date.now(),
        author: MD.myName(),
        category: category,
        ts: Date.now(),
        text: text,
        baseLikes: 0,
        likedBy: [],
        comments: 0,
        files: files
      });
      if (!MD.savePosts(posts)) {
        hint.textContent = '저장 공간이 부족해요. 첨부한 이미지를 줄이거나 빼고 다시 시도해주세요.';
        submitBtn.disabled = false;
        return;
      }
      window.location.href = 'community.html?tab=' + category;
    });
  });
});
