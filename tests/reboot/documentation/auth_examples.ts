import { Message } from "@bufbuild/protobuf";
import {
  allow,
  allowIf,
  Application,
  Auth,
  ExternalContext,
  ReaderContext,
  TokenVerifier,
  WriterContext,
} from "@reboot-dev/reboot";
import { errors_pb } from "@reboot-dev/reboot-api";
import { Account, Bank } from "./bank_rbt.js";

const SINGLETON_BANK_ID = "singleton-bank";
const VALID_JWT = "a-valid-json-web-token";

async function validateUser(userId: string): Promise<boolean> {
  return userId !== "";
}

async function isValidUser({
  context,
}: {
  context: ReaderContext;
  state?: Message;
  request?: Message;
}) {
  if (!context.auth) {
    return new errors_pb.Unauthenticated();
  }

  if (await validateUser(context.auth.userId)) {
    return new errors_pb.Ok();
  }

  return new errors_pb.PermissionDenied();
}

async function isAdmin({ context }: { context: ReaderContext }) {
  if (context.auth?.userId === "admin") {
    return new errors_pb.Ok();
  }

  return new errors_pb.PermissionDenied();
}

async function isAccountOwner({ context }: { context: ReaderContext }) {
  if (context.auth?.userId === context.stateId) {
    return new errors_pb.Ok();
  }

  return new errors_pb.PermissionDenied();
}

class AccountServicerBase extends Account.Servicer {
  async open(
    context: WriterContext,
    request: Account.OpenRequest
  ): Promise<Account.PartialOpenResponse> {
    this.state.customerName = request.customerName;
    return {};
  }

  async getId(
    context: ReaderContext,
    request: Account.GetIdRequest
  ): Promise<Account.PartialGetIdResponse> {
    return { id: context.stateId };
  }

  async balance(
    context: ReaderContext,
    request: Account.BalanceRequest
  ): Promise<Account.PartialBalanceResponse> {
    return { balance: this.state.balance };
  }

  async deposit(
    context: WriterContext,
    request: Account.DepositRequest
  ): Promise<Account.PartialDepositResponse> {
    this.state.balance += request.amount;
    return { updatedBalance: this.state.balance };
  }

  async withdraw(
    context: WriterContext,
    request: Account.WithdrawRequest
  ): Promise<Account.PartialWithdrawResponse> {
    this.state.balance -= request.amount;
    return { updatedBalance: this.state.balance };
  }
}

export class AccountServicer extends AccountServicerBase {
  authorizer() {
    return new Account.Authorizer({
      balance: allowIf({ any: [isAdmin, isAccountOwner] }),
      deposit: allow(),
      withdraw: allowIf({ all: [isAccountOwner] }),
    });
  }
}

export class AdminOnlyAccountServicer extends AccountServicerBase {
  authorizer() {
    return allowIf({ all: [isAdmin] });
  }
}

export class MyTokenVerifier extends TokenVerifier {
  async verifyToken(
    context: ReaderContext,
    token?: string
  ): Promise<Auth | null> {
    if (token === undefined) {
      return null;
    }
    return new Auth({ userId: token });
  }
}

export function main() {
  new Application({
    servicers: [AccountServicer],
    tokenVerifier: new MyTokenVerifier(),
  }).run();
}

export function makeContext(token: string): ExternalContext {
  const context = new ExternalContext({
    name: "Example",
    url: "http://localhost:9991",
    bearerToken: token,
  });
  return context;
}

export async function createBank(context: ExternalContext) {
  const [bank] = await Bank.create(
    context,
    SINGLETON_BANK_ID,
    {},
    { bearerToken: VALID_JWT }
  );
  return bank;
}

export function refAccount(request: Bank.TransferRequest, bearerToken: string) {
  const fromAccount = Account.ref(request.fromAccountId, { bearerToken });
  return fromAccount;
}
