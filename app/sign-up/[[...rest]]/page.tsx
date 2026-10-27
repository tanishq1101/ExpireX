import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Expire <span className="text-primary">X</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Create your account.</p>
      </div>
      <SignUp routing="hash" signInUrl="/login" fallbackRedirectUrl="/dashboard" />
      <Link href="/" className="text-sm text-muted hover:text-foreground">Back to Expire X</Link>
    </main>
  );
}
