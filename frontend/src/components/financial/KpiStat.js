// frontend/src/components/financial/KpiStat.js
import { Box, Stack, Typography, Chip, Skeleton } from "@mui/material";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export default function KpiStat({ title, value, deltaPct, trend = [], tone = "primary", loading = false }) {
  if (loading) {
    return <Skeleton variant="rounded" height={120} />;
  }
  const deltaTone = deltaPct == null ? "default" : deltaPct >= 0 ? "success" : "error";
  const deltaLabel = deltaPct == null ? "—" : `${deltaPct > 0 ? "+" : ""}${deltaPct}%`;

  return (
    <Box sx={{ p: 2, bgcolor: "background.paper", borderRadius: 2, boxShadow: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Stack spacing={0.5}>
          <Typography variant="subtitle2">{title}</Typography>
          <Typography variant="h5">{fmt(value)}</Typography>
        </Stack>
        <Chip size="small" color={deltaTone} label={deltaLabel} />
      </Stack>

      <Box sx={{ height: 64, mt: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend}>
            <defs>
              <linearGradient id={`g-${tone}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="y"
              stroke="currentColor"
              fill={`url(#g-${tone})`}
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
