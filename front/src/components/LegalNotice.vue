<script setup>
const emit = defineEmits(["close"]);
</script>

<template>
  <div class="lgl-overlay">
    <div class="lgl-shell">
      <header class="lgl-head">
        <span class="lgl-head-title">Mentions légales</span>
        <button class="lgl-close" @click="emit('close')">✕</button>
      </header>

      <div class="lgl-body">
        <section>
          <h3>Éditeur du site</h3>
          <p>
            Site édité à titre non professionnel par un particulier.
            Conformément à l'article 6-III de la LCEN, l'éditeur d'un site non
            professionnel peut ne pas divulguer publiquement son identité complète,
            celle-ci étant communiquée à l'hébergeur.
          </p>
          <p>Contact : <a href="mailto:zecrum.94@gmail.com">zecrum.94@gmail.com</a></p>
        </section>

        <section>
          <h3>Hébergement</h3>
          <p>OVH SAS — 2 rue Kellermann, 59100 Roubaix, France.</p>
        </section>

        <section>
          <h3>Non-affiliation</h3>
          <p>
            Ce site est un projet personnel indépendant. Il n'est <strong>affilié à aucun
            titre</strong> à la SNCF, à SNCF Voyageurs, à SNCF Connect, à Île-de-France
            Mobilités ni à Transilien. Les noms et marques cités appartiennent à leurs
            propriétaires respectifs et sont utilisés uniquement à titre descriptif.
          </p>
        </section>

        <section>
          <h3>Origine des données</h3>
          <p>
            Les statistiques affichées sont calculées à partir de données collectées
            via des interfaces non officielles de la SNCF et de Transilien. Ces interfaces
            n'étant pas documentées publiquement à cet usage, leur disponibilité et leur
            exactitude ne sont pas garanties — elles peuvent être interrompues ou modifiées
            sans préavis. Les chiffres présentés sont fournis à titre informatif, sans
            garantie d'exhaustivité ou de fiabilité.
          </p>
        </section>

        <section>
          <h3>Données personnelles</h3>
          <p>
            Le site ne dépose aucun cookie et ne collecte aucune donnée personnelle des
            visiteurs (pas de compte utilisateur, pas de suivi, pas d'outil d'analyse
            d'audience). Un accès administrateur protégé par mot de passe existe pour la
            gestion interne des données de collecte ; il n'est pas accessible au public.
          </p>
        </section>

        <section>
          <h3>Propriété intellectuelle</h3>
          <p>
            Le code source du dashboard est un projet personnel. Les données de
            circulation ferroviaire sous-jacentes proviennent de tiers cités ci-dessus
            et restent leur propriété.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lgl-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: var(--bg);
  overflow-y: auto;
}
.lgl-shell { max-width: 720px; margin: 0 auto; padding: 22px 26px 60px; }

.lgl-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 22px;
}
.lgl-head-title { font-family: "IBM Plex Mono", monospace; font-size: 15px; font-weight: 600; color: var(--text); }
.lgl-close {
  width: 32px; height: 32px; border: 1px solid var(--line2); background: var(--panel);
  color: var(--text); border-radius: 7px; cursor: pointer;
}
.lgl-close:hover { border-color: var(--dim); }

.lgl-body { display: flex; flex-direction: column; gap: 22px; }
.lgl-body h3 {
  font-family: "IBM Plex Mono", monospace; font-size: 12px; font-weight: 600;
  color: var(--faint); text-transform: uppercase; letter-spacing: .5px; margin: 0 0 8px;
}
.lgl-body p { font-size: 13px; line-height: 1.6; color: var(--dim); margin: 0 0 6px; }
.lgl-body a { color: var(--brand); text-decoration: none; }
.lgl-body a:hover { text-decoration: underline; }
</style>
