# 웹 페이지 설명

## 악보 업로드 및 조회 페이지

PDF 악보를 한 페이지씩 보면서 연주 순서와 속도를 설정하고, 설정한 시간에 맞춰 페이지를 자동으로 넘기는 연습 기능입니다.

- 페이지: [`pages/sheet_uploading.html`](pages/sheet_uploading.html)
- 스타일: [`pages/web_programming/css/upload.css`](pages/web_programming/css/upload.css)
- JavaScript 모듈 설명: [`pages/scripts/README.md`](pages/scripts/README.md)

### 주요 기능

**PDF 업로드와 악보 조회**

- PDF 파일을 선택하면 `내 악보들` 목록에 추가하고, 목록에서 다른 악보를 선택할 수 있습니다.
- 같은 이름, 크기, 수정 시간을 가진 파일을 다시 선택하면 기존 악보를 사용합니다.
- PDF.js로 페이지를 그리며, 원본 페이지의 비율과 회전을 반영해 화면 크기에 맞춥니다.
- 이전·다음 버튼과 키보드 좌우 방향키로 페이지를 이동합니다.
- PDF를 읽을 수 없거나 암호가 설정된 경우 안내 메시지를 표시합니다.

**연습 설정과 연주 순서**

- 악보마다 BPM과 마디당 박 수를 설정합니다. 기본값은 BPM 120, 마디당 4박입니다.
- 각 연주 단계에 PDF 페이지 번호와 연주할 마디 수를 입력합니다. 초기 순서는 PDF의 페이지 순서이며, 각 페이지의 기본 마디 수는 16입니다.
- `현재 페이지 추가`와 각 행의 삭제 버튼으로 순서를 편집합니다. 반복 연주는 같은 페이지를 순서에 다시 넣어 표현할 수 있습니다. 예: `1 → 2 → 1`.
- 설정에 따른 예상 연주 시간을 표시하고, 자동 넘기기 중에는 현재 단계와 남은 시간을 보여줍니다.

**자동 페이지 넘기기**

- `처음부터 시작`을 누르면 연주 순서의 첫 단계부터 진행합니다. 페이지를 표시한 뒤 해당 단계의 시간을 세고 다음 단계로 이동합니다.
- 한 단계의 연주 시간은 `(60 ÷ BPM) × 마디당 박 수 × 마디 수`초입니다. 예를 들어 BPM 120, 마디당 4박, 16마디는 32초입니다. BPM의 한 박과 마디당 박 수의 기준을 맞춰야 합니다.
- 마지막 단계의 시간이 끝나면 자동으로 멈춥니다. `정지` 후 다시 시작하면 첫 단계부터 진행합니다.
- 실행 중에는 연습 설정을 잠그며, 수동 페이지 이동, 악보 변경, 파일 선택 또는 탭 이탈 시 자동 넘기기가 정지됩니다.

**메트로놈**

- `자동 넘기기 중 소리 켜기`를 선택하면 설정한 BPM에 따라 소리가 나고 각 마디의 첫 박이 강조됩니다.
- 자동 넘기기를 정지하면 소리도 멈춥니다. 페이지를 표시하는 동안에는 소리가 잠시 멈추고 다음 단계가 준비되면 다시 시작합니다.
- 메트로놈은 BPM 600 이하에서 사용할 수 있습니다.

**브라우저 저장**

- PDF 파일과 악보별 마지막 페이지, BPM, 마디당 박 수, 연주 순서 및 메트로놈 설정을 브라우저의 IndexedDB에 저장합니다. 새로고침 후 저장된 목록과 설정을 불러옵니다.
- 현재 데이터는 해당 브라우저에 저장되며 계정이나 서버 DB와 연결되어 있지 않습니다. 다른 브라우저나 기기에서는 공유되지 않고, 브라우저 데이터를 삭제하면 사라질 수 있습니다.
- 저장에 실패하면 화면에 안내 메시지가 표시됩니다.

### 사용 방법

1. VS Code Live Server 등 로컬 웹 서버로 `pages/sheet_uploading.html`을 엽니다.
2. `악보 업로드`를 눌러 PDF를 선택합니다.
3. BPM과 마디당 박 수를 입력하고 각 연주 단계의 페이지와 마디 수를 설정합니다.
4. 반복이 있으면 필요한 페이지를 연주 순서에 다시 추가합니다.
5. 필요하면 메트로놈을 켜고 `처음부터 시작`을 누릅니다.

현재 PDF에서 마디 수나 도돌이표를 자동으로 인식하지 않으므로 직접 확인해 입력해야 합니다. 자동 넘기기는 입력한 BPM을 기준으로 시간을 계산하며 실제 연주 소리를 따라가지는 않습니다.

### 구현 구조와 향후 계획

`sheet_functions.js`가 각 모듈을 연결합니다. `pdf_viewer.js`는 PDF 표시, `score_library.js`는 악보 목록, `practice_settings.js`는 연습 설정, `auto_turn.js`는 자동 넘기기, `metronome.js`는 박자 소리, `score_storage.js`는 브라우저 저장을 담당합니다.

향후 사용자 계정과 DB를 연결해 악보와 연습 정보를 사용자별로 저장하고 불러오는 기능, PDF 악보를 인식해 페이지별 마디 수를 계산하는 기능을 검토합니다.

자동 넘기기 테스트는 프로젝트 루트에서 다음 명령으로 실행할 수 있습니다.

```sh
node --test tests/auto_turn.test.mjs
```


## 음악 디깅 플레이리스트 페이지

플레이리스트에 담은 곡의 장르를 분석해서 **비슷한 장르 / 다른 장르**의 곡을 추천하는 페이지입니다.
장르 정보는 Last.fm과 MusicBrainz API에서 가져옵니다.

## 실행 방법

1. 이 저장소를 clone합니다.
2. `pages/scripts/config.example.js`를 같은 폴더에 `config.js`로 복사합니다.
   ```
   cp pages/scripts/config.example.js pages/scripts/config.js
   ```
3. [Last.fm API 계정](https://www.last.fm/api/account/create)을 만들어 API key를 발급받고,
   `config.js`의 `YOUR_LASTFM_API_KEY`를 발급받은 키로 바꿉니다.
   (Shared secret은 필요 없습니다. 올리지 마세요.)
4. `home.html`을 브라우저로 엽니다. (VS Code의 Live Server 확장 사용을 권장)

`config.js`는 `.gitignore`에 등록되어 있어서 GitHub에 올라가지 않습니다.

## 동작 방식

- 검색: Last.fm `track.search`
- 곡 장르: Last.fm 곡 태그 -> 가수 태그 -> MusicBrainz 순서로 조회
- 비슷한 장르 추천: 플레이리스트 상위 장르의 인기곡 (`tag.getTopTracks`)
- 다른 장르 추천: 플레이리스트와 겹치지 않는 장르 후보에서 선택
- 플레이리스트는 브라우저 localStorage에 저장됩니다. (백엔드 연동 전 임시)

## TODO

- 유튜브 API 검색/재생 연동 (`home.js`의 `playSong`)
- 백엔드 연동: API 키를 서버로 이동, 플레이리스트를 DB에 저장

## Ambient 통합 화면

로컬 웹 서버로 루트 `index.html`을 열면 Ambient 로그인/게스트 화면과 시작 화면으로 이동합니다.
시작 화면의 `악보 업로드 · 연습` 카드에서 기존 PDF 연습 기능을 이용할 수 있고,
Aurora와 악보 화면의 상단 메뉴로 두 화면을 오갈 수 있습니다.

- Ambient 플레이어: `ambient/aurora/index.html`
- 악보 연습: `pages/sheet_uploading.html`
- 기존 음악 추천: `pages/home.html`
- 기존 커뮤니티: `pages/community.html`

Aurora의 재생 JavaScript와 기존 CSS, PDF 연습 모듈과 기존 `upload.css`는 그대로 유지합니다.
악보 화면에는 별도 `ambient/assets/practice.css`로 Ambient 스타일을 적용합니다.
Ambient 로그인은 기존 브라우저 데모 방식이며, Spotify·YouTube 연결은 기존 계정/API 설정을 사용합니다.
Spotify 앱의 Redirect URI는 실제로 접속하는 `ambient/aurora/` 주소와 일치해야 합니다.
악보와 플레이리스트는 사이트 주소별 브라우저 저장소를 사용하므로 다른 배포 주소의 자료가 자동 이전되지는 않습니다.
