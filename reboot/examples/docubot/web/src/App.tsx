import { DOCUBOT_ASSISTANT_ID } from "../../constants";
import { Docubot } from "../lib/main";

const App = () => {
  if (import.meta.env.VITE_REBOOT_APP_ENDPOINT == undefined) {
    return <>Please set 'VITE_REBOOT_APP_ENDPOINT' in the '.env' file</>;
  }

  return (
    <>
      <iframe
        id="docs.reboot.dev"
        src="https://docs.reboot.dev"
        title="Reboot Docs"
        className="w-screen h-screen"
      />
      <Docubot
        clientApiEndpoint={import.meta.env.VITE_REBOOT_APP_ENDPOINT}
        assistantId={DOCUBOT_ASSISTANT_ID}
      />
    </>
  );
};

export default App;
