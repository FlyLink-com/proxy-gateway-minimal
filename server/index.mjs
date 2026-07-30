import "dotenv/config";
import {
  startProductionProxyGateway
} from "./services/platform/coin-commerce-production-runtime.mjs";
import { installProcessHandlers } from "./start.mjs";

const handle = await startProductionProxyGateway();
installProcessHandlers(handle);
