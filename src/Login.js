import React, { useState } from "react";

const API_URL = "http://localhost:5000";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (data.token) {
      localStorage.setItem("token", data.token);
      onLogin();
    } else {
      alert(data.error || "Login failed");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-3xl mb-6">Safe Journey Login</h1>

      <input
        className="mb-4 p-2 bg-gray-800 rounded"
        placeholder="Username"
        onChange={(e) => setUsername(e.target.value)}
      />

      <input
        className="mb-4 p-2 bg-gray-800 rounded"
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        onClick={handleLogin}
        className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700"
      >
        Login
      </button>
    </div>
  );
}
