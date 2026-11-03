// ============================================================
// home.js - 노래 검색 / 플레이리스트 / 장르 기반 디깅 추천
//   검색·유사곡·장르 추천 : Last.fm API
//   장르 보완(태그가 없을 때) : MusicBrainz API
// ============================================================

// ------------------------------------------------------------
// 1. 설정
// ------------------------------------------------------------
// API 키는 config.js에서 읽어온다. (config.js는 .gitignore에 있어서 GitHub에 올라가지 않는다.)
// 만드는 법: config.example.js를 config.js로 복사한 뒤 키를 넣는다.
const LASTFM_KEY = (typeof CONFIG !== "undefined" && CONFIG.LASTFM_KEY) || "";

const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";
const MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2/";

const RECOMMEND_COUNT = 5;              // 추천 칸마다 보여줄 곡 수
const SEARCH_DELAY = 400;               // 타이핑 멈추고 검색 시작까지 대기(ms)
const MIN_TAG_COUNT = 20;               // Last.fm 태그 투표 수 최소 기준(0~100)
const SIMILAR_TAG_LIMIT = 3;            // '비슷한 장르' 추천에 쓸 상위 장르 수
const DIFFERENT_TAG_LIMIT = 3;          // '다른 장르' 추천에 쓸 장르 수
const PLAYLIST_KEY = "musicdig_playlist_v2";
const TAG_CACHE_KEY = "musicdig_tag_cache_v1";

// '다른 장르' 추천 후보. 플레이리스트 장르와 겹치지 않는 것 중에서 고른다.
const DIFFERENT_TAG_POOL = [
    "jazz", "metal", "electronic", "classical", "hip-hop", "country",
    "reggae", "blues", "folk", "punk", "soul", "funk", "ambient",
    "house", "latin", "bossa nova", "shoegaze", "disco", "gospel",
    "techno", "ska", "soundtrack", "lo-fi", "city pop",
];

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
    "rnb": "r&b", "r and b": "r&b", "rhythm and blues": "r&b",
};

// ------------------------------------------------------------
// 2. 상태(state)
// ------------------------------------------------------------
// 플레이리스트: { id, title, artist, genres: [] } 객체 배열
let playlist = loadPlaylist();
let nowPlayingId = null;
let playQueue = [];
let tagCache = loadTagCache();          // 곡 id -> 장르 배열 (API 호출 절약)

let lastSearchResults = [];             // 가장 최근 검색 결과(곡 객체 배열)
let searchTimer = null;
let searchToken = 0;                    // 오래된 검색 응답이 최신 결과를 덮어쓰지 않게
let similarToken = 0;
let differentToken = 0;

// ------------------------------------------------------------
// 3. HTML 요소
// ------------------------------------------------------------
const searchForm = document.querySelector(".search_login_form");
const searchInput = document.querySelector(".input_box");
const playlistBox = document.querySelector(".playlist");
const sections = document.querySelectorAll(".recommendation_section");
const similarList = sections[0].querySelector("div");
const differentList = sections[1].querySelector("div");
const header = document.querySelector("header");

const searchResults = document.createElement("div");
searchResults.className = "search_results box";
searchResults.hidden = true;
header.appendChild(searchResults);

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
        id: `${artist}|||${title}`.toLowerCase(),
        title,
        artist,
        genres: [...genres],
    };
}

function isInPlaylist(id) {
    return playlist.some(song => song.id === id);
}

function findInPlaylist(id) {
    return playlist.find(song => song.id === id);
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

// "노래 제목 - 가수 [장르]" 한 줄 (textContent라 HTML이 섞여 있어도 안전)
function makeSongRow(song) {
    const row = document.createElement("p");
    row.className = "song_row";

    const info = document.createElement("span");
    info.className = "song_info";
    info.textContent = `${song.title} - ${song.artist} `;

    song.genres.slice(0, 2).forEach(genre => {
        const tag = document.createElement("span");
        tag.className = "genre_tag";
        tag.textContent = genre;
        info.appendChild(tag);
        info.appendChild(document.createTextNode(" "));
    });

    row.appendChild(info);
    return row;
}

// ------------------------------------------------------------
// 5. 저장 (localStorage)
// ------------------------------------------------------------
function savePlaylist() {
    try {
        localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
    } catch (error) {
        console.warn("플레이리스트 저장 실패:", error);
    }
}

function loadPlaylist() {
    try {
        const saved = JSON.parse(localStorage.getItem(PLAYLIST_KEY));
        if (!Array.isArray(saved)) return [];
        return saved
            .filter(s => s && s.title && s.artist)
            .map(s => ({ ...makeSong(s.title, s.artist, s.genres || []) }));
    } catch (error) {
        return [];
    }
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
// 6. API 호출 (Last.fm / MusicBrainz)
// ------------------------------------------------------------
async function lastfm(method, params = {}) {
    if (!LASTFM_KEY || LASTFM_KEY === "YOUR_LASTFM_API_KEY") {
        throw new Error("config.js에 Last.fm API 키를 넣어주세요. (config.example.js 참고)");
    }
    const url = new URL(LASTFM_URL);
    url.search = new URLSearchParams({
        method,
        api_key: LASTFM_KEY,
        format: "json",
        ...params,
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm 요청 실패 (HTTP ${response.status})`);
    const data = await response.json();
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

// ------------------------------------------------------------
// 7. 장르(태그) 가져오기
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
    return picked.slice(0, 5).map(t => t.name);
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

// 곡 하나의 장르 찾기: 곡 태그 -> 가수 태그 -> MusicBrainz 순서로 시도
async function getGenres(song) {
    if (tagCache[song.id] && tagCache[song.id].length > 0) return tagCache[song.id];

    const steps = [
        () => genresFromLastfmTrack(song.artist, song.title),
        () => genresFromLastfmArtist(song.artist),
        () => genresFromMusicBrainz(song.artist),
    ];
    for (const step of steps) {
        try {
            const genres = await step();
            if (genres.length > 0) {
                tagCache[song.id] = genres;
                saveTagCache();
                return genres;
            }
        } catch (error) {
            console.warn("장르 조회 실패:", error.message);
        }
    }
    return [];
}

// ------------------------------------------------------------
// 8. 플레이리스트 담기 / 빼기
// ------------------------------------------------------------
async function addToPlaylist(song) {
    if (isInPlaylist(song.id)) {
        alert("이미 플레이리스트에 있는 곡이에요.");
        return;
    }
    const entry = makeSong(song.title, song.artist, song.genres);
    playlist.push(entry);
    savePlaylist();
    renderPlaylist();
    renderSearchResults();                      // 검색 결과의 '+' 버튼을 '담김'으로

    // 정확한 장르를 가져와서 채운 뒤 추천을 새로 만든다.
    const genres = await getGenres(entry);
    if (genres.length > 0) entry.genres = genres;
    savePlaylist();
    renderPlaylist();
    renderRecommendations();
}

function removeFromPlaylist(id) {
    playlist = playlist.filter(song => song.id !== id);
    playQueue = playQueue.filter(songId => songId !== id);
    if (nowPlayingId === id) nowPlayingId = null;
    savePlaylist();
    renderPlaylist();
    renderSearchResults();
    renderRecommendations();
}

// ------------------------------------------------------------
// 9. 재생 (지금은 "재생 중" 표시만)
//    YouTube 연결 시 playSong 안에서 검색/재생하면 된다.
// ------------------------------------------------------------
function playSong(id) {
    nowPlayingId = id;
    renderPlaylist();
    // TODO: YouTube 연결 (예: `${artist} ${title}` 검색 후 player.loadVideoById)
    console.log("재생:", findInPlaylist(id));
}

function playAll() {
    if (playlist.length === 0) return;
    playQueue = playlist.map(song => song.id);
    playSong(playQueue[0]);
}

function playNext() {
    const index = playQueue.indexOf(nowPlayingId);
    if (index === -1 || index === playQueue.length - 1) {
        nowPlayingId = null;
        playQueue = [];
        renderPlaylist();
        return;
    }
    playSong(playQueue[index + 1]);
}

// ------------------------------------------------------------
// 10. 장르 기반 추천
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
// 11. 화면 그리기
// ------------------------------------------------------------
function renderPlaylist() {
    playlistBody.innerHTML = "";

    if (playlist.length === 0) {
        playlistBody.appendChild(
            makeMessage("검색하거나 추천 곡의 + 버튼으로 노래를 담아보세요.")
        );
        return;
    }

    const controls = document.createElement("div");
    controls.className = "playlist_controls";
    controls.appendChild(makeButton("▶ 전체 재생", "플레이리스트 전체 재생", playAll));

    if (nowPlayingId !== null && findInPlaylist(nowPlayingId)) {
        const nowPlaying = document.createElement("p");
        nowPlaying.className = "now_playing";
        nowPlaying.textContent = `재생 중: ${findInPlaylist(nowPlayingId).title}`;
        controls.appendChild(nowPlaying);
        if (playQueue.length > 0) {
            controls.appendChild(makeButton("다음 곡", "다음 곡 재생", playNext));
        }
    }
    playlistBody.appendChild(controls);

    playlist.forEach(song => {
        const row = makeSongRow(song);
        if (song.id === nowPlayingId) row.classList.add("playing");
        row.appendChild(makeButton("▶", "이 곡 재생", () => playSong(song.id)));
        row.appendChild(makeButton("✕", "플레이리스트에서 빼기", () => removeFromPlaylist(song.id)));
        playlistBody.appendChild(row);
    });
}

function fillSongList(container, list, emptyText) {
    container.innerHTML = "";
    if (list.length === 0) {
        container.appendChild(makeMessage(emptyText));
        return;
    }
    list.forEach(song => {
        const row = makeSongRow(song);
        row.appendChild(makeButton("+", "플레이리스트에 담기", () => addToPlaylist(song)));
        container.appendChild(row);
    });
}

async function loadSimilarSection() {
    const token = ++similarToken;
    const title = sections[0].querySelector("h3");
    const profile = getProfile();

    if (playlist.length === 0) {
        title.textContent = "플레이리스트와 비슷한 장르";
        showMessage(similarList, "플레이리스트에 노래를 담으면 비슷한 장르를 추천해드려요.");
        return;
    }
    if (profile.top.length === 0) {
        title.textContent = "플레이리스트와 비슷한 장르";
        showMessage(similarList, "장르 정보를 찾는 중이거나, 찾지 못했어요.");
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

    if (playlist.length === 0 || profile.top.length === 0) {
        title.textContent = "플레이리스트와 다른 장르";
        showMessage(
            differentList,
            playlist.length === 0
                ? "플레이리스트에 노래를 담으면 다른 장르를 추천해드려요."
                : "장르 정보를 찾는 중이거나, 찾지 못했어요."
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
    if (keyword === "") {
        searchResults.hidden = true;
        return;
    }
    if (lastSearchResults.length === 0) {
        searchResults.hidden = false;
        showMessage(searchResults, `"${keyword}"에 맞는 곡이 없어요. 영어 표기나 "가수 - 제목"으로도 검색해보세요.`);
        return;
    }

    searchResults.innerHTML = "";
    lastSearchResults.forEach(song => {
        const row = makeSongRow(song);
        if (isInPlaylist(song.id)) {
            const added = document.createElement("span");
            added.className = "added_label";
            added.textContent = "담김";
            row.appendChild(added);
        } else {
            row.appendChild(makeButton("+", "플레이리스트에 담기", () => addToPlaylist(song)));
        }
        searchResults.appendChild(row);
    });
    searchResults.hidden = false;
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
    if (!event.composedPath().includes(header)) searchResults.hidden = true;
});

searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim() !== "" && lastSearchResults.length > 0) {
        renderSearchResults();
    }
});

// ------------------------------------------------------------
// 13. 시작
// ------------------------------------------------------------
renderPlaylist();
renderRecommendations();

// 장르가 비어 있는 저장된 곡이 있으면 다시 조회해서 채운다.
(async function fillMissingGenres() {
    let changed = false;
    for (const song of playlist) {
        if (song.genres.length === 0) {
            const genres = await getGenres(song);
            if (genres.length > 0) {
                song.genres = genres;
                changed = true;
            }
        }
    }
    if (changed) {
        savePlaylist();
        renderPlaylist();
        renderRecommendations();
    }
})();
