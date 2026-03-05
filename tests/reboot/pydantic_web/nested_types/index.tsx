import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { Address } from "./base_models/models_rbt_types";
import { UpdateInfoRequest } from "./servicer_api_rbt_types";
import { useCustomer } from "./servicer_api_zod_rbt_react";
import {
  GetStateResponse,
  InvalidPhoneError,
  PhoneNumber,
} from "./shared/models_rbt_types";

const STATE_ID = "nested-types-test";

type TestPhase =
  | "not-initialized"
  | "initialized"
  | "error-triggered"
  | "updated";

const App = () => {
  const customer = useCustomer({ id: STATE_ID });
  const [phase, setPhase] = useState<TestPhase>("not-initialized");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined
  );

  // Always call `useGetState` unconditionally to satisfy React's "Rules of Hooks":
  //   https://react.dev/reference/rules/rules-of-hooks
  const { response }: { response: GetStateResponse | undefined } =
    customer.useGetState();

  if (phase === "not-initialized") {
    return (
      <div className="App">
        <h1 id="phase">not-initialized</h1>
        <button
          id="initialize"
          onClick={async () => {
            await customer.initialize();
            setPhase("initialized");
          }}
        >
          Initialize Customer
        </button>
      </div>
    );
  }

  if (response === undefined) return <>Loading...</>;

  if (phase === "initialized") {
    return (
      <div className="App">
        <h1 id="phase">initialized</h1>
        <div id="state-display">
          <p id="name">name: "{response.name}"</p>
          <p id="street">street: "{response.address?.street}"</p>
          <p id="city">city: "{response.address?.city}"</p>
          <p id="zip-code">zipCode: "{response.address?.zipCode}"</p>
          <p id="phone">
            phone:{" "}
            {response.phone === undefined
              ? "undefined"
              : JSON.stringify(response.phone)}
          </p>
        </div>
        <button
          id="trigger-error"
          onClick={async () => {
            // Send an invalid phone number to trigger the error.
            const invalidPhone: PhoneNumber = {
              countryCode: "+1",
              number: "invalid-123",
            };
            const request: UpdateInfoRequest = {
              address: response.address,
              phone: invalidPhone,
            };
            const { aborted } = await customer.updateInfo(request);
            if (aborted !== undefined) {
              const error = aborted.error as InvalidPhoneError;
              setErrorMessage(error.message);
              setPhase("error-triggered");
            }
          }}
        >
          Trigger Error
        </button>
      </div>
    );
  }

  if (phase === "error-triggered") {
    return (
      <div className="App">
        <h1 id="phase">error-triggered</h1>
        <p id="error-message">error: "{errorMessage}"</p>
        <div id="state-display">
          <p id="name">name: "{response.name}"</p>
          <p id="street">street: "{response.address?.street}"</p>
          <p id="city">city: "{response.address?.city}"</p>
          <p id="zip-code">zipCode: "{response.address?.zipCode}"</p>
          <p id="phone">
            phone:{" "}
            {response.phone === undefined
              ? "undefined"
              : JSON.stringify(response.phone)}
          </p>
        </div>
        <button
          id="update"
          onClick={async () => {
            // Use valid values this time.
            const newAddress: Address = {
              street: "456 Oak Ave",
              city: "New City",
              zipCode: "67890",
            };
            const newPhone: PhoneNumber = {
              countryCode: "+1",
              number: "555-9876",
            };
            const request: UpdateInfoRequest = {
              address: newAddress,
              phone: newPhone,
            };
            await customer.updateInfo(request);
            setPhase("updated");
          }}
        >
          Update Info
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      <h1 id="phase">updated</h1>
      <div id="state-display">
        <p id="name">name: "{response.name}"</p>
        <p id="street">street: "{response.address?.street}"</p>
        <p id="city">city: "{response.address?.city}"</p>
        <p id="zip-code">zipCode: "{response.address?.zipCode}"</p>
        <p id="phone">
          phone:{" "}
          {response.phone === undefined
            ? "undefined"
            : JSON.stringify(response.phone)}
        </p>
      </div>
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
