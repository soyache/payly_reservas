cd ~/payly_reservas
git pull --ff-only origin main
npm ci
npm run build
pm2 restart payly-reservas --update-env
