import { openAccountState } from "./account_state.js";
import { initializeUserArea } from "./firebase_nav.js";
import { showDataError } from "./firebase_data.js";

// ============================================================
// digging.js - Aurora 플레이리스트 기반 장르 디깅 추천
//   플레이리스트 : Aurora(YouTube 모드)의 계정 플레이리스트(users/{uid}/appData/aurora)를 공유
//   태그 추출     : YouTube 영상 태그 + Last.fm 곡/가수 태그 (+ MusicBrainz 보완)
//   검색·추천     : Last.fm API
//   추천 곡 담기  : YouTube Data API로 영상을 찾아 Aurora 플레이리스트에 추가
// ============================================================

// ------------------------------------------------------------
// 1. 설정
// ------------------------------------------------------------
// Aurora와 같은 계정 저장소를 연다. (로그인: Firestore + UID별 로컬 캐시 / 게스트: 브라우저에만 저장)
const auroraStore = await openAccountState("aurora", "ambient-player-v1", () => ({ playlists: [], current: {} }));
if (auroraStore.loadError) showDataError(auroraStore.loadError);
// 예전 디깅 전용 곡 목록. 'Aurora로 옮기기'에만 사용한다.
const diggingStore = await openAccountState("digging", "musicdig_playlist_v2", () => []);
if (diggingStore.loadError) showDataError(diggingStore.loadError);

// 페이지를 열 때 계정 저장소에서 읽은 Aurora 상태 (아래 상태 초기화에서 바로 쓰이므로 여기서 선언)
let latestAurora = auroraStore.value;

const UID = auroraStore.uid;
const AURORA_STORE = auroraStore.cacheKey;               // Aurora가 저장할 때 갱신하는 로컬 캐시 키
const AURORA_MODE_KEY = "ambient-mode:" + UID;
const MOVED_KEY = "musicdig_moved_to_aurora:" + UID;     // Aurora로 옮긴 예전 디깅 곡 id 목록

// API 키는 코드·DB에 넣지 않는다. 사용자가 직접 발급받아 화면에서 입력하면
// 이 브라우저에 계정(UID)별로만 저장된다. (Aurora의 YouTube 키와 같은 방식)
//   Last.fm 키 : 이 페이지의 'Last.fm API 키' 패널에서 입력
//   YouTube 키 : Aurora 페이지에서 입력한 키를 같이 사용
const LASTFM_KEY_STORE = "ambient-lastfm-key:" + UID;
const YT_KEY_STORE = "ambient-yt-key:" + UID;
const readKey = key => { try { return localStorage.getItem(key) || ""; } catch { return ""; } };
const getLastfmKey = () => readKey(LASTFM_KEY_STORE);

const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";
const MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2/";
const YOUTUBE_URL = "https://www.googleapis.com/youtube/v3/";

const RECOMMEND_COUNT = 5;              // 추천 칸마다 보여줄 곡 수
const SEARCH_DELAY = 400;               // 타이핑 멈추고 검색 시작까지 대기(ms)
const MIN_TAG_COUNT = 20;               // Last.fm 태그 투표 수 최소 기준(0~100)
const SIMILAR_TAG_LIMIT = 3;            // '비슷한 장르' 추천에 쓸 상위 장르 수
const DIFFERENT_TAG_LIMIT = 3;          // '다른 장르' 추천에 쓸 장르 수
const MAX_GENRES = 5;                   // 곡 하나에 붙일 최대 장르 수
const TAG_CACHE_KEY = "musicdig_tag_cache_v1";

// YouTube 키: Aurora에서 저장한 키를 같이 쓴다.
const getYouTubeKey = () => readKey(YT_KEY_STORE);

// '다른 장르' 추천 후보. 플레이리스트 장르와 겹치지 않는 것 중에서 고른다.
const DIFFERENT_TAG_POOL = [
    "jazz", "metal", "electronic", "classical", "hip-hop", "country",
    "reggae", "blues", "folk", "punk", "soul", "funk", "ambient",
    "house", "latin", "bossa nova", "shoegaze", "disco", "gospel",
    "techno", "ska", "soundtrack", "lo-fi", "city pop",
];

// YouTube 영상 태그는 가수 이름·곡 제목 등이 섞여 있어서, 이 목록에 있는 장르만 골라 쓴다.
const GENRE_VOCAB = new Set([
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

// 장르가 아닌 Last.fm 태그는 걸러낸다. 필요하면 계속 추가하세요.
const TAG_BLACKLIST = new Set([
    "seen live", "favorites", "favourites", "favorite", "favourite", "love",
    "loved", "awesome", "beautiful", "good", "best", "amazing", "cool",
    "male vocalists", "female vocalists", "male vocalist", "female vocalist",
    "under 2000 listeners", "all", "music", "songs", "song", "my music",
    "spotify", "youtube", "albums i own", "check out", "new", "tag",
    "british", "american", "usa", "uk",
]);

const TAG_ALIASES = {
    "hip hop": "hip-hop", "hiphop": "hip-hop", "hip-hop/rap": "hip-hop",
    "kpop": "k-pop", "k pop": "k-pop", "korean pop": "k-pop",
    "jpop": "j-pop", "j pop": "j-pop",
    "rnb": "r&b", "r and b": "r&b", "rhythm and blues": "r&b", "r&b/soul": "r&b",
    "lofi": "lo-fi", "lo fi": "lo-fi", "ost": "soundtrack", "citypop": "city pop",
    // YouTube 한국어 태그
    "발라드": "ballad", "힙합": "hip-hop", "케이팝": "k-pop", "재즈": "jazz",
    "록": "rock", "락": "rock", "인디": "indie", "댄스": "dance", "알앤비": "r&b",
    "트로트": "trot", "팝": "pop", "클래식": "classical", "어쿠스틱": "acoustic",
    "시티팝": "city pop", "로파이": "lo-fi", "일렉트로닉": "electronic",
    "메탈": "metal", "포크": "folk", "랩": "rap", "펑크": "funk", "소울": "soul",
};

// ------------------------------------------------------------
// 2. 상태(state)
// ------------------------------------------------------------
// playlist: Aurora 현재 YouTube 플레이리스트를 디깅용 곡 객체로 바꾼 배열
//   { id, title, artist, genres: [], trackId, ytTags: [] }
let auroraState = loadAuroraState();
let playlist = [];
let tagCache = loadTagCache();          // 곡 id -> 외부 API(Last.fm/MusicBrainz) 장르 배열
const pendingAdds = new Set();          // YouTube에서 찾는 중인 곡 id

let lastSearchResults = [];             // 가장 최근 검색 결과(곡 객체 배열)
let searchTimer = null;
let searchToken = 0;                    // 오래된 검색 응답이 최신 결과를 덮어쓰지 않게
let similarToken = 0;
let differentToken = 0;
let analyzeToken = 0;

// ------------------------------------------------------------
// 3. HTML 요소
// ------------------------------------------------------------
const searchForm = document.querySelector(".search_login_form");
const searchInput = document.querySelector(".input_box");
const playlistBox = document.querySelector(".playlist");
const playlistSelect = document.getElementById("auroraPlaylistSelect");
const sections = document.querySelectorAll(".recommendation_section");
const similarList = sections[0].querySelector("div");
const differentList = sections[1].querySelector("div");
const searchArea = document.querySelector(".discovery-search");

const searchResults = document.createElement("div");
searchResults.className = "search_results box";
searchResults.id = "searchResults";
searchResults.setAttribute("aria-live", "polite");
searchResults.hidden = true;
searchArea.appendChild(searchResults);

await initializeUserArea(document.getElementById("userArea"));

const playlistBody = document.createElement("div");
playlistBody.className = "playlist_body";
playlistBox.appendChild(playlistBody);

// 추천 칸 제목 옆에 '다시 추천' 버튼 붙이기
addRefreshButton(sections[0], () => loadSimilarSection());
addRefreshButton(sections[1], () => loadDifferentSection());

// ------------------------------------------------------------
// 4. 유틸
// ------------------------------------------------------------
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const toArray = value => (Array.isArray(value) ? value : value ? [value] : []);
function uid() {        // 상단 상태 초기화에서 먼저 쓰이므로 함수 선언(호이스팅)으로 둔다
    return Math.random().toString(36).slice(2, 9);
}

function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function makeSong(title, artist, genres = []) {
    title = String(title || "").trim();
    artist = String(artist || "").trim();
    return {
        // (feat. ...) 같은 꼬리를 뗀 제목으로 id를 만들어 YouTube/Last.fm 표기 차이로 중복되지 않게 한다.
        id: `${artist}|||${cleanTitle(title)}`.toLowerCase(),
        title,
        artist,
        genres: [...genres],
    };
}

// YouTube 제목에 남은 (feat. ...), [ ... ], | ... 같은 꼬리를 떼서 Last.fm에서 찾기 쉽게 만든다.
function cleanTitle(title) {
    return String(title || "")
        .replace(/\s*[(\[（【][^)\]）】]*[)\]）】]/g, "")
        .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, "")
        .replace(/\s*[|｜].*$/, "")
        .replace(/\s+/g, " ")
        .trim() || String(title || "").trim();
}

function mergeGenres(...lists) {
    const out = [];
    lists.flat().forEach(genre => {
        if (genre && !out.includes(genre)) out.push(genre);
    });
    return out.slice(0, MAX_GENRES);
}

function isInPlaylist(id) {
    return playlist.some(song => song.id === id);
}

function makeButton(text, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.addEventListener("click", onClick);
    return button;
}

function addRefreshButton(section, onClick) {
    const title = section.querySelector("h3");
    const wrapper = document.createElement("div");
    wrapper.className = "section_header";
    title.replaceWith(wrapper);
    wrapper.appendChild(title);
    wrapper.appendChild(makeButton("🔄 다시 추천", "다른 곡 추천받기", onClick));
}

function makeMessage(text) {
    const p = document.createElement("p");
    p.className = "empty_message";
    p.textContent = text;
    return p;
}

function showMessage(container, text) {
    container.innerHTML = "";
    container.appendChild(makeMessage(text));
}

function makeLabel(text) {
    const label = document.createElement("span");
    label.className = "added_label";
    label.textContent = text;
    return label;
}

// "노래 제목 - 가수 [장르]" 한 줄 (textContent라 HTML이 섞여 있어도 안전)
function makeSongRow(song, genreCount = 2) {
    const row = document.createElement("p");
    row.className = "song_row";

    const info = document.createElement("span");
    info.className = "song_info";
    info.textContent = `${song.title} - ${song.artist} `;

    song.genres.slice(0, genreCount).forEach(genre => {
        const tag = document.createElement("span");
        tag.className = "genre_tag";
        tag.textContent = genre;
        info.appendChild(tag);
        info.appendChild(document.createTextNode(" "));
    });

    row.appendChild(info);
    return row;
}

// 검색 결과·추천 곡 오른쪽 버튼: 담김 / 찾는 중 / +
function appendAddControl(row, song) {
    if (isInPlaylist(song.id)) row.appendChild(makeLabel("담김"));
    else if (pendingAdds.has(song.id)) row.appendChild(makeLabel("YouTube에서 찾는 중…"));
    else row.appendChild(makeButton("+", "Aurora 플레이리스트에 담기", () => addToPlaylist(song)));
}

// ------------------------------------------------------------
// 5. 저장 - Aurora 계정 플레이리스트 공유
// ------------------------------------------------------------
// Aurora 저장 형식: { playlists: [{ id, name, mode, tracks: [...] }], current: { youtube: id, spotify: id } }
// latestAurora(1번 설정에서 선언)는 Aurora 탭의 저장(storage 이벤트)과 이 페이지의 저장으로만 갱신한다.
function loadAuroraState() {
    let state = null;
    try {
        state = JSON.parse(JSON.stringify(latestAurora));   // 깊은 복사: 고치다 실패해도 원본 유지
    } catch (error) {
        state = null;
    }
    if (!state || !Array.isArray(state.playlists)) state = { playlists: [], current: {} };
    if (!state.current || typeof state.current !== "object") state.current = {};
    // Aurora를 아직 한 번도 열지 않았으면 YouTube 기본 플레이리스트를 만들어 둔다(담을 때 저장됨).
    if (!state.playlists.some(p => p.mode === "youtube")) {
        state.playlists.push({ id: uid(), mode: "youtube", name: "내 플레이리스트", tracks: [] });
    }
    return state;
}

function youtubeLists(state = auroraState) {
    return state.playlists.filter(p => p.mode === "youtube");
}

function currentAuroraList(state = auroraState) {
    const lists = youtubeLists(state);
    return lists.find(p => p.id === state.current.youtube) || lists[0];
}

// 다른 탭(Aurora)에서 바뀐 내용을 덮어쓰지 않도록, 항상 최신 값에 고쳐서 계정 저장소에 저장한다.
// (저장하면 로컬 캐시도 바뀌어서 열려 있는 Aurora 탭이 storage 이벤트로 다시 읽는다.)
function updateAurora(change) {
    const state = loadAuroraState();
    change(state);
    latestAurora = state;
    auroraState = state;
    const pending = auroraStore.save(state);
    pending.catch(showDataError);
    return pending;
}

// Aurora 트랙 -> 디깅 곡 객체
function trackToSong(track) {
    const song = makeSong(cleanTitle(track.title), track.artist);
    song.trackId = track.id;
    song.ytTags = youtubeTagsOf(track);
    song.genres = mergeGenres(tagCache[song.id] || [], genresFromYouTubeTags(song.ytTags, song.artist));
    return song;
}

function refreshPlaylist() {
    auroraState = loadAuroraState();
    const list = currentAuroraList();
    const seen = new Set();
    playlist = list.tracks
        .filter(t => t.source === "youtube" || String(t.id).startsWith("yt:"))
        .map(trackToSong)
        .filter(song => song.title && song.artist && !seen.has(song.id) && seen.add(song.id));
}

function saveTagCache() {
    try {
        localStorage.setItem(TAG_CACHE_KEY, JSON.stringify(tagCache));
    } catch (error) {
        console.warn("태그 캐시 저장 실패:", error);
    }
}

function loadTagCache() {
    try {
        return JSON.parse(localStorage.getItem(TAG_CACHE_KEY)) || {};
    } catch (error) {
        return {};
    }
}

// ------------------------------------------------------------
// 6. API 호출 (Last.fm / MusicBrainz / YouTube)
// ------------------------------------------------------------
async function lastfm(method, params = {}) {
    const apiKey = getLastfmKey();
    if (!apiKey) {
        throw new Error("위의 'Last.fm API 키' 칸에 발급받은 키를 먼저 저장해주세요.");
    }
    const url = new URL(LASTFM_URL);
    url.search = new URLSearchParams({
        method,
        api_key: apiKey,
        format: "json",
        ...params,
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm 요청 실패 (HTTP ${response.status})`);
    const data = await response.json();
    if (data.error === 10 || data.error === 26) {
        throw new Error("Last.fm API 키가 올바르지 않아요. '키 변경'을 눌러 다시 입력해주세요.");
    }
    if (data.error) throw new Error(`Last.fm: ${data.message}`);
    return data;
}

// MusicBrainz는 초당 1회 제한이 있어서 요청을 한 줄로 세워 1.1초 간격을 둔다.
let musicbrainzReady = Promise.resolve();
function musicbrainz(path, params = {}) {
    const request = musicbrainzReady.then(async () => {
        const url = new URL(MUSICBRAINZ_URL + path);
        url.search = new URLSearchParams({ fmt: "json", ...params });
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`MusicBrainz 요청 실패 (HTTP ${response.status})`);
        return response.json();
    });
    musicbrainzReady = request.catch(() => {}).then(() => sleep(1100));
    return request;
}

async function youtube(path, params) {
    const key = getYouTubeKey();
    if (!key) throw new Error("Aurora에서 YouTube API 키를 먼저 저장해주세요.");
    const url = new URL(YOUTUBE_URL + path);
    url.search = new URLSearchParams({ ...params, key });
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `YouTube 요청 실패 (HTTP ${response.status})`);
    return data;
}

// ------------------------------------------------------------
// 7. 장르(태그) 추출
// ------------------------------------------------------------
function normalizeTag(name) {
    const tag = String(name).toLowerCase().trim();
    return TAG_ALIASES[tag] || tag;
}

function isGenreTag(tag, artist) {
    if (!tag || tag.length > 30) return false;
    if (TAG_BLACKLIST.has(tag)) return false;
    if (/^\d{2,4}s?$/.test(tag)) return false;          // 1990s, 2020 같은 연도
    if (tag === String(artist).toLowerCase().trim()) return false;  // 가수 이름 태그
    return true;
}

// rawTags: [{ name, count }] -> 장르 이름 배열(최대 5개)
function cleanTags(rawTags, artist) {
    const normalized = rawTags
        .map(t => ({ name: normalizeTag(t.name), count: Number(t.count) || 0 }))
        .filter(t => isGenreTag(t.name, artist));

    const unique = [];
    normalized.forEach(t => {
        if (!unique.some(u => u.name === t.name)) unique.push(t);
    });

    let picked = unique.filter(t => t.count >= MIN_TAG_COUNT);
    if (picked.length === 0) picked = unique.slice(0, 2);   // 기준 미달이면 상위 2개라도
    return picked.slice(0, MAX_GENRES).map(t => t.name);
}

// Aurora 트랙에 저장된 YouTube 태그 꺼내기
//   새로 담은 곡: tags 배열 / 예전에 담은 곡: genre 문자열(태그를 공백으로 이어 붙인 것)
function youtubeTagsOf(track) {
    if (Array.isArray(track.tags)) return track.tags;
    return String(track.genre || "").split(/\s+/).filter(Boolean);
}

// YouTube 태그 중 장르 사전에 있는 것만 장르로 인정한다.
function genresFromYouTubeTags(tags, artist) {
    const genres = [];
    toArray(tags).forEach(raw => {
        const tag = normalizeTag(String(raw).replace(/\s+(music|songs?|음악)$/i, ""));
        if (GENRE_VOCAB.has(tag) && isGenreTag(tag, artist) && !genres.includes(tag)) {
            genres.push(tag);
        }
    });
    return genres.slice(0, MAX_GENRES);
}

async function genresFromLastfmTrack(artist, title) {
    const data = await lastfm("track.getTopTags", { artist, track: title, autocorrect: 1 });
    return cleanTags(toArray(data.toptags && data.toptags.tag), artist);
}

async function genresFromLastfmArtist(artist) {
    const data = await lastfm("artist.getTopTags", { artist, autocorrect: 1 });
    return cleanTags(toArray(data.toptags && data.toptags.tag), artist);
}

async function genresFromMusicBrainz(artist) {
    const query = `artist:"${artist.replace(/"/g, "")}"`;
    const data = await musicbrainz("artist/", { query, limit: 1 });
    const found = data.artists && data.artists[0];
    if (!found) return [];
    // MusicBrainz 투표 수는 Last.fm과 척도가 달라서 순서만 쓰고 개수 기준은 적용하지 않는다.
    const raw = [...(found.genres || []), ...(found.tags || [])]
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .map(t => ({ name: t.name, count: 100 }));
    return cleanTags(raw, artist);
}

// 외부 API로 곡 장르 찾기: 곡 태그 -> 가수 태그 -> MusicBrainz 순서로 시도.
// YouTube 태그로 이미 장르를 찾은 곡은 느린 MusicBrainz까지는 가지 않는다.
async function lookupExternalGenres(song) {
    if (Array.isArray(tagCache[song.id])) return tagCache[song.id];

    const hasYouTubeGenres = genresFromYouTubeTags(song.ytTags, song.artist).length > 0;
    const steps = [
        () => genresFromLastfmTrack(song.artist, song.title),
        () => genresFromLastfmArtist(song.artist),
    ];
    if (!hasYouTubeGenres) steps.push(() => genresFromMusicBrainz(song.artist));

    let failed = false;
    for (const step of steps) {
        try {
            const genres = await step();
            if (genres.length > 0) {
                tagCache[song.id] = genres;
                saveTagCache();
                return genres;
            }
        } catch (error) {
            failed = true;
            console.warn("장르 조회 실패:", error.message);
        }
    }
    // API가 정상 응답했는데 태그가 없으면 '없음'으로 기억해서 매번 다시 묻지 않는다.
    if (!failed) {
        tagCache[song.id] = [];
        saveTagCache();
    }
    return [];
}

// ------------------------------------------------------------
// 8. Aurora 플레이리스트 담기 / 빼기
// ------------------------------------------------------------
// Last.fm 곡(제목/가수) -> 재생 가능한 YouTube 영상을 찾아 Aurora 트랙 형식으로 만든다.
const isoToSec = iso => {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || [];
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
};

async function findYouTubeTrack(song) {
    const search = await youtube("search", {
        part: "snippet", type: "video", videoCategoryId: "10", videoEmbeddable: "true",
        videoSyndicated: "true", maxResults: "8", q: `${song.artist} ${song.title}`,
    });
    const ids = search.items.map(item => item.id.videoId).filter(Boolean);
    if (ids.length === 0) return null;

    const videos = await youtube("videos", { part: "snippet,contentDetails,status", id: ids.join(",") });
    const candidates = videos.items
        .filter(it => {
            const sec = isoToSec(it.contentDetails.duration);
            const rr = it.contentDetails.regionRestriction;
            return sec >= 60 && sec <= 720 && it.snippet.liveBroadcastContent === "none"
                && it.status.embeddable !== false
                && !rr?.blocked?.includes("KR") && (!rr?.allowed || rr.allowed.includes("KR"));
        })
        // Topic 채널(공식 음원)이 임베드가 잘 되고 앨범 아트도 나와서 우선
        .sort((a, b) => / - Topic$/.test(b.snippet.channelTitle) - / - Topic$/.test(a.snippet.channelTitle));

    for (const it of candidates) {
        // 401/403 = 임베드 금지. 네트워크 오류일 땐 통과시킨다. (Aurora와 같은 검사)
        const ok = await fetch("https://www.youtube.com/oembed?format=json&url="
            + encodeURIComponent("https://www.youtube.com/watch?v=" + it.id)).then(r => r.ok, () => true);
        if (!ok) continue;

        const th = it.snippet.thumbnails;
        const tags = (it.snippet.tags || []).slice(0, 15);
        return {
            id: "yt:" + it.id, source: "youtube", vid: it.id,
            title: song.title, artist: song.artist,
            topic: / - Topic$/.test(it.snippet.channelTitle),
            album: it.snippet.channelTitle,
            art: (th.maxres || th.high || th.medium || th.default).url,
            thumb: (th.medium || th.default).url,
            tags,
            // Aurora의 무드(배경 분위기) 계산용: 장르 + 영상 태그
            genre: [...song.genres, ...tags].join(" "),
        };
    }
    return null;
}

async function addToPlaylist(song) {
    if (isInPlaylist(song.id)) {
        alert("이미 플레이리스트에 있는 곡이에요.");
        return;
    }
    if (pendingAdds.has(song.id)) return;
    if (!getYouTubeKey()) {
        alert("Aurora에서 YouTube API 키를 먼저 저장해주세요. 담은 곡은 Aurora에서 YouTube로 재생돼요.");
        return;
    }

    pendingAdds.add(song.id);
    rerenderAddButtons();
    let track = null;
    try {
        track = await findYouTubeTrack(song);
        if (!track) alert(`YouTube에서 재생 가능한 "${song.title}" 영상을 찾지 못했어요.`);
    } catch (error) {
        alert("YouTube 검색 실패: " + error.message);
    }
    pendingAdds.delete(song.id);

    if (track) {
        updateAurora(state => {
            const list = currentAuroraList(state);
            state.current.youtube = list.id;
            if (!list.tracks.some(t => t.id === track.id)) list.tracks.push(track);
        });
    }
    syncFromAurora();
}

function removeFromPlaylist(song) {
    updateAurora(state => {
        const list = currentAuroraList(state);
        list.tracks = list.tracks.filter(t => t.id !== song.trackId);
    });
    syncFromAurora();
}

// 재생은 Aurora에서 한다. 저장이 끝난 뒤 현재 플레이리스트를 YouTube 모드로 열어 준다.
async function openInAurora() {
    try {
        localStorage.setItem(AURORA_MODE_KEY, "youtube");
    } catch (error) { /* 모드 저장이 막혀도 이동은 한다 */ }
    try {
        await auroraStore.flush();
    } catch (error) {
        showDataError(error);
    }
    location.href = "aurora.html";
}

// ------------------------------------------------------------
// 8-1. 예전 디깅 목록 -> Aurora로 옮기기
// ------------------------------------------------------------
// 예전 디깅 곡에는 YouTube 영상 정보가 없어서, 곡마다 YouTube에서 영상을 찾아 담는다.
// 원본(계정의 appData/digging, 계정 구분 전 브라우저 목록)은 지우지 않고, 옮긴 곡 id만 기억한다.
let migrateProgress = "";

function readMovedIds() {
    try {
        return JSON.parse(localStorage.getItem(MOVED_KEY)) || [];
    } catch (error) {
        return [];
    }
}

function legacyDiggingSongs() {
    const skip = new Set(readMovedIds());
    const songs = [];
    [...toArray(diggingStore.value), ...toArray(diggingStore.legacy())].forEach(item => {
        if (!item || !item.title || !item.artist) return;
        const song = makeSong(item.title, item.artist, Array.isArray(item.genres) ? item.genres : []);
        if (skip.has(song.id) || isInPlaylist(song.id) || songs.some(s => s.id === song.id)) return;
        songs.push(song);
    });
    return songs;
}

async function migrateLegacySongs() {
    const songs = legacyDiggingSongs();
    if (songs.length === 0 || migrateProgress) return;
    if (!getYouTubeKey()) {
        alert("Aurora에서 YouTube API 키를 먼저 저장해주세요. 옮긴 곡은 Aurora에서 YouTube로 재생돼요.");
        return;
    }
    if (!confirm(`예전 디깅 목록의 ${songs.length}곡을 YouTube에서 찾아 현재 Aurora 플레이리스트에 담을까요?\n`
        + "(곡마다 YouTube API 할당량을 약 100씩 사용해요.)")) return;

    const tracks = [];
    const movedIds = [];
    const failed = [];
    for (const [i, song] of songs.entries()) {
        migrateProgress = `옮기는 중… (${i + 1}/${songs.length})`;
        renderPlaylist();
        try {
            const track = await findYouTubeTrack(song);
            if (track) {
                tracks.push(track);
                movedIds.push(song.id);
                // 예전 목록에 있던 장르는 캐시에 넣어 Last.fm 재조회를 줄인다.
                if (song.genres.length > 0 && !tagCache[song.id]?.length) tagCache[song.id] = song.genres;
            } else {
                failed.push(song);
            }
        } catch (error) {
            failed.push(song);
            if (/quota/i.test(error.message)) {
                alert("YouTube API 오늘 할당량을 다 써서 멈췄어요. 남은 곡은 내일 다시 옮길 수 있어요.");
                break;
            }
        }
    }
    migrateProgress = "";
    saveTagCache();

    if (tracks.length > 0) {
        updateAurora(state => {
            const list = currentAuroraList(state);
            state.current.youtube = list.id;
            tracks.forEach(track => {
                if (!list.tracks.some(t => t.id === track.id)) list.tracks.push(track);
            });
        });
        try {
            localStorage.setItem(MOVED_KEY, JSON.stringify([...readMovedIds(), ...movedIds]));
        } catch (error) { /* 기억하지 못해도 이미 담긴 곡은 목록에서 제외된다 */ }
    }
    const failText = failed.length > 0
        ? `\n찾지 못한 곡 ${failed.length}개: ${failed.slice(0, 5).map(s => `${s.title} - ${s.artist}`).join(", ")}${failed.length > 5 ? " 등" : ""}`
        : "";
    alert(`${tracks.length}곡을 Aurora 플레이리스트로 옮겼어요.${failText}`);
    syncFromAurora();
}

// ------------------------------------------------------------
// 9. 장르 기반 추천
// ------------------------------------------------------------
// 플레이리스트 전체의 장르 프로필 만들기
// 곡마다 앞쪽 장르일수록 높은 점수를 준다.
function getProfile() {
    const scores = {};
    playlist.forEach(song => {
        song.genres.forEach((genre, i) => {
            scores[genre] = (scores[genre] || 0) + (song.genres.length - i);
        });
    });
    const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    return { top: ranked, all: new Set(ranked) };
}

// 후보 장르가 플레이리스트 장르와 같거나 서로 포함하면 '가까운 장르'로 본다.
// 예) 후보 pop vs 플레이리스트 k-pop -> 가까움
function isCloseToProfile(candidate, profileTags) {
    for (const tag of profileTags) {
        if (tag === candidate || tag.includes(candidate) || candidate.includes(tag)) {
            return true;
        }
    }
    return false;
}

// 태그의 인기곡 가져오기. 매번 다른 곡이 나오도록 1~3페이지 중 무작위 선택.
async function fetchTagTracks(tag) {
    const page = 1 + Math.floor(Math.random() * 3);
    let data = await lastfm("tag.getTopTracks", { tag, limit: 30, page });
    let tracks = toArray(data.tracks && data.tracks.track);
    if (tracks.length === 0 && page > 1) {
        data = await lastfm("tag.getTopTracks", { tag, limit: 30, page: 1 });
        tracks = toArray(data.tracks && data.tracks.track);
    }
    return tracks.map(t =>
        makeSong(t.name, t.artist && t.artist.name ? t.artist.name : t.artist, [tag])
    );
}

// 여러 태그에서 곡을 모아 섞은 뒤 RECOMMEND_COUNT개만 고른다.
async function collectRecommendations(tags) {
    const settled = await Promise.allSettled(tags.map(fetchTagTracks));
    const fulfilled = settled.filter(r => r.status === "fulfilled");
    if (fulfilled.length === 0) {
        throw settled[0].reason || new Error("추천을 불러오지 못했어요.");
    }

    const seen = new Set();
    const pool = [];
    fulfilled.forEach(result => {
        result.value.forEach(song => {
            if (!song.title || !song.artist) return;
            if (seen.has(song.id) || isInPlaylist(song.id)) return;
            seen.add(song.id);
            pool.push(song);
        });
    });
    return shuffle(pool).slice(0, RECOMMEND_COUNT);
}

// ------------------------------------------------------------
// 10. 화면 그리기
// ------------------------------------------------------------
function renderPlaylistSelect() {
    const lists = youtubeLists();
    const current = currentAuroraList();
    playlistSelect.innerHTML = "";
    lists.forEach(list => {
        const option = document.createElement("option");
        option.value = list.id;
        option.textContent = `${list.name} (${list.tracks.length})`;
        playlistSelect.appendChild(option);
    });
    playlistSelect.value = current.id;
}

function renderPlaylist() {
    renderPlaylistSelect();
    playlistBody.innerHTML = "";

    // 예전 디깅 목록에 남은 곡이 있으면 Aurora로 옮기는 버튼을 보여준다.
    const legacy = legacyDiggingSongs();
    if (legacy.length > 0 || migrateProgress) {
        const button = makeButton(
            migrateProgress || `예전 디깅 곡 ${legacy.length}곡 Aurora로 옮기기`,
            "예전 디깅 목록의 곡을 YouTube에서 찾아 현재 Aurora 플레이리스트에 담기",
            () => migrateLegacySongs()
        );
        button.className = "migrate_button";
        button.disabled = migrateProgress !== "";
        playlistBody.appendChild(button);
    }

    if (playlist.length === 0) {
        playlistBody.appendChild(makeMessage(
            "Aurora(YouTube 모드)에서 노래를 담거나, 검색·추천 곡의 + 버튼으로 담아보세요."
        ));
        return;
    }

    const controls = document.createElement("div");
    controls.className = "playlist_controls";
    controls.appendChild(makeButton("▶ Aurora에서 재생", "이 플레이리스트를 Aurora에서 재생", openInAurora));
    playlistBody.appendChild(controls);

    playlist.forEach(song => {
        const row = makeSongRow(song, 3);
        row.appendChild(makeButton("✕", "플레이리스트에서 빼기", () => removeFromPlaylist(song)));
        playlistBody.appendChild(row);
    });
}

function fillSongList(container, list, emptyText) {
    container.innerHTML = "";
    container._songs = list;
    if (list.length === 0) {
        container.appendChild(makeMessage(emptyText));
        return;
    }
    list.forEach(song => {
        const row = makeSongRow(song);
        appendAddControl(row, song);
        container.appendChild(row);
    });
}

// 담기 상태(+ / 찾는 중 / 담김)만 바뀌었을 때 네트워크 호출 없이 다시 그린다.
function rerenderAddButtons() {
    renderSearchResults();
    [similarList, differentList].forEach(container => {
        if (Array.isArray(container._songs) && container._songs.length > 0) {
            fillSongList(container, container._songs, "");
        }
    });
}

async function loadSimilarSection() {
    const token = ++similarToken;
    const title = sections[0].querySelector("h3");
    const profile = getProfile();
    similarList._songs = null;

    if (playlist.length === 0) {
        title.textContent = "플레이리스트와 비슷한 장르";
        showMessage(similarList, "플레이리스트에 노래를 담으면 비슷한 장르를 추천해드려요.");
        return;
    }
    if (profile.top.length === 0) {
        title.textContent = "플레이리스트와 비슷한 장르";
        showMessage(similarList, "플레이리스트 곡에서 장르 태그를 찾지 못했어요.");
        return;
    }

    const tags = profile.top.slice(0, SIMILAR_TAG_LIMIT);
    title.textContent = `플레이리스트와 비슷한 장르 (${tags.join(", ")})`;
    showMessage(similarList, "추천 곡을 찾는 중...");

    try {
        const songs = await collectRecommendations(tags);
        if (token !== similarToken) return;
        fillSongList(similarList, songs, "추천할 곡을 찾지 못했어요. 다시 추천을 눌러보세요.");
    } catch (error) {
        if (token !== similarToken) return;
        showMessage(similarList, error.message);
    }
}

async function loadDifferentSection() {
    const token = ++differentToken;
    const title = sections[1].querySelector("h3");
    const profile = getProfile();
    differentList._songs = null;

    if (playlist.length === 0 || profile.top.length === 0) {
        title.textContent = "플레이리스트와 다른 장르";
        showMessage(
            differentList,
            playlist.length === 0
                ? "플레이리스트에 노래를 담으면 다른 장르를 추천해드려요."
                : "플레이리스트 곡에서 장르 태그를 찾지 못했어요."
        );
        return;
    }

    const candidates = DIFFERENT_TAG_POOL.filter(tag => !isCloseToProfile(tag, profile.all));
    const tags = shuffle(candidates).slice(0, DIFFERENT_TAG_LIMIT);
    title.textContent = `플레이리스트와 다른 장르 (${tags.join(", ")})`;
    showMessage(differentList, "추천 곡을 찾는 중...");

    try {
        const songs = await collectRecommendations(tags);
        if (token !== differentToken) return;
        fillSongList(differentList, songs, "추천할 곡을 찾지 못했어요. 다시 추천을 눌러보세요.");
    } catch (error) {
        if (token !== differentToken) return;
        showMessage(differentList, error.message);
    }
}

function renderRecommendations() {
    loadSimilarSection();
    loadDifferentSection();
}

// ------------------------------------------------------------
// 11. Aurora 플레이리스트 읽기 -> 태그 추출 -> 추천
// ------------------------------------------------------------
let lastProfileKey = null;

async function syncFromAurora() {
    const token = ++analyzeToken;
    refreshPlaylist();
    renderPlaylist();
    renderSearchResults();

    // 외부 API 장르를 아직 모르는 곡만 차례로 조회 (MusicBrainz 속도 제한 때문에 순서대로)
    const missing = playlist.filter(song => !Array.isArray(tagCache[song.id]));
    if (missing.length > 0) {
        [similarList, differentList].forEach(list => {
            list._songs = null;
            showMessage(list, `플레이리스트에서 태그를 추출하는 중... (${missing.length}곡)`);
        });
        lastProfileKey = null;
    }
    for (const song of missing) {
        await lookupExternalGenres(song);
        if (token !== analyzeToken) return;     // 그 사이 플레이리스트가 바뀌었으면 새 작업에 맡긴다
        song.genres = mergeGenres(tagCache[song.id] || [], genresFromYouTubeTags(song.ytTags, song.artist));
        renderPlaylist();
    }

    // 플레이리스트 곡 구성이 바뀌었을 때만 추천을 새로 받는다.
    const profileKey = playlist.map(song => song.id).join("\n");
    if (profileKey !== lastProfileKey) {
        lastProfileKey = profileKey;
        renderRecommendations();
    } else {
        rerenderAddButtons();
    }
}

playlistSelect.addEventListener("change", () => {
    updateAurora(state => { state.current.youtube = playlistSelect.value; });
    syncFromAurora();
});

// Aurora가 다른 탭에 열려 있어도 플레이리스트 변경을 바로 반영
window.addEventListener("storage", event => {
    if (event.key !== AURORA_STORE || !event.newValue) return;
    try {
        latestAurora = JSON.parse(event.newValue);
    } catch (error) {
        return;
    }
    syncFromAurora();
});

// ------------------------------------------------------------
// 12. 검색 (Last.fm track.search)
// ------------------------------------------------------------
async function runSearch(keyword) {
    const token = ++searchToken;
    searchResults.hidden = false;
    showMessage(searchResults, "검색 중...");

    // "가수 - 제목" 형태로 입력하면 두 값으로 나눠서 더 정확히 찾는다.
    const params = { track: keyword, limit: 10 };
    if (keyword.includes(" - ")) {
        const [artist, track] = keyword.split(" - ", 2);
        params.artist = artist.trim();
        params.track = track.trim();
    }

    try {
        const data = await lastfm("track.search", params);
        if (token !== searchToken) return;      // 더 새 검색이 있으면 버린다
        const matches = toArray(data.results && data.results.trackmatches
            && data.results.trackmatches.track);
        lastSearchResults = matches
            .map(t => makeSong(t.name, t.artist))
            .filter(song => song.title && song.artist);
        renderSearchResults(keyword);
    } catch (error) {
        if (token !== searchToken) return;
        showMessage(searchResults, error.message);
    }
}

// 마지막 검색 결과를 화면에 그린다(네트워크 호출 없음).
function renderSearchResults(keyword = searchInput.value.trim()) {
    if (keyword === "" || searchResults.hidden) return;
    if (lastSearchResults.length === 0) {
        showMessage(searchResults, `"${keyword}"에 맞는 곡이 없어요. 영어 표기나 "가수 - 제목"으로도 검색해보세요.`);
        return;
    }

    searchResults.innerHTML = "";
    lastSearchResults.forEach(song => {
        const row = makeSongRow(song);
        appendAddControl(row, song);
        searchResults.appendChild(row);
    });
}

function showSearchResults() {
    searchResults.hidden = false;
    renderSearchResults();
}

// 타이핑을 멈추면 검색 (글자 하나마다 API를 부르지 않도록 지연)
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const keyword = searchInput.value.trim();
    if (keyword === "") {
        searchToken++;
        lastSearchResults = [];
        searchResults.hidden = true;
        return;
    }
    searchTimer = setTimeout(() => runSearch(keyword), SEARCH_DELAY);
});

// Enter: 새로고침을 막고 바로 검색
searchForm.addEventListener("submit", event => {
    event.preventDefault();
    clearTimeout(searchTimer);
    const keyword = searchInput.value.trim();
    if (keyword !== "") runSearch(keyword);
});

searchInput.addEventListener("keydown", event => {
    if (event.key === "Escape") searchResults.hidden = true;
});

// 검색 영역 바깥을 클릭하면 닫기 (+ 클릭으로 요소가 바뀌어도 동작하도록 composedPath 사용)
document.addEventListener("click", event => {
    if (!event.composedPath().includes(searchArea)) searchResults.hidden = true;
});

searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim() !== "" && lastSearchResults.length > 0) showSearchResults();
});

// ------------------------------------------------------------
// 13. API 키 입력 (Aurora의 YouTube 키 입력과 같은 방식)
// ------------------------------------------------------------
const lfmPanel = document.getElementById("lfmPanel");
const lfmStatus = document.getElementById("lfmStatus");
const lfmKeyInput = document.getElementById("lfmKey");
const ytKeyHint = document.getElementById("ytKeyHint");

function updateKeyUI() {
    const hasKey = getLastfmKey() !== "";
    lfmPanel.hidden = hasKey;
    lfmStatus.hidden = !hasKey;
    ytKeyHint.hidden = getYouTubeKey() !== "";
}

// 키가 바뀌면 검색 결과·추천을 새 키로 다시 불러온다.
function onKeyChanged() {
    updateKeyUI();
    lastProfileKey = null;
    syncFromAurora();
    const keyword = searchInput.value.trim();
    if (keyword !== "" && !searchResults.hidden) runSearch(keyword);
}

document.getElementById("lfmKeyForm").addEventListener("submit", event => {
    event.preventDefault();
    const key = lfmKeyInput.value.trim();
    if (!/^[0-9a-f]{32}$/i.test(key)) {
        alert("Last.fm API key는 영문/숫자 32자리예요. 'API key' 값을 복사했는지 확인해주세요. (Shared secret 아님)");
        return;
    }
    try {
        localStorage.setItem(LASTFM_KEY_STORE, key);
    } catch (error) {
        alert("브라우저 저장소를 사용할 수 없어 키를 저장하지 못했어요. (시크릿 모드·저장소 차단 확인)");
        return;
    }
    lfmKeyInput.value = "";
    onKeyChanged();
});

document.getElementById("lfmKeyReset").addEventListener("click", () => {
    try { localStorage.removeItem(LASTFM_KEY_STORE); } catch (error) { /* 무시 */ }
    onKeyChanged();
    lfmKeyInput.focus();
});

// 다른 탭(Aurora)에서 YouTube 키를 저장하면 안내 문구를 갱신
window.addEventListener("storage", event => {
    if (event.key === YT_KEY_STORE || event.key === LASTFM_KEY_STORE || event.key === null) updateKeyUI();
});

// ------------------------------------------------------------
// 14. 시작
// ------------------------------------------------------------
updateKeyUI();
syncFromAurora();
