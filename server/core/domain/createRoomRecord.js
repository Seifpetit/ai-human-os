const CREATE_ROOM_RECORD_TEMPLATE = Object.freeze({
  isJoinable: true
});

export function createCreateRoomRecord() {
  return {
    isJoinable: true
  };
}

export function isCreateRoomRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);

  if (keys.length !== 1 || !keys.includes("isJoinable")) {
    return false;
  }

  return value.isJoinable === true;
}

export { CREATE_ROOM_RECORD_TEMPLATE };

export default createCreateRoomRecord;