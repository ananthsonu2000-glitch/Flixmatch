"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PreferenceForm from "@/components/PreferenceForm";
import { createSession } from "@/lib/api";
import { getDevicePairId, saveDevicePairId, saveIdentity } from "@/lib/identity";
import type { PreferenceInput } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (preferences: PreferenceInput) => {
    setSubmitting(true);
    setError(null);
    try {
      const pairId = getDevicePairId();
      const res = await createSession(preferences, pairId);
      saveDevicePairId(res.pairId, res.pairCode);
      saveIdentity({ sessionId: res.sessionId, role: "A", token: res.token });
      router.push(`/session/${res.sessionId}?t=${res.token}&r=A`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--text-dim)]">
          Two people. One deck. Zero negotiating.
        </p>
      </div>
      <PreferenceForm
        title="What are you in the mood for?"
        subtitle="Set your preferences, then invite your partner — they'll answer privately."
        submitLabel="Start & invite partner"
        submitting={submitting}
        onSubmit={handleSubmit}
      />
      {error && <p className="text-center text-sm text-[var(--pass)] mt-4">{error}</p>}
    </main>
  );
}
