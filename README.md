# Ambient

음악을 찾고, 취향을 공유하고, PDF 악보로 연습하는 웹 프로젝트입니다.
Google 로그인과 Firebase 기반 데이터 저장을 중심으로 음악 디깅, 커뮤니티, Aurora 플레이어, 악보 연습 화면을 제공합니다.

HTML·CSS·JavaScript ES 모듈로 구성한 정적 사이트이며, 별도의 애플리케이션 서버나 프런트엔드 빌드 과정 없이 로컬 웹 서버에서 실행합니다.

> 현재 소스에는 Firebase 연동이 구현되어 있습니다. 실제 사용에는 Authentication 설정과 `firestore.rules` 게시가 필요합니다. 외부 음악 검색·재생에는 서비스별 설정이 추가로 필요하며, PDF·첨부파일 원본은 브라우저에만 보관합니다.

## 페이지와 주요 기능

| 페이지 | 파일 | 주요 기능 |
| --- | --- | --- |
| 로그인 | [ambient_login.html](pages/ambient_login.html) | Google 로그인, 이메일 회원가입·로그인, 비밀번호 재설정, 로그인 유지, 게스트 입장 |
| 시작 | [ambient_hub.html](pages/ambient_hub.html) | 사용자 이름 표시, 각 서비스 이동, 로그아웃 |
| 음악 디깅 | [digging.html](pages/digging.html) | Aurora 플레이리스트 연동, 곡 태그 기반 장르 분석, 비슷한 장르·다른 장르 추천 |
| 커뮤니티 | [community.html](pages/community.html) | 게시글 피드, 카테고리·팔로잉 필터, 댓글·답글, 좋아요, 팔로우 |
| 글쓰기 | [community_write.html](pages/community_write.html) | 카테고리 선택, 본문 작성, 첨부파일 정보 등록 |
| 프로필 | [community_profile.html](pages/community_profile.html) | 작성한 글·좋아요한 글, 팔로워·팔로잉 수 확인 |
| Aurora | [aurora.html](pages/aurora.html) | YouTube 검색·재생, 플레이리스트 관리, 음악에 반응하는 배경 |
| 악보 연습 | [sheet_uploading.html](pages/sheet_uploading.html) | PDF 보기, 연주 순서 편집, BPM 기반 자동 넘기기, 메트로놈 |

루트 [index.html](index.html)과 [pages/index.html](pages/index.html)은 로그인 화면으로 이동하는 진입점입니다. 서비스 화면의 공통 메뉴로 각 기능을 오갈 수 있습니다.

### 로그인과 사용자 구분

- Firebase Authentication으로 Google 로그인·로그아웃과 인증 상태 복원을 처리합니다.
- 로그인 유지 선택에 따라 브라우저 재시작 후에도 유지하거나 현재 세션에만 유지합니다.
- 이메일 회원가입·로그인·비밀번호 재설정은 콘솔에서 이메일/비밀번호 공급자를 활성화한 경우 사용할 수 있습니다.
- 로그인 시 프로필을 Firestore에 저장하고, 화면에 사용자 이름을 표시합니다.
- 사용자를 이름 대신 Firebase UID로 구분하므로 동명이인의 활동과 개인 자료가 합쳐지지 않습니다.
- 게스트는 커뮤니티를 읽을 수 있고 개인 곡 목록과 악보를 브라우저에 저장할 수 있습니다. 게시글·댓글·좋아요·팔로우를 남기려면 로그인해야 합니다.

### 음악 커뮤니티

- 곡 추천·악보 공유·자유 카테고리로 글을 작성하고 조회합니다.
- 게시글, 댓글·답글, 좋아요, 팔로우는 Firestore에 저장하고 실시간으로 화면에 반영합니다.
- 팔로잉 피드와 사용자 프로필에서 관심 있는 사람의 활동을 확인합니다.
- 게시글 본문은 최대 10,000자, 댓글·답글은 최대 300자입니다.
- 첨부파일은 파일당 5MB 이하, 최대 3개입니다. DB에는 이름·크기·종류만 저장합니다.
- 첨부 원본의 `이 기기에서 열기`는 작성자가 파일을 저장한 브라우저에서만 동작합니다. 다른 사용자에게 원본을 공유하는 기능은 아직 없습니다.

같은 Firebase 프로젝트에 연결된 사이트 사용자들은 저장된 게시글을 함께 봅니다. 현재 규칙에서는 게스트도 커뮤니티 데이터를 읽을 수 있으며, 개인 플레이리스트와 악보 설정은 본인만 접근할 수 있습니다.

### 음악 디깅

- Aurora의 YouTube 플레이리스트(`users/{uid}/appData/aurora`)를 그대로 불러와 사용합니다. 화면에서 플레이리스트를 고르면 Aurora에서도 같은 목록이 선택됩니다.
- 곡마다 **YouTube 영상 태그**(장르 사전에 있는 것만)와 **Last.fm 곡 → 아티스트 태그**를 합쳐 장르를 정하고, 둘 다 없으면 MusicBrainz로 보완합니다.
- 플레이리스트 장르를 바탕으로 비슷한 장르 또는 겹치지 않는 장르의 곡을 추천합니다.
- 검색·추천 곡의 `+`는 YouTube Data API로 재생 가능한 영상을 찾아 Aurora 플레이리스트에 담고, `✕`는 Aurora 플레이리스트에서 뺍니다. 재생은 `▶ Aurora에서 재생`으로 Aurora에서 합니다.
- Aurora가 다른 탭에 열려 있어도 한쪽의 변경이 다른 쪽에 바로 반영됩니다.
- 예전 디깅 전용 목록(`appData/digging`, 계정 구분 전 브라우저 목록)에 곡이 남아 있으면 `예전 디깅 곡 N곡 Aurora로 옮기기` 버튼으로 YouTube 영상을 찾아 옮길 수 있습니다. 원본은 지우지 않습니다.
- 장르 태그 캐시는 외부 API 요청을 줄이기 위해 브라우저에 보관합니다.

### Aurora 음악 플레이어

- YouTube Data API로 검색하고 YouTube IFrame Player로 재생합니다.
- 재생·일시정지, 이전·다음 곡, 재생 위치, 볼륨·음소거, 셔플·반복을 제어합니다.
- 플레이리스트 생성·이름 변경·삭제와 곡 추가·제거를 지원하고 개인 목록을 DB에 저장합니다. 왼쪽 패널의 연필 버튼을 누르면 같은 자리에서 이름을 바꿀 수 있습니다.
- 커버 이미지의 색상을 Canvas 배경 애니메이션과 화면 강조색에 반영합니다.
- 전체화면 버튼이나 `F` 키를 누르면 앨범 커버와 배경이 화면을 채웁니다. 마우스를 화면 아래로 옮기면 재생 조작이 나타나고, `Esc` 또는 `F` 키로 전체화면을 종료할 수 있습니다.

YouTube 검색에는 YouTube Data API v3 키가 필요합니다. 실제 재생 가능 여부는 콘텐츠 재생 제한에 영향을 받습니다.

Aurora 원본: [RE2031 / ambient-music-site](https://github.com/RE2031/ambient-music-site).

### PDF 악보 연습

- PDF를 내 악보 목록에 추가하고 PDF.js로 페이지를 표시합니다.
- 이전·다음 버튼과 좌우 방향키로 이동하고, 화면 크기에 맞춰 PDF 비율을 유지합니다.
- 악보별 BPM, 마디당 박 수, 연주 순서와 각 단계의 마디 수를 설정합니다.
- 같은 페이지를 여러 번 넣어 `1 → 2 → 1 → 3`처럼 반복 순서를 만들 수 있습니다.
- `처음부터 시작`을 누르면 설정한 순서대로 자동 이동하고 마지막 단계가 끝나면 멈춥니다.
- 자동 넘기기 중 메트로놈을 켜고 마디 첫 박을 강조할 수 있습니다.
- 수동 이동·악보 변경·파일 선택·탭 이탈 시 자동 진행을 정지합니다. 정지 후 재시작하면 첫 단계부터 진행합니다.
- PDF 원본은 계정별 IndexedDB에, 마지막 페이지·연습 설정·파일 정보는 Firestore에 저장합니다.
- 다른 기기에서는 같은 PDF를 다시 선택하면 파일 내용의 해시로 저장된 설정을 찾아 복원합니다.

한 단계의 시간은 다음과 같습니다.

```text
연주 시간(초) = (60 ÷ BPM) × 마디당 박 수 × 해당 단계의 마디 수
예: BPM 120 × 마디당 4박 × 16마디 → 32초
```

마디 수와 반복 순서는 직접 입력합니다. PDF의 음표·도돌이표 자동 인식이나 실제 연주 소리를 따라가는 기능은 구현하지 않았습니다.

## 데이터 저장과 공개 범위

| 데이터 | 저장 위치 | 다른 사용자·기기에서의 동작 |
| --- | --- | --- |
| 로그인 정보 | Firebase Authentication | 계정 인증에 사용 |
| 비공개 프로필 | `users/{uid}` | 본인만 접근 |
| 공개 이름·사진 주소 | `publicProfiles/{uid}` | 커뮤니티에서 공개 조회 |
| 게시글·댓글·좋아요·팔로우 | `posts`, `comments`, `postLikes`, `follows` | 같은 DB를 사용하는 사용자에게 공유 |
| 디깅·Aurora 개인 목록 | `users/{uid}/appData/{digging,aurora}` | 같은 계정으로 불러오기 |
| PDF 정보·연습 설정 | `users/{uid}/scores/{scoreId}` | 같은 계정으로 불러오기 |
| PDF·첨부파일 원본 | 브라우저 IndexedDB | 저장한 브라우저에만 존재 |
| YouTube·Last.fm API 키 | 계정별 브라우저 저장소 | Firestore에 전송하지 않음 |
| 게스트 개인 목록·악보 | 브라우저 저장소 | 계정 DB에 저장하지 않음 |

Cloud Storage는 사용하지 않습니다. 브라우저 데이터를 삭제하면 해당 기기에만 있던 파일 원본이 사라질 수 있으므로 원본은 별도로 보관해야 합니다.

개인 목록은 페이지를 열 때 불러오고 변경할 때 저장합니다. 여러 기기에서 같은 목록을 동시에 수정하면 마지막 저장 내용이 적용됩니다. 커뮤니티는 실시간으로 갱신됩니다.

기존 계정 구분 없는 자료는 자동으로 합치지 않습니다. 디깅·Aurora·악보 화면의 `기존 브라우저 ... 가져오기` 버튼으로 현재 계정에 가져올 수 있습니다. 예전 커뮤니티 예시 자료는 공유 DB에 자동 게시하지 않습니다.

저장 구조·접근 권한·기존 자료 이전의 상세 설명은 [DB_CONNECTIONS.md](DB_CONNECTIONS.md)를 참고하세요.

## 실행과 설정

### 1. 로컬 웹 서버 실행

1. VS Code에서 이 프로젝트 폴더를 엽니다.
2. Live Server로 루트 `index.html`을 엽니다.
3. 로그인 또는 게스트 입장 후 시작 화면에서 서비스를 선택합니다.

HTML 파일을 더블클릭하는 `file://` 방식 대신 HTTP 웹 서버를 사용합니다. 로컬 실행 주소는 서버가 제공하는 주소를 사용하세요. `localhost`와 `127.0.0.1`은 브라우저 저장소가 서로 다르므로 개발 중 한 주소로 통일하는 편이 좋습니다.

### 2. Firebase 연결

현재 소스의 연결 대상 프로젝트는 `webproject-f06f1`입니다. 다른 프로젝트를 사용한다면 [firebase_config.js](pages/scripts/firebase_config.js)의 웹 앱 설정을 해당 프로젝트 값으로 변경합니다.

1. Firebase Authentication에서 Google 로그인 공급자를 활성화합니다.
2. Authentication의 승인된 도메인에 실제 접속 호스트를 등록합니다. 예: `localhost`, `127.0.0.1`, 배포 도메인. 프로토콜·포트·경로는 넣지 않습니다.
3. 이메일 로그인이 필요하면 이메일/비밀번호 공급자도 활성화합니다.
4. Cloud Firestore 데이터베이스를 만듭니다.
5. [firestore.rules](firestore.rules) 전체를 Firebase 콘솔 → Firestore → 규칙에 붙여넣고 게시합니다.

`firebase.json`을 저장하는 것만으로 서버 규칙이 바뀌지는 않습니다. 기존 `users/{uid}` 규칙만 있다면 커뮤니티와 하위 자료 저장에서 `permission-denied`가 발생할 수 있습니다.

Firebase 웹 앱 설정은 브라우저로 전달됩니다. 실제 데이터 접근 제한은 로그인 상태와 Firestore 보안 규칙으로 처리합니다. 서비스 계정 비밀키는 프런트엔드에 넣지 않습니다.

### 3. 디깅 검색 설정

Last.fm API 키는 저장소에 넣지 않습니다. 사용하는 사람이 각자 발급받아 디깅 화면에 입력하며, 키는 그 사람의 브라우저에 계정(UID)별로만 저장되고 Firestore에는 보내지 않습니다. (Aurora의 YouTube 키와 같은 방식)

1. [Last.fm API 계정 만들기](https://www.last.fm/api/account/create)에서 앱 이름과 이메일만 입력해 API key(32자리)를 발급합니다. Shared secret은 사용하지 않습니다.
2. 음악 디깅 화면 상단의 `Last.fm API 키` 칸에 붙여넣고 저장합니다.
3. 추천 곡을 플레이리스트에 담으려면 Aurora에서 YouTube API 키도 저장합니다.

예전에 쓰던 `config.js`/`config.example.js` 방식은 없앴습니다. 로컬에 `config.js`가 남아 있다면 지워도 됩니다.

### 4. Aurora 서비스 연결

- YouTube: Google Cloud에서 YouTube Data API v3를 활성화하고 발급한 API 키를 Aurora 화면에 입력합니다.

### 5. 다른 사람에게 사이트 공개

`127.0.0.1`이나 `localhost`는 자신의 컴퓨터에서 사용하는 주소입니다. 다른 사람이 링크로 접속하려면 정적 사이트를 배포하고, 배포 도메인을 Firebase 인증 설정에 추가해야 합니다. `.nojekyll`은 GitHub Pages의 정적 파일 제공을 위한 설정입니다.

현재 `firebase.json`에는 Firestore 규칙과 에뮬레이터 설정이 있으며 Firebase Hosting 배포 설정은 포함되어 있지 않습니다.

## DB 저장 확인 방법

Firebase 콘솔 → 프로젝트 `webproject-f06f1` → Firestore → 데이터에서 확인합니다.

- 작성한 글: `posts`의 문서에서 `text`, `authorUid`, `category`, `createdAt` 확인
- 댓글·답글: `comments`
- 좋아요: `postLikes`
- 팔로우: `follows`
- 개인 곡 목록: `users` → 내 UID 문서 → `appData`
- 악보 설정: `users` → 내 UID 문서 → `scores`

자료가 없으면 화면의 저장 오류와 개발자 도구 Console을 확인합니다. `permission-denied`는 게시된 규칙과 로그인 상태를, `auth/unauthorized-domain`은 승인된 도메인을 우선 확인합니다.

## 프로젝트 구성

```text
web_programming/
├─ index.html                  # 로그인 화면으로 이동
├─ README.md
├─ DB_CONNECTIONS.md           # 데이터 구조와 설정·검증 안내
├─ firebase.json               # 규칙 파일 경로와 에뮬레이터 설정
├─ firestore.rules             # 서버에서 적용할 접근 규칙
├─ pages/
│  ├─ *.html                   # 로그인·시작·커뮤니티·디깅·플레이어·악보
│  ├─ scripts/                 # 기능별 ES 모듈과 외부 라이브러리
│  ├─ web_programming/css/     # 화면별·공통 스타일
│  └─ imgs/                    # 이미지
└─ tests/                      # 브라우저 모의 연동·Firestore 규칙 검사
```

주요 JavaScript 역할은 [pages/scripts/README.md](pages/scripts/README.md)에 정리되어 있습니다.

- `firebase_data.js`, `firebase_nav.js`: 인증·프로필·공통 사용자 영역
- `community_store.js`: 커뮤니티 DB 저장과 실시간 구독
- `account_state.js`: 개인 목록 DB 저장과 계정별 로컬 캐시
- `local_files.js`: 첨부파일 원본의 로컬 저장
- `sheet_functions.js`: PDF 보기·연습 설정·자동 넘기기 모듈 연결
- `score_storage.js`: 계정별 PDF 원본과 연습 설정 저장

## 검증

현재 저장소에는 다음 검사가 있습니다. 실행 도구는 별도 설치가 필요하며, 제품 실행에 npm 빌드를 요구하는 것은 아닙니다.

| 검사 | 명령 | 필요한 환경·검사 범위 |
| --- | --- | --- |
| 브라우저 모의 연동 | `node tests/browser_db_smoke.cjs` | Playwright와 Chrome. Firebase SDK를 대역으로 바꿔 화면·계정 구분·저장 흐름 검사 |
| Firestore 규칙 | 아래 명령 | Firebase CLI, Java 21 이상, `firebase`·`@firebase/rules-unit-testing`. 에뮬레이터에서 접근 허용·거부 검사 |

```sh
firebase emulators:exec --only firestore --project demo-ambient-db "node --test tests/firestore_rules.test.cjs"
```

두 검사 모두 실제 Firebase 프로젝트에 게시글을 작성하는 검사가 아닙니다. 실제 사용 전에는 규칙 게시 후 두 계정과 게스트로 공개 글 조회·개인 자료 접근 제한·새로고침 복원 등을 확인해야 합니다. 외부 음악 서비스의 실제 로그인·검색·재생도 별도로 확인해야 합니다.

## 남은 작업과 현재 제약

- 디깅 화면의 실제 음악 재생 연결
- PDF·첨부파일 원본의 기기 간 동기화와 다른 사용자에게 공유하는 기능
- 게시글 수정·삭제 화면과 프로필 편집 화면
- 악보의 마디·반복 기호 자동 인식, 실제 연주 템포 추적, 단계별 BPM·박자 설정
- 커뮤니티 데이터가 많아질 때 페이지 분할과 구독 범위 최적화
- 실제 배포 도메인에서 Firebase 인증·규칙과 외부 음악 서비스의 전체 흐름 검증

구현된 코드, 콘솔에 적용된 설정, 실제 서비스에서 확인한 결과는 구분해서 관리합니다.
