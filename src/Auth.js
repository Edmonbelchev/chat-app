// src/Auth.js
import React from "react";
import { auth } from "./firebase"; // Import Firebase
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth"; // Import Google Auth

const Auth = () => {
  const provider = new GoogleAuthProvider();

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider); // Sign in with Google
    } catch (error) {
      console.error("Error during Google sign-in:", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl mb-4">Chat Application</h1>
      <button
        onClick={handleLogin}
        className="bg-blue-500 text-white p-2 rounded"
      >
        Sign in with Google
      </button>
    </div>
  );
};

export default Auth;
