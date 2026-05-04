import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/admin/", "/r/", "/auth/", "/verify/", "/reset-password/"],
      },
    ],
    sitemap: "https://1nelink.com/sitemap.xml",
  };
}
