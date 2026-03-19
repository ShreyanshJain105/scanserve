"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type {
  UserProfile,
  LoginRequest,
  RegisterRequest,
  BusinessProfile,
} from "@scan2serve/shared";
import { apiFetch } from "./api";

type CreateBusinessProfileInput = {
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  address: string;
  phone: string;
};

type UpdateBusinessProfileInput = Partial<CreateBusinessProfileInput> & {
  businessId: string;
};

type AuthContextType = {
  user: UserProfile | null;
  businesses: BusinessProfile[];
  selectedBusiness: BusinessProfile | null;
  loading: boolean;
  businessLoading: boolean;
  error: string | null;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  loginCustomerFromQr: (input: LoginRequest & { qrToken: string }) => Promise<void>;
  registerCustomerFromQr: (input: RegisterRequest & { role: "customer"; qrToken: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshBusinessProfiles: () => Promise<void>;
  selectBusiness: (businessId: string) => void;
  createBusinessProfile: (input: CreateBusinessProfileInput) => Promise<void>;
  updateBusinessProfile: (input: UpdateBusinessProfileInput) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessLoading, setBusinessLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBusinessProfiles = async (forUser?: UserProfile | null) => {
    const targetUser = forUser ?? user;
    if (!targetUser || targetUser.role !== "business") {
      setBusinesses([]);
      setSelectedBusinessId(null);
      return;
    }

    setBusinessLoading(true);
    try {
      const data = await apiFetch<{ businesses: BusinessProfile[] }>(
        "/api/business/profiles",
        { method: "GET" }
      );
      setBusinesses(data.businesses);
      setSelectedBusinessId((current) => {
        if (!data.businesses.length) return null;
        if (current && data.businesses.some((business) => business.id === current)) {
          return current;
        }
        return data.businesses[0].id;
      });
    } catch {
      setBusinesses([]);
      setSelectedBusinessId(null);
    } finally {
      setBusinessLoading(false);
    }
  };

  const refreshProfile = async () => {
    try {
      const data = await apiFetch<{ user: UserProfile }>("/api/auth/me", {
        method: "GET",
      });
      setUser(data.user);
      if (data.user.role === "business") {
        await refreshBusinessProfiles(data.user);
      } else {
        setBusinesses([]);
        setSelectedBusinessId(null);
      }
    } catch {
      setUser(null);
      setBusinesses([]);
      setSelectedBusinessId(null);
    }
  };

  useEffect(() => {
    refreshProfile().finally(() => setLoading(false));
  }, []);

  const login = async (input: LoginRequest) => {
    setError(null);
    try {
      const data = await apiFetch<{ user: UserProfile }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setUser(data.user);
      if (data.user.role === "business") {
        await refreshBusinessProfiles(data.user);
      } else {
        setBusinesses([]);
        setSelectedBusinessId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  };

  const register = async (input: RegisterRequest) => {
    setError(null);
    try {
      await apiFetch<{ user: UserProfile }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      // After registration, auto-login
      await login({ email: input.email, password: input.password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Register failed");
      throw err;
    }
  };

  const loginCustomerFromQr = async (input: LoginRequest & { qrToken: string }) => {
    setError(null);
    try {
      const data = await apiFetch<{ user: UserProfile }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  };

  const registerCustomerFromQr = async (
    input: RegisterRequest & { role: "customer"; qrToken: string }
  ) => {
    setError(null);
    try {
      await apiFetch<{ user: UserProfile }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await loginCustomerFromQr({
        email: input.email,
        password: input.password,
        qrToken: input.qrToken,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Register failed");
      throw err;
    }
  };

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setBusinesses([]);
    setSelectedBusinessId(null);
  };

  const createBusinessProfile = async (input: CreateBusinessProfileInput) => {
    await apiFetch("/api/business/profile", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await refreshBusinessProfiles();
  };

  const updateBusinessProfile = async (input: UpdateBusinessProfileInput) => {
    await apiFetch("/api/business/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    await refreshBusinessProfiles();
  };

  const selectedBusiness =
    businesses.find((business) => business.id === selectedBusinessId) ?? null;

  const value: AuthContextType = {
    user,
    businesses,
    selectedBusiness,
    loading,
    businessLoading,
    error,
    login,
    register,
    loginCustomerFromQr,
    registerCustomerFromQr,
    logout,
    refreshProfile,
    refreshBusinessProfiles,
    selectBusiness: setSelectedBusinessId,
    createBusinessProfile,
    updateBusinessProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
