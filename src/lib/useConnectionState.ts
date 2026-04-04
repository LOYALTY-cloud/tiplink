"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type ConnectionState = "connected" | "reconnecting" | "disconnected";

export function useConnectionState(channelName = "connection-probe") {
  const [state, setState] = useState<ConnectionState>("connected");

  useEffect(() => {
    const channel = supabase.channel(channelName);

    channel
      .on("system", { event: "*" } as any, (payload: any) => {
        const status = payload?.status ?? payload?.event;
        if (status === "SUBSCRIBED" || status === "subscribed") {
          setState("connected");
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "channel_error" ||
          status === "TIMED_OUT" ||
          status === "timed_out"
        ) {
          setState("reconnecting");
        } else if (status === "CLOSED" || status === "closed") {
          setState("disconnected");
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setState("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setState("reconnecting");
        else if (status === "CLOSED") setState("disconnected");
      });

    // Online/offline browser events
    const onOnline = () => setState("reconnecting"); // will become connected on next subscribe
    const onOffline = () => setState("disconnected");

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [channelName]);

  const pulseClass =
    state === "connected"
      ? "pulse-connected"
      : state === "reconnecting"
        ? "pulse-reconnecting"
        : "pulse-disconnected";

  const label =
    state === "connected"
      ? "Live"
      : state === "reconnecting"
        ? "Reconnecting…"
        : "Offline";

  return { state, pulseClass, label };
}
