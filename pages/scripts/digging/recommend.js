// ============================================================
// digging/recommend.js - 플레이리스트 장르 기반 추천
//   비슷한 장르 : 플레이리스트에서 점수가 높은 장르 상위 SIMILAR_TAG_LIMIT개
//   다른 장르   : DIFFERENT_TAG_POOL 중 플레이리스트 장르와 겹치지 않는 것을 무작위로
//   각 장르의 Last.fm 인기곡을 모아 섞은 뒤 RECOMMEND_COUNT곡을 고른다.
// ============================================================
import { RECOMMEND_COUNT, SIMILAR_TAG_LIMIT, DIFFERENT_TAG_LIMIT, DIFFERENT_TAG_POOL } from "./config.js";
import { lastfm } from "./api.js";
import { lastfmImage } from "./music_lookup.js";
import { makeSong, toArray, shuffle } from "./utils.js";

// 플레이리스트 전체의 장르 프로필. 곡마다 앞쪽 장르일수록 높은 점수를 준다.
//   top: 점수 높은 순 장르 배열 / all: 장르 집합
export function getProfile(songs) {
    const scores = {};
    songs.forEach(song => {
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
        if (tag === candidate || tag.includes(candidate) || candidate.includes(tag)) return true;
    }
    return false;
}

export const similarTags = profile => profile.top.slice(0, SIMILAR_TAG_LIMIT);

export function differentTags(profile) {
    const candidates = DIFFERENT_TAG_POOL.filter(tag => !isCloseToProfile(tag, profile.all));
    return shuffle(candidates).slice(0, DIFFERENT_TAG_LIMIT);
}

// 태그의 인기곡. 매번 다른 곡이 나오도록 1~3페이지 중 무작위로 고르고, 비어 있으면 1페이지로.
async function fetchTagTracks(tag) {
    const page = 1 + Math.floor(Math.random() * 3);
    let data = await lastfm("tag.getTopTracks", { tag, limit: 30, page });
    let tracks = toArray(data.tracks && data.tracks.track);
    if (tracks.length === 0 && page > 1) {
        data = await lastfm("tag.getTopTracks", { tag, limit: 30, page: 1 });
        tracks = toArray(data.tracks && data.tracks.track);
    }
    return tracks.map(t => {
        const song = makeSong(t.name, t.artist && t.artist.name ? t.artist.name : t.artist, [tag]);
        song.art = lastfmImage(t.image);    // 대부분 비어 있어서 카드를 그린 뒤 곡 정보로 채운다
        return song;
    });
}

// 여러 태그에서 곡을 모아 섞은 뒤 RECOMMEND_COUNT개만 고른다.
// isExcluded(songId)가 true인 곡(이미 플레이리스트에 있는 곡)은 뺀다.
// 모든 태그가 실패하면 첫 오류를 던진다.
export async function collectRecommendations(tags, isExcluded) {
    const settled = await Promise.allSettled(tags.map(fetchTagTracks));
    const fulfilled = settled.filter(r => r.status === "fulfilled");
    if (fulfilled.length === 0) {
        throw settled[0]?.reason || new Error("추천을 불러오지 못했어요.");
    }

    const seen = new Set();
    const pool = [];
    fulfilled.forEach(result => {
        result.value.forEach(song => {
            if (!song.title || !song.artist || seen.has(song.id) || isExcluded(song.id)) return;
            seen.add(song.id);
            pool.push(song);
        });
    });
    return shuffle(pool).slice(0, RECOMMEND_COUNT);
}
