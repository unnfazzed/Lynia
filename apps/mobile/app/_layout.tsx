import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/auth-context";
import { queryClient } from "../src/query/client";
import { usePushRegistration } from "../src/push/use-push-registration";

/** Syncs the device's FCM token with the signed-in profile. Renders nothing; lives under AuthProvider. */
function PushSync(): null {
  usePushRegistration(useAuth().session);
  return null;
}

export default function RootLayout(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PushSync />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
