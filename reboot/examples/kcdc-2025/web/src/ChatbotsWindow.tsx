import React, { useState } from "react";
import { useUser } from "./api/chat/v1/user_rbt_react";
import { Chatbot, useChatbot } from "./api/chatbot/v1/chatbot_rbt_react";
interface ChatbotFormProps {
  onCreateChatbot: (chatbot: Omit<Chatbot, "id">) => void;
}

const ChatbotForm: React.FC<ChatbotFormProps> = ({ onCreateChatbot }) => {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && prompt.trim()) {
      onCreateChatbot({
        name: name.trim(),
        prompt: prompt.trim(),
        channelId: "channel",
        humanInTheLoop: requiresApproval,
      });
      setName("");
      setPrompt("");
      setRequiresApproval(false);
    }
  };

  return (
    <div className="border border-gray-200 p-4 mb-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Create New Chatbot
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Bot Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter bot name"
            required
          />
        </div>

        <div>
          <label
            htmlFor="prompt"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Bot Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
            placeholder="Enter the bot's system prompt"
            required
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="approval"
            checked={requiresApproval}
            onChange={(e) => setRequiresApproval(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
          />
          <label
            htmlFor="approval"
            className="ml-2 block text-sm text-gray-700"
          >
            Require human approval before posting
          </label>
        </div>

        <button
          type="submit"
          className="border w-full bg-white text-black py-2 px-4 hover:bg-black hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Create Chatbot
        </button>
      </form>
    </div>
  );
};

const ChatBot = ({ chatbotId }: { chatbotId: string }) => {
  const { useGet } = useChatbot({ id: chatbotId });

  const { response } = useGet();
  const chatbot = response?.chatbot;
  if (!chatbot) {
    return <div></div>;
  }

  return (
    <div className="bg-white border border-gray-200 p-2 hover:shadow-sm transition-shadow m-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900">{chatbot.name}</h4>
        {chatbot.humanInTheLoop && (
          <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 ml-2">
            Approval Required
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600 mt-2 line-clamp-2">
        {chatbot.prompt.slice(0, 40) + "..."}
      </p>
    </div>
  );
};

const ChatbotList: React.FC<{ chatbotIds: string[] }> = ({ chatbotIds }) => {
  return (
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">Your Chatbots</h3>
      {chatbotIds.length === 0 ? (
        <div className="text-gray-500 text-center py-8">
          No chatbots created yet
        </div>
      ) : (
        <div className="flex">
          {chatbotIds.map((id) => (
            <ChatBot key={id} chatbotId={id} />
          ))}
        </div>
      )}
    </div>
  );
};

const ChatbotsWindow: React.FC<{ user: string }> = ({ user }) => {
  const { useListChatbots, addChatbot } = useUser({ id: user });
  const { response: chatbotsResponse } = useListChatbots();

  if (!chatbotsResponse) {
    return <div>Loading...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-xl font-semibold text-gray-900">Chatbots</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <ChatbotForm onCreateChatbot={addChatbot} />
        <ChatbotList chatbotIds={chatbotsResponse.chatbotIds} />
      </div>
    </div>
  );
};

export default ChatbotsWindow;
