// ============================================================
// digging/playlist_store.js - Aurora와 함께 쓰는 플레이리스트 저장소
//   저장 위치: users/{uid}/appData/aurora (게스트는 브라우저에만)
//   저장 형식: { playlists: [{ id, name, mode: "youtube", tracks: [...] }], current: { youtube: 목록 id } }
//   디깅은 YouTube 모드 목록만 다룬다.
//
//   다른 탭(Aurora)에서 바뀐 내용을 덮어쓰지 않도록 항상 '최신 값'을 복사해 고친 뒤 저장한다.
//   저장하면 로컬 캐시 키도 바뀌어서, 열려 있는 Aurora 탭이 storage 이벤트로 다시 읽는다.
// ============================================================
import { showDataError } from "../firebase_data.js";
import { makeSong, cleanTitle, uid } from "./utils.js";
import { youtubeTagsOf, songGenres } from "./genres.js";

let store = null;       // account_state.js의 openAccountState 결과
let latest = null;      // 계정 저장소/다른 탭에서 받은 가장 최근 원본
let state = null;       // 화면에 쓰는 정리된 사본

export function initPlaylistStore(accountStore) {
    store = accountStore;
    latest = accountStore.value;
    state = snapshot();
}

// 다른 탭이 저장할 때 바뀌는 로컬 캐시 키 (storage 이벤트 구분용)
export const cacheKey = () => store.cacheKey;

// 화면을 떠나기 전 남은 저장을 끝낸다.
export const flush = () => store.flush();

// 최신 원본을 깊은 복사하고 빠진 값을 채운다. (고치다 실패해도 원본은 그대로)
function snapshot() {
    let next = null;
    try {
        next = JSON.parse(JSON.stringify(latest));
    } catch {
        next = null;
    }
    if (!next || !Array.isArray(next.playlists)) next = { playlists: [], current: {} };
    if (!next.current || typeof next.current !== "object") next.current = {};
    // Aurora를 아직 한 번도 열지 않았으면 YouTube 기본 플레이리스트를 만들어 둔다(담을 때 저장됨).
    if (!next.playlists.some(p => p.mode === "youtube")) {
        next.playlists.push({ id: uid(), mode: "youtube", name: "내 플레이리스트", tracks: [] });
    }
    return next;
}

// 다른 탭에서 저장된 값(storage 이벤트의 newValue)을 받는다. 형식이 틀리면 false.
export function receiveExternal(json) {
    try {
        latest = JSON.parse(json);
    } catch {
        return false;
    }
    state = snapshot();
    return true;
}

export const youtubeLists = (s = state) => s.playlists.filter(p => p.mode === "youtube");

export function currentList(s = state) {
    const lists = youtubeLists(s);
    return lists.find(p => p.id === s.current.youtube) || lists[0];
}

// change(state)로 사본을 고친 뒤 계정 저장소에 저장한다. 저장 실패는 화면 상단 오류로 알린다.
function update(change) {
    const next = snapshot();
    change(next);
    latest = next;
    state = next;
    const pending = store.save(next);
    pending.catch(showDataError);
    return pending;
}

// ---------- 플레이리스트 관리 ----------
export function selectList(listId) {
    return update(s => { s.current.youtube = listId; });
}

export function createList(name) {
    return update(s => {
        const list = { id: uid(), name, mode: "youtube", tracks: [] };
        s.playlists.push(list);
        s.current.youtube = list.id;
    });
}

export function renameList(listId, name) {
    return update(s => {
        const target = s.playlists.find(p => p.id === listId);
        if (target) target.name = name;
    });
}

// 마지막 YouTube 목록은 지우지 않는다. (호출 전에 youtubeLists().length로 확인)
export function deleteList(listId) {
    return update(s => {
        s.playlists = s.playlists.filter(p => p.id !== listId);
        s.current.youtube = youtubeLists(s)[0].id;
    });
}

// ---------- 곡 담기 / 빼기 (현재 목록) ----------
export function addTracks(tracks) {
    return update(s => {
        const list = currentList(s);
        s.current.youtube = list.id;
        tracks.forEach(track => {
            if (!list.tracks.some(t => t.id === track.id)) list.tracks.push(track);
        });
    });
}

export function removeTrack(trackId) {
    return update(s => {
        const list = currentList(s);
        list.tracks = list.tracks.filter(t => t.id !== trackId);
    });
}

// ---------- 디깅용 곡 목록 ----------
// Aurora 트랙 -> 디깅 곡 객체
function trackToSong(track) {
    const song = makeSong(cleanTitle(track.title), track.artist);
    song.trackId = track.id;
    song.thumb = track.thumb || track.art || "";
    song.art = track.art || track.thumb || "";
    song.vid = track.vid || "";
    song.ytTags = youtubeTagsOf(track);
    song.genres = songGenres(song);
    return song;
}

// 현재 목록의 YouTube 곡을 디깅 곡 객체로 (같은 곡은 한 번만)
export function currentSongs() {
    const seen = new Set();
    return currentList().tracks
        .filter(t => t.source === "youtube" || String(t.id).startsWith("yt:"))
        .map(trackToSong)
        .filter(song => song.title && song.artist && !seen.has(song.id) && seen.add(song.id));
}
