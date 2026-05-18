import { RadioGroup, RadioOption } from "./radio_group";

// Tunnel provider the developer is using. `cloudflared` and `ngrok`
// have first-class flows with copy-pasteable commands; `other`
// covers Tailscale Funnel, raw SSH reverse tunnels, etc. — anything
// the developer is bringing themselves.
export type TunnelProviderName = "cloudflared" | "ngrok" | "other";

const PROVIDER_OPTIONS: ReadonlyArray<RadioOption<TunnelProviderName>> = [
  { id: "cloudflared", label: "cloudflared" },
  { id: "ngrok", label: "ngrok" },
  { id: "other", label: "Other" },
];

interface TunnelProviderPickerProps {
  selectedProviderName: TunnelProviderName;
  onSelect: (providerName: TunnelProviderName) => void;
}

export const TunnelProviderPicker = ({
  selectedProviderName,
  onSelect,
}: TunnelProviderPickerProps) => (
  <RadioGroup
    ariaLabel="Tunnel provider"
    options={PROVIDER_OPTIONS}
    selectedOptionId={selectedProviderName}
    onSelect={onSelect}
  />
);
