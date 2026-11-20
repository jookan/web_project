// ============================================================
// digging/utils.js - 화면·API와 무관한 작은 도우미 함수
// ============================================================
import { MAX_GENRES } from "./config.js";

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// API 응답에서 항목이 1개면 객체, 여러 개면 배열로 오는 경우가 있어 항상 배열로 맞춘다.
export const toArray = value => (Array.isArray(value) ? value : value ? [value] : []);

export const uid = () => Math.random().toString(36).slice(2, 9);

// 원본을 바꾸지 않고 섞은 새 배열 (Fisher-Yates)
export function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// localStorage 읽기·쓰기. 시크릿 모드나 저장소 차단에서도 페이지가 멈추지 않게 예외를 삼킨다.
export function readStorage(key, fallback = "") {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

export function readJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

// 저장에 성공하면 true
export function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function removeStorage(key) {
    try {
        localStorage.removeItem(key);
    } catch { /* 지우지 못해도 다음 저장 때 덮어쓴다 */ }
}

// YouTube 제목에 남은 (feat. ...), [ ... ], | ... 같은 꼬리를 떼서 Last.fm에서 찾기 쉽게 만든다.
export function cleanTitle(title) {
    const original = String(title || "").trim();
    return original
        .replace(/\s*[(\[（【][^)\]）】]*[)\]）】]/g, "")
        .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, "")
        .replace(/\s*[|｜].*$/, "")
        .replace(/\s+/g, " ")
        .trim() || original;
}

// 디깅에서 쓰는 곡 객체
//   { id, title, artist, genres }  + 상황에 따라 trackId, ytTags, thumb, art, vid, album
// id는 "가수|||꼬리 뗀 제목"(소문자)이라 YouTube/Last.fm 표기 차이로 같은 곡이 중복되지 않는다.
export function makeSong(title, artist, genres = []) {
    title = String(title || "").trim();
    artist = String(artist || "").trim();
    return {
        id: `${artist}|||${cleanTitle(title)}`.toLowerCase(),
        title,
        artist,
        genres: [...genres],
    };
}

// 여러 장르 목록을 순서대로 합치고 중복을 뺀 뒤 MAX_GENRES개까지만 남긴다.
export function mergeGenres(...lists) {
    const out = [];
    lists.flat().forEach(genre => {
        if (genre && !out.includes(genre)) out.push(genre);
    });
    return out.slice(0, MAX_GENRES);
}

// HTML 조각에서 글자만 꺼낸다. DOMParser는 스크립트를 실행하지 않아 안전하다.
export function plainText(html) {
    return new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent || "";
}

export const formatNumber = n => n.toLocaleString("ko-KR");
export const formatTime = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

// ISO 8601 기간(PT3M25S) -> 초
export function isoDurationToSeconds(iso) {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || [];
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}
