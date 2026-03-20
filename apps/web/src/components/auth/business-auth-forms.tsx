"use client";

import React from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { showToast } from "../../lib/toast";

type BusinessLoginFormProps = {
  onSuccess?: () => void;
};

export function BusinessLoginForm({ onSuccess }: BusinessLoginFormProps) {
  const { login, error } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!error) return;
    showToast({ variant: "error", message: error });
  }, [error]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const profile = await login({ email, password });
      onSuccess?.();
      if (profile.role === "admin") router.push("/admin");
      else if (profile.role === "business") router.push("/dashboard");
      else router.push("/home");
    } catch {
      // handled in auth context
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-amber-200 transition focus:ring-2"
          placeholder="you@business.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-amber-200 transition focus:ring-2"
          placeholder="Your password"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

const getPasswordChecks = (value: string) => ({
  minLength: value.length >= 8,
  hasUpper: /[A-Z]/.test(value),
  hasLower: /[a-z]/.test(value),
  hasNumber: /\d/.test(value),
  hasSymbol: /[^A-Za-z0-9]/.test(value),
});

type BusinessRegisterFormProps = {
  onSuccess?: () => void;
};

export function BusinessRegisterForm({ onSuccess }: BusinessRegisterFormProps) {
  const { register, error } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const checks = useMemo(() => getPasswordChecks(password), [password]);
  const isStrong =
    checks.minLength &&
    checks.hasUpper &&
    checks.hasLower &&
    checks.hasNumber &&
    checks.hasSymbol;

  useEffect(() => {
    if (!localError) return;
    showToast({ variant: "error", message: localError });
  }, [localError]);

  useEffect(() => {
    if (!error) return;
    showToast({ variant: "error", message: error });
  }, [error]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    if (password !== confirmPassword) {
      setLocalError("Password and confirm password do not match.");
      return;
    }
    if (!isStrong) {
      setLocalError("Please use a stronger password before creating your account.");
      return;
    }
    setLoading(true);
    try {
      await register({ email, password, role: "business" });
      onSuccess?.();
      router.push("/dashboard");
    } catch {
      // handled in auth context
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700">Work email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-amber-200 transition focus:ring-2"
          placeholder="you@business.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Create password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-amber-200 transition focus:ring-2"
          placeholder="Create a secure password"
        />
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-medium">Password requirements</p>
          <ul className="mt-1 space-y-1">
            <li>{checks.minLength ? "✓" : "•"} At least 8 characters</li>
            <li>{checks.hasUpper ? "✓" : "•"} One uppercase letter</li>
            <li>{checks.hasLower ? "✓" : "•"} One lowercase letter</li>
            <li>{checks.hasNumber ? "✓" : "•"} One number</li>
            <li>{checks.hasSymbol ? "✓" : "•"} One special character</li>
          </ul>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Confirm password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-amber-200 transition focus:ring-2"
          placeholder="Repeat password"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !isStrong}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create business account"}
      </button>
    </form>
  );
}
