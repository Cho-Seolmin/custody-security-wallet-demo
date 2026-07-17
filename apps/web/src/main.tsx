import { Buffer } from "buffer";

// shamirs-secret-sharing expects Node Buffer in the browser bundle
(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
