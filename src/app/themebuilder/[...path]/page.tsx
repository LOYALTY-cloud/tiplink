import { redirect } from "next/navigation";

export default async function ThemeBuilderLegacyCatchAllRedirectPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const suffix = Array.isArray(path) && path.length > 0 ? `/${path.join("/")}` : "";
  redirect(`/dashboard/themebuilder${suffix}`);
}
