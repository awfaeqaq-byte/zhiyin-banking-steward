import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./motion.css";
import "./components/app-theme.css";
import "./components/interface-motion.css";
import "./components/task-motion.css";

// This bundle belongs to the Zhiyin app inside MobileGym. Do not expose a
// second, standalone banking website outside the phone session.
const inPhone = window.parent !== window
  && new URLSearchParams(window.location.search).get("phone") === "mobilegym";

if (inPhone) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  document.body.textContent = "请通过 MobileGym 手机中的知银 App 打开。";
}
