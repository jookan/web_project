import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCi8Vojn5Gz1aoJFJ96jjcNeL-rCX0zLYQ",
    authDomain: "webproject-f06f1.firebaseapp.com",
    projectId: "webproject-f06f1",
    storageBucket: "webproject-f06f1.firebasestorage.app",
    messagingSenderId: "426463764475",
    appId: "1:426463764475:web:bf74a12ddf5a2c8d2cf55e",
    measurementId: "G-C4TTD6MZKK"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);