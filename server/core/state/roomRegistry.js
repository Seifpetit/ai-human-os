import { isCreateRoomRecord } from "../domain/createRoomRecord.js";

const ROOM_REGISTRY_TEMPLATE = Object.freeze({});

export function createRoomRegistry() {
  return {};
}

export function isRoomRegistry(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(([roomCode, roomRecord]) => {
    if (typeof roomCode !== "string" || roomCode.trim().length === 0) {
      return false;
    }

    return isCreateRoomRecord(roomRecord);
  });
}

export { ROOM_REGISTRY_TEMPLATE };

export default createRoomRegistry;