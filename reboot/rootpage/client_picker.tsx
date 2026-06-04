import { RadioGroup, RadioOption } from "./radio_group";

export type ClientName = "ChatGPT" | "Claude" | "MCPJam";

export const CLIENT_NAMES: readonly ClientName[] = [
  "Claude",
  "ChatGPT",
  "MCPJam",
];

interface ClientPickerProps {
  // The clients to offer. The caller filters this (e.g. dropping
  // MCPJam in prod, where a local inspector makes no sense).
  clientNames: readonly ClientName[];
  selectedClientName: ClientName;
  onSelect: (clientName: ClientName) => void;
}

export const ClientPicker = ({
  clientNames,
  selectedClientName,
  onSelect,
}: ClientPickerProps) => {
  const options: ReadonlyArray<RadioOption<ClientName>> = clientNames.map(
    (clientName) => ({ id: clientName, label: clientName })
  );
  return (
    <RadioGroup
      ariaLabel="Chat client"
      options={options}
      selectedOptionId={selectedClientName}
      onSelect={onSelect}
    />
  );
};
