import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Drive } from "@/components/Drive";

async function DriveLoader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <Drive
      email={user.email ?? ""}
      name={profile?.display_name || user.email?.split("@")[0] || "Участник"}
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <DriveLoader />
    </Suspense>
  );
}
