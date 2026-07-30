import "dotenv/config";
import {
  startProductionProxyGateway
} from "./server/services/platform/coin-commerce-production-runtime.mjs";
import { installProcessHandlers } from "./server/start.mjs";

const handle = await startProductionProxyGateway();
installProcessHandlers(handle);
