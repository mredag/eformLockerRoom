# eForm Locker Panel Frontend

Modern React frontend for the eForm Locker management panel.

## Tech Stack

- **React 18+** - UI library
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Component library
- **ESLint** - Code linting
- **Prettier** - Code formatting

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Format code
npm run format

# Type checking
npm run type-check
```

## Build Output

The build outputs to `../public/` directory which is served by the Fastify backend.

## Project Structure

```
src/
├── components/
│   └── ui/           # shadcn/ui components
├── lib/
│   └── utils.ts      # Utility functions
├── App.tsx           # Main app component
├── main.tsx          # Entry point
└── index.css         # Global styles with Tailwind
```

## Features

- ✅ React + Vite + TypeScript setup
- ✅ Tailwind CSS with custom theme
- ✅ shadcn/ui component library
- ✅ ESLint + Prettier configuration
- ✅ TypeScript strict mode
- ✅ Path mapping (@/* aliases)
- ✅ Build output to app/panel/public/
- ✅ Responsive design
- ✅ Dark mode support (via CSS variables)

## Next Steps

This setup provides the foundation for:
- React Router for navigation
- API client integration
- WebSocket real-time updates
- Internationalization (i18n)
- Authentication context
- Theme provider