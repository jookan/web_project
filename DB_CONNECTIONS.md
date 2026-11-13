# Firebase 데이터 연결

## 콘솔에 적용할 설정

이 저장소의 `firestore.rules` 전체를 Firebase 콘솔 → Firestore → 규칙에 붙여넣고 게시한다.
기존 `users/{uid}` 규칙만으로는 커뮤니티와 하위 컬렉션 접근이 허용되지 않는다.
규칙을 게시하기 전의 `permission-denied`는 코드만 변경해서 해결할 수 없다.

Firebase CLI를 이미 사용하는 환경에서는 다음 명령으로 같은 규칙을 배포할 수 있다.

```sh
firebase deploy --only firestore:rules --project webproject-f06f1
```

Google 로그인과 승인된 도메인은 기존 설정을 사용한다. 이메일·비밀번호 폼도 Firebase
Authentication으로 연결했으며, 이 방식을 사용하려면 콘솔에서 이메일/비밀번호 공급자를
추가로 활성화해야 한다. 활성화하지 않아도 Google 로그인은 사용할 수 있다.

## 저장 위치

| 기능 | Firestore 경로 | 접근 범위 |
| --- | --- | --- |
| 비공개 프로필 | `users/{uid}` | 본인만 읽기·수정 |
| 커뮤니티용 이름·사진 주소 | `publicProfiles/{uid}` | 공개 조회, 본인만 저장 |
| 게시글·첨부 이름/크기/종류 | `posts/{postId}` | 공개 조회, 작성자만 생성·수정·삭제 |
| 댓글·답글 | `comments/{commentId}` | 공개 조회, 로그인한 본인 명의로 생성 |
| 좋아요 | `postLikes/{postId}_{uid}` | 공개 조회, 본인의 항목만 생성·삭제 |
| 팔로우 | `follows/{uid}_{targetUid}` | 공개 조회, 본인의 항목만 생성·삭제 |
| 예전 디깅 곡 목록 (Aurora로 옮기기용, 새로 저장하지 않음) | `users/{uid}/appData/digging` | 본인만 접근 |
| Aurora 플레이리스트·선택 목록 | `users/{uid}/appData/aurora` | 본인만 접근 |
| PDF 정보·연습 설정 | `users/{uid}/scores/{scoreId}` | 본인만 접근 |

게시글·댓글·좋아요·팔로우는 실시간 구독으로 갱신한다. 사용자를 표시 이름이 아닌 UID로
구분하므로 동명이인의 활동이 합쳐지지 않는다. 현재 피드 구현은 각 커뮤니티 컬렉션을
구독하므로 데이터가 많아질 때에는 페이지 분할과 게시글별 구독으로 확장할 필요가 있다.

개인 플레이리스트는 페이지를 열 때 읽고 변경할 때 순서대로 저장한다. 여러 기기에서
동시에 같은 목록을 수정하면 마지막으로 저장된 내용이 적용된다. 한 저장 문서의
JSON은 UTF-8 800,000바이트까지 허용하며 초과하면 로컬에 보관하고 원격 저장 실패를 표시한다.
기존 서버 데이터를 읽지 못하면 로컬 기본값으로 서버 문서를 덮어쓰지 않는다.

## 파일 원본과 브라우저 데이터

사용자 결정에 따라 Cloud Storage는 연결하지 않는다.

- PDF 원본: UID별 IndexedDB `sheet-music-library-{uid}`에 보관한다.
- 악보 설정: BPM, 박 수, 연주 순서, 메트로놈, 마지막 페이지와 파일 정보를 Firestore에 저장한다.
- 다른 기기에서 원본이 없는 악보는 `PDF 선택 필요`로 표시한다. 같은 PDF를 선택하면
  파일 내용의 SHA-256으로 설정을 찾아 복원한다. 예전 파일 ID도 기존 자료를 복구할 때 유지한다.
- 게시글 첨부 원본: IndexedDB `ambient-local-attachments`에 `uid:postId:순서`로 보관한다.
  다른 기기/다른 사용자에게는 파일 정보만 보인다. `이 기기에서 열기`는 작성자 본인이
  원본을 보관한 브라우저에서만 동작한다.
- 게스트는 커뮤니티를 읽을 수 있고 개인 곡 목록·악보는 브라우저에만 저장한다.
  게시글·댓글·좋아요·팔로우를 저장하려면 로그인해야 한다.
- 곡 태그 캐시는 외부 API 요청 절약을 위해 브라우저에 유지한다.
- Spotify 인증 토큰·PKCE 값과 YouTube·Last.fm API 키는 UID별 브라우저 저장소에만 두며 DB에 보내지 않는다.
  (`ambient-yt-key:{uid}`, `ambient-lastfm-key:{uid}`) 키는 각 사용자가 직접 발급받아 화면에서 입력한다.
  로컬 개발의 `localhost`와 `127.0.0.1`은 서로 다른 사이트 저장소이므로 각각 로그인/서비스 연결이 필요하다.

## 기존 자료 가져오기

예전 계정 구분 없는 데이터는 삭제하지 않으며 다른 계정에 자동으로 가져오지 않는다.

- 디깅: 디깅은 이제 Aurora 플레이리스트(`appData/aurora`)를 함께 쓴다. 예전 디깅 목록(`appData/digging`과
  계정 구분 전 `musicdig_playlist_v2`)에 남은 곡은 `예전 디깅 곡 N곡 Aurora로 옮기기`로 YouTube 영상을 찾아
  현재 Aurora 목록에 담는다. 원본은 지우지 않고, 옮긴 곡 id만 `musicdig_moved_to_aurora:{uid}`에 기억한다.
- Aurora: `기존 브라우저 목록 가져오기`로 현재 계정 목록에 합친다.
- 악보: `기존 브라우저 악보 가져오기`로 원래 IndexedDB의 PDF와 설정을 복사한다.
- 예전 커뮤니티 예시 글/댓글과 이름 기반 팔로우는 실사용자의 UID를 검증할 수 없으므로
  공유 DB에 자동 게시하지 않는다. `musicdig_posts`, `musicdig_following_*` 원본은 그대로 남는다.

## 검증

JavaScript는 모듈 문법으로 검사한다. `tests/browser_db_smoke.cjs`는 Playwright와 SDK 대역을
사용해 실제 HTML에서 글쓰기·댓글·좋아요·팔로우·프로필, 로컬 첨부, 플레이리스트,
악보 설정, 계정 구분, 로그인 유지 선택과 로그아웃을 검사한다. 실제 Firebase에는 요청하지 않는다.

Playwright가 Node 모듈 경로에 설치된 환경에서:

```sh
node tests/browser_db_smoke.cjs
```

기본 브라우저는 설치된 Chrome의 임시 프로필이며 기존 Chrome 계정 데이터에 접근하지 않는다.
다른 Playwright 브라우저 채널은 `PLAYWRIGHT_BROWSER_CHANNEL`로 지정한다.
이 검사는 Firebase 서버의 보안 규칙 검증을 대신하지 않는다. 규칙 게시 후 실제 계정 A/B와
로그아웃 상태로 본인 자료 접근/다른 계정 자료 거부를 별도 확인해야 한다.

`tests/firestore_rules.test.cjs`는 Firebase의 공식 `@firebase/rules-unit-testing`과
Firestore 에뮬레이터로 규칙의 허용/거부를 검사한다. Java 21 이상과 테스트 도구가 설치된
환경에서 다음 명령을 사용한다. `demo-` 프로젝트이므로 실제 프로젝트 데이터에 접속하지 않는다.

```sh
firebase emulators:exec --only firestore --project demo-ambient-db "node --test tests/firestore_rules.test.cjs"
```

구현 시 검증 결과: JavaScript 24개 문법/상대 import와 HTML 리소스 경로 검사 통과,
SDK 대역을 사용한 브라우저 통합 검사 통과, 공식 에뮬레이터의 보안 규칙 검사 12개 통과.
실제 프로젝트에 대한 규칙 게시와 실제 계정의 전체 흐름 검증은 별도 단계다.
