c
# Project Genesis

**Data first. Visualization second.**

Project Genesis is a modular simulation engine designed to power complex civilization simulations. This repository contains the complete foundational structure, utilizing a clean, scalable architecture independent of the frontend visualization.

## Project Vision

To build a highly decoupled, data-driven simulation engine where backend systems compute the state of the world, and any number of frontends can connect to visualize that state. This phase focuses entirely on establishing the robust monorepo architecture and foundational packages.

## Architecture

This project follows **Clean Architecture** principles:
- **Presentation:** Frontend React Application.
- **Application:** Use cases and orchestration (Backend Services).
- **Domain:** Core business rules (Shared Types/Models).
- **Infrastructure:** Databases, APIs, and External Services (Backend Repositories).

The simulation engine is completely independent from the frontend.

## Folder Structure

```
genesis/
├── frontend/     # React, Vite, Tailwind CSS application
├── backend/      # Node.js, Fastify, Prisma backend API
├── shared/       # Shared TypeScript types, interfaces, constants
├── docs/         # Additional project documentation
├── scripts/      # Automation and CI/CD scripts
└── .github/      # GitHub actions and workflows
```

## Tech Stack

### Frontend
- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui
- **State/Routing:** Zustand, React Router, TanStack Query

### Backend
- **Framework:** Node.js + Fastify + TypeScript
- **Database:** Prisma ORM + SQLite
- **Validation:** Zod
- **Config:** dotenv

### Shared
- **Tooling:** ESLint, Prettier, Husky, lint-staged

## Installation

1. Install dependencies from the root to bootstrap all workspaces:
   ```bash
   npm install
   ```
2. Generate the Prisma Client:
   ```bash
   cd backend
   npx prisma generate
   ```

## Running the Project

### Running Backend
```bash
npm run dev:backend
```
*Runs the Fastify server with hot-reload.*

### Running Frontend
```bash
npm run dev:frontend
```
*Runs the Vite development server.*

### Running Both
```bash
npm run dev
```

## Future Roadmap
- Implementation of the Core Simulation Loop.
- Agent / Citizen logic and behaviors.
- Real-time world state broadcasting via WebSockets.
- Economy and Event subsystems.
