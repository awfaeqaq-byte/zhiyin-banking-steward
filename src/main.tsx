import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {MerchantOrderPage} from "./components/merchant-order";
import "./index.css";
import "./motion.css";
import "./components/app-theme.css";
import "./components/interface-motion.css";
import "./components/task-motion.css";

// This bundle belongs to the Zhiyin app inside MobileGym. Do not expose a
// second, standalone banking website outside the phone session.
const inPhone = window.parent !== window
  && new URLSearchParams(window.location.search).get("phone") === "mobilegym";

const entry = new URLSearchParams(window.location.search);
const merchant = entry.get('merchant');
if (merchant) {
  document.title = '小店点单 · 知银';
  // The public guest entry exposes a menu and an unpaid order receipt only.
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><MerchantOrderPage token={merchant} initialTable={entry.get('table') || undefined}/></React.StrictMode>,
  );
} else if (inPhone) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  document.body.textContent = "请通过 MobileGym 手机中的知银 App 打开。";
}
