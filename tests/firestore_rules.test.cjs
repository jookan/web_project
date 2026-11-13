const { test, before, beforeEach, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
let environment, alice, bob, guest;
const profile = () => ({displayName:'Same name',photoURL:'',createdAt:serverTimestamp()});
const post = authorUid => ({authorUid,category:'song',text:'Test post',files:[],createdAt:serverTimestamp()});
const state = payload => ({payload,updatedAt:serverTimestamp()});
const comment = (authorUid, postId='post-a', parentId='') => ({authorUid,postId,parentId,text:'Test comment',createdAt:serverTimestamp()});
before(async () => {
  environment = await initializeTestEnvironment({
    projectId:'demo-ambient-db',
    firestore:{host:'127.0.0.1',port:8085,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}
  });
  alice=environment.authenticatedContext('user-a').firestore();
  bob=environment.authenticatedContext('user-b').firestore();
  guest=environment.unauthenticatedContext().firestore();
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db=context.firestore();
    for (const uid of ['user-a','user-b']) {
      await setDoc(doc(db,'users',uid),profile());
      await setDoc(doc(db,'publicProfiles',uid),{displayName:'Same name',photoURL:'',updatedAt:serverTimestamp()});
    }
    await setDoc(doc(db,'posts','post-a'),post('user-a'));
    await setDoc(doc(db,'posts','post-b'),post('user-b'));
    await setDoc(doc(db,'comments','parent-a'),comment('user-a'));
    await setDoc(doc(db,'comments','parent-b'),comment('user-b','post-b'));
  });
});
after(async()=>{ if(environment) await environment.cleanup(); });

test('private profiles: owner only, including equal display names',async()=>{
  await assertSucceeds(getDoc(doc(alice,'users','user-a')));
  await assertFails(getDoc(doc(alice,'users','user-b')));
  await assertFails(getDoc(doc(guest,'users','user-a')));
});
test('private profile: name change allowed, createdAt and role injection denied',async()=>{
  await assertSucceeds(updateDoc(doc(alice,'users','user-a'),{displayName:'New name'}));
  await assertFails(updateDoc(doc(alice,'users','user-a'),{createdAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(alice,'users','user-a'),{admin:true}));
});
test('appData: own playlists allowed and other accounts denied',async()=>{
  await assertSucceeds(setDoc(doc(alice,'users','user-a','appData','digging'),state('[]')));
  await assertSucceeds(getDoc(doc(alice,'users','user-a','appData','digging')));
  await assertFails(getDoc(doc(bob,'users','user-a','appData','digging')));
  await assertFails(setDoc(doc(bob,'users','user-a','appData','digging'),state('[]')));
  await assertFails(setDoc(doc(guest,'users','user-a','appData','digging'),state('[]')));
});
test('appData: unknown document names, oversized data and extra fields denied',async()=>{
  await assertFails(setDoc(doc(alice,'users','user-a','appData','tokens'),state('{}')));
  await assertFails(setDoc(doc(alice,'users','user-a','appData','aurora'),state('x'.repeat(800001))));
  await assertFails(setDoc(doc(alice,'users','user-a','appData','aurora'),{...state('{}'),accessToken:'not-allowed'}));
});
test('score metadata: owner allowed, file bytes and invalid settings denied',async()=>{
  const data={scoreId:'hash',fileName:'test.pdf',fileSize:123,lastModified:100,pageNumber:1,
    practice:{bpm:120,beatsPerBar:4,steps:[{pageNumber:1,bars:16}],metronome:false},updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(alice,'users','user-a','scores','hash'),data));
  await assertFails(getDoc(doc(bob,'users','user-a','scores','hash')));
  await assertFails(setDoc(doc(alice,'users','user-a','scores','hash'),{...data,fileBytes:'raw'}));
  await assertFails(setDoc(doc(alice,'users','user-a','scores','hash'),{...data,pageNumber:0}));
});
test('public profiles: public read, own fields only, no email/token',async()=>{
  await assertSucceeds(getDoc(doc(guest,'publicProfiles','user-a')));
  await assertSucceeds(setDoc(doc(alice,'publicProfiles','user-a'),{displayName:'Updated',photoURL:'',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(bob,'publicProfiles','user-a'),{displayName:'Forged'}));
  await assertFails(updateDoc(doc(alice,'publicProfiles','user-a'),{email:'private@example.invalid',updatedAt:serverTimestamp()}));
});
test('posts: authenticated author only; guest and forged author rejected',async()=>{
  await assertSucceeds(getDoc(doc(guest,'posts','post-a')));
  await assertSucceeds(setDoc(doc(alice,'posts','new'),post('user-a')));
  await assertFails(setDoc(doc(alice,'posts','forged'),post('user-b')));
  await assertFails(setDoc(doc(guest,'posts','guest'),post('user-a')));
  await assertFails(setDoc(doc(alice,'posts','raw'),{...post('user-a'),files:[{name:'a',size:1,type:'text/plain',dataUrl:'raw'}]}));
});
test('posts: another user cannot edit; author and creation time immutable',async()=>{
  await assertSucceeds(updateDoc(doc(alice,'posts','post-a'),{text:'Updated'}));
  await assertFails(updateDoc(doc(bob,'posts','post-a'),{text:'Forged'}));
  await assertFails(updateDoc(doc(alice,'posts','post-a'),{authorUid:'user-b'}));
});
test('likes: own item only, other likes cannot be overwritten or removed',async()=>{
  const like=uid=>({userUid:uid,postId:'post-a',createdAt:serverTimestamp()});
  await assertSucceeds(setDoc(doc(alice,'postLikes','post-a_user-a'),like('user-a')));
  await assertSucceeds(setDoc(doc(bob,'postLikes','post-a_user-b'),like('user-b')));
  await assertFails(deleteDoc(doc(alice,'postLikes','post-a_user-b')));
  await assertFails(setDoc(doc(alice,'postLikes','post-a_user-b'),like('user-a')));
  await assertSucceeds(deleteDoc(doc(alice,'postLikes','post-a_user-a')));
});
test('comments and replies: valid parent/post required, no impersonation',async()=>{
  await assertSucceeds(setDoc(doc(alice,'comments','new-comment'),comment('user-a')));
  await assertSucceeds(setDoc(doc(alice,'comments','new-reply'),comment('user-a','post-a','parent-a')));
  await assertFails(setDoc(doc(alice,'comments','wrong-parent'),comment('user-a','post-a','parent-b')));
  await assertFails(setDoc(doc(alice,'comments','wrong-author'),comment('user-b')));
  await assertFails(setDoc(doc(alice,'comments','missing-post'),comment('user-a','missing')));
  await assertFails(setDoc(doc(guest,'comments','guest-comment'),comment('user-a')));
});
test('follow: own relationship only, no self/unknown/forged user',async()=>{
  const follow=(followerUid,targetUid)=>({followerUid,targetUid,createdAt:serverTimestamp()});
  await assertSucceeds(setDoc(doc(alice,'follows','user-a_user-b'),follow('user-a','user-b')));
  await assertFails(deleteDoc(doc(bob,'follows','user-a_user-b')));
  await assertFails(setDoc(doc(alice,'follows','user-a_user-a'),follow('user-a','user-a')));
  await assertFails(setDoc(doc(alice,'follows','user-a_unknown'),follow('user-a','unknown')));
  await assertFails(setDoc(doc(alice,'follows','user-b_user-a'),follow('user-b','user-a')));
});
test('unspecified collections denied',async()=>{
  await assertFails(setDoc(doc(alice,'secrets','anything'),{value:1}));
  await assertFails(getDoc(doc(guest,'secrets','anything')));
});
