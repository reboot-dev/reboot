import { FC } from "react";

// Simple debounce from:
// https://gist.github.com/ca0v/73a31f57b397606c9813472f7493a940
// Don't use this in production. Use something more performant, maybe lodash.
export const debounce = <F extends (...args: any[]) => any>(
  func: F,
  waitFor: number
) => {
  // This type varies between browsers so make it 'any'.
  let timeout: any;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
};

const MessagesWindow: FC<{
  onReachTop: () => void;
  children: React.ReactNode;
}> = ({ onReachTop, children }) => {
  const debouncedOnReachTop = debounce(onReachTop, 100);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLElement;

    const position = Math.floor(
      (scrollTop / (scrollHeight - clientHeight)) * 100
    );

    if (position === -100) {
      debouncedOnReachTop();
    }
  };

  return (
    <div
      onScroll={handleScroll}
      className="flex flex-col-reverse h-[calc(100%-72px)] overflow-y-auto"
    >
      {children}
    </div>
  );
};

export default MessagesWindow;
