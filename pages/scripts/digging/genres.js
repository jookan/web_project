// ============================================================
// digging/genres.js - 곡의 장르(태그) 추출
//   1) YouTube 영상 태그 중 장르 사전(GENRE_VOCAB)에 있는 것
//   2) Last.fm 곡 태그 -> 가수 태그
//   3) 둘 다 없으면 MusicBrainz 가수 장르
//   외부 API 결과는 브라우저에 캐시해서 같은 곡을 다시 묻지 않는다.
// ============================================================
import {
    GENRE_VOCAB, TAG_BLACKLIST, TAG_ALIASES, MIN_TAG_COUNT, MAX_GENRES, TAG_CACHE_KEY, GENRE_LABELS_KO,
} from "./config.js";
import { lastfm, musicbrainz } from "./api.js";
import { toArray, readJson, writeStorage, mergeGenres } from "./utils.js";

// ---------- 태그 정리 ----------
function normalizeTag(name) {
    const tag = String(name).toLowerCase().trim();
    return TAG_ALIASES[tag] || tag;
}

function isGenreTag(tag, artist) {
    if (!tag || tag.length > 30) return false;
    if (TAG_BLACKLIST.has(tag)) return false;
    if (/^\d{2,4}s?$/.test(tag)) return false;                       // 1990s, 2020 같은 연도
    if (tag === String(artist).toLowerCase().trim()) return false;   // 가수 이름 태그
    return true;
}

// 화면에 보여줄 장르 이름 (한국어 이름이 있으면 한국어)
export const genreLabel = genre => GENRE_LABELS_KO[genre] || genre;

// rawTags: [{ name, count }] -> 장르 이름 배열(최대 MAX_GENRES개)
export function cleanTags(rawTags, artist) {
    const unique = [];
    rawTags
        .map(t => ({ name: normalizeTag(t.name), count: Number(t.count) || 0 }))
        .filter(t => isGenreTag(t.name, artist))
        .forEach(t => {
            if (!unique.some(u => u.name === t.name)) unique.push(t);
        });

    let picked = unique.filter(t => t.count >= MIN_TAG_COUNT);
    if (picked.length === 0) picked = unique.slice(0, 2);   // 기준 미달이면 상위 2개라도
    return picked.slice(0, MAX_GENRES).map(t => t.name);
}

// ---------- YouTube 태그 ----------
// Aurora 트랙에 저장된 YouTube 태그 꺼내기
//   새로 담은 곡: tags 배열 / 예전에 담은 곡: genre 문자열(태그를 공백으로 이어 붙인 것)
export function youtubeTagsOf(track) {
    if (Array.isArray(track.tags)) return track.tags;
    return String(track.genre || "").split(/\s+/).filter(Boolean);
}

// YouTube 태그 중 장르 사전에 있는 것만 장르로 인정한다.
export function genresFromYouTubeTags(tags, artist) {
    const genres = [];
    toArray(tags).forEach(raw => {
        const tag = normalizeTag(String(raw).replace(/\s+(music|songs?|음악)$/i, ""));
        if (GENRE_VOCAB.has(tag) && isGenreTag(tag, artist) && !genres.includes(tag)) {
            genres.push(tag);
        }
    });
    return genres.slice(0, MAX_GENRES);
}

// ---------- 외부 API ----------
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

// ---------- 캐시 (곡 id -> 외부 API 장르 배열) ----------
const tagCache = readJson(TAG_CACHE_KEY, {});

function saveTagCache() {
    if (!writeStorage(TAG_CACHE_KEY, JSON.stringify(tagCache))) {
        console.warn("태그 캐시를 저장하지 못했어요.");
    }
}

export const hasCachedGenres = songId => Array.isArray(tagCache[songId]);

// 다른 곳(예전 디깅 목록)에서 이미 알고 있는 장르를 캐시에 넣는다. 저장은 saveGenreCache로 한 번에.
export function rememberGenres(songId, genres) {
    if (genres.length > 0 && !tagCache[songId]?.length) tagCache[songId] = genres;
}
export const saveGenreCache = saveTagCache;

// 곡 객체의 최종 장르 = 외부 API 장르 + YouTube 태그 장르
export function songGenres(song) {
    return mergeGenres(tagCache[song.id] || [], genresFromYouTubeTags(song.ytTags, song.artist));
}

// 외부 API로 곡 장르 찾기: 곡 태그 -> 가수 태그 -> MusicBrainz 순서로 시도.
// YouTube 태그로 이미 장르를 찾은 곡은 느린 MusicBrainz까지는 가지 않는다.
export async function lookupExternalGenres(song) {
    if (hasCachedGenres(song.id)) return tagCache[song.id];

    const steps = [
        () => genresFromLastfmTrack(song.artist, song.title),
        () => genresFromLastfmArtist(song.artist),
    ];
    if (genresFromYouTubeTags(song.ytTags, song.artist).length === 0) {
        steps.push(() => genresFromMusicBrainz(song.artist));
    }

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
    // (오류가 났을 때는 기억하지 않아 다음에 다시 시도한다.)
    if (!failed) {
        tagCache[song.id] = [];
        saveTagCache();
    }
    return [];
}
