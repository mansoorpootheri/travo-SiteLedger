import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { signIn, useSession, asAppUser } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Login() {
  const [tenancyName, setTenancyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isPending } = useSession();

  // Navigate only once Better Auth's session store actually reflects the
  // signed-in user, rather than right after signIn.email() resolves. The
  // store can briefly still hold its previous ("signed out") value at that
  // point — e.g. right after a sign-out, nothing on this page was subscribed
  // to it in between, so it goes stale — which would otherwise send a
  // freshly-signed-in user straight back to /login before the store catches
  // up. Subscribing here (via useSession) also keeps the store's refetch
  // listener alive across the whole sign-out → sign-in transition.
  useEffect(() => {
    if (isPending || !asAppUser(data?.user)) return;
    const from = (location.state as { from?: Location })?.from;
    navigate(from?.pathname ?? "/", { replace: true });
  }, [isPending, data, location.state, navigate]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read straight from the form instead of the `email`/`password` state:
    // browser autofill sets the input's DOM value without always firing the
    // event React's onChange relies on, so on a first submit right after
    // autofill the state can still be empty even though the fields look
    // filled — this reads what's actually in the fields at submit time.
    const formData = new FormData(e.currentTarget);
    const submittedTenancyName = String(formData.get("tenancyName") ?? "");
    const submittedEmail = String(formData.get("email") ?? "");
    const submittedPassword = String(formData.get("password") ?? "");
    setSubmitting(true);
    const { error } = await signIn.email({
      email: submittedEmail,
      password: submittedPassword,
      tenancyName: submittedTenancyName,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "Sign in failed");
    }
    // On success, the effect above navigates once useSession reflects it.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center text-center">
          <img src="/logo-horizontal.png" alt="Entry by Mazena" className="h-14 w-auto" />
          <CardTitle className="sr-only">Entry by Mazena</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit} autoComplete="off">
            <div className="space-y-1.5">
              <Label htmlFor="tenancyName">Company (leave blank for host admin)</Label>
              <Input
                id="tenancyName"
                name="tenancyName"
                type="text"
                autoComplete="off"
                value={tenancyName}
                onChange={(e) => setTenancyName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
