import { Application, Reboot } from "@reboot-dev/reboot";
import * as http from "http";
import { strict as assert } from "node:assert";
import test from "node:test";
import { Greeter } from "../greeter_rbt.js";
import { GreeterServicer } from "../nodejs/greeter.js";

test("Tests for Reboot HTTP documentation", async (t) => {
  await t.test("Simple HTTP", async (t) => {
    const application = new Application({ servicers: [GreeterServicer] });

    application.http.get("/hello_world", async (context, req, res) => {
      res.json({ message: `Hello, world!` });
    });

    const rbt = new Reboot();
    await rbt.start();
    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });
    // Make sure we can access the HTTP endpoint more than once.
    for (let i = 0; i < 5; i++) {
      const data = await new Promise<{ message: string }>((resolve, reject) => {
        const req = http.request(
          new URL(rbt.url() + "/hello_world"),
          {
            method: "GET",
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => {
              resolve(JSON.parse(data) as { message: string });
            });
          }
        );

        req.on("error", (err) => {
          reject(err);
        });
        req.end();
      });
      assert(data.message == "Hello, world!", `${JSON.stringify(data)}`);
    }
  });

  await t.test("HTTP can use external context", async (t) => {
    const application = new Application({ servicers: [GreeterServicer] });

    application.http.post("/hello_greeter", async (context, req, res) => {
      const { title, name, adjective } = req.body as {
        title: string;
        name: string;
        adjective: string;
      };
      const [greeter] = await Greeter.create(context, {
        title,
        name,
        adjective,
      });

      const { message } = await greeter.greet(context, { name: "You" });

      res.json({ message });
    });

    const rbt = new Reboot();
    await rbt.start();
    t.after(async () => {
      await rbt.stop();
    });
    await rbt.up(application, { localEnvoy: true });

    // Make sure we can access the HTTP endpoint more than once.
    for (let i = 0; i < 5; i++) {
      const data = await new Promise<{ message: string }>((resolve, reject) => {
        const requestData = JSON.stringify({
          name: "Reboot",
          title: "Dr",
          adjective: "best doctor ever",
        });

        const req = http.request(
          new URL(rbt.url() + "/hello_greeter"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": requestData.length,
            },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => {
              resolve(JSON.parse(data) as { message: string });
            });
          }
        );

        req.on("error", (err) => {
          reject(err);
        });

        req.write(requestData);

        req.end();
      });

      assert(
        data.message == "Hi You, I am Dr Reboot the best doctor ever",
        `${JSON.stringify(data)}`
      );
    }
  });
});
