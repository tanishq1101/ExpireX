import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Landing } from "@/components/landing";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");
  return <Landing />;
}
