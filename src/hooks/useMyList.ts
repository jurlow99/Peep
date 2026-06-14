import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { contentKey } from "../lib/contentIds";

async function loadMyListMap(userId: string, profileId: string): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from("user_list")
    .select("content_id, content_type")
    .eq("user_id", userId)
    .eq("profile_id", profileId);
  const map: Record<string, boolean> = {};
  (data || []).forEach((item) => {
    map[contentKey(item.content_type, item.content_id)] = true;
  });
  return map;
}

export function useMyList(
  userId: string | undefined,
  profileId: string | undefined,
  onNeedAuth: () => void
) {
  const queryClient = useQueryClient();
  const [myList, setMyList] = useState<Record<string, boolean>>({});

  const { data } = useQuery({
    queryKey: ["myList", userId, profileId],
    queryFn: () => loadMyListMap(userId!, profileId!),
    enabled: !!userId && !!profileId,
  });

  useEffect(() => {
    if (data) setMyList(data);
    else if (!userId || !profileId) setMyList({});
  }, [data, userId, profileId]);

  const toggleList = useCallback(
    async (contentId: string | number, contentType: string) => {
      if (!userId || !profileId) {
        onNeedAuth();
        return;
      }
      const key = contentKey(contentType, contentId);
      if (myList[key]) {
        await supabase
          .from("user_list")
          .delete()
          .eq("user_id", userId)
          .eq("profile_id", profileId)
          .eq("content_id", contentId)
          .eq("content_type", contentType);
        setMyList((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        await supabase.from("user_list").insert({
          user_id: userId,
          profile_id: profileId,
          content_id: contentId,
          content_type: contentType,
        });
        setMyList((prev) => ({ ...prev, [key]: true }));
      }
      queryClient.invalidateQueries({ queryKey: ["myList", userId, profileId] });
    },
    [userId, profileId, myList, onNeedAuth, queryClient]
  );

  return { myList, toggleList, setMyList };
}
