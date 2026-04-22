const CREATE_ROOM_COMMAND_TEMPLATE = Object.freeze({});

export function createCreateRoomCommand() {
  return {};
}

export function isCreateRoomCommand(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value).length === 0;
}

export { CREATE_ROOM_COMMAND_TEMPLATE };

export default createCreateRoomCommand;