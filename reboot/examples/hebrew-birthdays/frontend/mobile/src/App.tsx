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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { usePerson } from "../../api/birthdays/v1/person_rbt_react";
import { useUser, type UseUserApi } from "../../api/birthdays/v1/user_rbt_react";
import {
  eveningBefore,
  formatGregorian,
  HEBREW_MONTHS,
  localToday,
  whenText,
} from "../../common/dates";

// The Reboot server URL. Override with `EXPO_PUBLIC_REBOOT_URL` to
// point at a server reachable from a physical device (e.g. your
// machine's LAN IP). The default works for `expo start --web` and the
// iOS simulator; Android emulators reach the host via `10.0.2.2`.
const REBOOT_URL =
  process.env.EXPO_PUBLIC_REBOOT_URL ?? "http://localhost:9991";

// Native sign-in: Reboot runs the OAuth flow itself, in the system
// browser, keeping the session in the device keychain, so `useSignIn()`,
// `useSignOut()` and `useUser()` below behave exactly as they do in
// `frontend/web/`. `Linking` derives the redirect URI from the
// `scheme` in `app.json`, which `backend/src/main.py` lists in
// `OAuth(skip_consent_for_redirect_uris=[...])`.
//
// Built once at module scope: `RebootClientProvider` rebuilds its
// session machinery whenever this value changes identity.
const auth = expoAuth({
  WebBrowser,
  SecureStore,
  Linking,
  clientName: "Hebrew Birthdays Mobile",
});

type Upcoming = NonNullable<
  ReturnType<UseUserApi["useUpcomingBirthdays"]>["response"]
>["birthdays"][number];

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

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
    accessibilityRole="button"
    style={[styles.button, disabled ? styles.buttonDisabled : styles.buttonEnabled]}
    onPress={onPress}
    disabled={disabled}
  >
    <Text style={styles.buttonText}>{text}</Text>
  </Pressable>
);

// A wrapping row of selectable "chips", since React Native has no
// `<select>`.
const Chips = ({
  options,
  selected,
  onSelect,
  testIDPrefix,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  testIDPrefix: string;
}) => (
  <View style={styles.chipRow}>
    {options.map((option) => {
      const isSelected = option === selected;
      return (
        <Pressable
          key={option}
          testID={`${testIDPrefix}-${option}`}
          style={[styles.chip, isSelected && styles.chipSelected]}
          onPress={() => onSelect(option)}
        >
          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
            {option}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const AddPerson = ({ user }: { user: UseUserApi }) => {
  const [name, setName] = useState("");
  const [calendar, setCalendar] = useState("Gregorian");
  const [gregorian, setGregorian] = useState("");
  const [afterSunset, setAfterSunset] = useState(false);
  const [hebrewDay, setHebrewDay] = useState("");
  const [hebrewMonth, setHebrewMonth] = useState("");
  const [hebrewYear, setHebrewYear] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean }>();

  const ready =
    name.trim() !== "" &&
    (calendar === "Gregorian"
      ? gregorian !== ""
      : hebrewDay !== "" && hebrewMonth !== "" && hebrewYear !== "");

  const handleAdd = async () => {
    const request =
      calendar === "Gregorian"
        ? { name, gregorianBirthDate: gregorian, bornAfterSunset: afterSunset }
        : {
            name,
            hebrewBirthDay: Number(hebrewDay),
            hebrewBirthMonth: hebrewMonth,
            hebrewBirthYear: Number(hebrewYear),
          };
    const { response, aborted } = await user.addPerson(request);
    if (aborted !== undefined) {
      setMessage({
        text:
          aborted.error.type === "InvalidBirthdayError"
            ? String(aborted.error.message)
            : aborted.message,
        error: true,
      });
      return;
    }
    setMessage({
      text: `Added ${name.trim()}, born ${response.hebrewBirthDate?.text ?? ""}.`,
      error: false,
    });
    setName("");
    setGregorian("");
    setAfterSunset(false);
    setHebrewDay("");
    setHebrewMonth("");
    setHebrewYear("");
  };

  return (
    <Section title="Add someone">
      <Label text="Name" testID="name-label" />
      <TextInput
        testID="name-input"
        style={styles.textInput}
        value={name}
        onChangeText={setName}
        placeholder="Grandma Rivka"
        placeholderTextColor="#6d6a9a"
      />
      <Label text="Date of birth on the" />
      <Chips
        options={["Gregorian", "Hebrew"]}
        selected={calendar}
        onSelect={setCalendar}
        testIDPrefix="calendar"
      />
      {calendar === "Gregorian" ? (
        <>
          <Label text="Gregorian date of birth (YYYY-MM-DD)" testID="gregorian-label" />
          <TextInput
            testID="gregorian-input"
            style={styles.textInput}
            value={gregorian}
            onChangeText={setGregorian}
            placeholder="1950-03-10"
            placeholderTextColor="#6d6a9a"
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Born after sunset</Text>
            <Switch
              testID="after-sunset-switch"
              value={afterSunset}
              onValueChange={setAfterSunset}
            />
          </View>
        </>
      ) : (
        <>
          <Label text="Day and year" testID="hebrew-label" />
          <View style={styles.row}>
            <TextInput
              testID="hebrew-day-input"
              style={[styles.textInput, styles.flex]}
              value={hebrewDay}
              onChangeText={setHebrewDay}
              placeholder="15"
              placeholderTextColor="#6d6a9a"
              keyboardType="numeric"
            />
            <TextInput
              testID="hebrew-year-input"
              style={[styles.textInput, styles.flex]}
              value={hebrewYear}
              onChangeText={setHebrewYear}
              placeholder="5750"
              placeholderTextColor="#6d6a9a"
              keyboardType="numeric"
            />
          </View>
          <Label text="Month" />
          <Chips
            options={HEBREW_MONTHS}
            selected={hebrewMonth}
            onSelect={setHebrewMonth}
            testIDPrefix="month"
          />
        </>
      )}
      {message !== undefined && (
        <Text style={message.error ? styles.errorText : styles.successText}>
          {message.text}
        </Text>
      )}
      <Button
        testID="add-person-button"
        text="Add person"
        onPress={handleAdd}
        disabled={!ready}
      />
    </Section>
  );
};

const PersonDetails = ({
  personId,
  today,
  onClose,
}: {
  personId: string;
  today: string;
  onClose: () => void;
}) => {
  const person = usePerson({ id: personId });
  const { response } = person.useGet({ today, years: 5 });
  if (response === undefined) {
    return <Text style={styles.informationText}>Loading...</Text>;
  }
  return (
    <Section title={response.name}>
      <Text style={styles.big}>{response.hebrewBirthDate?.text}</Text>
      <Text style={styles.hebrew}>{response.hebrewBirthDate?.hebrewText}</Text>
      {response.notes !== "" && (
        <Text style={styles.informationText}>{response.notes}</Text>
      )}
      {response.upcoming.map((birthday) => (
        <View key={birthday.gregorianDate} style={styles.birthdayRow}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>{formatGregorian(birthday.gregorianDate)}</Text>
            <Text style={styles.rowDetail}>
              {birthday.hebrewDate?.text} · from sunset{" "}
              {eveningBefore(birthday.gregorianDate)}
            </Text>
          </View>
          <Text style={styles.age}>Turns {birthday.age}</Text>
        </View>
      ))}
      <Button text="Back to list" onPress={onClose} testID="close-details-button" />
    </Section>
  );
};

const BirthdayRow = ({
  birthday,
  onPress,
}: {
  birthday: Upcoming;
  onPress: () => void;
}) => {
  const next = birthday.nextBirthday;
  return (
    <Pressable style={styles.birthdayRow} onPress={onPress} testID="birthday-row">
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{birthday.name}</Text>
        <Text style={styles.rowDetail}>Born {birthday.hebrewBirthDate?.text}</Text>
      </View>
      {next !== undefined && (
        <View style={styles.rowRight}>
          <Text style={styles.rowDate}>{formatGregorian(next.gregorianDate)}</Text>
          <Text style={next.daysUntil <= 7 ? styles.soon : styles.rowDetail}>
            turns {next.age} · {whenText(next.daysUntil)}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const Birthdays = ({ user, onSignOut }: { user: UseUserApi; onSignOut: () => void }) => {
  const today = localToday();
  const [selected, setSelected] = useState<string>();
  const { response, isLoading } = user.useUpcomingBirthdays({ today });
  const todayHebrew = user.useConvertDate({ gregorianDate: today }).response;
  const birthdays = response?.birthdays ?? [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.heading}>🎂 Hebrew Birthdays</Text>
      {todayHebrew?.hebrewDate !== undefined && (
        <Text style={styles.subheading}>
          Today is {todayHebrew.hebrewDate.text} · {todayHebrew.hebrewDate.hebrewText}
        </Text>
      )}
      <View style={styles.sessionRow}>
        <Text testID="signed-in-as" style={styles.informationText} numberOfLines={1}>
          Signed in as {user.state_id}
        </Text>
        <Pressable testID="sign-out-button" onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
      {selected !== undefined ? (
        <PersonDetails
          personId={selected}
          today={today}
          onClose={() => setSelected(undefined)}
        />
      ) : (
        <>
          <Section title="Upcoming birthdays">
            {isLoading && response === undefined ? (
              <Text style={styles.informationText}>Loading...</Text>
            ) : birthdays.length === 0 ? (
              <Text style={styles.informationText}>
                Nobody yet — add someone below.
              </Text>
            ) : (
              birthdays.map((birthday) => (
                <BirthdayRow
                  key={birthday.personId}
                  birthday={birthday}
                  onPress={() => setSelected(birthday.personId)}
                />
              ))
            )}
          </Section>
          <AddPerson user={user} />
        </>
      )}
    </ScrollView>
  );
};

const Notice = ({ text }: { text: string }) => (
  <View style={styles.notice}>
    <Text style={styles.informationText}>{text}</Text>
  </View>
);

const SignIn = ({ onSignIn, error }: { onSignIn: () => void; error?: string }) => (
  <View style={styles.notice}>
    <Text style={styles.heading}>🎂 Hebrew Birthdays</Text>
    <Text style={styles.subheading}>יום הולדת שמח</Text>
    <View style={styles.section}>
      <Text style={styles.informationText}>
        Never miss a Hebrew birthday again. Sign in to see when each one falls
        this year.
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

// Identical in shape to the web app's `Root.tsx`, because the hooks
// behave identically on both.
const Root = () => {
  const signIn = useSignIn();
  const signOut = useSignOut();
  const [error, setError] = useState<string | undefined>(undefined);
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
  return <Birthdays user={user} onSignOut={() => void signOut()} />;
};

const App = () => (
  <SafeAreaProvider>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <RebootClientProvider url={REBOOT_URL} nativeAuth={auth}>
        <Root />
      </RebootClientProvider>
    </SafeAreaView>
  </SafeAreaProvider>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#1e1b4b" },
  scroll: { flex: 1 },
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
  heading: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    marginTop: 8,
  },
  subheading: {
    fontSize: 15,
    color: "#fcd34d",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  signOutText: { fontSize: 15, fontWeight: "600", color: "#fcd34d" },
  section: {
    backgroundColor: "#2a2670",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#4a4499",
  },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#ffffff", marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "500", color: "#c7d2fe", marginBottom: 6, marginTop: 10 },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#4a4499",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#ffffff",
    backgroundColor: "#1e1b4b",
  },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  switchText: { color: "#c7d2fe", fontSize: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 4 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4a4499",
    backgroundColor: "#1e1b4b",
  },
  chipSelected: { backgroundColor: "#fbbf24", borderColor: "#fcd34d" },
  chipText: { color: "#c7d2fe", fontSize: 14 },
  chipTextSelected: { color: "#1e1b4b", fontWeight: "600" },
  button: {
    marginTop: 16,
    height: 46,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonEnabled: { backgroundColor: "#fbbf24" },
  buttonDisabled: { backgroundColor: "#4a4499" },
  buttonText: { color: "#1e1b4b", fontSize: 16, fontWeight: "700" },
  birthdayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#3b3688",
  },
  rowTitle: { fontSize: 16, fontWeight: "600", color: "#ffffff" },
  rowDetail: { fontSize: 13, color: "#a5b4fc" },
  rowRight: { alignItems: "flex-end" },
  rowDate: { fontSize: 15, fontWeight: "600", color: "#fcd34d" },
  soon: { fontSize: 13, fontWeight: "700", color: "#fcd34d" },
  big: { fontSize: 22, fontWeight: "700", color: "#ffffff" },
  hebrew: { fontSize: 20, color: "#fcd34d", marginBottom: 8, writingDirection: "rtl" },
  age: { fontSize: 15, fontWeight: "700", color: "#fcd34d" },
  informationText: { fontSize: 15, color: "#a5b4fc", flexShrink: 1 },
  errorText: { marginTop: 12, fontSize: 14, color: "#fda4af" },
  successText: { marginTop: 12, fontSize: 14, color: "#6ee7b7" },
});

export default App;
