const CREATE_ROOM_RESULT_TEMPLATE = Object.freeze({
  roomCode: null,
  isJoinable: false
});

export function createCreateRoomResult({ roomCode = null, isJoinable = false } = {}) {
  return {
    roomCode,
    isJoinable
  };
}

export function isCreateRoomResult(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);

  if (keys.length !== 2 || !keys.includes("roomCode") || !keys.includes("isJoinable")) {
    return false;
  }

  const { roomCode, isJoinable } = value;

  if (typeof isJoinable !== "boolean") {
    return false;
  }

  if (roomCode !== null && typeof roomCode !== "string") {
    return false;
  }

  if (typeof roomCode === "string" && roomCode.trim().length === 0) {
    return false;
  }

  if (isJoinable && typeof roomCode !== "string") {
    return false;
  }

  if (!isJoinable && roomCode !== null) {
    return false;
  }

  return true;
}

export { CREATE_ROOM_RESULT_TEMPLATE };

export default createCreateRoomResult;