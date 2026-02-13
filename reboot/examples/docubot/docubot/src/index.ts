import { AssistantServicer } from "./assistant_servicer.js";
import { ThreadServicer } from "./thread_servicer.js";

export default {
  servicers: () => {
    return [AssistantServicer, ThreadServicer];
  },
};
