import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FC, useState } from "react";
import { Button } from "./components/ui/button";

const Login: FC<{ onSubmit: (input: string) => void }> = ({ onSubmit }) => {
  const [username, setUsername] = useState("");

  const handleClick = () => {
    if (username === "") {
      console.warn("Add your username");
    } else {
      onSubmit(username);
    }
  };

  return (
    <div className="w-screen h-screen flex justify-center item-center">
      <div className="flex items-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Login</CardTitle>
            <CardDescription>
              Enter your username below to see your chat messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Username</Label>
              <Input
                id="Username"
                type="text"
                placeholder="You"
                required
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleClick}>
              Sign in
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Login;
