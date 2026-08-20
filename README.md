# Electricity Metering

Коммерческая система учёта энергоресурсов (электроэнергия, вода, тепло, газ).

## Стек
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: Vue 3 + TypeScript + Vite + Pinia
- Инфраструктура: Docker + docker-compose

## Запуск (Windows)

1. Запусти **Docker Desktop**.
2. Дважды кликни `dev.bat` — поднимет Postgres, backend (`:4000`) и frontend (`:5173`) в отдельных окнах.
3. Остановка процессов Node: `stop.bat`.

Либо вручную из корня:

```bash
docker compose up -d postgres
npm run dev:backend
npm run dev:frontend
```