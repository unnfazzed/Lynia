import { useNavigation, useRouter } from "expo-router";
import { useCallback } from "react";
import { backToRiderBoard } from "../../logic/nav";

/**
 * Back to the rider board from a screen pushed on the root stack (job, food job, food offer) without
 * stacking a second board — see {@link backToRiderBoard}. The stack is read at call time, not render.
 */
export function useBackToBoard(): () => void {
  const router = useRouter();
  const navigation = useNavigation();
  return useCallback(() => backToRiderBoard(router, navigation.getState()?.routes), [router, navigation]);
}
