# deploy y reinicio

cd ~/payly_reservas
git pull --ff-only origin main
npm ci
npm run build
pm2 restart payly-reservas --update-env

# cambios en prisma
cd ~/payly_reservas
git pull --ff-only origin main
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart payly-reservas --update-env
npx prisma migrate status


# ver en tiempo real los logs

pm2 logs payly-reservas --lines 100

# solo ver errores 
pm2 logs payly-reservas --lines 100

# cambiar el token 
curl -i "https://graph.facebook.com/v21.0/me?access_token=EAAhzjZB21MYQBQsiz"


    