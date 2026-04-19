// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBd7Z05LZfkBKwba_1OG610BtrwLjgcd1M",
  authDomain: "mentalhealthbuddy.firebaseapp.com",
  projectId: "mentalhealthbuddy",
  storageBucket: "mentalhealthbuddy.firebasestorage.app",
  messagingSenderId: "46282975499",
  appId: "1:46282975499:web:8463d67030e531f53bda0e",
  measurementId: "G-YGM0FRX3XM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
if (typeof window !== "undefined") {
  getAnalytics(app);
}