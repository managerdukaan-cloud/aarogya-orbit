// Paste your Firebase web config (Console > Project settings). These are public identifiers, not secrets.
// Secrets (payment keys, service accounts) must NEVER go here; use Cloud Functions secrets.
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCtsWiuSDjD2rcYL-OEZ6zKC1S2FZKiN1E",
  authDomain: "aarogya-orbit.firebaseapp.com",
  projectId: "aarogya-orbit",
  storageBucket: "aarogya-orbit.firebasestorage.app",
  messagingSenderId: "596149847118",
  appId: "1:596149847118:web:2cfa54e648e55d3bd2ef1f",
  measurementId: "G-7EP4R9MZ58"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
