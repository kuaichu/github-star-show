import app from "./app.js";
import { startScheduler } from "./services/schedulerService.js";

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`GitHub Star Show backend running on http://localhost:${port}`);
  startScheduler();
});
