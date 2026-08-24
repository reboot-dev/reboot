import {
  RebootClientProvider,
  useSignIn,
  useSignOut,
} from "@reboot-dev/reboot-react";
import { expoAuth } from "@reboot-dev/reboot-react/native";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
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
import { useBank } from "../../api/bank/v1/bank_rbt_react";
import { useUser, type UseUserApi } from "../../api/bank/v1/user_rbt_react";

// Identifier for the shared singleton bank state instance.
const STATE_MACHINE_ID = "reboot-bank";

// The Reboot server URL. Override with `EXPO_PUBLIC_REBOOT_URL` to
// point at a server reachable from a physical device (e.g. your
// machine's LAN IP). The default works for `expo start --web` and the
// iOS simulator; Android emulators reach the host via `10.0.2.2`.
const REBOOT_URL =
  process.env.EXPO_PUBLIC_REBOOT_URL ?? "http://localhost:9991";

// Native sign-in. Reboot runs the OAuth flow itself; these three are
// the pieces React Native has no standard answer for — a browser to
// run it in, the device keychain to keep the session in, and the
// scheme-aware URL builder that says where to come back to. So
// `useSignIn()`, `useSignOut()` and `useUser()` below behave exactly
// as they do in `frontend/web/`.
//
// `Linking` derives the redirect URI from the `scheme` in `app.json`,
// and `backend/src/main.py` lists that URI in
// `OAuth(skip_consent_for_redirect_uris=[...])` — which is what lets
// Reboot sign users in with no consent screen.
//
// Built once at module scope, not inline in the JSX below:
// `RebootClientProvider` rebuilds its session machinery whenever this
// value changes identity.
const auth = expoAuth({
  WebBrowser,
  SecureStore,
  Linking,
  clientName: "Rebank Mobile",
});

// A wrapping row of selectable "chips". React Native has no `<select>`,
// so we pick an account by tapping a chip. The chips wrap to new lines
// rather than scrolling horizontally, so every chip stays reachable by
// the page's vertical scroll (a wide label like an account id would
// otherwise push later chips off the right edge, out of reach of a
// vertical scroll).
const ChipPicker = ({
  options,
  selected,
  onSelect,
  emptyText,
  testIDPrefix,
}: {
  // Each option carries a `testID` suffix that is stable and known
  // ahead of time, because its `value` is a server-generated account
  // id that an end-to-end test cannot predict.
  options: { value: string; label: string; testID: string }[];
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
            testID={`${testIDPrefix}-${option.testID}`}
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

const OpenAccount = ({ user }: { user: UseUserApi }) => {
  const [initialDeposit, setInitialDeposit] = useState("");

  const handleOpenAccount = async () => {
    // Clear the input synchronously, before awaiting. If we cleared it
    // after the await instead, a rapid follow-up (e.g. opening another
    // account) could run while this request is in flight, and this
    // clear would then clobber that next input.
    const deposit = Number(initialDeposit);
    setInitialDeposit("");
    const { aborted } = await user.openAccount({ initialDeposit: deposit });
    if (aborted !== undefined) {
      console.warn(aborted.error.type, aborted.message);
    }
  };

  return (
    <Section title="Open a New Account">
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
        testID="open-account-button"
        text="Open Account"
        onPress={handleOpenAccount}
        disabled={initialDeposit === ""}
      />
    </Section>
  );
};

const Transfer = ({ user }: { user: UseUserApi }) => {
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");

  // Transfers are a bank-wide operation, so they go through the
  // `Bank`; the pickers below only ever offer the signed-in user's own
  // accounts.
  const bank = useBank({ id: STATE_MACHINE_ID });

  const { response } = user.useBalances();

  // Account ids are server-generated, so address each chip by the
  // position of its account in the user's own list — the order in
  // which they opened them.
  const accountOptions = (response?.balances ?? []).map(
    ({ accountId }, index) => ({
      value: accountId,
      label: accountId,
      testID: `${index}`,
    })
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

const AccountsTable = ({ user }: { user: UseUserApi }) => {
  const { response, isLoading } = user.useBalances();

  if (isLoading && response === undefined) {
    return <Text style={styles.informationText}>Loading...</Text>;
  }

  const balances = response?.balances ?? [];

  return (
    <Section title="Your Accounts">
      {balances.length === 0 && user.openAccount.pending.length === 0 ? (
        <Text style={styles.informationText}>
          No accounts yet — open your first account above.
        </Text>
      ) : (
        <View>
          {balances.map(({ accountId, balance }) => (
            <AccountRow
              key={accountId}
              accountId={accountId}
              balance={balance}
              pending={false}
            />
          ))}
          {user.openAccount.pending.map(({ request, idempotencyKey }) => (
            <AccountRow
              key={idempotencyKey}
              accountId="... pending ..."
              balance={request.initialDeposit}
              pending={true}
            />
          ))}
        </View>
      )}
    </Section>
  );
};

// A full-screen centered message, for the states before the bank
// itself can be shown.
const Notice = ({ text }: { text: string }) => (
  <View style={styles.notice}>
    <Text style={styles.informationText}>{text}</Text>
  </View>
);

const SignIn = ({
  onSignIn,
  error,
}: {
  onSignIn: () => void;
  error?: string;
}) => (
  <View style={styles.notice}>
    <Text style={styles.heading}>Rebank</Text>
    <Text style={styles.subheading}>A Bank Rebooted</Text>
    <View style={styles.signInCard}>
      <Text style={styles.informationText}>
        Sign in to open accounts, check your balances, and move money between
        your accounts.
      </Text>
      <Button testID="sign-in-button" text="Sign in" onPress={onSignIn} />
      {error !== undefined && (
        <Text testID="sign-in-error" style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  </View>
);

// The signed-in user's view of the bank: sign-in auto-constructed
// their `User`, which signed them up as a customer (see
// `backend/src/user_servicer.py`), so everything here is scoped to the
// accounts they own.
const BankInterface = ({
  user,
  onSignOut,
}: {
  user: UseUserApi;
  onSignOut: () => void;
}) => {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.heading}>Rebank</Text>
      <Text style={styles.subheading}>A Bank Rebooted</Text>
      <View style={styles.sessionRow}>
        <Text testID="signed-in-as" style={styles.informationText}>
          Signed in as {user.state_id}
        </Text>
        <Pressable testID="sign-out-button" onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
      <OpenAccount user={user} />
      <Transfer user={user} />
      <AccountsTable user={user} />
    </ScrollView>
  );
};

// Branches on whether the user is signed in: a notice while the
// session resolves, a sign-in page when nobody is signed in, and the
// per-user bank once somebody is. Identical to the web front end's
// `Root.tsx`, because the hooks behave identically on both.
const Root = () => {
  const signIn = useSignIn();
  const signOut = useSignOut();
  const [error, setError] = useState<string | undefined>(undefined);
  // No id is passed: the signed-in user's own `User` is this state
  // type's default, which the provider resolved from the backend.
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <Notice text="Checking session..." />;
  }
  if (user === undefined) {
    return (
      <SignIn
        onSignIn={() => {
          setError(undefined);
          signIn().catch((caught) =>
            setError(caught instanceof Error ? caught.message : String(caught))
          );
        }}
        error={error}
      />
    );
  }
  return <BankInterface user={user} onSignOut={() => void signOut()} />;
};

const App = () => {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="auto" />
        <RebootClientProvider url={REBOOT_URL} nativeAuth={auth}>
          <Root />
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
  notice: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    ...Platform.select({
      web: { maxWidth: 640, width: "100%", alignSelf: "center" },
      default: {},
    }),
  },
  signInCard: {
    backgroundColor: "#1c1633",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#3b2f63",
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#c4b5fd",
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: "#fca5a5",
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
