export type RankedStore = {
  id: string;
  store_name: string | null;
  slug: string | null;
  description: string | null;
  category: string | null;
  total_sales: number | null;
  total_revenue: number | null;
  followers: number | null;
  featured: boolean | null;
  created_at?: string | null;
};

export function rankStores<T extends RankedStore>(stores: T[]): Array<T & { score: number }> {
  return stores
    .map((s) => {
      const totalSales = Number(s.total_sales ?? 0);
      const totalRevenue = Number(s.total_revenue ?? 0);
      const followers = Number(s.followers ?? 0);
      const featured = !!s.featured;

      const score =
        (totalSales * 5) +
        (totalRevenue * 0.1) +
        (followers * 2) +
        (featured ? 50 : 0);

      return { ...s, score };
    })
    .sort((a, b) => b.score - a.score);
}
