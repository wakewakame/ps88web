import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { locale } from "./i18n";
import "@material-design-icons/font";

// 実際に表示している言語を伝える。読み上げや翻訳の判断に使われる
document.documentElement.lang = locale;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
