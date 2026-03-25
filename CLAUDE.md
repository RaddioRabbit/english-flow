# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **English Flow Agent** - a React application for analyzing English sentences and generating educational content. It parses sentences and creates structured learning materials including translations, grammar analysis, vocabulary cards, and IELTS tips, then generates styled images (条漫/comic strips) for each module.

## Tech Stack

- **Framework**: React 18 + Vite 5 + TypeScript
- **UI Library**: shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS with custom gold/ink theme
- **State Management**: React Query (TanStack Query) for server state, localStorage for persistence
- **Routing**: React Router DOM
- **Testing**: Vitest + React Testing Library + Playwright
- **Build Tool**: Vite with SWC plugin for fast compilation

## Development Commands

```bash
# Install dependencies
npm i

# Start development server (runs on port 8080)
npm run dev

# Build for production
npm run build

# Build in development mode
npm run build:dev

# Preview production build
npm run preview

# Lint with ESLint
npm run lint

# Run tests once
npm run test

# Run tests in watch mode
npm run test:watch
```

## Architecture

### Directory Structure

- `src/pages/` - Route-level page components (CreateTask, EditTask, TaskExecution, TaskResults, HistoryPage, AboutPage)
- `src/components/ui/` - shadcn/ui component library (50+ reusable components)
- `src/lib/` - Core utilities and business logic
- `server/` - Vite dev server plugins for API routes
- `public/` - Static assets and PRD documentation

### Key Architectural Patterns

**Task-Based Data Model**: The app centers around "Tasks" - each task represents processing a single English sentence through multiple modules. Tasks are stored in localStorage with the key `english-flow.tasks.v2`.

**Module System**: Five fixed modules process each sentence:
1. `translation` - 句译对照图 (6-panel comic with sentence translation)
2. `grammar` - 句式分析图 (4-panel grammar analysis)
3. `summary` - 句式总结图 (2-panel structure summary)
4. `vocabulary` - 词汇解析图 (6-panel vocabulary cards)
5. `ielts` - 雅思备考图 (4-panel IELTS tips)

**Client-Side State**: Task state is managed through `src/lib/task-store.ts` which provides:
- Custom React hooks (`useTasks`, `useTask`) for accessing task data
- Functions for CRUD operations (create, update, delete tasks)
- Task lifecycle management (parsing → editing → generating → completed)
- Image generation state tracking with progress indicators

**Vite Plugin API**: The `server/text-analysis-plugin.ts` creates a custom Vite middleware that handles `/api/text-analysis` POST requests. This connects to Claude Agent SDK for AI-powered text analysis when API keys are available.

**Image Generation Flow**:
1. Reference images can be uploaded per module (stored as data URLs in localStorage)
2. Generated images are SVG-based templates rendered to data URLs
3. The `task-store.ts` contains the SVG generation logic with hardcoded layouts

### Route Structure

- `/` - Create new task (sentence input)
- `/edit/:taskId` - Edit parsed text content before generation
- `/task/:taskId` - Task execution/progress page
- `/result/:taskId` - View generated results
- `/history` - Task history list
- `/about` - About page
- `/sentence-explanation/:taskId` - View generated sentence explanation article with TTS audio

### Important Implementation Details

**TypeScript Configuration**: The project uses project references (`tsconfig.json` references `tsconfig.app.json` and `tsconfig.node.json`). Strict null checks are disabled.

**Path Aliases**: `@/` maps to `./src/` - use this for all imports.

**Theme**: Custom Tailwind colors include `gold`, `ink`, `success`, `warning`, `info` with CSS variables for theming.

**Text Analysis Contract**: `src/lib/text-analysis-contract.ts` defines the schema for AI-generated content including translations, grammar analysis, vocabulary cards, and IELTS tips.

**Environment Variables**: The text analysis plugin reads `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `CLAUDE_AGENT_SDK_ENABLED`, `CLAUDE_AGENT_SDK_TIMEOUT_MS`, `ANTHROPIC_HTTP_TIMEOUT_MS`, and `ANTHROPIC_HTTP_MAX_RETRIES` from environment variables.

**Lovable Integration**: This project was scaffolded with Lovable (lovable.dev). The `lovable-tagger` plugin is active in development mode for component tagging.

**Contract-First Pattern**: New features define `*-contract.ts` files with TypeScript interfaces before implementation. See `src/lib/sentence-explanation-contract.ts` for the canonical example.

**Client/Service Pairs**: Features use `*-client.ts` (frontend fetch wrappers) and `*-service.ts` (backend logic). Plugins in `server/*-plugin.ts` register API routes via Vite config.

**Skill Shim Pattern**: AI features use `server/*-skill-shim.ts` wrappers that delegate to Claude Code skills. See `server/aifast-image-skill-shim.ts` and `server/sentence-explanation-tts-skill-shim.ts`.

**Testing Pattern**: Tests live in `src/test/`, import from `@/` aliases, and use vitest's `describe/it/expect`. Run with `npm run test` (once) or `npm run test:watch`.

**ASCII-Safe Filenames**: Use `buildGeneratedImageFileName()` from `src/lib/image-file-name.ts` when generating files from user content with non-Latin characters.

**Image Storage**: Images store as data URLs by default. When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, images upload to Supabase Storage via `src/lib/supabase-image-store.ts`.

**Runtime Store Pattern**: For ephemeral in-session state (not persisted), use `*-runtime-store.ts`. See `src/lib/sentence-explanation-runtime-store.ts`.

**Task Snapshots**: `src/lib/supabase-task-snapshots.ts` persists task state snapshots to Supabase when Supabase env vars are set (mirrors image storage pattern).

**Video Export**: `src/lib/sentence-explanation-video-export.ts` handles MP4 export from the video page. Uses the `sentence-explanation-video` skill via a server plugin.
