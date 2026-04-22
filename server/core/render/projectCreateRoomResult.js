import createCreateRoomResult from "../../../shared/multiplayer/CreateRoomResult.js";
import createRoomRegistry, { isRoomRegistry } from "../state/roomRegistry.js";

export function projectCreateRoomResult({ roomCode = null, roomRegistry = createRoomRegistry() } = {}) {
  if (roomCode !== null && typeof roomCode !== "string") {
    throw new TypeError("projectCreateRoomResult requires roomCode to be a string or null.");
  }

  if (typeof roomCode === "string" && roomCode.trim().length === 0) {
    throw new TypeError("projectCreateRoomResult requires roomCode to be a non-empty string when provided.");
  }

  if (!isRoomRegistry(roomRegistry)) {
    throw new TypeError("projectCreateRoomResult requires a valid room registry.");
  }

  if (
    roomCode === null ||
    !Object.prototype.hasOwnProperty.call(roomRegistry, roomCode)
  ) {
    return createCreateRoomResult();
  }

  const roomRecord = roomRegistry[roomCode];

  return createCreateRoomResult({
    roomCode: roomRecord.isJoinable ? roomCode : null,
    isJoinable: roomRecord.isJoinable
  });
}

export default projectCreateRoomResult;