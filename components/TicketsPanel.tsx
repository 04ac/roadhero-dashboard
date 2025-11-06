"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Pothole = {
  id: string;
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

export default function TicketsPanel({
  tickets,
  onUpdate,
}: {
  tickets: Ticket[];
  onUpdate?: (id: string, status: string) => void;
}) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const sorted = [...tickets].sort(
    (a, b) =>
      (b.pothole_metadata.severity_score ?? 0) -
      (a.pothole_metadata.severity_score ?? 0)
  );

  async function updateStatus(id: string, newStatus: "ACTIVE" | "COMPLETE") {
    const { error } = await supabase
      .from("tickets")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) onUpdate?.(id, newStatus);
  }

  const severityColor = {
    HIGH: "bg-red-500",
    MEDIUM: "bg-orange-500",
    LOW: "bg-green-500",
  };

  return (
    <div className="bg-white rounded-xl shadow p-4 overflow-y-auto h-[85vh] flex flex-col">
      <h2 className="text-lg font-semibold mb-2">Live Tickets</h2>
      <p className="text-gray-500 text-sm mb-4">
        Sorted by severity (high → low)
      </p>

      <div className="space-y-4 flex-1">
        {sorted.map((t) => {
          const p = t.pothole_metadata;
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 border-b border-gray-100 pb-3"
            >
              {/* Image */}
              <img
                src={p.image_url ?? "/placeholder.png"}
                alt="pothole"
                className="w-20 h-16 object-cover rounded-md border cursor-pointer hover:opacity-80 transition"
                onClick={() => p.image_url && setLightboxImage(p.image_url)}
              />

              {/* Ticket Info */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-sm truncate">
                    {p.description ?? "Pothole"}
                  </h3>
                  <span
                    className={`px-2 py-0.5 text-xs text-white rounded-full shrink-0 ${
                      severityColor[p.severity]
                    }`}
                  >
                    {p.severity}
                  </span>
                </div>

                <p className="text-xs text-gray-500 mt-1">
                  {new Date(t.created_at).toLocaleString()}
                </p>

                {/* Status Dropdown */}
                <div className="flex items-center mt-1 gap-2">
                  <span className="text-xs text-gray-600">Status:</span>
                  <select
                    value={t.status}
                    onChange={(e) =>
                      updateStatus(
                        t.id,
                        e.target.value as "ACTIVE" | "COMPLETE"
                      )
                    }
                    className={`text-xs border rounded px-1.5 py-0.5 outline-none cursor-pointer transition ${
                      t.status === "ACTIVE"
                        ? "border-yellow-400 text-yellow-700 bg-yellow-50"
                        : "border-green-400 text-green-700 bg-green-50"
                    }`}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="COMPLETE">COMPLETE</option>
                  </select>
                </div>
              </div>

              {/* Status Icon — Clean & Consistent */}
              <div className="flex flex-col items-end justify-center min-w-[60px]">
                {t.status === "ACTIVE" ? (
                  <span
                    title="Pending repair"
                    className="text-yellow-500 text-xl font-bold"
                  >
                    ⚠
                  </span>
                ) : (
                  <span
                    title="Repair complete"
                    className="text-green-600 text-xl font-bold"
                  >
                    ✔
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-sm text-gray-500 text-center mt-10">
            No tickets yet.
          </p>
        )}
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-9999 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300 transition"
            onClick={() => setLightboxImage(null)}
          >
            ×
          </button>
          <img
            src={lightboxImage}
            alt="Pothole full view"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
