import { auth } from "@/auth";
import { SignIn } from "@/components/sign-in";
import { Dashboard } from "@/components/dashboard";

export default async function Home() {
  const session = await auth();
  if (!session) return <SignIn />;
  return <Dashboard user={session.user} />;
}
