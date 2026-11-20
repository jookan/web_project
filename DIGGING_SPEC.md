# 음악 디깅 기능 명세

- 페이지: `pages/digging.html`
- 스크립트: `pages/scripts/digging.js`(시작점)와 `pages/scripts/digging/` 모듈
- 스타일: `pages/web_programming/css/digging.css`
- 담당: 이예찬

## 1. 개요

음악 디깅은 사용자의 Aurora 플레이리스트를 분석해 새 음악을 추천하는 페이지다.

1. Aurora(YouTube 모드)의 플레이리스트를 그대로 불러온다.
2. 곡마다 장르 태그를 추출해 플레이리스트의 장르 취향을 계산한다.
3. 취향과 **비슷한 장르**와 **겹치지 않는 장르**의 곡을 앨범 자켓 카드로 추천한다.
4. 마음에 드는 곡은 `+`로 담는다. YouTube에서 재생 가능한 영상을 찾아 Aurora 플레이리스트에 넣는다.
5. 재생은 Aurora에서 한다.

디깅과 Aurora는 같은 플레이리스트 데이터를 쓴다. 한쪽에서 바꾸면 다른 쪽에도 반영된다.

## 2. 화면 구성

| 영역 | 내용 |
| --- | --- |
| API 키 설정 | Last.fm 키 발급 안내(3단계)와 입력 칸. 저장하면 "저장됨 ✓"과 `키 변경` 버튼으로 바뀐다. YouTube 키가 없으면 Aurora에서 저장하라는 안내가 보인다. |
| 검색창 | 가수나 곡 제목으로 Last.fm 검색. 결과는 검색창 아래에 펼쳐진다. |
| 플레이리스트 패널 | Aurora와 같은 구성: 목록 선택, `＋`(새로 만들기), `✎`(이름 변경), `🗑`(삭제), `▶ Aurora에서 재생`, 곡 목록(썸네일·제목·가수·장르·✕). |
| 비슷한 장르 추천 | 제목에 사용한 장르를 표시하고, 앨범 자켓 카드 5장과 `🔄 다시 추천` 버튼이 있다. |
| 다른 장르 추천 | 위와 같은 형식이며, 플레이리스트에 없는 장르에서 고른다. |
| 대화창 | 만들기·이름 변경·삭제 확인 등에 쓰는 페이지 안 창. 브라우저 `alert`·`prompt`·`confirm` 창은 쓰지 않는다. |
| 곡 정보 창 | 앨범 자켓, 제목, 가수, 앨범, 장르(한국어 이름), 청취자 수, 재생 수, 길이, 한국어 소개(자동 번역이면 안내와 `원문 보기`), 외부 링크, 담기·재생 버튼. |
| 알림 | 화면 아래에 잠시 떴다가 사라지는 안내 문구(4.5초). |

## 3. 기능 목록

| ID | 기능 | 요약 |
| --- | --- | --- |
| F-01 | Last.fm API 키 저장·변경 | 사용자가 발급한 키를 브라우저에 저장 |
| F-02 | Aurora 플레이리스트 불러오기·선택 | Aurora의 YouTube 목록 표시, 선택 목록 공유 |
| F-03 | 플레이리스트 만들기 | 페이지 안 대화창으로 이름 입력 |
| F-04 | 플레이리스트 이름 변경 | 현재 목록 이름 변경 |
| F-05 | 플레이리스트 삭제 | 확인 후 삭제(마지막 목록은 불가) |
| F-06 | 곡 빼기 | 현재 목록에서 곡 제거 |
| F-07 | Aurora에서 재생 | 저장을 마친 뒤 Aurora로 이동 |
| F-08 | 장르 추출 | YouTube 태그 → Last.fm → MusicBrainz |
| F-09 | 비슷한 장르 추천 | 상위 장르의 인기곡 추천 |
| F-10 | 다른 장르 추천 | 겹치지 않는 장르의 인기곡 추천 |
| F-11 | 곡 검색 | Last.fm 곡 검색 |
| F-12 | 곡 담기 | YouTube 영상을 찾아 Aurora 목록에 추가 |
| F-13 | 곡 정보 보기 | 앨범 자켓·곡 정보 창, 곡 소개 한국어 표시 |
| F-14 | 예전 디깅 곡 옮기기 | 예전 디깅 전용 목록을 Aurora 목록으로 이전 |
| F-15 | 다른 탭과 동기화 | Aurora 탭과 플레이리스트·키 변경 공유 |

### F-01 Last.fm API 키 저장·변경

| 항목 | 내용 |
| --- | --- |
| 입력 | Last.fm에서 발급한 API key(영문·숫자 32자리) |
| 처리 | 형식(`/^[0-9a-f]{32}$/i`)을 검사한 뒤 `ambient-lastfm-key:{uid}`에 저장한다. 저장하면 장르 분석·추천·검색 결과를 새 키로 다시 불러온다. |
| 출력 | 입력 칸 대신 "Last.fm API 키 저장됨 ✓"과 `키 변경` 버튼을 보여준다. `키 변경`은 키를 지우고 입력 칸을 다시 보여준다. |
| 예외 | 형식이 틀림 → "영문/숫자 32자리" 알림 · 브라우저 저장소 차단 → 저장 실패 알림 · Last.fm 오류 10/26(잘못된·정지된 키) → "키가 올바르지 않아요" 문구 |
| 원칙 | 키는 코드·Git·Firestore 어디에도 넣지 않는다. 사용자마다 자기 키를 쓴다. |

YouTube 키는 Aurora에서 입력한 `ambient-yt-key:{uid}`를 같이 쓴다. 키가 없으면 안내 문구가 보이고, 곡 담기(F-12)와 옮기기(F-14)를 할 수 없다.

### F-02 Aurora 플레이리스트 불러오기·선택

| 항목 | 내용 |
| --- | --- |
| 처리 | 계정 저장소 `users/{uid}/appData/aurora`를 연다. 게스트는 브라우저에만 저장된다. `mode: "youtube"` 목록만 선택 칸에 `이름 (곡 수)`로 보여준다. YouTube 목록이 하나도 없으면 "내 플레이리스트"를 만들어 둔다. |
| 선택 | 목록을 바꾸면 `current.youtube`에 저장한다. Aurora를 열면 같은 목록이 선택되어 있다. |
| 곡 표시 | 썸네일, 제목(굵게), "가수 · 장르(최대 3개)". 같은 곡(가수+정리된 제목)은 한 번만 표시한다. |
| 예외 | 서버에서 읽지 못하면 화면 상단에 오류를 표시한다. 이때 로컬 기본값으로 서버 데이터를 덮어쓰지 않는다(`account_state.js`). |

### F-03 ~ F-05 플레이리스트 만들기·이름 변경·삭제

| 기능 | 대화창 | 처리 | 제약·예외 |
| --- | --- | --- | --- |
| 만들기 `＋` | 제목 "새 플레이리스트", 이름 입력, `만들기` | YouTube 목록을 새로 만들고 현재 목록으로 선택한다. | 빈 이름 → 대화창 안에 "이름을 입력해주세요." · 이름은 최대 40자 |
| 이름 변경 `✎` | 현재 이름이 선택된 입력 칸, `변경` | 현재 목록의 이름을 바꾼다. | 같은 이름이거나 취소하면 아무것도 하지 않는다. |
| 삭제 `🗑` | "\"이름\" (N곡)을 삭제할까요? Aurora에서도 함께 삭제돼요.", 빨간 `삭제` | 목록을 지우고 남은 첫 YouTube 목록을 선택한다. | YouTube 목록이 하나뿐이면 "마지막 플레이리스트는 삭제할 수 없어요." |

대화창 공통 동작은 다음과 같다.

- Enter를 누르면 확인된다.
- Esc, `취소`, 창 바깥 클릭은 모두 취소로 처리한다.
- 창이 이미 열려 있으면 새 창을 열지 않는다.

### F-06 곡 빼기 / F-07 Aurora에서 재생

- **곡 빼기(✕):** 현재 목록에서 그 곡의 Aurora 트랙 id를 지우고 장르와 추천을 다시 계산한다.
- **Aurora에서 재생:** 다음 순서로 동작한다.
  1. Aurora 모드를 `youtube`로 저장한다.
  2. 남은 저장(`flush`)을 끝낸다.
  3. `aurora.html`로 이동한다.

### F-08 장르 추출

곡마다 다음 순서로 장르를 정한다. 곡 하나에는 최대 5개까지 붙는다.

1. **YouTube 영상 태그:** 담을 때 저장한 `tags`(예전 곡은 `genre` 문자열)에서 장르 사전(`GENRE_VOCAB`)에 있는 것만 장르로 인정한다.
2. **Last.fm 곡 태그:** `track.getTopTags`
3. **Last.fm 가수 태그:** 곡 태그가 없을 때 `artist.getTopTags`를 쓴다.
4. **MusicBrainz 가수 장르:** 1~3에서 장르를 하나도 찾지 못했을 때만 쓴다.

태그 정리 규칙은 다음과 같다.

- 소문자로 바꾸고, 표기가 다른 같은 장르는 하나로 합친다(`hip hop`→`hip-hop`, `발라드`→`ballad` 등 `TAG_ALIASES`).
- 다음 태그는 장르에서 뺀다.
  - 장르가 아닌 태그: `seen live`, `favorites` 등(`TAG_BLACKLIST`)
  - 연도: `1990s` 등
  - 가수 이름과 같은 태그
  - 30자를 넘는 태그
- Last.fm 태그는 투표 점수 20 이상만 쓴다. 기준을 넘는 태그가 없으면 상위 2개를 쓴다.

캐시와 진행 표시는 다음과 같다.

- 외부 API 결과는 `musicdig_tag_cache_v1`에 곡 id별로 저장한다.
- 태그가 없다는 정상 응답은 `[]`로 기억해 다시 묻지 않는다. 오류가 났을 때는 기억하지 않아 다음에 다시 시도한다.
- 아직 장르를 모르는 곡만 한 곡씩 차례로 조회하고, 그동안 추천 칸에 "태그를 추출하는 중... (N곡)"을 보여준다.
- 조회 중 플레이리스트가 바뀌면 이전 작업은 멈추고 새 작업이 이어받는다.

### F-09 비슷한 장르 추천 / F-10 다른 장르 추천

**장르 프로필:** 곡마다 앞쪽 장르일수록 높은 점수를 준다. 장르가 n개인 곡은 첫 장르에 n점, 다음 장르에 n−1점을 준다. 플레이리스트 전체 점수를 더해 순위를 매긴다.

| 구분 | 사용할 장르 | 제목 예 |
| --- | --- | --- |
| 비슷한 장르 | 점수 상위 3개 | 플레이리스트와 비슷한 장르 (jazz, piano) |
| 다른 장르 | `DIFFERENT_TAG_POOL`(24개) 중 플레이리스트 장르와 같거나 서로 포함하지 않는 것 무작위 3개 | 플레이리스트와 다른 장르 (folk, metal, electronic) |

곡을 고르는 방법은 다음과 같다.

1. 장르마다 Last.fm `tag.getTopTracks`에서 30곡을 받는다. 매번 다른 곡이 나오도록 1~3페이지 중 하나를 무작위로 고르고, 비어 있으면 1페이지를 받는다.
2. 이미 플레이리스트에 있는 곡과 중복 곡을 뺀다.
3. 남은 곡을 섞어 5곡을 고른다.

추천 카드와 다시 추천은 다음과 같다.

- 카드에는 앨범 자켓, 제목, 가수, 담기 상태(`+` / `YouTube에서 찾는 중…` / `담김`)가 보인다.
- 자켓은 카드를 그린 뒤 `track.getInfo`로 채운다. Last.fm 기본 별 이미지나 빈 이미지는 ♪로 대신한다.
- 플레이리스트 곡 구성이 바뀔 때만 추천을 새로 받는다. 담기 상태만 바뀌면 다시 요청하지 않고 버튼만 다시 그린다.
- `🔄 다시 추천`은 그 칸만 새로 받는다.

| 상황 | 문구 |
| --- | --- |
| 플레이리스트가 비어 있음 | 플레이리스트에 노래를 담으면 비슷한/다른 장르를 추천해드려요. |
| 곡에서 장르를 못 찾음 | 플레이리스트 곡에서 장르 태그를 찾지 못했어요. |
| 후보 곡 없음 | 추천할 곡을 찾지 못했어요. 다시 추천을 눌러보세요. |
| 모든 장르 요청 실패 | 첫 오류 메시지(예: Last.fm 키 안내) |

### F-11 곡 검색

| 항목 | 내용 |
| --- | --- |
| 입력 | 곡 제목 또는 `가수 - 제목` |
| 처리 | 입력을 멈추고 0.4초 뒤 Last.fm `track.search`(최대 10곡)를 호출한다. Enter를 누르면 바로 검색한다. `가수 - 제목` 형식이면 가수와 제목을 나눠 검색한다. |
| 출력 | "제목 - 가수"와 담기 버튼 |
| 닫기 | Esc, 검색 영역 바깥 클릭, 입력 칸 비우기 |
| 예외 | 결과 없음 → 영어 표기나 `가수 - 제목` 형식으로 검색하라는 안내. 늦게 도착한 이전 검색 응답은 버린다. |

### F-12 곡 담기

| 항목 | 내용 |
| --- | --- |
| 조건 | YouTube 키가 있고, 아직 담기지 않았고, 찾는 중이 아닌 곡 |
| 처리 | ① YouTube `search`(음악 분류, 임베드 가능, 최대 8개) ② `videos`로 길이 60~720초, 라이브 아님, 한국(KR)에서 볼 수 있는 영상만 남김 ③ 공식 음원(Topic 채널)을 우선 ④ oEmbed로 임베드 허용 확인 ⑤ Aurora 트랙 형식으로 현재 목록에 추가 |
| 저장 형식 | `{ id: "yt:"+영상id, source: "youtube", vid, title, artist, topic, album, art, thumb, tags, genre }` |
| 비용 | 곡 하나에 YouTube API 할당량 약 101(search 100 + videos 1) |
| 예외 | 키 없음 · 이미 담긴 곡 · 재생 가능한 영상 없음 · YouTube 오류(할당량 초과 포함) → 알림 |

### F-13 곡 정보 보기

| 항목 | 내용 |
| --- | --- |
| 여는 방법 | 추천 카드의 앨범 자켓, 또는 플레이리스트 곡 클릭 |
| 처리 | 기본 정보(제목·가수·장르)를 먼저 보여주고, Last.fm `track.getInfo` 결과가 오면 채운다. 같은 곡의 정보는 한 번만 요청한다. 실패하면 캐시하지 않아 다음에 다시 시도한다. |
| 표시 | 앨범 자켓, 앨범명, 장르(한국어 이름으로 표시), 청취자 수, 재생 수, 길이, **한국어 곡 소개**, `Last.fm에서 보기`, `YouTube에서 보기`(담긴 곡은 영상, 아니면 검색 결과) |
| 버튼 | 담긴 곡: "플레이리스트에 담김 ✓" + `▶ Aurora에서 재생` / 아닌 곡: `＋ 플레이리스트에 담기` |
| 닫기 | ✕, Esc, 창 바깥 클릭 |
| 예외 | Last.fm 키 없음 → 기본 정보만 표시 · 소개 없음 → "Last.fm에 등록된 곡 소개가 없어요." · 다른 곡을 연 뒤 늦게 온 응답은 버린다. |

#### 곡 소개 한국어 표시

Last.fm 곡 소개는 대부분 영어로만 작성되어 있다. 그래서 아래 순서로 한국어 소개를 준비한다. 준비하는 동안에는 "곡 소개를 한국어로 준비하는 중…"을 보여준다.

1. **Last.fm 한국어 소개:** `track.getInfo`를 `lang=ko`로 한 번 더 요청한다. 한글이 들어 있으면 그대로 보여준다.
2. **브라우저 내장 번역기:** Chrome Translator API로 영어 소개를 번역한다.
   - 번역은 기기 안에서 하고, 키나 사용량 제한이 없다.
   - 번역 모델을 처음 내려받으려면 사용자 클릭이 필요하다. 그래서 곡 정보 창을 여는 클릭 순간에 준비를 시작한다.
   - 내려받는 동안에는 기다리지 않고 3번을 쓴다. 다음에 창을 열 때부터 내장 번역기를 쓴다.
3. **MyMemory 무료 번역 API:** 영어 소개를 문장 단위로 450자 이하씩 나눠 번역한다. 키는 필요 없지만 하루 사용량 제한이 있다.
4. **원문:** 2와 3이 모두 실패하면 영어 원문을 보여주고, "번역하지 못해 Last.fm 원문(영어)을 보여드려요."라고 안내한다.

번역 결과의 표시와 저장은 다음과 같다.

- 자동 번역한 소개 아래에는 "Last.fm 영어 소개를 자동 번역했어요. (브라우저 번역 / MyMemory 번역)"을 표시한다.
- `원문 보기`를 펼치면 영어 원문을 볼 수 있다.
- 번역 결과는 `musicdig_ko_summary_v1`에 곡 id별로 최대 200곡까지 저장한다. 같은 소개는 다시 번역하지 않는다. 200곡을 넘으면 오래된 것부터 지운다.
- 번역기 응답은 8초까지만 기다린다. 응답이 없으면 다음 방법으로 넘어간다.

장르는 저장과 분석에는 영어 이름(`jazz`)을 쓴다. 곡 정보 창에서만 한국어 이름(`재즈`)으로 보여주고, 원래 이름은 마우스를 올리면 보인다(`GENRE_LABELS_KO`). 사전에 없는 장르는 영어로 보여준다.

### F-14 예전 디깅 곡 옮기기

Aurora와 연동하기 전에는 디깅 전용 곡 목록이 따로 있었다. 이 기능은 그 곡들을 Aurora 플레이리스트로 옮긴다.

| 항목 | 내용 |
| --- | --- |
| 대상 | 계정의 `appData/digging`과 계정 구분 전 브라우저 목록 `musicdig_playlist_v2`의 곡 중, 아직 옮기지 않았고 현재 목록에 없는 곡 |
| 표시 | 대상이 있을 때만 플레이리스트 패널에 `예전 디깅 곡 N곡 Aurora로 옮기기` 버튼이 보인다. |
| 처리 | ① 할당량 사용(곡당 약 100)을 알리는 확인 창 ② 곡마다 F-12와 같은 방법으로 영상 찾기(버튼에 "옮기는 중… (i/N)") ③ 찾은 곡을 현재 목록에 한 번에 추가 ④ 옮긴 곡 id를 `musicdig_moved_to_aurora:{uid}`에 기억 ⑤ 예전 장르는 장르 캐시에 넣어 재조회를 줄임 |
| 결과 | "N곡을 Aurora 플레이리스트로 옮겼어요." + 찾지 못한 곡(최대 5개 표시) |
| 예외 | YouTube 키 없음 → 안내 · 할당량 초과 → 그 자리에서 멈추고 남은 곡은 다음에 옮길 수 있음 |
| 원칙 | 예전 목록 원본은 지우지 않는다. 디깅은 `appData/digging`에 새로 저장하지 않는다. |

### F-15 다른 탭과 동기화

- Aurora 탭에서 목록을 바꾸면, 디깅 탭이 같은 계정의 로컬 캐시 키 `ambient-player-v1:{uid}`의 `storage` 이벤트를 받아 다시 그린다.
- 디깅에서 저장해도 같은 키가 바뀌므로, 열려 있는 Aurora 탭에 반영된다.
- 다른 탭에서 YouTube·Last.fm 키를 저장하거나 지우면 키 안내 영역을 갱신한다.
- 디깅은 저장할 때 항상 최신 값을 복사해 고친다. 그래서 다른 탭에서 바꾼 내용을 오래된 값으로 덮어쓰지 않는다.

## 4. 데이터

### 저장 위치

| 데이터 | 위치 | 비고 |
| --- | --- | --- |
| 플레이리스트(Aurora와 공용) | Firestore `users/{uid}/appData/aurora` + 로컬 캐시 `ambient-player-v1:{uid}` | 게스트는 로컬만 · 문서 최대 800,000바이트 |
| 예전 디깅 곡 | Firestore `users/{uid}/appData/digging`, 로컬 `musicdig_playlist_v2` | 읽기 전용(옮기기용) |
| 옮긴 곡 id | 로컬 `musicdig_moved_to_aurora:{uid}` | |
| Last.fm 키 | 로컬 `ambient-lastfm-key:{uid}` | DB에 보내지 않음 |
| YouTube 키 | 로컬 `ambient-yt-key:{uid}` | Aurora에서 입력 |
| 장르 캐시 | 로컬 `musicdig_tag_cache_v1` | 곡 id → 장르 배열 |
| 번역한 곡 소개 | 로컬 `musicdig_ko_summary_v1` | 곡 id → `{ source, text, engine }`, 최대 200곡 |
| 곡 정보 | 메모리(페이지를 닫으면 사라짐) | `track.getInfo` 결과 |

### 플레이리스트 형식

```js
{
  playlists: [
    { id: "a1b2c3d", name: "밤 산책", mode: "youtube", tracks: [ /* F-12 저장 형식 */ ] }
  ],
  current: { youtube: "a1b2c3d" }
}
```

### 디깅 곡 객체

```js
{
  id: "miles davis|||blue in green",  // "가수|||꼬리 뗀 제목" 소문자, 중복 판단 기준
  title, artist,
  genres: ["jazz", "cool jazz"],      // 최대 5개
  // 플레이리스트 곡만: trackId, ytTags, thumb, art, vid
  // 추천 곡: art(자켓), album
}
```

제목의 `(feat. ...)`, `[MV]`, `| ...` 같은 꼬리는 id를 만들 때 뗀다. 그래서 YouTube 제목과 Last.fm 제목이 달라도 같은 곡으로 본다.

## 5. 외부 API

| API | 사용처 | 호출 시점 | 키 |
| --- | --- | --- | --- |
| Last.fm `track.search` | F-11 검색 | 입력 후 0.4초 | Last.fm |
| Last.fm `track.getTopTags`, `artist.getTopTags` | F-08 장르 | 장르를 모르는 곡마다(캐시) | Last.fm |
| Last.fm `tag.getTopTracks` | F-09·F-10 추천 | 추천 칸마다 장르 3개 | Last.fm |
| Last.fm `track.getInfo` | F-13 곡 정보, 추천 자켓 | 추천 카드마다 1회(캐시) | Last.fm |
| Last.fm `track.getInfo` (`lang=ko`) | F-13 한국어 곡 소개 | 곡 정보 창을 열 때 1회(캐시) | Last.fm |
| Chrome Translator API | F-13 소개 번역 | 한국어 소개가 없을 때 | 없음 · 기기 안에서 번역 |
| MyMemory `get` | F-13 소개 번역(예비) | 내장 번역기를 쓸 수 없을 때 | 없음 · 하루 사용량 제한 |
| MusicBrainz `artist` 검색 | F-08 장르 보완 | 다른 방법으로 장르를 못 찾은 곡 | 없음 · 1.1초 간격으로 순서대로 |
| YouTube `search`, `videos` | F-12·F-14 영상 찾기 | 곡을 담을 때 | YouTube · 곡당 약 101 |
| YouTube oEmbed | F-12·F-14 임베드 확인 | 후보 영상마다 | 없음 |

## 6. 코드 구성

`digging.js`는 화면 그리기와 이벤트 연결을 맡는다. 데이터 처리는 `digging/` 모듈이 맡는다. 화면 요소는 모두 `textContent`로 채워 곡 제목에 HTML이 섞여 있어도 실행되지 않는다.

| 파일 | 역할 | 주요 함수 |
| --- | --- | --- |
| `digging.js` | 시작점, 화면·이벤트 | `syncFromAurora`, `renderPlaylist`, `loadRecommendations`, `addToPlaylist`, `runSearch` |
| `digging/config.js` | 설정값·저장 키·장르 사전 | `storageKeys`, `GENRE_VOCAB`, `TAG_ALIASES` |
| `digging/utils.js` | 작은 도우미 | `makeSong`, `cleanTitle`, `mergeGenres`, `readJson`, `writeStorage` |
| `digging/api.js` | 키 보관, API 호출 | `lastfm`, `musicbrainz`, `youtube`, `isEmbeddable`, `saveLastfmKey` |
| `digging/genres.js` | 장르 추출, 캐시 | `lookupExternalGenres`, `songGenres`, `genresFromYouTubeTags`, `cleanTags` |
| `digging/playlist_store.js` | Aurora 공용 플레이리스트 | `currentSongs`, `createList`, `renameList`, `deleteList`, `addTracks`, `removeTrack` |
| `digging/music_lookup.js` | 검색, 영상 찾기, 곡 정보 | `searchTracks`, `findYouTubeTrack`, `getSongInfo` |
| `digging/recommend.js` | 추천 | `getProfile`, `similarTags`, `differentTags`, `collectRecommendations` |
| `digging/ui.js` | 요소·알림·대화창 | `makeCover`, `notify`, `openDialog` |
| `digging/song_dialog.js` | 곡 정보 창, 한국어 소개 표시 | `showSongInfo`, `refreshSongActions` |
| `digging/translate.js` | 곡 소개 한국어 번역, 번역 캐시 | `toKorean`, `prepareTranslator` |
| `digging/legacy_migration.js` | 예전 곡 옮기기 | `legacySongs`, `migrateLegacySongs` |

화면이 갱신되는 흐름은 다음과 같다.

```text
페이지 열기 / 목록 변경 / 다른 탭 저장
  → syncFromAurora()
     → playlistStore.currentSongs()      플레이리스트 읽기
     → renderPlaylist()                  패널 그리기
     → lookupExternalGenres(곡)          모르는 장르만 차례로 조회
     → 곡 구성이 바뀌었으면 loadRecommendations("similar" / "different")
```

여러 요청이 겹칠 수 있는 곳(검색, 추천 두 칸, 장르 분석, 곡 정보 창)은 요청마다 번호를 매긴다. 늦게 도착한 이전 응답은 화면에 반영하지 않는다.

## 7. 제약과 알려진 한계

- Last.fm 키가 없으면 장르 분석(YouTube 태그로 찾은 장르 제외), 추천, 검색, 곡 정보를 쓸 수 없다.
- YouTube 무료 할당량은 하루 10,000이다. 곡 담기는 곡당 약 101을 쓰므로 하루에 약 99곡까지 담을 수 있다.
- Last.fm 추천 곡에는 앨범 자켓이 없는 경우가 있다. 이때는 ♪로 표시한다.
- 곡 소개 자동 번역은 기계 번역이라 어색한 표현이 있을 수 있다. 그래서 원문을 함께 볼 수 있게 했다.
- Chrome 내장 번역기를 지원하지 않는 브라우저와 아직 모델을 내려받지 않은 경우에는 MyMemory를 쓴다. MyMemory의 하루 사용량을 넘으면 영어 원문을 보여준다.
- 번역을 위해 곡 소개(Last.fm에 공개된 글)를 MyMemory로 보낸다. 사용자 정보는 보내지 않는다.
- 같은 목록을 여러 기기에서 동시에 고치면 마지막으로 저장한 내용이 남는다(Aurora와 같은 정책).
- Aurora는 아직 플레이리스트 만들기·삭제에 브라우저 `prompt`·`confirm` 창을 쓴다(Aurora 담당 영역).

## 8. 검증

`tests/browser_db_smoke.cjs`(Playwright, Firebase SDK 대역)의 디깅 부분은 다음을 확인한다.

- Aurora 목록이 선택 칸에 보이고, YouTube 태그(`jazz`)가 곡 장르로 표시된다.
- 예전 디깅 곡 중 Aurora에 없는 곡만 `예전 디깅 곡 1곡 Aurora로 옮기기`에 잡힌다.
- `✕`가 Aurora 계정 데이터에서 곡을 뺀다.
- 페이지 안 대화창으로 플레이리스트를 만들고 이름을 바꾸면 Aurora 계정 데이터에 저장된다.
- Last.fm 키가 `ambient-lastfm-key:{uid}`에만 저장된다.
- 디깅 페이지에서 브라우저 `alert`·`prompt`·`confirm` 창이 한 번도 뜨지 않는다.

```sh
node tests/browser_db_smoke.cjs
```

외부 API(Last.fm·YouTube)는 테스트에서 막혀 있다. 추천 카드와 곡 정보 창은 실제 키로 브라우저에서 확인한다.
