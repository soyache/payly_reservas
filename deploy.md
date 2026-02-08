# deploy y reinicio

cd ~/payly_reservas
git pull --ff-only origin main
npm ci
npm run build
pm2 restart payly-reservas --update-env

# ver en tiempo real los logs

pm2 logs payly-reservas --lines 100

# solo ver errores 
pm2 logs payly-reservas --lines 100


