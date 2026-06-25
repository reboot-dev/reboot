import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  useBank,
  type UseBankApi,
} from "./api/bank/v1/pydantic/bank_rbt_react";

// The web front end constructs the same state machine id, so the
// mobile app shares its accounts and balances out of the box.
const STATE_MACHINE_ID = "reboot-bank";

// The Reboot server URL. Override with `EXPO_PUBLIC_REBOOT_URL` to
// point at a server reachable from a physical device (e.g. your
// machine's LAN IP). The default works for `expo start --web` and the
// iOS simulator; Android emulators reach the host via `10.0.2.2`.
const REBOOT_URL =
  process.env.EXPO_PUBLIC_REBOOT_URL ?? "http://localhost:9991";

// A horizontally scrolling row of selectable "chips". React Native has
// no `<select>`, so we pick a customer or account by tapping a chip.
const ChipPicker = ({
  options,
  selected,
  onSelect,
  emptyText,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
  emptyText: string;
}) => {
  if (options.length === 0) {
    return <Text style={styles.informationText}>{emptyText}</Text>;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map(({ value, label }) => {
        const isSelected = value === selected;
        return (
          <Pressable
            key={value}
            style={[styles.chip, isSelected && styles.chipSelected]}
            onPress={() => onSelect(value)}
          >
            <Text
              style={[styles.chipText, isSelected && styles.chipTextSelected]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
};

const Label = ({ text }: { text: string }) => (
  <Text style={styles.label}>{text}</Text>
);

const Button = ({
  text,
  onPress,
  disabled,
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    style={[
      styles.button,
      disabled ? styles.buttonDisabled : styles.buttonEnabled,
    ]}
    onPress={onPress}
    disabled={disabled}
  >
    <Text style={styles.buttonText}>{text}</Text>
  </Pressable>
);

const CreateCustomer = ({ bank }: { bank: UseBankApi }) => {
  const [newCustomerId, setNewCustomerId] = useState("");

  const handleCreateCustomer = async () => {
    if (newCustomerId === "") {
      return;
    }
    const { aborted } = await bank.signUp({ customerId: newCustomerId });
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
    setNewCustomerId("");
  };

  return (
    <Section title="Create New Customer">
      <Label text="Customer ID" />
      <TextInput
        style={styles.textInput}
        value={newCustomerId}
        onChangeText={setNewCustomerId}
        onSubmitEditing={handleCreateCustomer}
        placeholder="e.g., team@reboot.dev"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        text="Create Customer"
        onPress={handleCreateCustomer}
        disabled={newCustomerId === ""}
      />
    </Section>
  );
};

const OpenAccount = ({
  bank,
  customerIds,
}: {
  bank: UseBankApi;
  customerIds: string[];
}) => {
  const [customerId, setCustomerId] = useState("");
  const [initialDeposit, setInitialDeposit] = useState("");

  const handleAddAccount = async () => {
    if (customerId === "") {
      return;
    }
    const { aborted } = await bank.openCustomerAccount({
      customerId,
      initialDeposit: Number(initialDeposit),
    });
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
    setCustomerId("");
    setInitialDeposit("");
  };

  return (
    <Section title="Add Account to Customer">
      <Label text="Customer" />
      <ChipPicker
        options={customerIds.map((id) => ({ value: id, label: id }))}
        selected={customerId}
        onSelect={setCustomerId}
        emptyText="No customers yet."
      />
      <Label text="Initial Deposit ($)" />
      <TextInput
        style={styles.textInput}
        value={initialDeposit}
        onChangeText={setInitialDeposit}
        placeholder="1000.00"
        keyboardType="numeric"
      />
      <Button
        text="Add Account"
        onPress={handleAddAccount}
        disabled={customerId === ""}
      />
    </Section>
  );
};

const Transfer = ({ bank }: { bank: UseBankApi }) => {
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");

  const { response } = bank.useAccountBalances();

  // Flatten every account into a pickable option labelled with its
  // owning customer so the source and destination are unambiguous.
  const accountOptions = (response?.balances ?? []).flatMap((customer) =>
    customer.accounts.map((account) => ({
      value: account.accountId,
      label: `${customer.customerId} / ${account.accountId}`,
    }))
  );

  const handleTransfer = async () => {
    if (fromAccountId === "" || toAccountId === "") {
      return;
    }
    const { aborted } = await bank.transfer({
      fromAccountId,
      toAccountId,
      amount: Number(amount),
    });
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
    setFromAccountId("");
    setToAccountId("");
    setAmount("");
  };

  const ready = fromAccountId !== "" && toAccountId !== "" && amount !== "";

  return (
    <Section title="Transfer Funds">
      <Label text="From Account" />
      <ChipPicker
        options={accountOptions}
        selected={fromAccountId}
        onSelect={setFromAccountId}
        emptyText="No accounts yet."
      />
      <Label text="To Account" />
      <ChipPicker
        options={accountOptions}
        selected={toAccountId}
        onSelect={setToAccountId}
        emptyText="No accounts yet."
      />
      <Label text="Amount ($)" />
      <TextInput
        style={styles.textInput}
        value={amount}
        onChangeText={setAmount}
        placeholder="100.00"
        keyboardType="numeric"
      />
      <Button
        text="Transfer Funds"
        onPress={handleTransfer}
        disabled={!ready}
      />
    </Section>
  );
};

const AccountRow = ({
  accountId,
  balance,
  pending,
}: {
  accountId: string;
  balance: number;
  pending: boolean;
}) => (
  <View style={styles.accountRow}>
    <Text style={styles.accountId}>{accountId}</Text>
    <Text style={[styles.balance, pending && styles.balancePending]}>
      ${balance}
    </Text>
  </View>
);

const AccountsTable = ({ bank }: { bank: UseBankApi }) => {
  const { response } = bank.useAccountBalances();

  if (response === undefined) {
    return <Text style={styles.informationText}>Loading...</Text>;
  }

  const { balances } = response;

  return (
    <Section title="All Accounts">
      {balances.length === 0 && bank.signUp.pending.length === 0 ? (
        <Text style={styles.informationText}>No accounts yet!</Text>
      ) : (
        <View>
          {balances.map(({ customerId, accounts }) => (
            <View key={customerId} style={styles.customerGroup}>
              <Text style={styles.customerId}>{customerId}</Text>
              {accounts.map(({ accountId, balance }) => (
                <AccountRow
                  key={accountId}
                  accountId={accountId}
                  balance={balance}
                  pending={false}
                />
              ))}
              {bank.openCustomerAccount.pending
                .filter(({ request }) => request.customerId === customerId)
                .map(({ request, idempotencyKey }) => (
                  <AccountRow
                    key={idempotencyKey}
                    accountId="... pending ..."
                    balance={request.initialDeposit}
                    pending={true}
                  />
                ))}
            </View>
          ))}
          {bank.signUp.pending.map(({ request, idempotencyKey }) => (
            <View key={idempotencyKey} style={styles.customerGroup}>
              <Text style={[styles.customerId, styles.customerIdPending]}>
                {request.customerId} (pending...)
              </Text>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
};

const BankInterface = () => {
  const bank = useBank({ id: STATE_MACHINE_ID });

  const { response: allCustomerIdsResponse } = bank.useAllCustomerIds();
  const customerIds = allCustomerIdsResponse?.customerIds ?? [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.heading}>Rebank</Text>
      <Text style={styles.subheading}>A Bank Rebooted</Text>
      <CreateCustomer bank={bank} />
      <OpenAccount bank={bank} customerIds={customerIds} />
      <Transfer bank={bank} />
      <AccountsTable bank={bank} />
    </ScrollView>
  );
};

const App = () => {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="auto" />
        <RebootClientProvider url={REBOOT_URL}>
          <BankInterface />
        </RebootClientProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0f0a1e",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    ...Platform.select({
      web: { maxWidth: 640, width: "100%", alignSelf: "center" },
      default: {},
    }),
  },
  heading: {
    fontSize: 32,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    marginTop: 8,
  },
  subheading: {
    fontSize: 16,
    color: "#c4b5fd",
    textAlign: "center",
    marginBottom: 16,
  },
  section: {
    backgroundColor: "#1c1633",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#3b2f63",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#c4b5fd",
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#3b2f63",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#ffffff",
    backgroundColor: "#0f0a1e",
  },
  chipRow: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3b2f63",
    backgroundColor: "#0f0a1e",
  },
  chipSelected: {
    backgroundColor: "#7c3aed",
    borderColor: "#a78bfa",
  },
  chipText: {
    color: "#c4b5fd",
    fontSize: 14,
  },
  chipTextSelected: {
    color: "#ffffff",
    fontWeight: "600",
  },
  button: {
    marginTop: 16,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonEnabled: {
    backgroundColor: "#7c3aed",
  },
  buttonDisabled: {
    backgroundColor: "#3b2f63",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  customerGroup: {
    marginBottom: 12,
  },
  customerId: {
    fontSize: 15,
    fontWeight: "700",
    color: "#c4b5fd",
    marginBottom: 6,
  },
  customerIdPending: {
    color: "#f0abfc",
    fontStyle: "italic",
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2147",
  },
  accountId: {
    fontSize: 15,
    color: "#ffffff",
  },
  balance: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4ade80",
  },
  balancePending: {
    color: "#f0abfc",
    fontStyle: "italic",
  },
  informationText: {
    fontSize: 15,
    color: "#8b80a8",
    fontStyle: "italic",
  },
});

export default App;
