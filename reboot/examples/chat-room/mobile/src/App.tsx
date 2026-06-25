import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useChatRoom } from "./api/chat_room/v1/chat_room_rbt_react";

// We can choose any id we want because the state will be constructed
// when we make the first `.send()` call.
const STATE_MACHINE_ID = "reboot-chat-room";

// The Reboot server URL. Override with `EXPO_PUBLIC_REBOOT_URL` to
// point at a server reachable from a physical device (e.g. your
// machine's LAN IP). The default works for `expo start --web` and the
// iOS simulator; Android emulators reach the host via `10.0.2.2`.
const REBOOT_URL =
  process.env.EXPO_PUBLIC_REBOOT_URL ?? "http://localhost:9991";

const Message = ({ text }: { text: string }) => {
  return (
    <View style={styles.message}>
      <Text style={styles.messageText}>{text}</Text>
    </View>
  );
};

const PendingMessage = ({
  text,
  isLoading,
}: {
  text: string;
  isLoading: boolean;
}) => {
  return (
    <View
      style={[
        styles.message,
        isLoading ? styles.pendingLoading : styles.pending,
      ]}
    >
      <Text style={styles.messageText}>{text}</Text>
    </View>
  );
};

const ChatRoom = () => {
  // State of the input component.
  const [message, setMessage] = useState("Hello, Reboot!");

  const { useMessages, send } = useChatRoom({ id: STATE_MACHINE_ID });
  const { response } = useMessages();

  const handleSend = async () => {
    if (message === "") {
      return;
    }
    const { aborted } = await send({ message });
    if (aborted !== undefined) {
      console.warn(aborted.error.getType());
      console.warn(aborted.message);
    }
    setMessage("");
  };

  // Render the confirmed messages followed by any optimistically
  // rendered pending sends. Each pending mutation on `send.pending`
  // is removed automatically once a `response` arrives that includes
  // its update, so readers and mutators never race.
  const confirmed = response?.messages ?? [];
  const pending = send.pending;

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          onChangeText={setMessage}
          onSubmitEditing={handleSend}
          value={message}
          placeholder="Your message here..."
          returnKeyType="send"
        />
        <Pressable
          style={[
            styles.button,
            message === "" ? styles.buttonDisabled : styles.buttonEnabled,
          ]}
          onPress={handleSend}
          disabled={message === ""}
        >
          <Text style={styles.buttonText}>Send</Text>
        </Pressable>
      </View>

      {response === undefined ? (
        <Text style={styles.informationText}>Loading...</Text>
      ) : confirmed.length === 0 && pending.length === 0 ? (
        <Text style={styles.informationText}>No messages yet!</Text>
      ) : (
        <FlatList
          style={styles.messages}
          data={confirmed}
          keyExtractor={(item, index) => `${index}-${item}`}
          renderItem={({ item }) => <Message text={item} />}
          ListFooterComponent={
            <View>
              {pending.map(({ request: { message }, isLoading }, index) => (
                <PendingMessage
                  text={message}
                  isLoading={isLoading}
                  key={`pending-${index}-${message}`}
                />
              ))}
            </View>
          }
        />
      )}
    </View>
  );
};

const App = () => {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="auto" />
        <RebootClientProvider url={REBOOT_URL}>
          <ChatRoom />
        </RebootClientProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    padding: 16,
    ...Platform.select({
      web: { maxWidth: 640, width: "100%", alignSelf: "center" },
      default: {},
    }),
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  textInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  button: {
    marginLeft: 8,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonEnabled: {
    backgroundColor: "#5c6bc0",
  },
  buttonDisabled: {
    backgroundColor: "#c5cae9",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  messages: {
    flex: 1,
  },
  message: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#f1f3f9",
    marginBottom: 8,
  },
  messageText: {
    fontSize: 16,
    color: "#1a1a2e",
  },
  pending: {
    opacity: 0.6,
  },
  pendingLoading: {
    opacity: 0.4,
  },
  informationText: {
    fontSize: 16,
    color: "#888888",
    fontStyle: "italic",
  },
});

export default App;
