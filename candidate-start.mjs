import "dotenv/config";
import { installProcessHandlers, startProxyGateway } from "./server/start.mjs";

const handle = await startProxyGateway();
installProcessHandlers(handle);
