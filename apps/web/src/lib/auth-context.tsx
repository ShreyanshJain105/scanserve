"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type {
  UserProfile,
  LoginRequest,
  RegisterRequest,
  BusinessProfile,
} from "@scan2serve/shared";
import { apiFetch } from "./api";

type CreateBusinessProfileInput = {
  name: string;
  currencyCode: string;
  description?: string | null;
  address: string;
  phone: string;
};

type UpdateBusinessProfileInput = Partial<CreateBusinessProfileInput> & {
  businessId: string;
};

type AuthContextType = {
  user: UserProfile | null;
  businessUser: UserProfile | null;
  customerUser: UserProfile | null;
  businesses: BusinessProfile[];
  selectedBusiness: BusinessProfile | null;
  loading: boolean;
  businessLoading: boolean;
  error: string | null;
  login: (input: LoginRequest) => Promise<UserProfile>;
  register: (input: RegisterRequest) => Promise<void>;
  loginCustomerFromQr: (input: LoginRequest & { qrToken: string }) => Promise<void>;
  registerCustomerFromQr: (input: RegisterRequest & { role: "customer"; qrToken: string }) => Promise<void>;
  logout: () => Promise<void>;
  logoutBusiness: () => Promise<void>;
  logoutCustomer: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshBusinessProfiles: () => Promise<void>;
  selectBusiness: (businessId: string) => void;
  createBusinessProfile: (input: CreateBusinessProfileInput) => Promise<BusinessProfile>;
  updateBusinessProfile: (input: UpdateBusinessProfileInput) => Promise<BusinessProfile>;
  archiveBusinessProfile: (businessId: string) => Promise<BusinessProfile>;
  restoreBusinessProfile: (businessId: string) => Promise<BusinessProfile>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getQrTokenFromLocation = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  const url = new URL(window.location.href);
  const queryToken = url.searchParams.get("token") ?? url.searchParams.get("qrToken");
  if (queryToken && queryToken.trim().length >= 12) return queryToken.trim();

  if (url.pathname.startsWith("/qr/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const segment = parts[1];
    if (segment && segment !== "login" && segment !== "register" && segment.length >= 12) {
      return decodeURIComponent(segment);
    }
  }

  return undefined;
};

const getScopedAuthHeaders = () => {
  const qrToken = getQrTokenFromLocation();
  return qrToken ? { "x-qr-token": qrToken } : undefined;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [businessUser, setBusinessUser] = useState<UserProfile | null>(null);
  const [customerUser, setCustomerUser] = useState<UserProfile | null>(null);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessLoading, setBusinessLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const [lastQrToken, setLastQrToken] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

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
        const firstActive = data.businesses.find((business) => business.status !== "archived");
        return firstActive?.id ?? data.businesses[0].id;
      });
    } catch {
      setBusinesses([]);
      setSelectedBusinessId(null);
    } finally {
      setBusinessLoading(false);
    }
  };

  const refreshProfile = async () => {
    const scopedHeaders = getScopedAuthHeaders();
    try {
      const sessions = await apiFetch<{
        businessUser: UserProfile | null;
        customerUser: UserProfile | null;
        activeScope: "business" | "customer";
      }>("/api/auth/sessions", {
        method: "GET",
        headers: scopedHeaders,
      });
      setBusinessUser(sessions.businessUser);
      setCustomerUser(sessions.customerUser);
    } catch {
      setBusinessUser(null);
      setCustomerUser(null);
    }

    try {
      const data = await apiFetch<{ user: UserProfile }>("/api/auth/me", {
        method: "GET",
        headers: scopedHeaders,
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
    refreshProfile()
      .finally(() => {
        setLoading(false);
        setLastQrToken(getQrTokenFromLocation() ?? null);
        setBootstrapped(true);
      });
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;
    const currentToken = getQrTokenFromLocation() ?? null;
    if (currentToken === lastQrToken) return;
    setLastQrToken(currentToken);
    setLoading(true);
    refreshProfile().finally(() => setLoading(false));
  }, [pathname, bootstrapped, lastQrToken]);

  const login = async (input: LoginRequest): Promise<UserProfile> => {
    setError(null);
    if (businessUser) {
      const message = `Already logged in as ${businessUser.email}`;
      setError(message);
      throw new Error(message);
    }
    try {
      const data = await apiFetch<{ user: UserProfile }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setUser(data.user);
      setBusinessUser(data.user);
      if (data.user.role === "business") {
        await refreshBusinessProfiles(data.user);
      } else {
        setBusinesses([]);
        setSelectedBusinessId(null);
      }
      return data.user;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  };

  const register = async (input: RegisterRequest) => {
    setError(null);
    if (businessUser) {
      const message = `Already logged in as ${businessUser.email}`;
      setError(message);
      throw new Error(message);
    }
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
    if (customerUser) {
      const message = `Already logged in as ${customerUser.email}`;
      setError(message);
      throw new Error(message);
    }
    try {
      const data = await apiFetch<{ user: UserProfile }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setUser(data.user);
      setCustomerUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  };

  const registerCustomerFromQr = async (
    input: RegisterRequest & { role: "customer"; qrToken: string }
  ) => {
    setError(null);
    if (customerUser) {
      const message = `Already logged in as ${customerUser.email}`;
      setError(message);
      throw new Error(message);
    }
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

  const logoutWithScope = async (scope: "business" | "customer" | "all") => {
    await apiFetch("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ scope }),
      headers: getScopedAuthHeaders(),
    });
    await refreshProfile();
  };

  const logout = async () => {
    await logoutWithScope("all");
  };

  const logoutBusiness = async () => {
    await logoutWithScope("business");
  };

  const logoutCustomer = async () => {
    await logoutWithScope("customer");
  };

  const logoutAll = async () => {
    await logoutWithScope("all");
  };

  const createBusinessProfile = async (input: CreateBusinessProfileInput) => {
    const data = await apiFetch<{ business: BusinessProfile }>("/api/business/profile", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await refreshBusinessProfiles();
    return data.business;
  };

  const updateBusinessProfile = async (input: UpdateBusinessProfileInput) => {
    const data = await apiFetch<{ business: BusinessProfile }>("/api/business/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    await refreshBusinessProfiles();
    return data.business;
  };

  const archiveBusinessProfile = async (businessId: string) => {
    const data = await apiFetch<{ business: BusinessProfile }>("/api/business/profile/archive", {
      method: "PATCH",
      body: JSON.stringify({ businessId }),
    });
    await refreshBusinessProfiles();
    return data.business;
  };

  const restoreBusinessProfile = async (businessId: string) => {
    const data = await apiFetch<{ business: BusinessProfile }>("/api/business/profile/restore", {
      method: "PATCH",
      body: JSON.stringify({ businessId }),
    });
    await refreshBusinessProfiles();
    return data.business;
  };

  const selectedBusiness =
    businesses.find((business) => business.id === selectedBusinessId) ?? null;

  const value: AuthContextType = {
    user,
    businessUser,
    customerUser,
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
    logoutBusiness,
    logoutCustomer,
    logoutAll,
    refreshProfile,
    refreshBusinessProfiles,
    selectBusiness: setSelectedBusinessId,
    createBusinessProfile,
    updateBusinessProfile,
    archiveBusinessProfile,
    restoreBusinessProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
