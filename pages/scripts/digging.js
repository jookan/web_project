// ============================================================
// digging.js - 음악 디깅 페이지 (진입 파일)
//   플레이리스트 : Aurora(YouTube 모드)의 계정 플레이리스트(users/{uid}/appData/aurora)를 공유
//   태그 추출     : YouTube 영상 태그 + Last.fm 곡/가수 태그 (+ MusicBrainz 보완)
//   검색·추천     : Last.fm API
//   추천 곡 담기  : YouTube Data API로 영상을 찾아 Aurora 플레이리스트에 추가
//
//   이 파일은 화면 그리기와 이벤트 연결만 맡고, 나머지는 digging/ 폴더의 모듈이 맡는다.
//     config.js           설정값·장르 사전
//     utils.js            작은 도우미 함수
//     api.js              API 키 보관, Last.fm/MusicBrainz/YouTube 호출
//     genres.js           곡 장르 추출과 캐시
//     playlist_store.js   Aurora와 함께 쓰는 플레이리스트 저장소
//     music_lookup.js     곡 검색, YouTube 영상 찾기, 곡 정보
//     recommend.js        장르 기반 추천
//     ui.js               요소 만들기, 알림, 대화창
//     song_dialog.js      곡 정보 창
//     translate.js        곡 소개 한국어 번역
//     legacy_migration.js 예전 디깅 곡 옮기기
// ============================================================
import { openAccountState } from "./account_state.js";
import { initializeUserArea } from "./firebase_nav.js";
import { showDataError } from "./firebase_data.js";
import { SEARCH_DELAY, PLAYLIST_NAME_MAX, AURORA_STATE, LEGACY_DIGGING_STATE, storageKeys } from "./digging/config.js";
import {
    initApiKeys, keyStorageNames, getLastfmKey, getYouTubeKey, isValidLastfmKey, saveLastfmKey, clearLastfmKey,
} from "./digging/api.js";
import { hasCachedGenres, lookupExternalGenres, songGenres } from "./digging/genres.js";
import * as playlistStore from "./digging/playlist_store.js";
import { searchTracks, findYouTubeTrack, getSongInfo } from "./digging/music_lookup.js";
import { getProfile, similarTags, differentTags, collectRecommendations } from "./digging/recommend.js";
import {
    makeButton, makeLabel, showMessage, makeCover, makeSongRow, makeTrackText, notify, openDialog,
} from "./digging/ui.js";
import { initSongDialog, showSongInfo, refreshSongActions } from "./digging/song_dialog.js";
import {
    initLegacyMigration, legacySongs, migrateLegacySongs, migrationProgress,
} from "./digging/legacy_migration.js";
import { writeStorage } from "./digging/utils.js";

// ------------------------------------------------------------
// 1. 계정 저장소 열기
// ------------------------------------------------------------
// 로그인: Firestore + UID별 로컬 캐시 / 게스트: 브라우저에만 저장
const auroraStore = await openAccountState(AURORA_STATE.name, AURORA_STATE.legacyKey,
    () => ({ playlists: [], current: {} }));
if (auroraStore.loadError) showDataError(auroraStore.loadError);
// 예전 디깅 전용 곡 목록. 'Aurora로 옮기기'에만 사용한다.
const legacyStore = await openAccountState(LEGACY_DIGGING_STATE.name, LEGACY_DIGGING_STATE.legacyKey, () => []);
if (legacyStore.loadError) showDataError(legacyStore.loadError);

const KEYS = storageKeys(auroraStore.uid);
initApiKeys(auroraStore.uid);
playlistStore.initPlaylistStore(auroraStore);
initLegacyMigration(legacyStore, KEYS.movedToAurora);

// ------------------------------------------------------------
// 2. 상태
// ------------------------------------------------------------
let playlist = [];                      // 현재 Aurora 목록을 디깅 곡 객체로 바꾼 배열
const pendingAdds = new Set();          // YouTube에서 영상을 찾는 중인 곡 id
let lastSearchResults = [];             // 가장 최근 검색 결과
let searchTimer = null;
// 늦게 도착한 응답이 최신 결과를 덮어쓰지 않도록 요청마다 번호를 올린다.
const tokens = { search: 0, similar: 0, different: 0, analyze: 0 };
let lastProfileKey = null;              // 추천을 받은 플레이리스트 구성 (바뀔 때만 새로 추천)

const isInPlaylist = id => playlist.some(song => song.id === id);

// ------------------------------------------------------------
// 3. 화면 요소
// ------------------------------------------------------------
const $ = id => document.getElementById(id);
const searchArea = document.querySelector(".discovery-search");
const searchForm = document.querySelector(".search_login_form");
const searchInput = $("songSearch");
const playlistBox = document.querySelector(".playlist");
const playlistSelect = $("auroraPlaylistSelect");
const sections = document.querySelectorAll(".recommendation_section");
const recSections = {
    similar: { section: sections[0], list: sections[0].querySelector(".rec_list"), baseTitle: "플레이리스트와 비슷한 장르" },
    different: { section: sections[1], list: sections[1].querySelector(".rec_list"), baseTitle: "플레이리스트와 다른 장르" },
};

const searchResults = document.createElement("div");
searchResults.className = "search_results box";
searchResults.id = "searchResults";
searchResults.setAttribute("aria-live", "polite");
searchResults.hidden = true;
searchArea.appendChild(searchResults);

const playlistBody = document.createElement("div");
playlistBody.className = "playlist_body";
playlistBox.appendChild(playlistBody);

$("dgDialogInput").maxLength = PLAYLIST_NAME_MAX;

await initializeUserArea($("userArea"));

// ------------------------------------------------------------
// 4. 곡 담기 / 빼기 / Aurora에서 재생
// ------------------------------------------------------------
async function addToPlaylist(song) {
    if (isInPlaylist(song.id)) return notify("이미 플레이리스트에 있는 곡이에요.");
    if (pendingAdds.has(song.id)) return;
    if (!getYouTubeKey()) {
        return notify("Aurora에서 YouTube API 키를 먼저 저장해주세요. 담은 곡은 Aurora에서 YouTube로 재생돼요.");
    }

    pendingAdds.add(song.id);
    rerenderAddButtons();
    let track = null;
    try {
        track = await findYouTubeTrack(song);
        if (!track) notify(`YouTube에서 재생 가능한 "${song.title}" 영상을 찾지 못했어요.`);
    } catch (error) {
        notify("YouTube 검색 실패: " + error.message);
    }
    pendingAdds.delete(song.id);

    if (track) playlistStore.addTracks([track]);
    syncFromAurora();
}

function removeFromPlaylist(song) {
    playlistStore.removeTrack(song.trackId);
    syncFromAurora();
}

// 재생은 Aurora에서 한다. 남은 저장을 끝낸 뒤 YouTube 모드로 연다.
async function openInAurora() {
    writeStorage(KEYS.auroraMode, "youtube");
    try {
        await playlistStore.flush();
    } catch (error) {
        showDataError(error);
    }
    location.href = "aurora.html";
}

// 담기 상태에 맞는 버튼: 담김 / 찾는 중 / +
function appendAddControl(container, song) {
    if (isInPlaylist(song.id)) container.appendChild(makeLabel("담김"));
    else if (pendingAdds.has(song.id)) container.appendChild(makeLabel("YouTube에서 찾는 중…"));
    else container.appendChild(makeButton("+", "Aurora 플레이리스트에 담기", () => addToPlaylist(song)));
}

// 곡 정보 창 아래 버튼
initSongDialog({
    renderActions(container, song) {
        if (isInPlaylist(song.id)) {
            container.append(
                makeLabel("플레이리스트에 담김 ✓"),
                makeButton("▶ Aurora에서 재생", "이 플레이리스트를 Aurora에서 재생", openInAurora),
            );
        } else if (pendingAdds.has(song.id)) {
            container.appendChild(makeLabel("YouTube에서 찾는 중…"));
        } else {
            container.appendChild(makeButton("＋ 플레이리스트에 담기", `"${playlistStore.currentList().name}"에 담기`,
                () => addToPlaylist(song), "dg_primary"));
        }
    },
});

// ------------------------------------------------------------
// 5. 플레이리스트 관리 (Aurora와 같은 기능, 페이지 안 대화창)
// ------------------------------------------------------------
async function createPlaylist() {
    const name = await openDialog({
        title: "새 플레이리스트",
        input: { label: "플레이리스트 이름", placeholder: "예) 출근길 재즈" },
        confirmText: "만들기",
    });
    if (!name) return;
    playlistStore.createList(name);
    notify(`"${name}" 플레이리스트를 만들었어요.`);
    syncFromAurora();
}

async function renamePlaylist() {
    const list = playlistStore.currentList();
    const name = await openDialog({
        title: "이름 변경",
        input: { label: "새 이름", value: list.name },
        confirmText: "변경",
    });
    if (!name || name === list.name) return;
    playlistStore.renameList(list.id, name);
    renderPlaylist();
}

async function deletePlaylist() {
    if (playlistStore.youtubeLists().length < 2) return notify("마지막 플레이리스트는 삭제할 수 없어요.");
    const list = playlistStore.currentList();
    const ok = await openDialog({
        title: "플레이리스트 삭제",
        message: `"${list.name}" (${list.tracks.length}곡)을 삭제할까요?\nAurora에서도 함께 삭제돼요.`,
        confirmText: "삭제",
        danger: true,
    });
    if (!ok) return;
    playlistStore.deleteList(list.id);
    notify(`"${list.name}" 플레이리스트를 삭제했어요.`);
    syncFromAurora();
}

async function migrateLegacy() {
    await migrateLegacySongs(isInPlaylist, renderPlaylist);
    syncFromAurora();
}

// ------------------------------------------------------------
// 6. 화면 그리기 - 플레이리스트
// ------------------------------------------------------------
function renderPlaylistSelect() {
    playlistSelect.replaceChildren(...playlistStore.youtubeLists().map(list => {
        const option = document.createElement("option");
        option.value = list.id;
        option.textContent = `${list.name} (${list.tracks.length})`;
        return option;
    }));
    playlistSelect.value = playlistStore.currentList().id;
}

// Aurora 트랙 목록과 같은 모양: 썸네일 + 제목(굵게) / 가수 · 장르(작게) + ✕
function makePlaylistItem(song) {
    const li = document.createElement("li");
    li.className = "pl_track";

    const open = makeButton("", "곡 정보 보기", () => showSongInfo(song), "pl_open");
    open.append(
        makeCover(song.thumb, "pl_thumb"),
        makeTrackText(song.title, [song.artist, song.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ")),
    );

    const remove = makeButton("✕", "플레이리스트에서 빼기", () => removeFromPlaylist(song), "mini");
    remove.setAttribute("aria-label", `${song.title} 플레이리스트에서 빼기`);
    li.append(open, remove);
    return li;
}

function renderPlaylist() {
    renderPlaylistSelect();
    playlistBody.replaceChildren();

    // 예전 디깅 목록에 남은 곡이 있으면 Aurora로 옮기는 버튼을 보여준다.
    const progress = migrationProgress();
    const legacyCount = legacySongs(isInPlaylist).length;
    if (legacyCount > 0 || progress) {
        const button = makeButton(progress || `예전 디깅 곡 ${legacyCount}곡 Aurora로 옮기기`,
            "예전 디깅 목록의 곡을 YouTube에서 찾아 현재 Aurora 플레이리스트에 담기", migrateLegacy, "migrate_button");
        button.disabled = progress !== "";
        playlistBody.appendChild(button);
    }

    if (playlist.length === 0) {
        const hint = document.createElement("p");
        hint.className = "pl_hint";
        hint.textContent = "검색하거나 추천 곡의 + 버튼으로 노래를 담아보세요.";
        playlistBody.appendChild(hint);
        return;
    }

    const controls = document.createElement("div");
    controls.className = "playlist_controls";
    controls.appendChild(makeButton("▶ Aurora에서 재생", "이 플레이리스트를 Aurora에서 재생", openInAurora));

    const ol = document.createElement("ol");
    ol.className = "pl_tracks";
    ol.append(...playlist.map(makePlaylistItem));
    playlistBody.append(controls, ol);
}

// ------------------------------------------------------------
// 7. 화면 그리기 - 추천 카드
// ------------------------------------------------------------
// 카드를 그린 뒤 곡 정보에서 앨범 자켓을 받아 채운다. 받은 자켓은 곡 객체에 기억한다.
async function loadCardCover(song, card) {
    if (song.coverLoaded) return;
    try {
        const info = await getSongInfo(song);
        song.coverLoaded = true;
        if (info.album) song.album = info.album;
        if (!info.art || info.art === song.art) return;
        song.art = info.art;
        card.querySelector(".rec_cover_img")?.replaceWith(makeCover(song.art, "rec_cover_img"));
    } catch (error) {
        console.warn("곡 정보 조회 실패:", error.message);
    }
}

// 앨범 자켓 + 제목 / 가수 + 담기 버튼. 자켓을 누르면 곡 정보 창을 연다.
function makeSongCard(song) {
    const card = document.createElement("article");
    card.className = "rec_card";

    const cover = makeButton("", "곡 정보 보기", () => showSongInfo(song), "rec_cover");
    cover.setAttribute("aria-label", `${song.title} - ${song.artist} 곡 정보 보기`);
    cover.appendChild(makeCover(song.art, "rec_cover_img"));

    const meta = document.createElement("div");
    meta.className = "rec_meta";
    meta.appendChild(makeTrackText(song.title, song.artist));
    appendAddControl(meta, song);

    card.append(cover, meta);
    loadCardCover(song, card);
    return card;
}

function fillRecommendations(container, songs, emptyText) {
    container._songs = songs;
    if (songs.length === 0) return showMessage(container, emptyText);
    const grid = document.createElement("div");
    grid.className = "rec_grid";
    grid.append(...songs.map(makeSongCard));
    container.replaceChildren(grid);
}

// 담기 상태(+ / 찾는 중 / 담김)만 바뀌었을 때 네트워크 호출 없이 다시 그린다.
function rerenderAddButtons() {
    refreshSongActions();
    renderSearchResults();
    Object.values(recSections).forEach(({ list }) => {
        if (Array.isArray(list._songs) && list._songs.length > 0) fillRecommendations(list, list._songs, "");
    });
}

// kind: "similar" | "different"
async function loadRecommendations(kind) {
    const token = ++tokens[kind];
    const { section, list, baseTitle } = recSections[kind];
    const title = section.querySelector("h3");
    const profile = getProfile(playlist);
    list._songs = null;

    if (playlist.length === 0 || profile.top.length === 0) {
        title.textContent = baseTitle;
        const what = kind === "similar" ? "비슷한" : "다른";
        showMessage(list, playlist.length === 0
            ? `플레이리스트에 노래를 담으면 ${what} 장르를 추천해드려요.`
            : "플레이리스트 곡에서 장르 태그를 찾지 못했어요.");
        return;
    }

    const tags = kind === "similar" ? similarTags(profile) : differentTags(profile);
    title.textContent = `${baseTitle} (${tags.join(", ")})`;
    showMessage(list, "추천 곡을 찾는 중...");
    try {
        const songs = await collectRecommendations(tags, isInPlaylist);
        if (token !== tokens[kind]) return;
        fillRecommendations(list, songs, "추천할 곡을 찾지 못했어요. 다시 추천을 눌러보세요.");
    } catch (error) {
        if (token !== tokens[kind]) return;
        showMessage(list, error.message);
    }
}

// 추천 칸 제목 옆 '다시 추천' 버튼
Object.keys(recSections).forEach(kind => {
    const title = recSections[kind].section.querySelector("h3");
    const header = document.createElement("div");
    header.className = "section_header";
    title.replaceWith(header);
    header.append(title, makeButton("🔄 다시 추천", "다른 곡 추천받기", () => loadRecommendations(kind)));
});

// ------------------------------------------------------------
// 8. Aurora 플레이리스트 읽기 -> 태그 추출 -> 추천
// ------------------------------------------------------------
async function syncFromAurora() {
    const token = ++tokens.analyze;
    playlist = playlistStore.currentSongs();
    renderPlaylist();
    refreshSongActions();
    renderSearchResults();

    // 외부 API 장르를 아직 모르는 곡만 차례로 조회 (MusicBrainz 속도 제한 때문에 순서대로)
    const missing = playlist.filter(song => !hasCachedGenres(song.id));
    if (missing.length > 0) {
        Object.values(recSections).forEach(({ list }) => {
            list._songs = null;
            showMessage(list, `플레이리스트에서 태그를 추출하는 중... (${missing.length}곡)`);
        });
        lastProfileKey = null;
    }
    for (const song of missing) {
        await lookupExternalGenres(song);
        if (token !== tokens.analyze) return;   // 그 사이 플레이리스트가 바뀌었으면 새 작업에 맡긴다
        song.genres = songGenres(song);
        renderPlaylist();
    }

    // 플레이리스트 곡 구성이 바뀌었을 때만 추천을 새로 받는다.
    const profileKey = playlist.map(song => song.id).join("\n");
    if (profileKey !== lastProfileKey) {
        lastProfileKey = profileKey;
        loadRecommendations("similar");
        loadRecommendations("different");
    } else {
        rerenderAddButtons();
    }
}

playlistSelect.addEventListener("change", () => {
    playlistStore.selectList(playlistSelect.value);
    syncFromAurora();
});
$("newPlaylist").addEventListener("click", createPlaylist);
$("renamePlaylist").addEventListener("click", renamePlaylist);
$("deletePlaylist").addEventListener("click", deletePlaylist);

// ------------------------------------------------------------
// 9. 검색 (Last.fm track.search)
// ------------------------------------------------------------
async function runSearch(keyword) {
    const token = ++tokens.search;
    searchResults.hidden = false;
    showMessage(searchResults, "검색 중...");
    try {
        const songs = await searchTracks(keyword);
        if (token !== tokens.search) return;
        lastSearchResults = songs;
        renderSearchResults(keyword);
    } catch (error) {
        if (token !== tokens.search) return;
        showMessage(searchResults, error.message);
    }
}

// 마지막 검색 결과를 다시 그린다(네트워크 호출 없음).
function renderSearchResults(keyword = searchInput.value.trim()) {
    if (keyword === "" || searchResults.hidden) return;
    if (lastSearchResults.length === 0) {
        showMessage(searchResults, `"${keyword}"에 맞는 곡이 없어요. 영어 표기나 "가수 - 제목"으로도 검색해보세요.`);
        return;
    }
    searchResults.replaceChildren(...lastSearchResults.map(song => {
        const row = makeSongRow(song);
        appendAddControl(row, song);
        return row;
    }));
}

// 타이핑을 멈추면 검색 (글자마다 API를 부르지 않도록 지연)
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const keyword = searchInput.value.trim();
    if (keyword === "") {
        tokens.search++;
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

searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim() === "" || lastSearchResults.length === 0) return;
    searchResults.hidden = false;
    renderSearchResults();
});

// 검색 영역 바깥을 누르면 닫기 (+ 클릭으로 요소가 바뀌어도 동작하도록 composedPath 사용)
document.addEventListener("click", event => {
    if (!event.composedPath().includes(searchArea)) searchResults.hidden = true;
});

// ------------------------------------------------------------
// 10. Last.fm API 키 입력 (Aurora의 YouTube 키 입력과 같은 방식)
// ------------------------------------------------------------
const lfmKeyInput = $("lfmKey");

function updateKeyUI() {
    const hasKey = getLastfmKey() !== "";
    $("lfmPanel").hidden = hasKey;
    $("lfmStatus").hidden = !hasKey;
    $("ytKeyHint").hidden = getYouTubeKey() !== "";
}

// 키가 바뀌면 장르·추천·검색 결과를 새 키로 다시 불러온다.
function onKeyChanged() {
    updateKeyUI();
    lastProfileKey = null;
    syncFromAurora();
    const keyword = searchInput.value.trim();
    if (keyword !== "" && !searchResults.hidden) runSearch(keyword);
}

$("lfmKeyForm").addEventListener("submit", event => {
    event.preventDefault();
    const key = lfmKeyInput.value.trim();
    if (!isValidLastfmKey(key)) {
        return notify("Last.fm API key는 영문/숫자 32자리예요. 'API key' 값을 복사했는지 확인해주세요. (Shared secret 아님)");
    }
    if (!saveLastfmKey(key)) {
        return notify("브라우저 저장소를 사용할 수 없어 키를 저장하지 못했어요. (시크릿 모드·저장소 차단 확인)");
    }
    lfmKeyInput.value = "";
    onKeyChanged();
});

$("lfmKeyReset").addEventListener("click", () => {
    clearLastfmKey();
    onKeyChanged();
    lfmKeyInput.focus();
});

// ------------------------------------------------------------
// 11. 다른 탭과 동기화
// ------------------------------------------------------------
window.addEventListener("storage", event => {
    // Aurora가 다른 탭에 열려 있어도 플레이리스트 변경을 바로 반영
    if (event.key === playlistStore.cacheKey() && event.newValue) {
        if (playlistStore.receiveExternal(event.newValue)) syncFromAurora();
        return;
    }
    // 다른 탭에서 API 키를 저장·삭제하면 안내 문구를 갱신 (null = 저장소 전체 삭제)
    const keyNames = keyStorageNames();
    if (event.key === keyNames.youtube || event.key === keyNames.lastfm || event.key === null) updateKeyUI();
});

// ------------------------------------------------------------
// 12. 시작
// ------------------------------------------------------------
updateKeyUI();
syncFromAurora();
