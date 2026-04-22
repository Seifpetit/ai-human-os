import createRoomRequest from "./core/input/createRoomRequest.js";
import createRoomRegistry, { isRoomRegistry } from "./core/state/roomRegistry.js";

export function createServerRuntime({ roomRegistry = createRoomRegistry() } = {}) {
  if (!isRoomRegistry(roomRegistry)) {
    throw new TypeError("createServerRuntime requires a valid room registry.");
  }

  let currentRoomRegistry = roomRegistry;

  return {
    createRoomRequest(request) {
      const { roomRegistry: nextRoomRegistry, result } = createRoomRequest({
        request,
        roomRegistry: currentRoomRegistry
      });

      currentRoomRegistry = nextRoomRegistry;

      return result;
    }
  };
}

export default createServerRuntime;