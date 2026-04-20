import { AnimatePresence } from "framer-motion";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppDataProvider } from "./context/AppDataContext";
import { LanguageProvider } from "./context/LanguageContext";
import Login from "./pages/Login";
import DashboardLayout from "./layouts/DashboardLayout";

function AppContent() {
  const { isAuthenticated } = useAuth();
  return (
    <AnimatePresence mode="wait">
      {isAuthenticated ? <DashboardLayout key="dashboard" /> : <Login key="login" />}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppDataProvider>
          <AppContent />
        </AppDataProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
