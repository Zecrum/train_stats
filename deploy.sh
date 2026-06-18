#!/bin/bash
cd /www/wwwroot/sites/train-stats.zecrum.fr
git pull origin main
cd collector && npm install
cd ../api && npm install
cd ../front && npm install && npm run build

# THEN => restart manually the API and the collector to apply the change
