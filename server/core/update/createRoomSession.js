import { isCreateRoomCommand } from "../../../shared/multiplayer/CreateRoomCommand.js";
import createCreateRoomRecord from "../domain/createRoomRecord.js";
import createRoomRegistry, { isRoomRegistry } from "../state/roomRegistry.js";

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_ATTEMPT_LIMIT = 1024;

function createRoomCode(roomRegistry) {
  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPT_LIMIT; attempt += 1) {
    let roomCode = "";

    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      const characterIndex = Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length);
      roomCode += ROOM_CODE_CHARACTERS[characterIndex];
    }

    if (!Object.prototype.hasOwnProperty.call(roomRegistry, roomCode)) {
      return roomCode;
    }
  }

  throw new Error("Unable to create a unique room code.");
}

export function createRoomSession({ command, roomRegistry = createRoomRegistry() } = {}) {
  if (!isCreateRoomCommand(command)) {
    throw new TypeError("createRoomSession requires a valid create-room command.");
  }

  if (!isRoomRegistry(roomRegistry)) {
    throw new TypeError("createRoomSession requires a valid room registry.");
  }

  const roomCode = createRoomCode(roomRegistry);
  const roomRecord = createCreateRoomRecord();

  return {
    roomCode,
    roomRegistry: {
      ...roomRegistry,
      [roomCode]: roomRecord
    }
  };
}

export default createRoomSession;