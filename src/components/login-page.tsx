"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Loader2, Key, Shield, ChevronLeft } from "lucide-react";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (isRegister) {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, displayName: displayName || username }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        setRegisterSuccess(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Registration failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // Step 1: If we haven't checked 2FA yet, check if this account requires it
      if (!requires2FA) {
        const checkRes = await fetch("/api/auth/check-2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        const checkData = await checkRes.json();

        if (checkData.requires2FA) {
          // Account has 2FA — show the code input, don't call signIn yet
          setRequires2FA(true);
          setLoading(false);
          return;
        }
      }

      // Step 2: Call signIn (with TOTP if 2FA is required)
      const result = await signIn("credentials", {
        username,
        password,
        totp: requires2FA ? totpCode : undefined,
        redirect: false,
      });

      if (result?.error) {
        if (requires2FA) {
          setError("Invalid 2FA code. Please try again.");
        } else {
          setError("Invalid username or password, or your account may be pending admin approval");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(prev => !prev);
    setError("");
    setRegisterSuccess(false);
    setRequires2FA(false);
    setTotpCode("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="HERO Sidekick" className="h-16 w-16 rounded-2xl mx-auto mb-4 earth-glow" />
          <h1 className="text-2xl font-bold">HERO Sidekick</h1>
          <p className="text-sm text-muted-foreground mt-1">ERTH Pickup Automation</p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-white/10 bg-card earth-glow p-6">
          <h2 className="text-lg font-semibold mb-4">{isRegister ? "Create Account" : "Sign In"}</h2>

          {registerSuccess && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mb-4 text-sm text-emerald-300">
              Account created! An admin needs to approve your account before you can sign in.
              <div className="mt-2 pt-2 border-t border-emerald-500/20 text-xs text-emerald-400/80">
                <strong>💡 Security Tip:</strong> After signing in, enable 2FA in Settings → Security for extra account protection with Google Authenticator.
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 mb-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {!registerSuccess && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <Label className="text-xs text-muted-foreground">Display Name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    className="h-11 bg-white/5 border-white/10"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Username</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-username"
                  className="h-11 bg-white/5 border-white/10"
                  required
                  minLength={3}
                  disabled={requires2FA}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 bg-white/5 border-white/10"
                  required
                  minLength={4}
                  disabled={requires2FA}
                />
              </div>
              {requires2FA && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs text-primary font-medium flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      2FA Required — Enter your authenticator code
                    </p>
                  </div>
                  <Input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="h-12 bg-white/5 border-white/10 text-center text-xl tracking-[0.5em] font-mono"
                    required
                    maxLength={6}
                    autoFocus
                  />
                  <p className="text-[0.625rem] text-muted-foreground">Open Google Authenticator and enter the 6-digit code</p>
                  <button
                    type="button"
                    onClick={() => { setRequires2FA(false); setTotpCode(""); setError(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft className="h-3 w-3" />Back to sign in
                  </button>
                </div>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground text-base"
              >
                {loading ? "Please wait..." : isRegister ? "Create Account" : requires2FA ? "Verify & Sign In" : "Sign In"}
              </Button>
            </form>
          )}

          <div className="mt-4 text-center">
            {!registerSuccess && (
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-primary hover:underline"
              >
                {isRegister ? "Already have an account? Sign in" : "Don't have an account? Register"}
              </button>
            )}
            {registerSuccess && (
              <Button
                variant="outline"
                onClick={() => { setIsRegister(false); setRegisterSuccess(false); setUsername(""); setPassword(""); setDisplayName(""); }}
                className="mt-2 border-white/10 bg-white/5"
              >
                Back to Sign In
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          New accounts require admin approval before sign-in
        </p>
      </div>
    </div>
  );
}

// ============ NOTIFICATION BELL ============
