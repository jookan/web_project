// ============================================================
// digging/api.js - API 키 보관과 외부 API 호출 (Last.fm / MusicBrainz / YouTube)
//   API 키는 코드·DB에 넣지 않는다. 사용자가 직접 발급받아 화면에서 입력하면
//   이 브라우저에 계정(UID)별로만 저장된다.
//     Last.fm 키 : 디깅 페이지의 'Last.fm API 키' 패널에서 입력
//     YouTube 키 : Aurora 페이지에서 입력한 키를 같이 사용
// ============================================================
import {
    LASTFM_URL, MUSICBRAINZ_URL, YOUTUBE_URL, YOUTUBE_OEMBED_URL, MUSICBRAINZ_INTERVAL, storageKeys,
} from "./config.js";
import { sleep, readStorage, writeStorage, removeStorage } from "./utils.js";

// ---------- API 키 ----------
let keys = storageKeys("guest");

// 로그인 계정이 정해진 뒤 한 번 호출한다.
export function initApiKeys(uid) {
    keys = storageKeys(uid);
}

export const keyStorageNames = () => ({ lastfm: keys.lastfmKey, youtube: keys.youtubeKey });
export const getLastfmKey = () => readStorage(keys.lastfmKey);
export const getYouTubeKey = () => readStorage(keys.youtubeKey);
export const isValidLastfmKey = key => /^[0-9a-f]{32}$/i.test(key);
export const saveLastfmKey = key => writeStorage(keys.lastfmKey, key);
export const clearLastfmKey = () => removeStorage(keys.lastfmKey);

// ---------- Last.fm ----------
export async function lastfm(method, params = {}) {
    const apiKey = getLastfmKey();
    if (!apiKey) throw new Error("위의 'Last.fm API 키' 칸에 발급받은 키를 먼저 저장해주세요.");

    const url = new URL(LASTFM_URL);
    url.search = new URLSearchParams({ method, api_key: apiKey, format: "json", ...params });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Last.fm 요청 실패 (HTTP ${response.status})`);

    const data = await response.json();
    // 10: 잘못된 키, 26: 정지된 키
    if (data.error === 10 || data.error === 26) {
        throw new Error("Last.fm API 키가 올바르지 않아요. '키 변경'을 눌러 다시 입력해주세요.");
    }
    if (data.error) throw new Error(`Last.fm: ${data.message}`);
    return data;
}

// ---------- MusicBrainz ----------
// 초당 1회 제한이 있어서 요청을 한 줄로 세우고 간격을 둔다.
let musicbrainzQueue = Promise.resolve();

export function musicbrainz(path, params = {}) {
    const request = musicbrainzQueue.then(async () => {
        const url = new URL(MUSICBRAINZ_URL + path);
        url.search = new URLSearchParams({ fmt: "json", ...params });
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`MusicBrainz 요청 실패 (HTTP ${response.status})`);
        return response.json();
    });
    musicbrainzQueue = request.catch(() => {}).then(() => sleep(MUSICBRAINZ_INTERVAL));
    return request;
}

// ---------- YouTube ----------
export async function youtube(path, params) {
    const key = getYouTubeKey();
    if (!key) throw new Error("Aurora에서 YouTube API 키를 먼저 저장해주세요.");

    const url = new URL(YOUTUBE_URL + path);
    url.search = new URLSearchParams({ ...params, key });
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `YouTube 요청 실패 (HTTP ${response.status})`);
    return data;
}

// 다른 사이트에 넣어 재생할 수 있는 영상인지 확인한다. (401/403 = 임베드 금지)
// 네트워크 오류일 때는 막지 않고 통과시킨다. (Aurora와 같은 검사)
export function isEmbeddable(videoId) {
    const url = YOUTUBE_OEMBED_URL + "?format=json&url="
        + encodeURIComponent("https://www.youtube.com/watch?v=" + videoId);
    return fetch(url).then(response => response.ok, () => true);
}
