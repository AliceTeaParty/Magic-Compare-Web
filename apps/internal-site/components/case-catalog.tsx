"use client";

import { useMemo, useState } from "react";
import { FilterListOutlined, RestartAlt, Search, Sort } from "@mui/icons-material";
import {
  Box,
  Button,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { CaseStatus } from "@magic-compare/content-schema";
import type { CaseCatalogItem } from "@/lib/server/repositories/content-repository";
import { CaseDirectoryGrid } from "./case-directory-grid";
import { FluentFolderEmoji } from "./fluent-emoji";

type StatusFilter = "all" | CaseStatus;
type SortOrder = "updated-desc" | "updated-asc" | "title";

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
          gridTemplateColumns: { xs: "1fr", sm: "minmax(240px, 1fr) 152px 168px" },
          gap: 1,
          alignItems: "center",
          p: 1.25,
          borderRadius: 2,
          backgroundColor: "var(--mui-palette-surface-containerLow)",
        }}
      >
        <TextField
          size="small"
          placeholder="搜索标题、Slug 或标签"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <FormControl size="small">
          <InputLabel id="case-status-filter-label">状态</InputLabel>
          <Select
            labelId="case-status-filter-label"
            value={status}
            label="状态"
            startAdornment={<FilterListOutlined sx={{ mr: 1, fontSize: 18 }} />}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <MenuItem value="all">全部状态</MenuItem>
            <MenuItem value="draft">草稿</MenuItem>
            <MenuItem value="internal">内部</MenuItem>
            <MenuItem value="published">已发布</MenuItem>
            <MenuItem value="archived">已归档</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel id="case-sort-label">排序</InputLabel>
          <Select
            labelId="case-sort-label"
            value={sortOrder}
            label="排序"
            startAdornment={<Sort sx={{ mr: 1, fontSize: 18 }} />}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
          >
            <MenuItem value="updated-desc">最近更新</MenuItem>
            <MenuItem value="updated-asc">最早更新</MenuItem>
            <MenuItem value="title">标题</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Typography variant="body2" color="text.secondary">
        {visibleItems.length} 个 Case
      </Typography>

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
    </Stack>
  );
}
