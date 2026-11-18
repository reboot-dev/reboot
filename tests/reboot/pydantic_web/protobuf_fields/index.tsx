import { protobuf_es, tasks_pb } from "@reboot-dev/reboot-api";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { Receipt } from "./receipt_pb";
import { GetStateResponse, RecordRequest } from "./servicer_api_rbt_types";
import { useTest } from "./servicer_api_zod_rbt_react";

const STATE_ID = "pydantic-web-test";

const App = () => {
  const test = useTest({ id: STATE_ID });

  const { response }: { response: GetStateResponse | undefined } =
    test.useGetState();

  if (response === undefined || response.scheduledTaskId === undefined) {
    return (
      <div className="App">
        <h1 id="status">not scheduled</h1>
        <button
          id="start-and-record"
          onClick={async () => {
            const { response } = await test.start();
            if (response === undefined) {
              return;
            }

            // Each message field of the generated types is typed by
            // the message's generated class: one of Reboot's own, a
            // well-known type, and one the application declares.
            const taskId: protobuf_es.PartialMessage<tasks_pb.TaskId> =
              response.taskId;
            const at: protobuf_es.PartialMessage<protobuf_es.Timestamp> =
              protobuf_es.Timestamp.fromDate(new Date(1000));
            const receipt: protobuf_es.PartialMessage<Receipt> = new Receipt({
              note: "from the browser",
            });

            const request: RecordRequest = { taskId, at, receipt };
            await test.record(request);
          }}
        >
          Start and record
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      <h1 id="status">scheduled</h1>
      <p id="scheduled-state-type">{response.scheduledTaskId.stateType}</p>
      <p id="recorded-state-type">{response.recordedTaskId?.stateType}</p>
      <p id="recorded-at">{String(response.recordedAt?.seconds)}</p>
      <p id="receipts">
        {response.receipts.map((receipt) => receipt.note).join(", ")}
      </p>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
  );

  root.render(
    <StrictMode>
      <RebootClientProvider url={url}>
        <App />
      </RebootClientProvider>
    </StrictMode>
  );
};
