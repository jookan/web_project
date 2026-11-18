// ============================================================
// digging/music_lookup.js - 곡 찾기
//   searchTracks      : Last.fm에서 곡 검색
//   findYouTubeTrack  : Last.fm 곡(제목/가수) -> 재생 가능한 YouTube 영상(Aurora 트랙 형식)
//   getSongInfo       : Last.fm track.getInfo로 앨범 자켓·앨범명·청취 수·소개
// ============================================================
import { MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS, REGION, LASTFM_PLACEHOLDER, SEARCH_LIMIT } from "./config.js";
import { lastfm, youtube, isEmbeddable } from "./api.js";
import { cleanTags } from "./genres.js";
import { makeSong, toArray, plainText, isoDurationToSeconds } from "./utils.js";

// ---------- 검색 ----------
// "가수 - 제목" 형태로 입력하면 두 값으로 나눠서 더 정확히 찾는다.
export async function searchTracks(keyword) {
    const params = { track: keyword, limit: SEARCH_LIMIT };
    if (keyword.includes(" - ")) {
        const [artist, track] = keyword.split(" - ", 2);
        params.artist = artist.trim();
        params.track = track.trim();
    }
    const data = await lastfm("track.search", params);
    return toArray(data.results && data.results.trackmatches && data.results.trackmatches.track)
        .map(t => makeSong(t.name, t.artist))
        .filter(song => song.title && song.artist);
}

// ---------- YouTube 영상 찾기 ----------
const isTopicChannel = snippet => / - Topic$/.test(snippet.channelTitle);

// 노래 길이이고, 라이브가 아니고, 임베드 가능하고, 한국에서 볼 수 있는 영상만
function isPlayableVideo(video) {
    const seconds = isoDurationToSeconds(video.contentDetails.duration);
    const region = video.contentDetails.regionRestriction;
    return seconds >= MIN_VIDEO_SECONDS && seconds <= MAX_VIDEO_SECONDS
        && video.snippet.liveBroadcastContent === "none"
        && video.status.embeddable !== false
        && !region?.blocked?.includes(REGION)
        && (!region?.allowed || region.allowed.includes(REGION));
}

// 곡 하나에 YouTube API 할당량을 약 100(search) + 1(videos) 사용한다.
export async function findYouTubeTrack(song) {
    const search = await youtube("search", {
        part: "snippet", type: "video", videoCategoryId: "10", videoEmbeddable: "true",
        videoSyndicated: "true", maxResults: "8", q: `${song.artist} ${song.title}`,
    });
    const ids = search.items.map(item => item.id.videoId).filter(Boolean);
    if (ids.length === 0) return null;

    const videos = await youtube("videos", { part: "snippet,contentDetails,status", id: ids.join(",") });
    // Topic 채널(공식 음원)이 임베드가 잘 되고 앨범 아트도 나와서 앞으로
    const candidates = videos.items
        .filter(isPlayableVideo)
        .sort((a, b) => isTopicChannel(b.snippet) - isTopicChannel(a.snippet));

    for (const video of candidates) {
        if (!(await isEmbeddable(video.id))) continue;
        const thumbs = video.snippet.thumbnails;
        const tags = (video.snippet.tags || []).slice(0, 15);
        return {
            id: "yt:" + video.id, source: "youtube", vid: video.id,
            title: song.title, artist: song.artist,
            topic: isTopicChannel(video.snippet),
            album: video.snippet.channelTitle,
            art: (thumbs.maxres || thumbs.high || thumbs.medium || thumbs.default).url,
            thumb: (thumbs.medium || thumbs.default).url,
            tags,                                       // 디깅의 장르 분석용
            genre: [...song.genres, ...tags].join(" "), // Aurora의 무드(배경 분위기) 계산용
        };
    }
    return null;
}

// ---------- 곡 정보 ----------
// Last.fm 이미지 배열에서 가장 큰 실제 이미지 (기본 별 이미지는 제외)
export function lastfmImage(images) {
    const list = toArray(images);
    for (const size of ["extralarge", "large", "medium", "small"]) {
        const url = (list.find(image => image.size === size) || {})["#text"];
        if (url && !url.includes(LASTFM_PLACEHOLDER)) return url;
    }
    return "";
}

const infoCache = new Map();    // 곡 id -> Promise<정보>

// { art, album, listeners, playcount, duration(초), tags, summary, url }
// 같은 곡은 한 번만 요청하고, 실패하면 캐시에서 빼서 다음에 다시 시도한다.
export function getSongInfo(song) {
    if (!infoCache.has(song.id)) {
        const pending = lastfm("track.getInfo", { artist: song.artist, track: song.title, autocorrect: 1 })
            .then(data => {
                const t = data.track || {};
                return {
                    art: lastfmImage(t.album && t.album.image),
                    album: (t.album && t.album.title) || "",
                    listeners: Number(t.listeners) || 0,
                    playcount: Number(t.playcount) || 0,
                    duration: Math.round((Number(t.duration) || 0) / 1000),
                    tags: cleanTags(toArray(t.toptags && t.toptags.tag).map(tag => ({ name: tag.name, count: 100 })), song.artist),
                    summary: wikiSummary(t),
                    url: t.url || "",
                };
            })
            .catch(error => {
                infoCache.delete(song.id);
                throw error;
            });
        infoCache.set(song.id, pending);
    }
    return infoCache.get(song.id);
}

// Last.fm 소개의 HTML과 끝의 "Read more on Last.fm" 링크 문구를 뺀 글자
function wikiSummary(track) {
    return plainText(track.wiki && track.wiki.summary)
        .replace(/\s*Read more on Last\.fm\.?\s*$/i, "")
        .replace(/\s*Last\.fm에서 더 읽어보기\.?\s*$/, "")
        .trim();
}

const koreanWikiCache = new Map();   // 곡 id -> Promise<한국어 소개 | "">

// Last.fm에 한국어로 작성된 곡 소개가 있으면 가져온다. 없거나 실패하면 "".
// (lang=ko로 요청해도 한국어 소개가 없으면 영어나 빈 소개가 오므로 한글이 있는지 확인한다.)
export function getKoreanWiki(song) {
    if (!koreanWikiCache.has(song.id)) {
        const pending = lastfm("track.getInfo", { artist: song.artist, track: song.title, autocorrect: 1, lang: "ko" })
            .then(data => {
                const summary = wikiSummary(data.track || {});
                return /[가-힣]/.test(summary) ? summary : "";
            })
            .catch(() => {
                koreanWikiCache.delete(song.id);
                return "";
            });
        koreanWikiCache.set(song.id, pending);
    }
    return koreanWikiCache.get(song.id);
}
