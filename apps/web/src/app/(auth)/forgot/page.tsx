import { noindexMetadata } from "@/lib/seo";
import { ForgotView } from "@/components/features/auth/forgot-view";

export const metadata = noindexMetadata("Reset your password", "Enter your email and we will send a link to choose a new password.", "/forgot");

export default function ForgotPage() {
  return <ForgotView />;
}
