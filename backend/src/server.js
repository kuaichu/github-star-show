import app from "./app.js";

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`GitHub Star Show backend running on http://localhost:${port}`);
});
