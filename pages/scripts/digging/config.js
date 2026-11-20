// ============================================================
// digging/config.js - 디깅 페이지 설정값과 장르 사전
//   숫자·주소·저장 키·장르 목록처럼 동작을 조절하는 값만 모아 둔다. (로직 없음)
// ============================================================

// ---------- 외부 API 주소 ----------
export const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";
export const MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2/";
export const YOUTUBE_URL = "https://www.googleapis.com/youtube/v3/";
export const YOUTUBE_OEMBED_URL = "https://www.youtube.com/oembed";
export const MYMEMORY_URL = "https://api.mymemory.translated.net/get";   // 곡 소개 자동 번역(예비)

// ---------- 동작 조절 ----------
export const RECOMMEND_COUNT = 5;           // 추천 칸마다 보여줄 곡 수
export const SEARCH_DELAY = 400;            // 타이핑을 멈추고 검색을 시작하기까지 대기(ms)
export const SEARCH_LIMIT = 10;             // 검색 결과 최대 곡 수
export const MIN_TAG_COUNT = 20;            // Last.fm 태그 투표 수 최소 기준(0~100)
export const SIMILAR_TAG_LIMIT = 3;         // '비슷한 장르' 추천에 쓸 상위 장르 수
export const DIFFERENT_TAG_LIMIT = 3;       // '다른 장르' 추천에 쓸 장르 수
export const MAX_GENRES = 5;                // 곡 하나에 붙일 최대 장르 수
export const MUSICBRAINZ_INTERVAL = 1100;   // MusicBrainz 초당 1회 제한 → 요청 간격(ms)
export const TOAST_DURATION = 4500;         // 알림 표시 시간(ms)
export const PLAYLIST_NAME_MAX = 40;        // 플레이리스트 이름 최대 길이
export const TRANSLATE_CHUNK = 450;         // MyMemory에 한 번에 보내는 최대 글자 수(제한 500)
export const TRANSLATE_CACHE_MAX = 200;     // 번역 결과를 기억할 최대 곡 수
export const BROWSER_TRANSLATE_TIMEOUT = 8000;  // 브라우저 번역기 응답 대기(ms)
export const MYMEMORY_TIMEOUT = 8000;           // MyMemory 요청 하나의 응답 대기(ms)

// YouTube에서 '노래'로 인정할 영상 길이(초)
export const MIN_VIDEO_SECONDS = 60;
export const MAX_VIDEO_SECONDS = 720;
export const REGION = "KR";

// Last.fm이 이미지가 없을 때 주는 기본 별 이미지의 파일 이름
export const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

// ---------- 브라우저 저장 키 ----------
// API 키·모드는 계정(UID)별로 나눠 저장한다. DB에는 보내지 않는다.
export const storageKeys = uid => ({
    lastfmKey: "ambient-lastfm-key:" + uid,          // 이 페이지에서 입력하는 Last.fm 키
    youtubeKey: "ambient-yt-key:" + uid,             // Aurora에서 입력한 YouTube 키(같이 사용)
    auroraMode: "ambient-mode:" + uid,               // Aurora를 열 때의 모드
    movedToAurora: "musicdig_moved_to_aurora:" + uid, // Aurora로 옮긴 예전 디깅 곡 id 목록
});
export const TAG_CACHE_KEY = "musicdig_tag_cache_v1";  // 곡 id -> 외부 API 장르 (계정과 무관한 공용 캐시)
export const TRANSLATE_CACHE_KEY = "musicdig_ko_summary_v1";  // 곡 id -> 한국어로 번역한 곡 소개

// 계정 저장소 이름 (account_state.js의 openAccountState 인자)
export const AURORA_STATE = { name: "aurora", legacyKey: "ambient-player-v1" };
export const LEGACY_DIGGING_STATE = { name: "digging", legacyKey: "musicdig_playlist_v2" };

// ---------- 장르 사전 ----------
// '다른 장르' 추천 후보. 플레이리스트 장르와 겹치지 않는 것 중에서 고른다.
export const DIFFERENT_TAG_POOL = [
    "jazz", "metal", "electronic", "classical", "hip-hop", "country",
    "reggae", "blues", "folk", "punk", "soul", "funk", "ambient",
    "house", "latin", "bossa nova", "shoegaze", "disco", "gospel",
    "techno", "ska", "soundtrack", "lo-fi", "city pop",
];

// YouTube 영상 태그에는 가수 이름·곡 제목 등이 섞여 있어서, 이 목록에 있는 장르만 골라 쓴다.
export const GENRE_VOCAB = new Set([
    ...DIFFERENT_TAG_POOL,
    "pop", "k-pop", "j-pop", "c-pop", "rock", "indie", "indie pop", "indie rock",
    "alternative", "alternative rock", "hip-hop", "rap", "trap", "r&b", "neo-soul",
    "ballad", "dance", "edm", "electropop", "synthpop", "dream pop", "pop rock",
    "pop punk", "hard rock", "heavy metal", "metalcore", "emo", "grunge", "post-rock",
    "acoustic", "singer-songwriter", "trot", "j-rock", "k-indie", "k-rock",
    "k-hip-hop", "k-r&b", "anime", "chill", "chillout", "new age", "instrumental",
    "piano", "dubstep", "drum and bass", "future bass", "idm", "garage", "grime",
    "electronica", "trance", "synthwave", "jazz hip-hop", "orchestral",
]);

// 장르가 아닌 Last.fm 태그는 걸러낸다. 필요하면 계속 추가한다.
export const TAG_BLACKLIST = new Set([
    "seen live", "favorites", "favourites", "favorite", "favourite", "love",
    "loved", "awesome", "beautiful", "good", "best", "amazing", "cool",
    "male vocalists", "female vocalists", "male vocalist", "female vocalist",
    "under 2000 listeners", "all", "music", "songs", "song", "my music",
    "spotify", "youtube", "albums i own", "check out", "new", "tag",
    "british", "american", "usa", "uk",
]);

// 표기가 다른 같은 장르를 하나로 합친다. (YouTube 한국어 태그 포함)
export const TAG_ALIASES = {
    "hip hop": "hip-hop", "hiphop": "hip-hop", "hip-hop/rap": "hip-hop",
    "kpop": "k-pop", "k pop": "k-pop", "korean pop": "k-pop",
    "jpop": "j-pop", "j pop": "j-pop",
    "rnb": "r&b", "r and b": "r&b", "rhythm and blues": "r&b", "r&b/soul": "r&b",
    "lofi": "lo-fi", "lo fi": "lo-fi", "ost": "soundtrack", "citypop": "city pop",
    "발라드": "ballad", "힙합": "hip-hop", "케이팝": "k-pop", "재즈": "jazz",
    "록": "rock", "락": "rock", "인디": "indie", "댄스": "dance", "알앤비": "r&b",
    "트로트": "trot", "팝": "pop", "클래식": "classical", "어쿠스틱": "acoustic",
    "시티팝": "city pop", "로파이": "lo-fi", "일렉트로닉": "electronic",
    "메탈": "metal", "포크": "folk", "랩": "rap", "펑크": "funk", "소울": "soul",
};

// 곡 정보 창에 보여줄 장르의 한국어 이름. 없는 장르는 영어 그대로 보여준다.
// (저장·분석은 영어 장르 이름으로 하고, 화면에만 한국어로 표시한다.)
export const GENRE_LABELS_KO = {
    "pop": "팝", "k-pop": "케이팝", "j-pop": "제이팝", "c-pop": "중국 팝", "rock": "록",
    "indie": "인디", "indie pop": "인디 팝", "indie rock": "인디 록", "k-indie": "한국 인디",
    "alternative": "얼터너티브", "alternative rock": "얼터너티브 록", "hip-hop": "힙합",
    "k-hip-hop": "한국 힙합", "rap": "랩", "trap": "트랩", "r&b": "알앤비", "k-r&b": "한국 알앤비",
    "neo-soul": "네오 소울", "soul": "소울", "funk": "펑크(Funk)", "punk": "펑크 록", "pop punk": "팝 펑크",
    "ballad": "발라드", "dance": "댄스", "edm": "EDM", "electronic": "일렉트로닉",
    "electronica": "일렉트로니카", "electropop": "일렉트로팝", "synthpop": "신스팝",
    "synthwave": "신스웨이브", "dream pop": "드림 팝", "pop rock": "팝 록", "hard rock": "하드 록",
    "heavy metal": "헤비메탈", "metal": "메탈", "metalcore": "메탈코어", "emo": "이모", "grunge": "그런지",
    "post-rock": "포스트 록", "shoegaze": "슈게이징", "acoustic": "어쿠스틱",
    "singer-songwriter": "싱어송라이터", "folk": "포크", "country": "컨트리", "blues": "블루스",
    "jazz": "재즈", "cool jazz": "쿨 재즈", "jazz hip-hop": "재즈 힙합", "bossa nova": "보사노바",
    "classical": "클래식", "orchestral": "오케스트라", "piano": "피아노", "instrumental": "연주곡",
    "soundtrack": "OST", "anime": "애니메이션", "trot": "트로트", "j-rock": "제이록", "k-rock": "한국 록",
    "reggae": "레게", "ska": "스카", "latin": "라틴", "gospel": "가스펠", "disco": "디스코",
    "house": "하우스", "techno": "테크노", "trance": "트랜스", "dubstep": "덥스텝",
    "drum and bass": "드럼 앤 베이스", "future bass": "퓨처 베이스", "garage": "개러지", "grime": "그라임",
    "idm": "IDM", "ambient": "앰비언트", "new age": "뉴에이지", "chill": "칠", "chillout": "칠아웃",
    "lo-fi": "로파이", "city pop": "시티팝",
};
