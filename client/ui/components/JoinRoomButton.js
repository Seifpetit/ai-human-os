import React from "react";

export function JoinRoomButton({ onClick }) {
  return React.createElement(
    "button",
    {
      type: "button",
      className: "lobby-layout__action lobby-layout__action--secondary",
      onClick,
    },
    "Join Room"
  );
}

export default JoinRoomButton;
