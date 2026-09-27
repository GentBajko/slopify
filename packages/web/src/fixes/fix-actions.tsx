import type { Fix } from "@app/slices/fixes/rules.js";
import type { HealthReport } from "@app/slices/settings/health.js";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { Button, type ButtonSize } from "@/components/kit/button";
import { useToast } from "@/components/kit/toast";
import { checkHealth } from "@/components/provider-upkeep-api";

// The fix-it buttons (`slices/fixes/rules.ts` names the fix; this renders it): a signed-out
// CLI gets its sign-in command to copy and a Check again that asks the CLI and, once it is
// signed in, runs the step again; a key goes to Settings → Providers; a full disk to Storage.
// A refused prompt or a retired model is changed where the caller keeps it (`edit`).

type SignIn = Extract<Fix, { readonly kind: "sign-in" }>;

// What Check again found out about the CLI's sign-in.
export type SignInCheck = "signed-in" | "signed-out" | "unknown";

export function signInOf(report: HealthReport, fix: SignIn): SignInCheck {
  const check = report.providers
    .find((row) => row.id === fix.cli)
    ?.checks.find((one) => one.label === "Signed in");
  if (check?.state === "ok") return "signed-in";
  if (check?.state === "problem") return "signed-out";
  return "unknown";
}

// "Codex" from "Sign in to Codex".
function cliName(fix: SignIn): string {
  return fix.label.replace(/^Sign in to /, "");
}

export async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Copy sign-in command, then Check again. `retry` runs once the CLI answers that it is signed
// in (or cannot say, as Gemini cannot: the step itself then tells); left out, Check again only
// reports what it found.
export function SignInActions({
  fix,
  retry,
  variant = "primary",
  size = "default",
}: {
  readonly fix: SignIn;
  readonly retry?: { readonly run: () => void; readonly busy?: boolean } | undefined;
  readonly variant?: "primary" | "secondary";
  readonly size?: ButtonSize;
}): ReactElement {
  const { api } = useApp();
  const notify = useToast();
  const name = cliName(fix);
  const check = useMutation({
    mutationFn: async () => signInOf(await checkHealth(api, fix.cli), fix),
    onSuccess: (found) => {
      if (found === "signed-out") {
        notify(
          `${name} is still signed out. Run ${fix.command} in a terminal on the computer running Slopify, sign in, then press Check again.`,
          "error",
        );
        return;
      }
      if (retry === undefined) {
        notify(
          found === "signed-in"
            ? `${name} is signed in.`
            : `Slopify couldn't tell whether ${name} is signed in. If ${fix.command} finished without an error, try the step again.`,
          found === "signed-in" ? "success" : "info",
        );
        return;
      }
      notify(`${name} is signed in. Trying again.`, "success");
      retry.run();
    },
    onError: (error: Error) =>
      notify(
        `Slopify couldn't check ${name}'s sign-in: ${error.message} Press Check again in a moment, or use Check all in Settings → Providers.`,
        "error",
      ),
  });
  const copy = async () => {
    const copied = await copyText(fix.command);
    notify(
      copied
        ? `Copied ${fix.command}. Paste it in a terminal on the computer running Slopify and sign in, then press Check again.`
        : `Couldn't copy: the browser blocked the clipboard. Type ${fix.command} in a terminal on the computer running Slopify, sign in, then press Check again.`,
      copied ? "success" : "error",
    );
  };
  return (
    <>
      <Button variant={variant} size={size} onClick={() => void copy()}>
        Copy sign-in command
      </Button>
      <Button
        variant="secondary"
        size={size}
        disabled={check.isPending || retry?.busy === true}
        disabledReason="Checking the sign-in…"
        onClick={() => check.mutate()}
      >
        {check.isPending ? "Checking…" : "Check again"}
      </Button>
    </>
  );
}

// Every fix as buttons. `edit` is the caller's own way to change a refused prompt or a retired
// model; without one, those fixes show nothing here.
export function FixActions({
  fix,
  retry,
  edit,
  variant = "primary",
  size = "default",
}: {
  readonly fix: Fix;
  readonly retry?: { readonly run: () => void; readonly busy?: boolean } | undefined;
  readonly edit?: ReactNode;
  readonly variant?: "primary" | "secondary";
  readonly size?: ButtonSize;
}): ReactNode {
  switch (fix.kind) {
    case "sign-in":
      return <SignInActions fix={fix} retry={retry} variant={variant} size={size} />;
    case "provider-settings":
      return (
        <Button asChild variant={variant} size={size}>
          <Link to="/settings" search={{ section: "providers" }}>
            {fix.label}
          </Link>
        </Button>
      );
    case "free-space":
      return (
        <Button asChild variant={variant} size={size}>
          <Link to="/settings" search={{ section: "storage" }}>
            {fix.label}
          </Link>
        </Button>
      );
    case "refused":
    case "switch-model":
      return edit ?? null;
  }
}
