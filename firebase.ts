import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// REPLACE THIS WITH YOUR FIREBASE CONFIGURATION
// You get this from the Firebase Console -> Project Settings -> General -> Your Apps
const firebaseConfig = {
    apiKey: "AIzaSyCjQXJZPGpsZtI6VppUlRC3vdopDVR9Wio",
    authDomain: "pokedraft-hub.firebaseapp.com",
    projectId: "pokedraft-hub",
    storageBucket: "pokedraft-hub.firebasestorage.app",
    messagingSenderId: "487219322944",
    appId: "1:487219322944:web:e3428e30c0cda51bdcbfa5",
    measurementId: "G-0GV9RJBZTK"
  };

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);