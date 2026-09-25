# back-markitdown-service

Servicio web para convertir **PDF, Word (.docx), PowerPoint (.pptx) y Excel (.xlsx / .xls)** a Markdown usando [microsoft/markitdown](https://github.com/microsoft/markitdown).
Se levanta con Docker Compose en una Raspberry Pi y se publica con un túnel de Cloudflare en **https://md.antonioalonso.com.mx**.

## Arquitectura

```
Navegador ──HTTPS──▶ Cloudflare ──túnel──▶ cloudflared ──▶ front (nginx + React) ──/api──▶ back (FastAPI + markitdown)
```

| Servicio      | Carpeta  | Descripción |
|---------------|----------|-------------|
| `back`        | `back/`  | API en FastAPI que usa la librería `markitdown`. Solo es accesible dentro de la red de Docker. |
| `front`       | `front/` | React (Vite) compilado y servido por nginx. nginx redirige `/api/*` al back. |
| `cloudflared` | —        | Conector del túnel de Cloudflare; usa el token del archivo `.env`. |

### API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/convert` | `multipart/form-data` con el campo `file`. Responde `{ filename, source, size_bytes, markdown }`. Con `?download=true` regresa el `.md` como archivo. |
| `GET`  | `/api/formats` | Extensiones permitidas y tamaño máximo. |
| `GET`  | `/api/health`  | Estado del servicio. |
| `GET`  | `/api/docs`    | Swagger UI. |

Ejemplo con curl:

```bash
curl -F "file=@documento.pdf" "https://md.antonioalonso.com.mx/api/convert?download=true" -o documento.md
```

## Despliegue en la Raspberry Pi

Requisitos: Raspberry Pi OS **de 64 bits**, Docker y el plugin Docker Compose (igual que para Immich).

### 1. Configurar el túnel en Cloudflare

En [Cloudflare Zero Trust](https://one.dash.cloudflare.com) > **Networks > Tunnels**:

1. **Create a tunnel** > tipo *Cloudflared* > nombre, por ejemplo `markitdown`.
2. En *Install and run a connector*, copia el **token**: es la cadena larga que aparece después de `--token` en el comando de Docker.
3. En **Public Hostname** agrega:
   - Subdomain: `md` · Domain: `antonioalonso.com.mx`
   - Service: `HTTP` · URL: `front:80`

> ⚠️ **No reutilices el token del túnel de Immich en este compose.** Si dos conectores usan el mismo token, Cloudflare reparte las peticiones entre ellos, y este contenedor no puede alcanzar a Immich (ni el de Immich a este front), así que ambos servicios fallarían de forma intermitente. Usa un túnel nuevo o la alternativa de abajo.

### 2. Levantar los servicios

```bash
git clone <url-de-este-repo> markitdown && cd markitdown
cp .env.example .env
nano .env        # pega el token en CLOUDFLARE_TUNNEL_TOKEN
docker compose up -d --build
```

La primera compilación en la Raspberry tarda varios minutos. Para verificar:

```bash
docker compose ps                      # los 3 servicios deben estar "healthy"/"running"
docker compose logs -f cloudflared     # debe mostrar "Registered tunnel connection"
```

- Red local: `http://<IP-raspberry>:8080`
- Internet: `https://md.antonioalonso.com.mx`

### Alternativa: reutilizar el túnel existente de Immich

Si prefieres no crear otro túnel:

1. En el túnel de Immich, agrega el Public Hostname `md.antonioalonso.com.mx` > `HTTP` > `<IP-raspberry>:8080`.
2. Levanta solo el back y el front (sin el `cloudflared` de este repo):

   ```bash
   docker compose up -d --build back front
   ```

### Actualizar

```bash
git pull
docker compose up -d --build
```

Para actualizar markitdown, cambia la versión en `back/requirements.txt` y vuelve a compilar.

## Desarrollo local

```bash
# Back
cd back
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Front (en otra terminal; /api se redirige a localhost:8000)
cd front
npm install
npm run dev
```

## Notas

- Límite de tamaño: `MAX_UPLOAD_MB` (25 MB por defecto). Cloudflare en el plan gratuito limita las subidas a 100 MB y corta las peticiones que tardan más de ~100 s.
- markitdown **no hace OCR**: un PDF escaneado (solo imágenes) no produce texto.
- El sitio queda **público**. Si más adelante quieres restringir el acceso, activa Cloudflare Access para `md.antonioalonso.com.mx`; no hace falta cambiar el código.
