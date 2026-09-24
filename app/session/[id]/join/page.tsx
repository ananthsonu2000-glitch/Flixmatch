"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { joinSession } from "@/lib/api";
import { existingRoleFor, loadIdentity, saveIdentity } from "@/lib/identity";
import WaitingRoom from "@/components/WaitingRoom";

export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [status, setStatus] = useState<"joining" | "already_full" | "error">("joining");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const existingRole = existingRoleFor(id);
    if (existingRole) {
      const identity = loadIdentity(id)!;
      router.replace(`/session/${id}?t=${identity.token}&r=${identity.role}`);
      return;
    }

    joinSession(id)
      .then((res) => {
        if ("error" in res) {
          setStatus(res.error === "session_already_has_two_players" ? "already_full" : "error");
          setErrorMsg(res.error);
          return;
        }
        saveIdentity({ sessionId: id, role: "B", token: res.token });
        router.replace(`/session/${id}?t=${res.token}&r=B`);
      })
      .catch((e) => {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (status === "joining") {
    return <WaitingRoom title="Joining session…" subtitle="Hang tight, connecting you in." />;
  }

  if (status === "already_full") {
    return (
      <WaitingRoom
        showSpinner={false}
        title="This session already has two players"
        subtitle="Ask your partner to start a fresh session and send you a new invite."
      />
    );
  }

  return (
    <WaitingRoom
      showSpinner={false}
      title="Couldn't join this session"
      subtitle={errorMsg || "The invite link may have expired. Ask your partner to send a new one."}
    />
  );
}
