-- Schéma attendu par l'API (lecture seule).
-- Le collecteur résout `materiel` et `couplage` à partir de composition[0].commercialName
-- AU MOMENT DE LA COLLECTE, pour que l'API ne fasse que des agrégats indexés.

CREATE TABLE IF NOT EXISTS circulations (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  date_circulation DATE            NOT NULL,
  heure            TINYINT         NOT NULL,                 -- 0..23
  branche          ENUM('Chelles','Tournan','Villiers','Central') NOT NULL,
  mission          CHAR(4)         NULL,                     -- ex. NOCY, NATU…
  materiel         ENUM('RER NG','NAT','MI2N')               NULL, -- NULL si status != 'ok'
  couplage         ENUM('UM','US')                           NULL, -- UM = couplé, US = simple
  status           ENUM('ok','unknown') NOT NULL DEFAULT 'ok',
  collected_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_date_status   (date_circulation, status),
  KEY idx_date_materiel (date_circulation, materiel),
  KEY idx_date_branche  (date_circulation, branche),
  KEY idx_date_heure    (date_circulation, heure)
);

-- Utilisateur dédié en lecture seule pour le dashboard :
-- CREATE USER 'rer_e_readonly'@'localhost' IDENTIFIED BY 'motdepasse';
-- GRANT SELECT ON rer_e_stats.* TO 'rer_e_readonly'@'localhost';
