import { ExternalContext } from "@reboot-dev/reboot";
import { Counter } from "../../api/counter/v1/counter_rbt";
import { COUNTER_IDS } from "../../constants";
import TakeableCounter from "./TakeableCounter";

export default async function Home() {
  const context = new ExternalContext({
    name: "react server context",
    url: process.env.NEXT_PUBLIC_ENDPOINT,
  });

  const counts = await Promise.all(
    COUNTER_IDS.map(async (id: string) => Counter.ref(id).count(context))
  );

  return COUNTER_IDS.map((id, index) => (
    <TakeableCounter id={id} key={id} initialCount={counts[index].count} />
  ));
}
