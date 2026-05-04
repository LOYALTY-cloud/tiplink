import { redirect } from "next/navigation";

export default async function ThemeBuilderEditRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/themebuilder/create?edit=${encodeURIComponent(id)}`);
}
