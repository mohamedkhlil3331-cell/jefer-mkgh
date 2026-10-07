import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW, listenConnectivity } from "./pwa";
import { installMutationProtection } from "./components/MutationSyncStatus";

installMutationProtection();
registerSW();
listenConnectivity();

createRoot(document.getElementById("root")!).render(<App />);
