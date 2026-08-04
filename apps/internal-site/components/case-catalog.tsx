"use client";

import { useMemo, useState } from "react";
import { FilterListOutlined, RestartAlt, Search, Sort } from "@mui/icons-material";
import {
  Box,
  Button,
  FormControl,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { CaseStatus } from "@magic-compare/content-schema";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { CaseDirectoryGrid } from "./case-directory-grid";
import { FluentFolderEmoji } from "./fluent-emoji";

type StatusFilter = "all" | CaseStatus;
type SortOrder = "updated-desc" | "updated-asc" | "title";

const controlSx = {
  // Status and sort previously repeated their labels in the outline notch. The filled M3 surface
  // keeps the icon and selected value readable without spending a second line on control chrome.
  "& .MuiFilledInput-root": {
    minHeight: 52,
    borderRadius: "26px",
    overflow: "hidden",
    backgroundColor: "var(--mui-palette-surface-containerHigh)",
    "&:hover": { backgroundColor: "var(--mui-palette-surface-containerHighest)" },
    "&.Mui-focused": { backgroundColor: "var(--mui-palette-surface-containerHighest)" },
    "&::before, &::after": { display: "none" },
  },
  "& .MuiFilledInput-input": { py: 1.5 },
} as const;

/** Filters the server snapshot locally so catalog controls respond without route-level loading. */
export function CaseCatalog({ items }: { items: CaseCatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("updated-desc");
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...items]
      .filter((item) => status === "all" || item.status === status)
      .filter(
        (item) =>
          !normalizedQuery ||
          item.title.toLocaleLowerCase().includes(normalizedQuery) ||
          item.slug.toLocaleLowerCase().includes(normalizedQuery) ||
          item.tags.some((tag) => tag.toLocaleLowerCase().includes(normalizedQuery)),
      )
      .sort((left, right) => {
        if (sortOrder === "title") return left.title.localeCompare(right.title);
        const delta = Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
        return sortOrder === "updated-asc" ? delta : -delta;
      });
  }, [items, query, sortOrder, status]);

  if (items.length === 0) return <CaseDirectoryGrid items={items} />;

  return (
    <Stack spacing={2.5} sx={{ pt: 2.5 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            sm: "minmax(240px, 1fr) 152px 168px",
          },
          gap: 1,
          alignItems: "center",
        }}
      >
        <TextField
          hiddenLabel
          variant="filled"
          placeholder="搜索标题、Slug 或标签"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ ...controlSx, gridColumn: { xs: "1 / -1", sm: "auto" } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            },
            htmlInput: { "aria-label": "搜索 Case" },
          }}
        />
        <Tooltip title="筛选状态">
          <FormControl hiddenLabel variant="filled" sx={controlSx}>
            <Select
              value={status}
              disableUnderline
              startAdornment={<FilterListOutlined sx={{ mr: 1, fontSize: 20 }} />}
              inputProps={{ "aria-label": "筛选 Case 状态" }}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
            >
              <MenuItem value="all">全部状态</MenuItem>
              <MenuItem value="draft">草稿</MenuItem>
              <MenuItem value="internal">内部</MenuItem>
              <MenuItem value="published">已发布</MenuItem>
              <MenuItem value="archived">已归档</MenuItem>
            </Select>
          </FormControl>
        </Tooltip>
        <Tooltip title="调整排序">
          <FormControl hiddenLabel variant="filled" sx={controlSx}>
            <Select
              value={sortOrder}
              disableUnderline
              startAdornment={<Sort sx={{ mr: 1, fontSize: 20 }} />}
              inputProps={{ "aria-label": "Case 排序" }}
              onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            >
              <MenuItem value="updated-desc">最近更新</MenuItem>
              <MenuItem value="updated-asc">最早更新</MenuItem>
              <MenuItem value="title">标题</MenuItem>
            </Select>
          </FormControl>
        </Tooltip>
      </Box>

      {visibleItems.length > 0 ? (
        <CaseDirectoryGrid items={visibleItems} />
      ) : (
        <Stack sx={{ alignItems: "center", py: 8, textAlign: "center" }} spacing={1.25}>
          <FluentFolderEmoji size={56} />
          <Typography variant="h4">没有匹配的 Case</Typography>
          <Typography variant="body2" color="text.secondary">
            调整搜索词或筛选条件。
          </Typography>
          <Button
            variant="text"
            startIcon={<RestartAlt />}
            onClick={() => {
              // Reset all discovery controls together so a zero-result state always has an immediate
              // recovery path instead of asking the operator to reverse each choice manually.
              setQuery("");
              setStatus("all");
              setSortOrder("updated-desc");
            }}
          >
            清除筛选
          </Button>
        </Stack>
      )}

      <Box
        component="footer"
        sx={{ display: "flex", justifyContent: "flex-end", minHeight: 20, pt: 0.5 }}
      >
        <Typography variant="caption" color="text.secondary">
          {visibleItems.length === items.length
            ? `${items.length} Case`
            : `${visibleItems.length} / ${items.length} Case`}
        </Typography>
      </Box>
    </Stack>
  );
}
