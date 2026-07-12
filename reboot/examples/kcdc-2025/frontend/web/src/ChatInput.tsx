import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { FC, useState } from "react";

const ChatInput: FC<{ onSubmit: (input: string) => void }> = ({ onSubmit }) => {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (input !== "") {
      onSubmit(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="w-full">
      <Separator />
      <div className="flex">
        <Input
          className="border-none m-2 h-12"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          value={input}
        />
        <Button
          className="h-12 w-12 m-2"
          variant="outline"
          size="icon"
          onClick={handleSubmit}
        >
          <PaperPlaneIcon />
        </Button>
      </div>
    </div>
  );
};

export default ChatInput;
