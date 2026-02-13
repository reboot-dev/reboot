import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { FC, useState } from "react";

const QuestionBox: FC<{ onSubmit: (question: string) => void }> = ({
  onSubmit,
}) => {
  const [question, setQuestion] = useState("");

  const handleSubmit = () => {
    if (question !== "") {
      onSubmit(question);
      setQuestion("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="absolute bottom-0 w-full">
      <Separator />
      <div className="flex">
        <Input
          className="outline-none focus:outline-none "
          placeholder="What's the TL;DR for Reboot?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          className="border-y-0 border-r-0"
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

export default QuestionBox;
