import "dotenv/config";
import { installProcessHandlers, startProxyGateway } from "./start.mjs";

const handle = await startProxyGateway();
installProcessHandlers(handle);
