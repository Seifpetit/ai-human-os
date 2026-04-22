import { buildTargetRequest } from "../runtime/planning/data_layer.js";

export function enrichRequest(baseRequest, options = {}) {
  return buildTargetRequest(baseRequest, options);
}
