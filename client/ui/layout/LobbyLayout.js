import React from "react";
import CreateRoomButton from "../components/CreateRoomButton.js";
import JoinRoomButton from "../components/JoinRoomButton.js";
import "./LobbyLayout.css";

export default function LobbyLayout() {
  return React.createElement(
    "main",
    { className: "lobby-layout" },
    React.createElement(
      "section",
      { className: "lobby-layout__shell", "aria-labelledby": "lobby-title" },
      React.createElement(
        "header",
        { className: "lobby-layout__hero" },
        React.createElement("p", { className: "lobby-layout__eyebrow" }, "Gravity Ball"),
        React.createElement("h1", { className: "lobby-layout__title", id: "lobby-title" }, "Shape the ball with gravity."),
        React.createElement(
          "p",
          { className: "lobby-layout__subtitle" },
          "Start a room or join one from the browser lobby. Interactions stay projection-only here."
        )
      ),
      React.createElement(
        "div",
        { className: "lobby-layout__actions" },
        React.createElement(CreateRoomButton, { onClick: () => {} }),
        React.createElement(JoinRoomButton, { onClick: () => {} })
      )
    )
  );
}
