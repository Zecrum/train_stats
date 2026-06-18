#!/bin/bash
cd /www/wwwroot/sites/train-stats.zecrum.fr
git pull origin main
cd api && npm install
cd ../front && npm install && npm run build

# THEN => restart manually the server to apply the change
