import React from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App.js";

const mountTarget = document.getElementById("root");

if (!mountTarget) {
  throw new Error("Root mount target '#root' was not found.");
}

createRoot(mountTarget).render(React.createElement(App));
