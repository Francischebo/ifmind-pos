import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { z } from "zod";
import cfiLogo from "@/assets/cfi-pos-techiez-logo.png";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Auth() {
  const { signIn, verifyOtp, user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [authStep, setAuthStep] = useState<"login" | "otp">("login");
  const [currentOtpToken, setCurrentOtpToken] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      loginSchema.parse({ email, password });
      const { error, needsOtp, otpToken } = await signIn(email, password);
      if (error) {
        const errorMsg = error;
        if (errorMsg && errorMsg.includes("Invalid login credentials")) {
          toast.error("Invalid email or password");
        } else {
          toast.error(errorMsg || "Login failed");
        }
      } else if (needsOtp && otpToken) {
        setCurrentOtpToken(otpToken);
        setAuthStep("otp");
        toast.success("Please check your email for the OTP");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentOtpToken) return;

    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const code = formData.get("code") as string;

    const { error } = await verifyOtp(currentOtpToken, code);
    if (error) {
      toast.error(error || "Invalid OTP code");
    } else {
      toast.success("Login successful!");
    }
    setIsLoading(false);
  };

  if (authStep === "otp") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <img
          src={cfiLogo}
          alt="CFI-POS Techiez Limited Company"
          className="mb-4 h-auto w-full max-w-xs object-contain"
        />
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Security Verification</CardTitle>
            <CardDescription>
              Enter the 6-digit OTP sent to your email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-code">OTP Code</Label>
                <Input
                  id="otp-code"
                  name="code"
                  type="text"
                  maxLength={6}
                  minLength={6}
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit code"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Verifying..." : "Verify OTP"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full mt-2"
                onClick={() => setAuthStep("login")}
              >
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <img
        src={cfiLogo}
        alt="CFI-POS Techiez Limited Company"
        className="mb-4 h-auto w-full max-w-xs object-contain"
      />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 bg-primary rounded-full flex items-center justify-center">
              <ShoppingCart className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">CFI-POS Techiez</CardTitle>
          <CardDescription>
            Sign in to access your point of sale terminal and inventory
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email Address</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                placeholder="cashier@store.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="rounded-lg bg-muted/50 p-3 border border-border text-center text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-0.5">Need an account or password reset?</p>
            <p>Staff and cashier accounts are provisioned by your system administrator. Contact your manager or supervisor for credentials.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
