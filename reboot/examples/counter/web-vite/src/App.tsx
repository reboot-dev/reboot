import { COUNTER_IDS } from "../../constants.js";
import TakeableCounter from "./TakeableCounter.js";

function App() {
  return (
    <div>
      {COUNTER_IDS.map((id: string) => (
        <TakeableCounter id={id} key={id} />
      ))}
    </div>
  );
}

export default App;
