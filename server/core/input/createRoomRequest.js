import createCreateRoomCommand from "../../../shared/multiplayer/CreateRoomCommand.js";
import projectCreateRoomResult from "../render/projectCreateRoomResult.js";
import createRoomRegistry from "../state/roomRegistry.js";
import createRoomSession from "../update/createRoomSession.js";

function parseCreateRoomCommand(request) {
  if (typeof request === "undefined") {
    return createCreateRoomCommand();
  }

  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("createRoomRequest requires request to be an object when provided.");
  }

  if (Object.keys(request).length > 0) {
    throw new TypeError("createRoomRequest does not accept request properties.");
  }

  return createCreateRoomCommand();
}

export function createRoomRequest({ request, roomRegistry = createRoomRegistry() } = {}) {
  const command = parseCreateRoomCommand(request);
  const { roomCode, roomRegistry: nextRoomRegistry } = createRoomSession({
    command,
    roomRegistry
  });

  return {
    roomRegistry: nextRoomRegistry,
    result: projectCreateRoomResult({
      roomCode,
      roomRegistry: nextRoomRegistry
    })
  };
}

export default createRoomRequest;