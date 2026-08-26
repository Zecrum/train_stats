"use strict";
require("dotenv").config();
const { app, VERSION } = require("./app");

const PORT = process.env.PORT || 3051;

app.listen(PORT, () => {
  console.log(`API RER E Stats v${VERSION} à l'écoute sur http://localhost:${PORT}`);
});
