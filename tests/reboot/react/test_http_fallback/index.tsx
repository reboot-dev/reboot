import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { useGreeter } from "../../greeter_rbt_react";

const ID = "actor-test-132";

const App = ({ url }) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${url}/hello_world`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        setData(data);
      })
      .catch((error) => {
        console.error(`Failed to fetch: ${error}`);
      });
  }, []);

  if (!data) return <p>Loading...</p>;

  return (
    <div className="App">
      <h1 id="data">{data.message}</h1>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  root.render(
    <StrictMode>
      <App url={url} />
    </StrictMode>
  );
};
