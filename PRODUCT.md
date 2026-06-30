# PRODUCT.md

This document captures the product intent behind Magic Compare Web so implementation choices stay aligned with the inspection workflow.
It complements engineering workflow docs and should guide UI, copy, loading, and interaction trade-offs.

## Register

product

## Users

Magic Compare serves internal operators and reviewers who inspect before/after image groups, publish selected comparisons, and validate imported visual assets under time pressure.

## Product Purpose

The product makes large visual comparison sets browsable, inspectable, and publishable without mixing internal asset operations with the static public viewer. Success means users can move through frames and groups quickly while trusting that the visible image state reflects the selected comparison target.

Near-term product development prioritizes filling Web capabilities in the internal workspace and viewer. The legacy Python uploader remains available for existing import flows, but new upload and metadata-management work should default toward the cross-platform Web surface.

## Brand Personality

Precise, restrained, work-focused. The interface should feel like a dependable inspection bench rather than a marketing surface.

## Anti-references

Avoid decorative dashboards, oversized hero language, gratuitous animation, stock-like empty states, and loading states that hide whether the selected target has actually changed.

## Design Principles

- Keep image inspection primary; chrome supports the task and should stay quiet.
- Prefer immediate, truthful feedback over blank waiting states.
- Preserve internal-site, public-site, and legacy uploader boundaries.
- Optimize perceived speed without replacing original assets as the inspection source of truth.
- Use familiar product UI patterns before inventing custom affordances.
- Make inline metadata edits feel stable and document-like: no layout jump, no full-page flash, no hidden save ambiguity.

## Accessibility & Inclusion

Target practical WCAG AA contrast, keyboard-accessible navigation, reduced-motion fallbacks for loading and transitions, and non-color-only states for failures or loading progress.
