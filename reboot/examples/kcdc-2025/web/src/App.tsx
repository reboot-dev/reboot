import {
  Presence,
  usePresenceContext,
} from "@reboot-dev/reboot-std-react/presence";
import { FC, useEffect, useState } from "react";
import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";
import ChatWindow from "./ChatWindow";
import ChatbotsWindow from "./ChatbotsWindow";
import Login from "./Login";
import MessagesWindow from "./MessagesWindow";
import ReactionsWindow from "./ReactionWindow";
import { useChannel } from "./api/chat/v1/channel_rbt_react";
import { useUser, useUsers } from "./api/chat/v1/user_rbt_react";
import { useChatbot } from "./api/chatbot/v1/chatbot_rbt_react";
import { Button } from "./components/ui/button";

const UsersPane: FC<{ users: string[] }> = ({ users }) => {
  const { subscriberIds } = usePresenceContext();
  return (
    <>
      {users.map((user) => (
        <div className="flex items-center" key={user}>
          <div key={user} className="p-2">
            {decodeURIComponent(user)}
          </div>
          <span
            className={`flex w-3 h-3 me-3 ${
              subscriberIds.includes(user) ? "bg-green-500" : "bg-gray-500"
            } rounded-full`}
          ></span>
        </div>
      ))}
    </>
  );
};

const PendingChatbotMessage: FC<{ chatbotId: string; index: number }> = ({
  chatbotId,
  index,
}) => {
  const { useGet, approve, deny } = useChatbot({ id: chatbotId });

  const { response } = useGet();
  const chatbot = response?.chatbot;

  if (!chatbot) {
    return <div></div>;
  }

  const handleApprove = (postId: string) => {
    approve({ id: postId });
  };

  const handleDismiss = (postId: string) => {
    deny({ id: postId });
  };

  if (chatbot.postsForApproval.length === 0) {
    return <div></div>;
  }

  return chatbot.postsForApproval.map((post) => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center
      bg-black bg-opacity-50"
      style={{
        zIndex: 1000 + index,
      }}
      key={post.id}
    >
      <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 transform transition-all">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Pending Chatbot Approval
          </h2>
          <p className="text-gray-600 text-sm mb-4">{post.author}</p>
          <p className="text-gray-600 text-sm mb-4">{post.text}</p>
        </div>

        <div className="flex justify-end space-x-3">
          <Button
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2"
            onClick={() => handleDismiss(post.id)}
          >
            Dismiss
          </Button>
          <Button
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2"
            onClick={() => handleApprove(post.id)}
          >
            Approve
          </Button>
        </div>
      </div>
    </div>
  ));
};

const PendingChatbotMessages: FC<{ chatbotIds?: string[] }> = ({
  chatbotIds,
}) => {
  if (!chatbotIds || chatbotIds.length === 0) {
    return <div className="p-4"></div>;
  }

  return (
    <div className="flex flex-col z-10 absolute bottom-0 right-0 p-4 bg-white">
      {chatbotIds.map((id, index) => (
        <PendingChatbotMessage key={id} chatbotId={id} index={index} />
      ))}
    </div>
  );
};

const PAGE_SIZE = 20;
const LoggedInChatApp: FC<{ username: string; handleLogout: () => void }> = ({
  username,
  handleLogout,
}) => {
  const [window, setWindow] = useState<"chats" | "reactions" | "chatbots">(
    "chats"
  );
  const [limit, setLimit] = useState(20);

  const { post, useMessages } = useChannel({ id: "channel" });

  const { useList } = useUsers({ id: "(singleton)" });

  const { response: usersResponse } = useList();

  const { create, useListChatbots } = useUser({ id: username });

  useEffect(() => {
    create();
  }, []);

  const onMessage = (message: string) => {
    post({ author: username, text: message });
  };

  const { response } = useMessages({ limit });
  const messages = (response && response.messages) || {};
  const { response: chatbotsResponse } = useListChatbots();

  if (!usersResponse) {
    return <div>Loading...</div>;
  }

  return (
    <Presence id={"presence"} subscriberId={username}>
      <div className="flex">
        <div className="w-1/4 border-r flex flex-col p-4 h-screen">
          <Button
            className={
              "m-2 bg-white text-darkgrey border hover:bg-black hover:text-white " +
              (window === "chats" && "bg-black text-white")
            }
            onClick={() => setWindow("chats")}
          >
            Chats
          </Button>
          <Button
            className={
              "m-2 bg-white text-darkgrey border hover:bg-black hover:text-white " +
              (window === "reactions" && "bg-black text-white")
            }
            onClick={() => setWindow("reactions")}
          >
            Reactions
          </Button>
          <Button
            className={
              "m-2 bg-white text-darkgrey border hover:bg-black hover:text-white " +
              (window === "chatbots" && "bg-black text-white")
            }
            onClick={() => setWindow("chatbots")}
          >
            Chatbots
          </Button>
          <Button
            className={
              "m-2 bg-white text-darkgrey border hover:bg-black hover:text-white "
            }
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>
        <div className="w-3/4">
          {window === "chats" && (
            <div className="flex h-screen">
              <ChatWindow>
                <MessagesWindow
                  onReachTop={() => setLimit((limit) => limit + PAGE_SIZE)}
                >
                  {post.pending.map((message) => (
                    <ChatMessage
                      id={message.idempotencyKey}
                      username={username}
                      message={message.request.text}
                      name={message.request.author}
                      reactions={{}}
                      pending={true}
                      key={message.idempotencyKey}
                    />
                  ))}
                  {Object.keys(messages)
                    .sort()
                    .reverse()
                    .map((timestamp) => (
                      <ChatMessage
                        timestamp={timestamp}
                        id={messages[timestamp].id}
                        username={username}
                        message={messages[timestamp].text}
                        name={messages[timestamp].author}
                        key={messages[timestamp].id}
                        reactions={messages[timestamp].reactions}
                      />
                    ))}
                </MessagesWindow>
                <ChatInput onSubmit={onMessage} />
              </ChatWindow>
              <div className="border w-1/2 p-4">
                <h1 className="text-xl">Users</h1>
                <UsersPane users={usersResponse.users} />
              </div>
            </div>
          )}
          {window === "reactions" && <ReactionsWindow />}
          {window === "chatbots" && <ChatbotsWindow user={username} />}
          <PendingChatbotMessages chatbotIds={chatbotsResponse?.chatbotIds} />
        </div>
      </div>
    </Presence>
  );
};

function App() {
  const usernameLocalStorage = localStorage.getItem("username");
  let [username, setUsername] = useState(usernameLocalStorage || undefined);

  const handleLogout = () => {
    setUsername(undefined);
    localStorage.removeItem("username");
  };

  const handleLogin = (username: string) => {
    setUsername(username);
    localStorage.setItem("username", username);
  };

  if (username === undefined) return <Login onSubmit={handleLogin} />;

  return <LoggedInChatApp username={username} handleLogout={handleLogout} />;
}

export default App;
