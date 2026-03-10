import {
  allow,
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { MainTest, SecondaryTest } from "./servicer_api_rbt.js";

export const SHARED_STATE_ID = "shared-state-id";

export class MainTestServicer extends MainTest.Servicer {
  authorizer() {
    return allow();
  }

  async transaction(
    context: TransactionContext,
    request: MainTest.TransactionRequest
  ): Promise<void> {
    this.state.data = request.mainTestData;

    await SecondaryTest.ref(SHARED_STATE_ID).writer(context, {
      data: request.secondaryTestData,
    });
  }

  async getData(
    context: ReaderContext,
    request: MainTest.GetDataRequest
  ): Promise<MainTest.GetDataResponse> {
    const mainTestData = this.state.data;

    const secondaryTestData = await SecondaryTest.ref(SHARED_STATE_ID).getData(
      context
    );

    return { mainTestData, secondaryTestData: secondaryTestData.data };
  }
}

export class SecondaryTestServicer extends SecondaryTest.Servicer {
  authorizer() {
    return allow();
  }

  async writer(
    context: WriterContext,
    request: SecondaryTest.WriterRequest
  ): Promise<void> {
    this.state.data = request.data;
  }

  async getData(
    context: ReaderContext,
    request: SecondaryTest.GetDataRequest
  ): Promise<SecondaryTest.GetDataResponse> {
    return { data: this.state.data };
  }
}
