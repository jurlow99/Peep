import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";

export type SubscriptionRow = {
  id: number;
  user_id: string;
  status: string;
  email?: string;
  stripe_subscription_id?: string;
  plan?: string;
  [key: string]: unknown;
};

async function fetchSubscription(userId: string, pollAfterSubscribe: boolean): Promise<SubscriptionRow | null> {
  let retries = pollAfterSubscribe ? 8 : 0;
  while (true) {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (data || retries <= 0) return data;
    await new Promise((r) => setTimeout(r, 1000));
    retries--;
  }
}

export function useSubscription(userId: string | undefined) {
  const justSubscribed = new URLSearchParams(window.location.search).get("subscribed") === "1";

  const query = useQuery({
    queryKey: ["subscription", userId],
    queryFn: () => fetchSubscription(userId!, justSubscribed),
    enabled: !!userId,
    staleTime: 30_000,
  });

  if (justSubscribed && query.isSuccess) {
    history.replaceState(null, "", "/");
  }

  return {
    subscription: query.data ?? null,
    subChecked: !userId || query.isFetched,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function hasActiveSubscription(
  subscription: SubscriptionRow | null,
  isOwner: boolean
): boolean {
  if (isOwner) return true;
  return subscription?.status === "active";
}
