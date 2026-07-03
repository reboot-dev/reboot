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

// Identifier for the shared singleton bank state instance.
const STATE_MACHINE_ID = "reboot-bank";

// The Reboot server URL. Override with `EXPO_PUBLIC_REBOOT_URL` to
// point at a server reachable from a physical device (e.g. your
// machine's LAN IP). The default works for `expo start --web` and the
// iOS simulator; Android emulators reach the host via `10.0.2.2`.
const REBOOT_URL =
  process.env.EXPO_PUBLIC_REBOOT_URL ?? "http://localhost:9991";

// A wrapping row of selectable "chips". React Native has no `<select>`,
// so we pick a customer or account by tapping a chip. The chips wrap to
// new lines rather than scrolling horizontally, so every chip stays
// reachable by the page's vertical scroll (a wide label like
// `customer / account-id` would otherwise push later chips off the
// right edge, out of reach of a vertical scroll).
const ChipPicker = ({
  options,
  selected,
  onSelect,
  emptyText,
  testIDPrefix,
}: {
  // Each option may carry a `testID` suffix; it defaults to `value`,
  // but pickers whose `value` is a server-generated id (e.g. an account
  // id) can supply a stable, human-known suffix instead.
  options: { value: string; label: string; testID?: string }[];
  selected: string;
  onSelect: (value: string) => void;
  emptyText: string;
  // Prefix for each chip's `testID` so the same chip in different
  // pickers (e.g. the transfer "from" and "to" rows) stays uniquely
  // addressable in end-to-end tests.
  testIDPrefix: string;
}) => {
  if (options.length === 0) {
    return <Text style={styles.informationText}>{emptyText}</Text>;
  }
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const { value, label } = option;
        const isSelected = value === selected;
        return (
          <Pressable
            key={value}
            testID={`${testIDPrefix}-${option.testID ?? value}`}
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
    </View>
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

const Label = ({ text, testID }: { text: string; testID?: string }) => (
  <Text testID={testID} style={styles.label}>
    {text}
  </Text>
);

const Button = ({
  text,
  onPress,
  disabled,
  testID,
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) => (
  <Pressable
    testID={testID}
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
    // Clear the input synchronously, before awaiting. If we cleared it
    // after the await instead, a rapid follow-up (e.g. creating another
    // customer) could run while this request is in flight, and this
    // clear would then clobber that next input.
    const customerId = newCustomerId;
    setNewCustomerId("");
    const { aborted } = await bank.signUp({ customerId });
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
  };

  return (
    <Section title="Create New Customer">
      <Label text="Customer ID" testID="customer-id-label" />
      <TextInput
        testID="customer-id-input"
        style={styles.textInput}
        value={newCustomerId}
        onChangeText={setNewCustomerId}
        onSubmitEditing={handleCreateCustomer}
        placeholder="e.g., team@reboot.dev"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        testID="create-customer-button"
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
    // Capture and clear the form synchronously, before awaiting. If we
    // cleared after the await instead, opening a second account quickly
    // (as the end-to-end test does) would select the next customer while
    // this request is in flight, and this clear would clobber that
    // selection — so the next `add-account` would see `customerId === ""`
    // and silently do nothing.
    const requestedCustomerId = customerId;
    const deposit = Number(initialDeposit);
    setCustomerId("");
    setInitialDeposit("");
    const { aborted } = await bank.openCustomerAccount({
      customerId: requestedCustomerId,
      initialDeposit: deposit,
    });
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
  };

  return (
    <Section title="Add Account to Customer">
      <Label text="Customer" />
      <ChipPicker
        options={customerIds.map((id) => ({ value: id, label: id }))}
        selected={customerId}
        onSelect={setCustomerId}
        emptyText="No customers yet."
        testIDPrefix="open-account-customer"
      />
      <Label text="Initial Deposit ($)" testID="initial-deposit-label" />
      <TextInput
        testID="initial-deposit-input"
        style={styles.textInput}
        value={initialDeposit}
        onChangeText={setInitialDeposit}
        placeholder="1000.00"
        keyboardType="numeric"
      />
      <Button
        testID="add-account-button"
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
      // The account id is server-generated, so address the chip by its
      // owning customer in end-to-end test, which create one account
      // per customer.
      testID: customer.customerId,
    }))
  );

  const handleTransfer = async () => {
    if (fromAccountId === "" || toAccountId === "") {
      return;
    }
    // Capture and clear the form synchronously, before awaiting, so a
    // clear firing after the await can't clobber a follow-up selection.
    const request = {
      fromAccountId,
      toAccountId,
      amount: Number(amount),
    };
    setFromAccountId("");
    setToAccountId("");
    setAmount("");
    const { aborted } = await bank.transfer(request);
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
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
        testIDPrefix="transfer-from"
      />
      <Label text="To Account" />
      <ChipPicker
        options={accountOptions}
        selected={toAccountId}
        onSelect={setToAccountId}
        emptyText="No accounts yet."
        testIDPrefix="transfer-to"
      />
      <Label text="Amount ($)" testID="transfer-amount-label" />
      <TextInput
        testID="transfer-amount-input"
        style={styles.textInput}
        value={amount}
        onChangeText={setAmount}
        placeholder="100.00"
        keyboardType="numeric"
      />
      <Button
        testID="transfer-button"
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
    <Text
      testID="account-balance"
      style={[styles.balance, pending && styles.balancePending]}
    >
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
    flexDirection: "row",
    flexWrap: "wrap",
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
