import { Paper, Stack, Typography } from "@mui/material";

export function CaseDirectoryEmptyState() {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3.25, md: 4.25 },
        borderRadius: 3.5,
        border: "1px dashed",
        borderColor: "divider",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
      }}
    >
      <Stack spacing={1.5}>
        <Typography variant="h5">No cases yet</Typography>
        <Typography color="text.secondary">
          Initialize the SQLite schema, then import a local case with the Python
          uploader.
        </Typography>
        <Typography
          component="pre"
          sx={{ fontSize: 13, color: "text.secondary", m: 0 }}
        >
          pnpm db:push
          {"\n"}pnpm db:seed
        </Typography>
      </Stack>
    </Paper>
  );
}
