import React from "react";

export function CreateRoomButton({ onClick, disabled = false, label = "Create Room" }) {
  return React.createElement(
    "button",
    {
      type: "button",
      className: "lobby-layout__action lobby-layout__action--primary",
      onClick,
      disabled,
    },
    label
  );
}

export default CreateRoomButton;
