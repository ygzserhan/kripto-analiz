import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

// Uygulama genelinde kullanılan tüm Chart.js bileşenlerini tek yerden kaydet.
// (Line grafikler için: Category/Linear/Point/Line, Halka grafik için: Arc)
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);