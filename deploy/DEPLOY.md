# Guía de despliegue en producción — Mundo Pets

Pasos para sacar el proyecto de localhost con **HTTPS (Let's Encrypt) + Nginx + PM2**. Ajusta los nombres de dominio y rutas a tu servidor (Ubuntu/Debian recomendado).

## 1. DNS

Crea un registro **A** para tu dominio (y `www`) apuntando a la IP pública del servidor. Espera a que propague.

## 2. Instalar dependencias

```bash
sudo apt update
sudo apt install -y nginx nodejs npm mysql-server certbot python3-certbot-nginx
sudo npm install -g pm2
```

## 3. Base de datos

```bash
sudo mysql -u root -p
CREATE DATABASE mundo_pets CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mundo_pets_app'@'localhost' IDENTIFIED BY 'CONTRASEÑA_FUERTE';
GRANT ALL PRIVILEGES ON mundo_pets.* TO 'mundo_pets_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 4. Aplicación y entorno

```bash
git clone https://github.com/MayorGg/mundo-pets.git /opt/mundo-pets
cd /opt/mundo-pets
npm --prefix backend install
node backend/seed.js
cp backend/.env.production backend/.env.production
# edita backend/.env.production con credenciales reales:
#   DB_USER=mundo_pets_app, DB_PASSWORD=..., JWT_SECRET=..., CORS_ORIGIN=https://tudominio.com
```

> Genera un secreto fuerte: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

## 5. Arrancar con PM2 (auto-reinicio y logs)

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # copia el comando que imprime y ejecútalo para que arranque al bootear
pm2 status
```

- Logs: `pm2 logs mundo-pets` o `logs/pm2-out.log` / `logs/pm2-error.log`.
- Si apagas el servidor a la mala, PM2 reinicia la app automáticamente.

## 6. Nginx

```bash
sudo cp deploy/nginx-mundo-pets.conf /etc/nginx/sites-available/mundo-pets
# edita el archivo reemplazando TU_DOMINIO
sudo ln -s /etc/nginx/sites-available/mundo-pets /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 7. HTTPS con Let's Encrypt

```bash
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
sudo certbot renew --dry-run   # verifica la renovación automática
```

Certbot edita la config de Nginx, instala el certificado y programa la renovación automática (cron de certbot).

## 8. Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 9. Backups automáticos (MySQL)

```bash
# Linux: agrega al crontab (diario 03:00)
crontab -e
0 3 * * * powershell -NoProfile -ExecutionPolicy Bypass -File /opt/mundo-pets/scripts/backup-db.ps1
```

> En Windows el script equivalente se registra como tarea programada:
> `schtasks /Create /F /TN "MundoPetsBackup" /TR "powershell -File <ruta>\scripts\backup-db.ps1" /SC DAILY /ST 03:00`

Los dumps quedan en `backups/` (gitignoreado) conservando los últimos 14.

## Verificación final

```bash
curl -I https://tudominio.com                # 200 + headers de seguridad
pm2 status                                   # online
ls backups/                                  # hay un dump reciente
```