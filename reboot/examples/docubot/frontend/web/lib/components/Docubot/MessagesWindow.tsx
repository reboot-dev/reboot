import { FC } from "react";

const MessagesWindow: FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex flex-col-reverse h-[calc(100%-72px)] overflow-y-auto">
      {children}
    </div>
  );
};

export default MessagesWindow;
