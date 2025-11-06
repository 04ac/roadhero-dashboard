"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import TicketsPanel from "@/components/TicketsPanel";

const RealtimeMap = dynamic(() => import("@/components/RealtimeMap"), {
  ssr: false,
});

type Pothole = {
  latitude: number;
  longitude: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  image_url?: string;
  description?: string;
  severity_score?: number;
};

type Ticket = {
  id: string;
  status: "ACTIVE" | "COMPLETE";
  created_at: string;
  pothole_metadata: Pothole;
};

export default function DashboardPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    console.log(
      "DashboardPage useEffect running. Setting up Supabase subscription..."
    );
    // Helper to load tickets with pothole metadata
    const fetchTickets = async () => {
      console.log("Refetching tickets...");
      const { data, error } = await supabase
        .from("tickets")
        .select("*, pothole_metadata(*)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching tickets:", error);
        return;
      }
      if (data) setTickets(data);
    };

    // Initial fetch
    fetchTickets();

    // Realtime subscription
    const channel = supabase
      .channel("tickets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        async (payload) => {
          console.log("Supabase Realtime event:", payload);
          if (
            payload.eventType === "INSERT" ||
            payload.eventType === "UPDATE"
          ) {
            await fetchTickets();
          } else if (payload.eventType === "DELETE") {
            setTickets((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("Supabase realtime channel subscribed!");
        }
        if (status === "CHANNEL_ERROR") {
          console.error("Supabase channel error:", err);
        }
        if (status === "TIMED_OUT") {
          console.warn("Supabase connection timed out.");
        }
      });

    return () => {
      console.log("Cleaning up Supabase channel.");
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUpdate = (id: string, status: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: status as any } : t))
    );
  };

  return (
    <main className="p-6 space-y-4">
      <header>
        <h1 className="text-3xl font-bold">RoadHero Dashboard</h1>
        <p className="text-gray-600">
          Live pothole detection reports (auto-updating)
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <TicketsPanel tickets={tickets} onUpdate={handleUpdate} />
        <RealtimeMap tickets={tickets} />
      </div>
    </main>
  );
}
