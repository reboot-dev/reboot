import {
  Application,
  Auth,
  ReaderContext,
  Reboot,
  TokenVerifier,
  allowIf,
} from "@reboot-dev/reboot";
import { errors_pb } from "@reboot-dev/reboot-api";
import { strict as assert } from "node:assert";
import test from "node:test";
import { Greeter } from "../../../../tests/reboot/greeter_rbt.js";
import { GreeterServicer } from "../greeter.js";

const TOKEN_FOR_TEST = "a_secret";

const EXPECTED_AUTH = new Auth({
  userId: "the_user",
  properties: { a: "property" },
});

const EXPECTED_STATE = new Greeter.State({
  title: "Dr",
  name: "Horrible",
  adjective: "supervillain",
});

class StaticTokenVerifier extends TokenVerifier {
  #expectedStateTypeNames: string[];
  #expectedMethods: string[];

  constructor(expectedStateTypeNames: string[], expectedMethods: string[]) {
    super();
    this.#expectedStateTypeNames = expectedStateTypeNames;
    this.#expectedMethods = expectedMethods;
  }

  async verifyToken(
    context: ReaderContext,
    token?: string
  ): Promise<Auth | null> {
    assert(this.#expectedStateTypeNames.includes(context.stateTypeName));
    assert(this.#expectedMethods.includes(context.method));

    assert(context.callerBearerToken === token);

    if (token === TOKEN_FOR_TEST) {
      return new Auth(EXPECTED_AUTH);
    }
    return null;
  }
}

class AuthedGreeterServicer extends GreeterServicer {
  authorizer() {
    return new Greeter.Authorizer({
      create: allowIf({
        all: [
          ({ context }) => {
            if (!context.auth) {
              // This must mean an "incorrect" bearer token was passed.
              assert(context.callerBearerToken != TOKEN_FOR_TEST);
              return new errors_pb.Unauthenticated();
            }
            assert.deepStrictEqual(context.auth, EXPECTED_AUTH);
            assert(context.callerBearerToken === TOKEN_FOR_TEST);
            return new errors_pb.Ok();
          },
        ],
      }),

      greet: allowIf({
        all: [
          ({ context, state }) => {
            // Tests (currently) only expect this to get called once,
            // after we've called create with specific state which we
            // check here.
            assert.deepStrictEqual(state, EXPECTED_STATE);

            assert.deepStrictEqual(context.auth, EXPECTED_AUTH);
            return new errors_pb.Ok();
          },
        ],
      }),
    });
  }
}

test("auth", async (t) => {
  let rbt: Reboot;
  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({
        servicers: [AuthedGreeterServicer],
        tokenVerifier: new StaticTokenVerifier(
          ["tests.reboot.Greeter"],
          ["create", "setAdjective", "greet"]
        ),
      })
    );
  });
  t.after(async () => {
    await rbt.stop();
  });

  await t.test("via ExternalContext", async (t) => {
    async function expectUnauthenticated(options?: {
      id?: string;
      bearerToken?: string;
    }): Promise<void> {
      const context = rbt.createExternalContext("test", {
        bearerToken: options?.bearerToken,
      });
      try {
        await Greeter.create(context, options?.id);
        assert(false, `Should not have successfully authed with ${options}`);
      } catch (e) {
        assert(e instanceof Greeter.CreateAborted, "not CreateAborted");
        assert(
          e.error instanceof errors_pb.Unauthenticated,
          "not Unauthenticated"
        );
      }
    }

    // Test that an unauthenticated context fails.
    await expectUnauthenticated();

    // Test that an incorrectly authenticated context fails.
    await expectUnauthenticated({ bearerToken: "not the correct value" });

    // Test that an authenticated context succeeds.
    const authedContext = rbt.createExternalContext("test", {
      bearerToken: TOKEN_FOR_TEST,
    });
    const [greeter] = await Greeter.create(authedContext);

    // Confirm that our authorizer does not allow access to any other method
    // by default, since we have not overridden other methods.
    try {
      await greeter.setAdjective(authedContext);
      assert(false, "Should not have successfully authed.");
    } catch (e) {
      assert(
        e instanceof Greeter.SetAdjectiveAborted,
        "not SetAdjectiveAborted"
      );
      assert(
        e.error instanceof errors_pb.PermissionDenied,
        "not PermissionDenied"
      );
    }
  });

  await t.test("via construct and lookup", async (t) => {
    // Test that an authenticated construct succeeds.
    const context = rbt.createExternalContext("test");
    const [greeter] = await Greeter.create(
      context,
      {
        title: "Dr",
        name: "Horrible",
        adjective: "supervillain",
      },
      {
        bearerToken: TOKEN_FOR_TEST,
      }
    );

    // Test that an authenticated lookup succeeds.
    await Greeter.ref(greeter.stateId, {
      bearerToken: TOKEN_FOR_TEST,
    }).greet(context);
  });
});
