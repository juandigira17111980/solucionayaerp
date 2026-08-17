# Laboratorio VPS

El despliegue del ERP usa Docker Compose, la red externa `coolify` y el proxy Traefik existente en el VPS.

El archivo `.env` se crea solo en el servidor a partir de `.env.example`, con permisos `600`; nunca se versiona ni se copia al contexto de Docker.

Desde la raiz del repositorio en el VPS:

```bash
docker compose --env-file .env -f deploy/lab/compose.vps.yml up -d --build
docker compose --env-file .env -f deploy/lab/compose.vps.yml ps
curl -fsS http://127.0.0.1:3000/healthz
```

La URL de laboratorio es `https://solucionayaerp.lab.nexostack.app`.
