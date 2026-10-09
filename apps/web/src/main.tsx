import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { queryClient } from "./query";
import { Toasts } from "./toast";
import "./index.css";
import "./story.css";

const savedAppearance = localStorage.getItem("dig-appearance");
document.documentElement.dataset.theme = savedAppearance === "dark" || savedAppearance === "light"
  ? savedAppearance
  : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toasts />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
