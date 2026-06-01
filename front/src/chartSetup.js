// Enregistrement unique des éléments Chart.js utilisés par l'app.
// On enregistre aussi les contrôleurs (Bar/Line/Doughnut) pour ne dépendre
// d'aucune auto-registration de vue-chartjs.
import {
  Chart,
  BarController,
  LineController,
  DoughnutController,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  BarController,
  LineController,
  DoughnutController,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);
