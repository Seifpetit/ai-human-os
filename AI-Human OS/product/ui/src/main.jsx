import React from "react";
import { createRoot } from "react-dom/client";
import ConsoleApp from "./ui/ConsoleApp.jsx";
import "./ui/console.css";

const mountTarget = document.getElementById("root");
if (!mountTarget) {
  throw new Error("Missing #root mount target");
}

createRoot(mountTarget).render(React.createElement(ConsoleApp));

