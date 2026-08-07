"use client";

import {
  ArrowOutwardRounded,
  CollectionsOutlined,
  PublicOutlined,
  ScheduleOutlined,
  TagRounded,
} from "@mui/icons-material";
import { Box, Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";

const statusLabels = {
  draft: "草稿",
  internal: "内部",
  published: "已发布",
  archived: "已归档",
} as const;

function formatCatalogDate(value: string): string {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function MetadataItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, minWidth: 0 }}>
      {icon}
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
        {label}
      </Typography>
    </Stack>
  );
}

/** Keeps the technical Case identifier distinct from the title without turning it into an action. */
function SlugLabel({ value }: { value: string }) {
  return (
    <Stack
      direction="row"
      title={value}
      sx={{
        alignItems: "center",
        gap: 0.5,
        width: "fit-content",
        maxWidth: "100%",
        mt: 0.375,
        color: "text.secondary",
        // Slug text owns the same left edge as the title. The trailing icon identifies the field
        // without introducing the visual indentation caused by a leading icon and padded backing.
      }}
    >
      <Typography
        variant="caption"
        noWrap
        sx={{ minWidth: 0, fontSize: "0.6875rem", fontWeight: 550, lineHeight: 1.35 }}
      >
        {value}
      </Typography>
      <TagRounded sx={{ flexShrink: 0, fontSize: 13, color: "primary.main", opacity: 0.82 }} />
    </Stack>
  );
}

/** Presents one Case as an M3 outlined card with a duotone identity field and metadata footer. */
export function CaseDirectoryCard({ item }: { item: CaseCatalogItem }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(item.coverThumbUrl) && !coverFailed;

  return (
    <Card
      variant="outlined"
      sx={{
        display: "flex",
        minWidth: 0,
        height: "100%",
        borderRadius: 2,
        // The outline and higher tonal container keep the card distinct without hover elevation.
        borderColor: "divider",
        backgroundColor: "var(--mui-palette-surface-containerHigh)",
        boxShadow: "none",
        overflow: "hidden",
      }}
    >
      <CardActionArea
        component={Link}
        href={`/cases/${item.slug}`}
        sx={{
          display: "grid",
          position: "relative",
          gridTemplateRows: "1fr auto",
          alignItems: "stretch",
          // ButtonBase defaults to centered content. Stretch both grid rows explicitly so the
          // identity field and metadata footer use the full card width at every breakpoint.
          justifyContent: "stretch",
          justifyItems: "stretch",
          minWidth: 0,
          width: "100%",
          minHeight: 232,
          height: "100%",
          color: "text.primary",
          textAlign: "left",
          textDecoration: "none",
          // M3 interaction uses a paint-only state layer, so repeated cards never shift on hover.
          "&::after": {
            content: '""',
            position: "absolute",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
            backgroundColor: "primary.main",
            opacity: 0,
            transition: "opacity 150ms cubic-bezier(0.2, 0, 0, 1)",
          },
          "&:hover::after": { opacity: 0.04 },
          "&:active::after": { opacity: 0.1 },
          "&.Mui-focusVisible": {
            outline: "3px solid var(--mui-palette-primary-main)",
            outlineOffset: -3,
          },
          "& .MuiCardActionArea-focusHighlight": { opacity: 0 },
        }}
      >
        <Box
          className="case-card-content"
          sx={{
            position: "relative",
            isolation: "isolate",
            minWidth: 0,
            width: "100%",
            minHeight: 168,
            overflow: "hidden",
            p: { xs: 2.25, md: 2.5 },
            backgroundColor: "var(--mui-palette-surface-containerHigh)",
          }}
        >
          {showCover && (
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                insetBlock: 0,
                right: 0,
                zIndex: 0,
                width: { xs: "72%", sm: "64%" },
                overflow: "hidden",
                backgroundColor: "primary.main",
                // The cover belongs to the right side of the identity field. A mask reveals it
                // gradually from left to right without placing a visible image panel behind text.
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.28) 30%, #000 64%)",
                maskImage:
                  "linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.28) 30%, #000 64%)",
              }}
            >
              <Box
                component="img"
                src={item.coverThumbUrl ?? undefined}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => {
                  // Broken storage references fall back to the same neutral surface as coverless
                  // Cases instead of leaving a damaged image behind the card text.
                  setCoverFailed(true);
                }}
                sx={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: "grayscale(1) contrast(1.18)",
                  mixBlendMode: "luminosity",
                  opacity: 0.62,
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "primary.main",
                  mixBlendMode: "multiply",
                  opacity: 0.42,
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "secondary.main",
                  mixBlendMode: "screen",
                  opacity: 0.2,
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "var(--mui-palette-surface-containerHigh)",
                  opacity: 0.54,
                }}
              />
            </Box>
          )}

          <Stack
            spacing={1.5}
            sx={{
              position: "relative",
              zIndex: 1,
              minWidth: 0,
              width: showCover ? { xs: "calc(100% - 72px)", sm: "62%" } : "calc(100% - 72px)",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h3" noWrap title={item.title}>
                {item.title}
              </Typography>
              <SlugLabel value={item.slug} />
            </Box>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
              }}
            >
              {item.summary || "暂无描述。"}
            </Typography>
          </Stack>
          <Chip
            label={statusLabels[item.status]}
            size="small"
            color={item.status === "published" ? "primary" : "default"}
            sx={{
              position: "absolute",
              top: { xs: 18, md: 20 },
              right: { xs: 18, md: 20 },
              zIndex: 1,
              height: 28,
              borderRadius: 1.25,
            }}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            gap: 1.5,
            width: "100%",
            minHeight: 62,
            px: { xs: 2.25, md: 2.5 },
            py: 1.5,
            borderTop: 1,
            borderColor: "divider",
            backgroundColor: "var(--mui-palette-surface-containerHighest)",
          }}
        >
          <Stack
            direction="row"
            sx={{
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 2,
              rowGap: 0.75,
            }}
          >
            <MetadataItem
              icon={<CollectionsOutlined sx={{ fontSize: 18, color: "text.secondary" }} />}
              label={`${item.groupCount} Group`}
            />
            <MetadataItem
              icon={<PublicOutlined sx={{ fontSize: 18, color: "text.secondary" }} />}
              // Keep the Case catalog metadata in the same English product terminology as Group.
              label={`${item.publicGroupCount} Public`}
            />
            <MetadataItem
              icon={<ScheduleOutlined sx={{ fontSize: 18, color: "text.secondary" }} />}
              label={formatCatalogDate(item.updatedAt)}
            />
          </Stack>
          <ArrowOutwardRounded
            aria-hidden
            sx={{
              fontSize: 21,
              color: "primary.main",
              opacity: 0.82,
            }}
          />
        </Box>
      </CardActionArea>
    </Card>
  );
}
