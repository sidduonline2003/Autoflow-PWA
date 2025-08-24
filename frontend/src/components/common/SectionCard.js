// frontend/src/components/common/SectionCard.js
import { Card, CardHeader, CardContent } from "@mui/material";

export default function SectionCard({ title, subheader, action, children, sx }) {
  return (
    <Card sx={{ p: 1, ...sx }}>
      <CardHeader
        title={title}
        subheader={subheader}
        action={action}
        sx={{ pb: 0, "& .MuiCardHeader-action": { alignSelf: "center" } }}
      />
      <CardContent sx={{ pt: 1 }}>{children}</CardContent>
    </Card>
  );
}
