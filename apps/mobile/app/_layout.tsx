import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth/auth-context";
import { queryClient } from "../src/query/client";

export default function RootLayout(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
