import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { Truck, Eye, EyeOff, AlertCircle } from "lucide-react";

const demoAccounts = [
  { role: "Customer", email: "customer@mkgh.sa", password: "customer123", color: "text-blue-400" },
  { role: "Reviewer", email: "reviewer@mkgh.sa", password: "reviewer123", color: "text-green-400" },
  { role: "Supervisor", email: "supervisor@mkgh.sa", password: "super123", color: "text-purple-400" },
  { role: "Driver", email: "driver@mkgh.sa", password: "driver123", color: "text-orange-400" },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    const ok = login(email, password);
    if (!ok) {
      setError("Invalid email or password. Please try again.");
    }
    setLoading(false);
  };

  const fillDemo = (acc: typeof demoAccounts[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Panel */}
      <div className="mkgh-sidebar hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 p-12 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Decorative circles */}
        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-[#f97316] opacity-10" />
        <div className="absolute top-24 -right-16 w-48 h-48 rounded-full bg-blue-400 opacity-8" />

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3 mb-12"
          >
            <div className="w-12 h-12 rounded-xl mkgh-gradient-orange flex items-center justify-center shadow-lg">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-2xl tracking-wide">MKGH</span>
              <p className="text-white/40 text-xs tracking-widest uppercase mt-0.5">Logistics ERP</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Precision Logistics,<br />
              <span className="text-[#f97316]">Engineered to Move.</span>
            </h1>
            <p className="text-white/55 text-base leading-relaxed">
              End-to-end freight management across the Kingdom — from order placement to last-mile delivery.
            </p>
          </motion.div>
        </div>

        <div className="relative z-10">
          <div className="grid grid-cols-2 gap-4 mb-8">
            {[
              { label: "Active Shipments", value: "347" },
              { label: "Fleet Vehicles", value: "82" },
              { label: "Drivers On Duty", value: "61" },
              { label: "Cities Covered", value: "24" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                className="bg-white/6 rounded-xl p-4 border border-white/8"
              >
                <p className="text-[#f97316] text-2xl font-bold">{stat.value}</p>
                <p className="text-white/45 text-xs mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
          <p className="text-white/30 text-xs">© 2026 MKGH Logistics. All rights reserved.</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 bg-background min-h-screen lg:min-h-auto">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl mkgh-gradient-orange flex items-center justify-center shadow">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <span className="text-foreground font-bold text-xl tracking-wide">MKGH <span className="text-muted-foreground font-normal text-sm">Logistics ERP</span></span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">Welcome back</h2>
            <p className="text-muted-foreground text-sm">Sign in to your MKGH account to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mkgh.sa"
                required
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl mkgh-gradient-orange text-white font-semibold text-sm shadow-md hover:opacity-90 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : "Sign In"}
            </motion.button>
          </form>

          {/* Demo accounts */}
          <div className="mt-8">
            <p className="text-xs text-muted-foreground text-center mb-3 uppercase tracking-wider font-medium">Demo Accounts — Click to fill</p>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((acc) => (
                <motion.button
                  key={acc.role}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => fillDemo(acc)}
                  className="text-left p-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all cursor-pointer group"
                >
                  <p className={`text-xs font-semibold ${acc.color} mb-0.5`}>{acc.role}</p>
                  <p className="text-muted-foreground text-[10px] truncate">{acc.email}</p>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
