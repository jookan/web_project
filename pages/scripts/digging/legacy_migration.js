// ============================================================
// digging/legacy_migration.js - 예전 디깅 목록 -> Aurora 플레이리스트로 옮기기
//   예전 디깅 곡은 계정의 appData/digging과, 계정 구분 전 브라우저 목록(musicdig_playlist_v2)에 있다.
//   YouTube 영상 정보가 없어서 곡마다 YouTube에서 영상을 찾아 담는다.
//   원본은 지우지 않고, 옮긴 곡 id만 브라우저에 기억해 다시 보이지 않게 한다.
// ============================================================
import { getYouTubeKey } from "./api.js";
import { findYouTubeTrack } from "./music_lookup.js";
import { rememberGenres, saveGenreCache } from "./genres.js";
import { addTracks, currentList } from "./playlist_store.js";
import { openDialog, notify } from "./ui.js";
import { makeSong, toArray, readJson, writeStorage } from "./utils.js";

let legacyStore = null;     // openAccountState("digging", ...) 결과
let movedKey = "";          // 옮긴 곡 id 목록을 기억하는 브라우저 키
let progress = "";          // 진행 중 문구 ("옮기는 중… (3/10)"), 진행 중이 아니면 ""

export function initLegacyMigration(accountStore, movedStorageKey) {
    legacyStore = accountStore;
    movedKey = movedStorageKey;
}

export const migrationProgress = () => progress;

const readMovedIds = () => toArray(readJson(movedKey, []));

// 아직 옮기지 않았고 현재 플레이리스트에도 없는 예전 곡 (중복 제거)
export function legacySongs(isInPlaylist) {
    if (!legacyStore) return [];
    const skip = new Set(readMovedIds());
    const songs = [];
    [...toArray(legacyStore.value), ...toArray(legacyStore.legacy())].forEach(item => {
        if (!item || !item.title || !item.artist) return;
        const song = makeSong(item.title, item.artist, Array.isArray(item.genres) ? item.genres : []);
        if (skip.has(song.id) || isInPlaylist(song.id) || songs.some(s => s.id === song.id)) return;
        songs.push(song);
    });
    return songs;
}

// onChange: 진행 상황이 바뀔 때마다 화면을 다시 그리는 함수
// 끝나면 옮긴 곡 수를 돌려준다. (취소·불가능하면 0)
export async function migrateLegacySongs(isInPlaylist, onChange) {
    const songs = legacySongs(isInPlaylist);
    if (songs.length === 0 || progress) return 0;
    if (!getYouTubeKey()) {
        notify("Aurora에서 YouTube API 키를 먼저 저장해주세요. 옮긴 곡은 Aurora에서 YouTube로 재생돼요.");
        return 0;
    }
    const ok = await openDialog({
        title: "예전 디깅 곡 옮기기",
        message: `예전 디깅 목록의 ${songs.length}곡을 YouTube에서 찾아 "${currentList().name}"에 담을까요?\n`
            + "곡마다 YouTube API 할당량을 약 100씩 사용해요.",
        confirmText: "옮기기",
    });
    if (!ok) return 0;

    const tracks = [];
    const movedIds = [];
    const failed = [];
    for (const [i, song] of songs.entries()) {
        progress = `옮기는 중… (${i + 1}/${songs.length})`;
        onChange();
        try {
            const track = await findYouTubeTrack(song);
            if (track) {
                tracks.push(track);
                movedIds.push(song.id);
                rememberGenres(song.id, song.genres);   // 예전 장르를 캐시에 넣어 Last.fm 재조회를 줄인다
            } else {
                failed.push(song);
            }
        } catch (error) {
            failed.push(song);
            if (/quota/i.test(error.message)) {
                notify("YouTube API 오늘 할당량을 다 써서 멈췄어요. 남은 곡은 내일 다시 옮길 수 있어요.");
                break;
            }
        }
    }
    progress = "";
    saveGenreCache();

    if (tracks.length > 0) {
        addTracks(tracks);
        // 기억하지 못해도 이미 담긴 곡은 목록에서 제외되므로 실패는 무시한다.
        writeStorage(movedKey, JSON.stringify([...readMovedIds(), ...movedIds]));
    }
    const failText = failed.length > 0
        ? ` 찾지 못한 곡 ${failed.length}개: ${failed.slice(0, 5).map(s => `${s.title} - ${s.artist}`).join(", ")}${failed.length > 5 ? " 등" : ""}`
        : "";
    notify(`${tracks.length}곡을 Aurora 플레이리스트로 옮겼어요.${failText}`);
    onChange();
    return tracks.length;
}
