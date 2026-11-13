import { auth } from "./firebase_config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

onAuthStateChanged(auth, function (user) {
  const session = Session.get();
  const isGuest = session && session.guest === true;

  if (!user && !isGuest) {
    location.replace("ambient_login.html");
  }
});