import { auth, db } from "./firebase_config.js";
import { currentUser, requireUser, ensureProfile, logout, showDataError } from "./firebase_data.js";
import { storeAttachments } from "./local_files.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  collection, doc, setDoc, addDoc, onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const cache = { posts: [], comments: [], postLikes: [], follows: [], publicProfiles: [] };
const subscribers = new Set();
const unsubscribe = [];
let me = null;
const millis = value => value?.toMillis?.() || Date.now();
const notify = () => subscribers.forEach(callback => callback());
export const subscribe = callback => { subscribers.add(callback); return () => subscribers.delete(callback); };
export const getCurrentUser = () => me;
export const myName = () => me?.name || "게스트";
export const myId = () => me?.uid || "";
export const CATEGORY_LABEL = { song: "곡 추천", sheet: "악보 공유", free: "자유" };

export function getProfile(uid) {
  const profile = cache.publicProfiles.find(item => item.id === uid);
  return { uid, name: profile?.displayName || "회원", photoURL: profile?.photoURL || "" };
}

export function resolveUid(value) {
  if (cache.publicProfiles.some(item => item.id === value)) return value;
  const matches = cache.publicProfiles.filter(item => item.displayName === value);
  return matches.length === 1 ? matches[0].id : value;
}

export function getPosts() {
  return cache.posts.map(post => {
    const comments = cache.comments.filter(item => item.postId === post.id);
    const view = item => ({ ...item, author: getProfile(item.authorUid).name, ts: millis(item.createdAt) });
    return {
      ...post, author: getProfile(post.authorUid).name, ts: millis(post.createdAt), baseLikes: 0,
      likedBy: cache.postLikes.filter(item => item.postId === post.id).map(item => item.userUid),
      commentList: comments.filter(item => !item.parentId).sort((a, b) => millis(a.createdAt) - millis(b.createdAt)).map(item => ({
        ...view(item), replies: comments.filter(reply => reply.parentId === item.id)
          .sort((a, b) => millis(a.createdAt) - millis(b.createdAt)).map(view)
      }))
    };
  });
}

export const getFollowing = uid => cache.follows.filter(item => item.followerUid === uid).map(item => item.targetUid);
export const getFollowerCount = uid => cache.follows.filter(item => item.targetUid === uid).length;
export function countComments(post) {
  return (post.commentList || []).reduce((sum, item) => sum + 1 + (item.replies || []).length, 0);
}

export async function toggleFollow(unused, targetUid) {
  const user = requireUser();
  if (targetUid === user.uid) return false;
  const ref = doc(db, "follows", user.uid + "_" + targetUid);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) transaction.delete(ref);
    else transaction.set(ref, { followerUid: user.uid, targetUid, createdAt: serverTimestamp() });
    return !snapshot.exists();
  });
}

export async function toggleLike(postId) {
  const user = requireUser();
  const ref = doc(db, "postLikes", postId + "_" + user.uid);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) transaction.delete(ref);
    else transaction.set(ref, { userUid: user.uid, postId, createdAt: serverTimestamp() });
  });
}

export async function createPost(category, text, files) {
  const user = requireUser();
  if (!CATEGORY_LABEL[category] || !text.trim() || text.length > 10000) throw new Error("카테고리와 내용을 확인해 주세요. 내용은 10,000자까지 입력할 수 있어요.");
  if (files.length > 3 || files.some(file => file.size > 5 * 1024 * 1024)) throw new Error("첨부파일은 5MB 이하, 최대 3개까지 보관할 수 있어요.");
  const ref = doc(collection(db, "posts"));
  const metadata = await storeAttachments(user.uid, ref.id, files);
  await setDoc(ref, { authorUid: user.uid, category, text: text.trim(), files: metadata, createdAt: serverTimestamp() });
  return ref.id;
}

export async function addComment(postId, unused, text) {
  const user = requireUser();
  if (!text.trim() || text.length > 300) throw new Error("댓글은 1~300자로 입력해 주세요.");
  await addDoc(collection(db, "comments"), { postId, parentId: "", authorUid: user.uid, text: text.trim(), createdAt: serverTimestamp() });
}

export async function addReply(postId, parentId, unused, text) {
  const user = requireUser();
  if (!text.trim() || text.length > 300) throw new Error("답글은 1~300자로 입력해 주세요.");
  await addDoc(collection(db, "comments"), { postId, parentId, authorUid: user.uid, text: text.trim(), createdAt: serverTimestamp() });
}

function listen(name) {
  return new Promise((resolve, reject) => {
    const stop = onSnapshot(collection(db, name), snapshot => {
      cache[name] = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      notify();
      resolve();
    }, error => { showDataError(error); reject(error); });
    unsubscribe.push(stop);
  });
}

export const ready = (async () => {
  const user = await currentUser();
  const uid = user?.uid || "";
  onAuthStateChanged(auth, next => {
    if ((next?.uid || "") !== uid) location.replace("ambient_login.html");
  });
  if (user) me = await ensureProfile(user);
  else if (window.Session?.get()?.guest) me = { name: "게스트", guest: true };
  await Promise.all(Object.keys(cache).map(listen));
})();
// 호출 페이지에서 ready 오류를 표시한다. 모듈 로딩 중 unhandled rejection도 방지한다.
ready.catch(showDataError);
window.addEventListener("pagehide", () => unsubscribe.forEach(stop => stop()));

export function renderUserArea(container) {
  container.replaceChildren();
  const name = document.createElement("a");
  name.textContent = me ? me.name + (me.guest ? "" : "님") : "로그인";
  name.href = me?.uid ? "community_profile.html?user=" + encodeURIComponent(me.uid) : "ambient_login.html";
  container.appendChild(name);
  if (me) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = me.guest ? "나가기" : "로그아웃";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await logout(); } catch (error) { showDataError(error); button.disabled = false; }
    });
    container.appendChild(button);
  }
}
