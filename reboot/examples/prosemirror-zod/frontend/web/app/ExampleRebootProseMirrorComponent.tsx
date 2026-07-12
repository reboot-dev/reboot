"use client";

import { JsonValue } from "@bufbuild/protobuf";
import { DOC_ID, SCHEMA } from "@monorepo/common/constants";
import { useState } from "react";
import RebootProseMirror from "./RebootProseMirror";

export default function ExampleRebootProseMirrorComponent({
  version,
  doc,
}: {
  version: number;
  doc: JsonValue;
}) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  return (
    <>
      <h1 className="text-2xl">Reboot Prosemirror</h1>
      <RebootProseMirror
        id={DOC_ID}
        mount={mount}
        version={version}
        doc={doc}
        schema={SCHEMA}
      >
        <div className="h-20" ref={setMount} />
      </RebootProseMirror>
    </>
  );
}
