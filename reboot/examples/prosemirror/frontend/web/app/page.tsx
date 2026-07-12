import { Authority } from "@monorepo/api/rbt/thirdparty/prosemirror/v1/authority_rbt";
import { DOC_ID } from "@monorepo/common/constants";
import { ExternalContext } from "@reboot-dev/reboot";
import ExampleRebootProseMirrorComponent from "./ExampleRebootProseMirrorComponent";

export default async function Home() {
  const context = new ExternalContext({
    name: "react server context",
    url: "http://localhost:9991",
  });

  // Get initial state here from the backend.
  const { version, doc } = await Authority.ref(DOC_ID).create(context);
  return (
    <>
      <ExampleRebootProseMirrorComponent version={version} doc={doc.toJson()} />
    </>
  );
}
